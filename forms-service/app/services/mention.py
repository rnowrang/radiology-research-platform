"""Mention parsing and management service."""

import re
from typing import List, Dict, Any, Optional, Tuple
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.database import Base
from app.models.project import ProjectCollaborator
from app.models.form import FormInstance


class CommentMention(Base):
    """Model for mentions in comments."""

    __tablename__ = "comment_mentions"

    id = Column(Integer, primary_key=True, index=True)
    comment_id = Column(Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=False)
    mentioned_user_id = Column(PG_UUID(as_uuid=True), nullable=False)
    notified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# Regex pattern for @mentions
# Matches @username where username can contain letters, numbers, underscores, periods, and hyphens
MENTION_PATTERN = re.compile(r'@([a-zA-Z0-9_.\-]+)')


class MentionService:
    """Service for managing @mentions in comments."""

    @staticmethod
    def parse_mentions(content: str) -> List[str]:
        """
        Parse @username mentions from comment content.

        Args:
            content: The comment text content

        Returns:
            List of unique usernames mentioned (without the @ prefix)
        """
        if not content:
            return []

        matches = MENTION_PATTERN.findall(content)
        # Return unique usernames preserving order
        seen = set()
        unique_mentions = []
        for username in matches:
            username_lower = username.lower()
            if username_lower not in seen:
                seen.add(username_lower)
                unique_mentions.append(username)

        return unique_mentions

    @staticmethod
    def resolve_mentions_to_user_ids(
        db: Session,
        usernames: List[str],
        valid_user_ids: Optional[List[UUID]] = None,
    ) -> Dict[str, UUID]:
        """
        Resolve usernames to user IDs.

        Args:
            db: Database session
            usernames: List of usernames to resolve
            valid_user_ids: Optional list of valid user IDs (for filtering to collaborators)

        Returns:
            Dict mapping usernames to user IDs
        """
        from sqlalchemy import text

        if not usernames:
            return {}

        # Query users by email prefix (before @) as our username
        # This assumes the username portion of the email is used for mentions
        result = {}

        # Build query to find users by email prefix
        for username in usernames:
            query = text("""
                SELECT id, email FROM users
                WHERE LOWER(SPLIT_PART(email, '@', 1)) = LOWER(:username)
                AND is_active = true
                LIMIT 1
            """)
            row = db.execute(query, {"username": username}).fetchone()

            if row:
                user_id = row[0]
                # If we have a filter list, check if user is in it
                if valid_user_ids is None or user_id in valid_user_ids:
                    result[username] = user_id

        return result

    @staticmethod
    def create_mentions(
        db: Session,
        comment_id: int,
        mentioned_user_ids: List[UUID],
    ) -> List[CommentMention]:
        """
        Create mention records for a comment.

        Args:
            db: Database session
            comment_id: ID of the comment containing mentions
            mentioned_user_ids: List of user IDs that were mentioned

        Returns:
            List of created CommentMention records
        """
        if not mentioned_user_ids:
            return []

        mentions = []
        for user_id in mentioned_user_ids:
            mention = CommentMention(
                comment_id=comment_id,
                mentioned_user_id=user_id,
            )
            db.add(mention)
            mentions.append(mention)

        db.flush()
        return mentions

    @staticmethod
    def get_mentionable_users(
        db: Session,
        form_id: int,
    ) -> List[Dict[str, Any]]:
        """
        Get users that can be mentioned on a form (collaborators + owner).

        Args:
            db: Database session
            form_id: ID of the form

        Returns:
            List of user info dicts with id, name, email, and username
        """
        from sqlalchemy import text

        # Get form to find owner and project
        form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
        if not form:
            return []

        user_ids = set()
        user_ids.add(form.owner_id)

        # Get project collaborators if form is in a project
        if form.project_id:
            collaborators = db.query(ProjectCollaborator).filter(
                ProjectCollaborator.project_id == form.project_id
            ).all()
            for collab in collaborators:
                user_ids.add(collab.user_id)

        # Also add any users who have been assigned as form collaborators
        # (using form_collaborators table if it exists)
        try:
            query = text("""
                SELECT user_id FROM form_collaborators
                WHERE form_instance_id = :form_id
            """)
            rows = db.execute(query, {"form_id": form_id}).fetchall()
            for row in rows:
                user_ids.add(row[0])
        except Exception:
            # Table might not exist yet
            pass

        # Also add reviewers
        try:
            query = text("""
                SELECT reviewer_id FROM form_reviews
                WHERE form_instance_id = :form_id AND reviewer_id IS NOT NULL
            """)
            rows = db.execute(query, {"form_id": form_id}).fetchall()
            for row in rows:
                user_ids.add(row[0])
        except Exception:
            pass

        if not user_ids:
            return []

        # Get user details
        user_ids_str = ",".join([f"'{str(uid)}'" for uid in user_ids])
        query = text(f"""
            SELECT id, full_name, email
            FROM users
            WHERE id IN ({user_ids_str}) AND is_active = true
            ORDER BY full_name
        """)
        rows = db.execute(query).fetchall()

        return [
            {
                "id": str(row[0]),
                "name": row[1],
                "email": row[2],
                "username": row[2].split("@")[0] if row[2] else None,
            }
            for row in rows
        ]

    @staticmethod
    def get_mentions_for_comment(
        db: Session,
        comment_id: int,
    ) -> List[Dict[str, Any]]:
        """
        Get all mentions for a comment.

        Args:
            db: Database session
            comment_id: ID of the comment

        Returns:
            List of mention info dicts
        """
        from sqlalchemy import text

        query = text("""
            SELECT cm.id, cm.mentioned_user_id, cm.notified, cm.created_at,
                   u.full_name, u.email
            FROM comment_mentions cm
            JOIN users u ON cm.mentioned_user_id = u.id
            WHERE cm.comment_id = :comment_id
        """)
        rows = db.execute(query, {"comment_id": comment_id}).fetchall()

        return [
            {
                "id": row[0],
                "user_id": str(row[1]),
                "notified": row[2],
                "created_at": row[3],
                "user_name": row[4],
                "user_email": row[5],
            }
            for row in rows
        ]

    @staticmethod
    def mark_mention_notified(
        db: Session,
        mention_id: int,
    ) -> bool:
        """
        Mark a mention as notified.

        Args:
            db: Database session
            mention_id: ID of the mention record

        Returns:
            True if successful
        """
        mention = db.query(CommentMention).filter(CommentMention.id == mention_id).first()
        if mention:
            mention.notified = True
            db.commit()
            return True
        return False

    @staticmethod
    def process_comment_mentions(
        db: Session,
        comment_id: int,
        content: str,
        form_id: int,
    ) -> Tuple[List[CommentMention], List[Dict[str, Any]]]:
        """
        Process mentions in a new comment - parse, resolve, and create records.

        Args:
            db: Database session
            comment_id: ID of the new comment
            content: Comment text content
            form_id: ID of the form

        Returns:
            Tuple of (created mentions, mentioned user info for notifications)
        """
        # Parse mentions from content
        usernames = MentionService.parse_mentions(content)
        if not usernames:
            return [], []

        # Get valid users for this form
        valid_users = MentionService.get_mentionable_users(db, form_id)
        valid_user_map = {u["username"].lower(): u for u in valid_users if u.get("username")}

        # Resolve and filter mentions
        mentioned_users = []
        for username in usernames:
            user_info = valid_user_map.get(username.lower())
            if user_info:
                mentioned_users.append(user_info)

        if not mentioned_users:
            return [], []

        # Create mention records
        user_ids = [UUID(u["id"]) for u in mentioned_users]
        mentions = MentionService.create_mentions(db, comment_id, user_ids)

        return mentions, mentioned_users


# Create singleton instance
mention_service = MentionService()
