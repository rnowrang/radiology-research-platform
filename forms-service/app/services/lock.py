"""Editing lock management service."""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.database import Base
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


class EditingLock(Base):
    """Model for editing locks on forms/sections."""

    __tablename__ = "editing_locks"

    id = Column(Integer, primary_key=True, index=True)
    form_instance_id = Column(Integer, ForeignKey("form_instances.id", ondelete="CASCADE"), nullable=False)
    section_id = Column(String(255), nullable=True)
    locked_by_id = Column(PG_UUID(as_uuid=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LockService:
    """Service for managing editing locks."""

    DEFAULT_LOCK_DURATION_MINUTES = 5

    @staticmethod
    def acquire_lock(
        db: Session,
        form_id: int,
        user_id: UUID,
        section_id: Optional[str] = None,
        duration_minutes: int = DEFAULT_LOCK_DURATION_MINUTES,
    ) -> Dict[str, Any]:
        """
        Acquire a lock on a form or section.

        Args:
            db: Database session
            form_id: ID of the form to lock
            user_id: ID of the user acquiring the lock
            section_id: Optional section ID for section-level locking
            duration_minutes: Lock duration in minutes

        Returns:
            Dict with lock info or error
        """
        # Clean up expired locks first
        LockService.cleanup_expired_locks(db)

        # Check if lock already exists for this form/section
        existing_lock = db.query(EditingLock).filter(
            EditingLock.form_instance_id == form_id,
            EditingLock.section_id == section_id if section_id else EditingLock.section_id.is_(None),
        ).first()

        if existing_lock:
            if existing_lock.locked_by_id == user_id:
                # User already has the lock, extend it
                existing_lock.expires_at = datetime.utcnow() + timedelta(minutes=duration_minutes)
                db.commit()
                db.refresh(existing_lock)
                return {
                    "success": True,
                    "lock_id": existing_lock.id,
                    "expires_at": existing_lock.expires_at,
                    "extended": True,
                }
            else:
                # Lock held by another user
                return {
                    "success": False,
                    "error": "locked_by_another_user",
                    "locked_by_id": str(existing_lock.locked_by_id),
                    "expires_at": existing_lock.expires_at,
                }

        # Create new lock
        expires_at = datetime.utcnow() + timedelta(minutes=duration_minutes)
        new_lock = EditingLock(
            form_instance_id=form_id,
            section_id=section_id,
            locked_by_id=user_id,
            expires_at=expires_at,
        )
        db.add(new_lock)
        db.commit()
        db.refresh(new_lock)

        return {
            "success": True,
            "lock_id": new_lock.id,
            "expires_at": new_lock.expires_at,
            "extended": False,
        }

    @staticmethod
    def release_lock(
        db: Session,
        form_id: int,
        user_id: UUID,
        section_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Release a lock on a form or section.

        Args:
            db: Database session
            form_id: ID of the form
            user_id: ID of the user releasing the lock
            section_id: Optional section ID

        Returns:
            Dict with success status
        """
        lock = db.query(EditingLock).filter(
            EditingLock.form_instance_id == form_id,
            EditingLock.section_id == section_id if section_id else EditingLock.section_id.is_(None),
        ).first()

        if not lock:
            return {"success": True, "message": "No lock found"}

        if lock.locked_by_id != user_id:
            return {
                "success": False,
                "error": "not_lock_owner",
                "message": "You do not own this lock",
            }

        db.delete(lock)
        db.commit()

        return {"success": True, "message": "Lock released"}

    @staticmethod
    def force_release_lock(
        db: Session,
        form_id: int,
        section_id: Optional[str] = None,
        user_id: Optional[UUID] = None,
        user_role: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Force release a lock (for admins or form owners).

        Args:
            db: Database session
            form_id: ID of the form
            section_id: Optional section ID
            user_id: ID of user requesting force release
            user_role: Role of user requesting force release

        Returns:
            Dict with success status
        """
        from app.models.form import FormInstance

        # Check if user is admin or form owner
        if user_role != "admin":
            form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
            if not form:
                return {"success": False, "error": "form_not_found"}
            if form.owner_id != user_id:
                return {
                    "success": False,
                    "error": "permission_denied",
                    "message": "Only admins or form owners can force release locks",
                }

        lock = db.query(EditingLock).filter(
            EditingLock.form_instance_id == form_id,
            EditingLock.section_id == section_id if section_id else EditingLock.section_id.is_(None),
        ).first()

        if not lock:
            return {"success": True, "message": "No lock found"}

        db.delete(lock)
        db.commit()

        return {"success": True, "message": "Lock force released"}

    @staticmethod
    def check_lock(
        db: Session,
        form_id: int,
        section_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Check the lock status of a form or section.

        Args:
            db: Database session
            form_id: ID of the form
            section_id: Optional section ID

        Returns:
            Dict with lock status
        """
        # Clean up expired locks first
        LockService.cleanup_expired_locks(db)

        lock = db.query(EditingLock).filter(
            EditingLock.form_instance_id == form_id,
            EditingLock.section_id == section_id if section_id else EditingLock.section_id.is_(None),
        ).first()

        if not lock:
            return {
                "is_locked": False,
                "locked_by_id": None,
                "expires_at": None,
            }

        return {
            "is_locked": True,
            "lock_id": lock.id,
            "locked_by_id": str(lock.locked_by_id),
            "expires_at": lock.expires_at,
            "created_at": lock.created_at,
        }

    @staticmethod
    def get_all_locks_for_form(
        db: Session,
        form_id: int,
    ) -> list:
        """
        Get all active locks for a form (including section locks).

        Args:
            db: Database session
            form_id: ID of the form

        Returns:
            List of lock info dicts
        """
        # Clean up expired locks first
        LockService.cleanup_expired_locks(db)

        locks = db.query(EditingLock).filter(
            EditingLock.form_instance_id == form_id,
        ).all()

        return [
            {
                "lock_id": lock.id,
                "section_id": lock.section_id,
                "locked_by_id": str(lock.locked_by_id),
                "expires_at": lock.expires_at,
                "created_at": lock.created_at,
            }
            for lock in locks
        ]

    @staticmethod
    def extend_lock(
        db: Session,
        form_id: int,
        user_id: UUID,
        section_id: Optional[str] = None,
        duration_minutes: int = DEFAULT_LOCK_DURATION_MINUTES,
    ) -> Dict[str, Any]:
        """
        Extend an existing lock.

        Args:
            db: Database session
            form_id: ID of the form
            user_id: ID of the user extending the lock
            section_id: Optional section ID
            duration_minutes: Extension duration in minutes

        Returns:
            Dict with lock info or error
        """
        lock = db.query(EditingLock).filter(
            EditingLock.form_instance_id == form_id,
            EditingLock.section_id == section_id if section_id else EditingLock.section_id.is_(None),
        ).first()

        if not lock:
            return {
                "success": False,
                "error": "lock_not_found",
                "message": "No lock found to extend",
            }

        if lock.locked_by_id != user_id:
            return {
                "success": False,
                "error": "not_lock_owner",
                "message": "You do not own this lock",
            }

        lock.expires_at = datetime.utcnow() + timedelta(minutes=duration_minutes)
        db.commit()
        db.refresh(lock)

        return {
            "success": True,
            "lock_id": lock.id,
            "expires_at": lock.expires_at,
        }

    @staticmethod
    def cleanup_expired_locks(db: Session) -> int:
        """
        Remove all expired locks.

        Args:
            db: Database session

        Returns:
            Number of locks cleaned up
        """
        now = datetime.utcnow()
        result = db.query(EditingLock).filter(
            EditingLock.expires_at < now
        ).delete(synchronize_session=False)
        db.commit()
        return result


# Create singleton instance
lock_service = LockService()
