"""Amendment service for managing form amendments."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from fastapi import HTTPException, status

from app.models.amendment import Amendment, AmendmentFieldChange
from app.models.form import FormInstance, FormData
from app.schemas.amendment import (
    AmendmentCreate,
    AmendmentUpdate,
    AmendmentFieldChangeCreate,
    AmendmentFieldChangeUpdate,
)


class AmendmentService:
    """Service for amendment operations."""

    # Allowed statuses for creating amendments
    AMENDABLE_STATUSES = ["approved", "locked"]

    @staticmethod
    def get_amendment(db: Session, amendment_id: int) -> Optional[Amendment]:
        """Get a single amendment by ID."""
        return db.query(Amendment).filter(Amendment.id == amendment_id).first()

    @staticmethod
    def get_form_amendments(
        db: Session,
        form_id: int,
        status_filter: Optional[str] = None,
    ) -> List[Amendment]:
        """Get all amendments for a form."""
        query = db.query(Amendment).filter(Amendment.form_instance_id == form_id)

        if status_filter:
            query = query.filter(Amendment.status == status_filter)

        return query.order_by(Amendment.created_at.desc()).all()

    @staticmethod
    def create_amendment(
        db: Session,
        form_id: int,
        user_id: UUID,
        data: AmendmentCreate,
    ) -> Amendment:
        """Create a new amendment for a form."""
        # Verify form exists and is in amendable status
        form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
        if not form:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Form not found",
            )

        if form.status not in AmendmentService.AMENDABLE_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Form must be approved or locked to create amendments. Current status: {form.status}",
            )

        # Check if there's already a draft or submitted amendment
        existing = (
            db.query(Amendment)
            .filter(
                Amendment.form_instance_id == form_id,
                Amendment.status.in_(["draft", "submitted"]),
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="There is already a pending amendment for this form. Complete or withdraw it first.",
            )

        amendment = Amendment(
            form_instance_id=form_id,
            amendment_type=data.amendment_type.value,
            description=data.description,
            created_by_id=user_id,
            status="draft",
        )
        db.add(amendment)
        db.commit()
        db.refresh(amendment)
        return amendment

    @staticmethod
    def update_amendment(
        db: Session,
        amendment_id: int,
        user_id: UUID,
        data: AmendmentUpdate,
    ) -> Amendment:
        """Update a draft amendment."""
        amendment = AmendmentService.get_amendment(db, amendment_id)
        if not amendment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Amendment not found",
            )

        if amendment.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only draft amendments can be updated",
            )

        # Check ownership
        if str(amendment.created_by_id) != str(user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own amendments",
            )

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field == "amendment_type" and value:
                setattr(amendment, field, value.value)
            else:
                setattr(amendment, field, value)

        db.commit()
        db.refresh(amendment)
        return amendment

    @staticmethod
    def delete_amendment(
        db: Session,
        amendment_id: int,
        user_id: UUID,
    ) -> bool:
        """Delete a draft amendment."""
        amendment = AmendmentService.get_amendment(db, amendment_id)
        if not amendment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Amendment not found",
            )

        if amendment.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only draft amendments can be deleted",
            )

        # Check ownership
        if str(amendment.created_by_id) != str(user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete your own amendments",
            )

        db.delete(amendment)
        db.commit()
        return True

    @staticmethod
    def add_field_change(
        db: Session,
        amendment_id: int,
        user_id: UUID,
        data: AmendmentFieldChangeCreate,
    ) -> AmendmentFieldChange:
        """Add a field change to an amendment."""
        amendment = AmendmentService.get_amendment(db, amendment_id)
        if not amendment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Amendment not found",
            )

        if amendment.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Can only add changes to draft amendments",
            )

        # Check ownership
        if str(amendment.created_by_id) != str(user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only modify your own amendments",
            )

        # Check if field change for this field already exists
        existing = (
            db.query(AmendmentFieldChange)
            .filter(
                AmendmentFieldChange.amendment_id == amendment_id,
                AmendmentFieldChange.field_id == data.field_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Field change for '{data.field_id}' already exists. Update or remove it first.",
            )

        change = AmendmentFieldChange(
            amendment_id=amendment_id,
            field_id=data.field_id,
            field_label=data.field_label,
            old_value=data.old_value,
            new_value=data.new_value,
            justification=data.justification,
        )
        db.add(change)
        db.commit()
        db.refresh(change)
        return change

    @staticmethod
    def update_field_change(
        db: Session,
        change_id: int,
        user_id: UUID,
        data: AmendmentFieldChangeUpdate,
    ) -> AmendmentFieldChange:
        """Update a field change."""
        change = db.query(AmendmentFieldChange).filter(AmendmentFieldChange.id == change_id).first()
        if not change:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Field change not found",
            )

        amendment = AmendmentService.get_amendment(db, change.amendment_id)
        if amendment.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Can only update changes in draft amendments",
            )

        if str(amendment.created_by_id) != str(user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only modify your own amendments",
            )

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(change, field, value)

        db.commit()
        db.refresh(change)
        return change

    @staticmethod
    def remove_field_change(
        db: Session,
        change_id: int,
        user_id: UUID,
    ) -> bool:
        """Remove a field change from an amendment."""
        change = db.query(AmendmentFieldChange).filter(AmendmentFieldChange.id == change_id).first()
        if not change:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Field change not found",
            )

        amendment = AmendmentService.get_amendment(db, change.amendment_id)
        if amendment.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Can only remove changes from draft amendments",
            )

        if str(amendment.created_by_id) != str(user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only modify your own amendments",
            )

        db.delete(change)
        db.commit()
        return True

    @staticmethod
    def submit_amendment(
        db: Session,
        amendment_id: int,
        user_id: UUID,
    ) -> Amendment:
        """Submit an amendment for review."""
        amendment = AmendmentService.get_amendment(db, amendment_id)
        if not amendment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Amendment not found",
            )

        if amendment.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only draft amendments can be submitted",
            )

        if str(amendment.created_by_id) != str(user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only submit your own amendments",
            )

        # Verify there's at least one field change
        if not amendment.field_changes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Amendment must have at least one field change",
            )

        amendment.status = "submitted"
        amendment.submitted_at = datetime.utcnow()
        amendment.submitted_by_id = user_id

        db.commit()
        db.refresh(amendment)
        return amendment

    @staticmethod
    def approve_amendment(
        db: Session,
        amendment_id: int,
        reviewer_id: UUID,
        notes: Optional[str] = None,
    ) -> Amendment:
        """Approve an amendment and apply changes to the form."""
        amendment = AmendmentService.get_amendment(db, amendment_id)
        if not amendment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Amendment not found",
            )

        if amendment.status != "submitted":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only submitted amendments can be approved",
            )

        # Apply field changes to form data
        form_data = (
            db.query(FormData)
            .filter(FormData.form_instance_id == amendment.form_instance_id)
            .first()
        )
        if not form_data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Form data not found",
            )

        current_data = form_data.data or {}

        for change in amendment.field_changes:
            # Handle nested keys (e.g., "section.field")
            keys = change.field_id.split(".")
            if len(keys) == 1:
                current_data[change.field_id] = change.new_value
            else:
                parent = current_data
                for key in keys[:-1]:
                    if key not in parent:
                        parent[key] = {}
                    parent = parent[key]
                parent[keys[-1]] = change.new_value

        form_data.data = current_data
        flag_modified(form_data, "data")

        # Update amendment status
        amendment.status = "approved"
        amendment.reviewed_at = datetime.utcnow()
        amendment.reviewed_by_id = reviewer_id
        amendment.review_notes = notes

        db.commit()
        db.refresh(amendment)
        return amendment

    @staticmethod
    def reject_amendment(
        db: Session,
        amendment_id: int,
        reviewer_id: UUID,
        notes: str,
    ) -> Amendment:
        """Reject an amendment."""
        amendment = AmendmentService.get_amendment(db, amendment_id)
        if not amendment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Amendment not found",
            )

        if amendment.status != "submitted":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only submitted amendments can be rejected",
            )

        amendment.status = "rejected"
        amendment.reviewed_at = datetime.utcnow()
        amendment.reviewed_by_id = reviewer_id
        amendment.review_notes = notes

        db.commit()
        db.refresh(amendment)
        return amendment

    @staticmethod
    def withdraw_amendment(
        db: Session,
        amendment_id: int,
        user_id: UUID,
    ) -> Amendment:
        """Withdraw an amendment (owner only)."""
        amendment = AmendmentService.get_amendment(db, amendment_id)
        if not amendment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Amendment not found",
            )

        if amendment.status not in ["draft", "submitted"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only draft or submitted amendments can be withdrawn",
            )

        if str(amendment.created_by_id) != str(user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only withdraw your own amendments",
            )

        amendment.status = "withdrawn"
        db.commit()
        db.refresh(amendment)
        return amendment


# Singleton instance for import
amendment_service = AmendmentService()
