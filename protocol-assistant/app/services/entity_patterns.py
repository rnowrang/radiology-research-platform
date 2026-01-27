"""Entity Pattern Service for learning common entities.

Learns and suggests common entities like:
- PI information (name, email, department)
- Common procedures
- Department names
- Standard language/phrases
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.knowledge import PersonInfo, LearnedPattern

logger = logging.getLogger(__name__)


class EntityPatternService:
    """Service for managing learned entity patterns."""

    def __init__(self, db: AsyncSession):
        """Initialize the entity pattern service.

        Args:
            db: Async database session
        """
        self.db = db

    async def learn_pi_pattern(
        self,
        institution_id: UUID,
        pi_info: PersonInfo,
    ) -> UUID:
        """Learn PI contact information for reuse.

        Args:
            institution_id: Institution UUID
            pi_info: PersonInfo with PI details

        Returns:
            UUID of the pattern record
        """
        import json

        pattern_key = self._normalize_name(pi_info.name or "")

        if not pattern_key:
            raise ValueError("PI name is required")

        pattern_value = {
            "name": pi_info.name,
            "title": pi_info.title,
            "department": pi_info.department,
            "email": pi_info.email,
            "phone": pi_info.phone,
            "institution": pi_info.institution,
            "credentials": pi_info.credentials,
        }

        return await self._upsert_pattern(
            institution_id=institution_id,
            pattern_type="pi_info",
            pattern_key=pattern_key,
            pattern_value=pattern_value,
        )

    async def suggest_pi(
        self,
        institution_id: UUID,
        partial_name: str,
        limit: int = 5,
    ) -> List[PersonInfo]:
        """Suggest PI info based on partial name match.

        Args:
            institution_id: Institution UUID
            partial_name: Partial name to search
            limit: Maximum suggestions

        Returns:
            List of PersonInfo suggestions
        """
        import json

        normalized = self._normalize_name(partial_name)

        result = await self.db.execute(
            text("""
                SELECT pattern_value, usage_count
                FROM institution_patterns
                WHERE institution_id = :institution_id
                    AND pattern_type = 'pi_info'
                    AND pattern_key ILIKE :search_pattern
                ORDER BY usage_count DESC, last_used_at DESC
                LIMIT :limit
            """),
            {
                "institution_id": str(institution_id),
                "search_pattern": f"%{normalized}%",
                "limit": limit,
            }
        )
        rows = result.fetchall()

        suggestions = []
        for row in rows:
            try:
                value = json.loads(row.pattern_value) if isinstance(row.pattern_value, str) else row.pattern_value
                suggestions.append(PersonInfo(
                    name=value.get("name"),
                    title=value.get("title"),
                    department=value.get("department"),
                    email=value.get("email"),
                    phone=value.get("phone"),
                    institution=value.get("institution"),
                    credentials=value.get("credentials"),
                ))
            except Exception as e:
                logger.warning(f"Failed to parse PI pattern: {e}")
                continue

        return suggestions

    async def get_pi_by_email(
        self,
        institution_id: UUID,
        email: str,
    ) -> Optional[PersonInfo]:
        """Get PI info by email address.

        Args:
            institution_id: Institution UUID
            email: Email to search

        Returns:
            PersonInfo or None
        """
        import json

        result = await self.db.execute(
            text("""
                SELECT pattern_value
                FROM institution_patterns
                WHERE institution_id = :institution_id
                    AND pattern_type = 'pi_info'
                    AND pattern_value->>'email' ILIKE :email
                LIMIT 1
            """),
            {
                "institution_id": str(institution_id),
                "email": email.lower(),
            }
        )
        row = result.fetchone()

        if not row:
            return None

        try:
            value = json.loads(row.pattern_value) if isinstance(row.pattern_value, str) else row.pattern_value
            return PersonInfo(**value)
        except Exception:
            return None

    async def learn_procedure(
        self,
        institution_id: UUID,
        procedure_name: str,
        procedure_description: Optional[str] = None,
    ) -> UUID:
        """Learn a common procedure.

        Args:
            institution_id: Institution UUID
            procedure_name: Name of the procedure
            procedure_description: Optional description

        Returns:
            UUID of the pattern record
        """
        pattern_key = self._normalize_name(procedure_name)

        pattern_value = {
            "name": procedure_name,
            "description": procedure_description,
        }

        return await self._upsert_pattern(
            institution_id=institution_id,
            pattern_type="procedure",
            pattern_key=pattern_key,
            pattern_value=pattern_value,
        )

    async def suggest_procedures(
        self,
        institution_id: UUID,
        query: str,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Suggest procedures based on query.

        Args:
            institution_id: Institution UUID
            query: Search query
            limit: Maximum suggestions

        Returns:
            List of procedure suggestions
        """
        import json

        normalized = self._normalize_name(query)

        result = await self.db.execute(
            text("""
                SELECT pattern_value, usage_count
                FROM institution_patterns
                WHERE institution_id = :institution_id
                    AND pattern_type = 'procedure'
                    AND (pattern_key ILIKE :search_pattern
                         OR pattern_value->>'description' ILIKE :search_pattern)
                ORDER BY usage_count DESC, last_used_at DESC
                LIMIT :limit
            """),
            {
                "institution_id": str(institution_id),
                "search_pattern": f"%{normalized}%",
                "limit": limit,
            }
        )
        rows = result.fetchall()

        suggestions = []
        for row in rows:
            try:
                value = json.loads(row.pattern_value) if isinstance(row.pattern_value, str) else row.pattern_value
                suggestions.append({
                    "name": value.get("name"),
                    "description": value.get("description"),
                    "usage_count": row.usage_count,
                })
            except Exception:
                continue

        return suggestions

    async def learn_department(
        self,
        institution_id: UUID,
        department_name: str,
        building: Optional[str] = None,
        floor: Optional[str] = None,
    ) -> UUID:
        """Learn a department pattern.

        Args:
            institution_id: Institution UUID
            department_name: Name of the department
            building: Optional building name
            floor: Optional floor

        Returns:
            UUID of the pattern record
        """
        pattern_key = self._normalize_name(department_name)

        pattern_value = {
            "name": department_name,
            "building": building,
            "floor": floor,
        }

        return await self._upsert_pattern(
            institution_id=institution_id,
            pattern_type="department",
            pattern_key=pattern_key,
            pattern_value=pattern_value,
        )

    async def suggest_departments(
        self,
        institution_id: UUID,
        query: str = "",
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """Suggest departments.

        Args:
            institution_id: Institution UUID
            query: Optional search query
            limit: Maximum suggestions

        Returns:
            List of department suggestions
        """
        import json

        params = {
            "institution_id": str(institution_id),
            "limit": limit,
        }

        if query:
            normalized = self._normalize_name(query)
            search_clause = "AND pattern_key ILIKE :search_pattern"
            params["search_pattern"] = f"%{normalized}%"
        else:
            search_clause = ""

        result = await self.db.execute(
            text(f"""
                SELECT pattern_value, usage_count
                FROM institution_patterns
                WHERE institution_id = :institution_id
                    AND pattern_type = 'department'
                    {search_clause}
                ORDER BY usage_count DESC, last_used_at DESC
                LIMIT :limit
            """),
            params
        )
        rows = result.fetchall()

        suggestions = []
        for row in rows:
            try:
                value = json.loads(row.pattern_value) if isinstance(row.pattern_value, str) else row.pattern_value
                suggestions.append({
                    "name": value.get("name"),
                    "building": value.get("building"),
                    "floor": value.get("floor"),
                    "usage_count": row.usage_count,
                })
            except Exception:
                continue

        return suggestions

    async def learn_standard_language(
        self,
        institution_id: UUID,
        key: str,
        text: str,
        category: Optional[str] = None,
    ) -> UUID:
        """Learn standard language/phrases.

        Args:
            institution_id: Institution UUID
            key: Identifier for this language (e.g., 'confidentiality_statement')
            text: The standard text
            category: Optional category

        Returns:
            UUID of the pattern record
        """
        pattern_key = self._normalize_name(key)

        pattern_value = {
            "key": key,
            "text": text,
            "category": category,
        }

        return await self._upsert_pattern(
            institution_id=institution_id,
            pattern_type="standard_language",
            pattern_key=pattern_key,
            pattern_value=pattern_value,
        )

    async def get_standard_language(
        self,
        institution_id: UUID,
        key: str,
    ) -> Optional[str]:
        """Get standard language by key.

        Args:
            institution_id: Institution UUID
            key: Language key

        Returns:
            Text or None
        """
        import json

        pattern_key = self._normalize_name(key)

        result = await self.db.execute(
            text("""
                SELECT pattern_value
                FROM institution_patterns
                WHERE institution_id = :institution_id
                    AND pattern_type = 'standard_language'
                    AND pattern_key = :pattern_key
                LIMIT 1
            """),
            {
                "institution_id": str(institution_id),
                "pattern_key": pattern_key,
            }
        )
        row = result.fetchone()

        if not row:
            return None

        try:
            value = json.loads(row.pattern_value) if isinstance(row.pattern_value, str) else row.pattern_value
            return value.get("text")
        except Exception:
            return None

    async def get_common_patterns(
        self,
        institution_id: UUID,
        pattern_type: str,
        limit: int = 50,
    ) -> List[LearnedPattern]:
        """Get common patterns of a specific type.

        Args:
            institution_id: Institution UUID
            pattern_type: Type of pattern
            limit: Maximum patterns to return

        Returns:
            List of LearnedPattern objects
        """
        import json

        result = await self.db.execute(
            text("""
                SELECT id, pattern_type, pattern_key, pattern_value,
                       usage_count, last_used_at, created_at
                FROM institution_patterns
                WHERE institution_id = :institution_id
                    AND pattern_type = :pattern_type
                ORDER BY usage_count DESC, last_used_at DESC
                LIMIT :limit
            """),
            {
                "institution_id": str(institution_id),
                "pattern_type": pattern_type,
                "limit": limit,
            }
        )
        rows = result.fetchall()

        patterns = []
        for row in rows:
            try:
                value = json.loads(row.pattern_value) if isinstance(row.pattern_value, str) else row.pattern_value
                # Calculate confidence from usage count
                confidence = min(0.95, 0.6 + (row.usage_count * 0.05))

                patterns.append(LearnedPattern(
                    pattern_type=row.pattern_type,
                    pattern_key=row.pattern_key,
                    pattern_value=value,
                    usage_count=row.usage_count,
                    confidence=confidence,
                    last_used_at=row.last_used_at,
                ))
            except Exception as e:
                logger.warning(f"Failed to parse pattern: {e}")
                continue

        return patterns

    async def increment_usage(
        self,
        institution_id: UUID,
        pattern_type: str,
        pattern_key: str,
    ) -> None:
        """Increment usage count for a pattern.

        Args:
            institution_id: Institution UUID
            pattern_type: Pattern type
            pattern_key: Pattern key
        """
        normalized_key = self._normalize_name(pattern_key)

        await self.db.execute(
            text("""
                UPDATE institution_patterns
                SET usage_count = usage_count + 1,
                    last_used_at = NOW()
                WHERE institution_id = :institution_id
                    AND pattern_type = :pattern_type
                    AND pattern_key = :pattern_key
            """),
            {
                "institution_id": str(institution_id),
                "pattern_type": pattern_type,
                "pattern_key": normalized_key,
            }
        )
        await self.db.commit()

    async def _upsert_pattern(
        self,
        institution_id: UUID,
        pattern_type: str,
        pattern_key: str,
        pattern_value: Dict[str, Any],
    ) -> UUID:
        """Insert or update a pattern.

        Args:
            institution_id: Institution UUID
            pattern_type: Type of pattern
            pattern_key: Unique key within type
            pattern_value: Pattern data

        Returns:
            UUID of the pattern record
        """
        import json

        pattern_id = uuid4()

        # Check if exists
        result = await self.db.execute(
            text("""
                SELECT id FROM institution_patterns
                WHERE institution_id = :institution_id
                    AND pattern_type = :pattern_type
                    AND pattern_key = :pattern_key
            """),
            {
                "institution_id": str(institution_id),
                "pattern_type": pattern_type,
                "pattern_key": pattern_key,
            }
        )
        existing = result.fetchone()

        if existing:
            # Update existing
            await self.db.execute(
                text("""
                    UPDATE institution_patterns
                    SET pattern_value = :pattern_value,
                        usage_count = usage_count + 1,
                        last_used_at = NOW()
                    WHERE id = :id
                """),
                {
                    "id": existing.id,
                    "pattern_value": json.dumps(pattern_value),
                }
            )
            pattern_id = UUID(existing.id)
        else:
            # Insert new
            await self.db.execute(
                text("""
                    INSERT INTO institution_patterns
                        (id, institution_id, pattern_type, pattern_key, pattern_value,
                         usage_count, last_used_at)
                    VALUES
                        (:id, :institution_id, :pattern_type, :pattern_key, :pattern_value,
                         1, NOW())
                """),
                {
                    "id": str(pattern_id),
                    "institution_id": str(institution_id),
                    "pattern_type": pattern_type,
                    "pattern_key": pattern_key,
                    "pattern_value": json.dumps(pattern_value),
                }
            )

        await self.db.commit()
        return pattern_id

    def _normalize_name(self, name: str) -> str:
        """Normalize a name for pattern matching.

        Args:
            name: Name to normalize

        Returns:
            Normalized name (lowercase, stripped)
        """
        if not name:
            return ""
        return name.lower().strip().replace("  ", " ")


def get_entity_pattern_service(db: AsyncSession) -> EntityPatternService:
    """Get an EntityPatternService instance.

    Args:
        db: Async database session

    Returns:
        EntityPatternService instance
    """
    return EntityPatternService(db)
