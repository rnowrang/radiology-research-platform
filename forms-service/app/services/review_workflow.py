"""Service for multi-stage review workflow management."""

from datetime import datetime, timedelta, date
from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException

from app.models.review_stage import ReviewStage
from app.models.review import FormReview
from app.models.form import FormInstance
from app.schemas.review_stage import (
    ReviewStageCreate,
    ReviewStageUpdate,
    ReviewStageResponse,
    StageReviewInfo,
    ReviewProgressResponse,
    FormReviewResponse,
)


class ReviewWorkflowService:
    """Service for managing review workflow stages and progress."""

    # ==========================================================================
    # Review Stage Management (Admin)
    # ==========================================================================

    @staticmethod
    def get_all_stages(db: Session, active_only: bool = True) -> List[ReviewStage]:
        """Get all review stages ordered by sequence."""
        query = db.query(ReviewStage)
        if active_only:
            query = query.filter(ReviewStage.is_active == True)
        return query.order_by(ReviewStage.sequence_order).all()

    @staticmethod
    def get_stage(db: Session, stage_id: int) -> Optional[ReviewStage]:
        """Get a review stage by ID."""
        return db.query(ReviewStage).filter(ReviewStage.id == stage_id).first()

    @staticmethod
    def get_stage_by_code(db: Session, code: str) -> Optional[ReviewStage]:
        """Get a review stage by code."""
        return db.query(ReviewStage).filter(ReviewStage.code == code).first()

    @staticmethod
    def create_stage(db: Session, data: ReviewStageCreate) -> ReviewStage:
        """Create a new review stage."""
        # Check for duplicate code
        existing = db.query(ReviewStage).filter(ReviewStage.code == data.code).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Stage with code '{data.code}' already exists")

        stage = ReviewStage(**data.model_dump())
        db.add(stage)
        db.commit()
        db.refresh(stage)
        return stage

    @staticmethod
    def update_stage(db: Session, stage_id: int, data: ReviewStageUpdate) -> ReviewStage:
        """Update an existing review stage."""
        stage = db.query(ReviewStage).filter(ReviewStage.id == stage_id).first()
        if not stage:
            raise HTTPException(status_code=404, detail="Review stage not found")

        update_data = data.model_dump(exclude_unset=True)

        # Check for duplicate code if code is being updated
        if "code" in update_data and update_data["code"] != stage.code:
            existing = db.query(ReviewStage).filter(ReviewStage.code == update_data["code"]).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Stage with code '{update_data['code']}' already exists")

        for field, value in update_data.items():
            setattr(stage, field, value)

        db.commit()
        db.refresh(stage)
        return stage

    @staticmethod
    def delete_stage(db: Session, stage_id: int) -> bool:
        """Delete a review stage (soft delete by setting is_active=False)."""
        stage = db.query(ReviewStage).filter(ReviewStage.id == stage_id).first()
        if not stage:
            raise HTTPException(status_code=404, detail="Review stage not found")

        # Check if stage has any active reviews
        active_reviews = db.query(FormReview).filter(
            FormReview.review_stage_id == stage_id,
            FormReview.status.in_(["pending", "assigned", "in_progress"])
        ).count()

        if active_reviews > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete stage with {active_reviews} active reviews. Deactivate instead."
            )

        stage.is_active = False
        db.commit()
        return True

    @staticmethod
    def reorder_stages(db: Session, stage_ids: List[int]) -> List[ReviewStage]:
        """Reorder review stages based on provided ID sequence."""
        # Verify all stage IDs exist
        stages = db.query(ReviewStage).filter(ReviewStage.id.in_(stage_ids)).all()
        if len(stages) != len(stage_ids):
            raise HTTPException(status_code=400, detail="Some stage IDs are invalid")

        # Update sequence order
        for idx, stage_id in enumerate(stage_ids):
            stage = next((s for s in stages if s.id == stage_id), None)
            if stage:
                stage.sequence_order = idx

        db.commit()
        return ReviewWorkflowService.get_all_stages(db, active_only=False)

    # ==========================================================================
    # Form Review Progress
    # ==========================================================================

    @staticmethod
    def get_form_review_progress(db: Session, form_id: int) -> ReviewProgressResponse:
        """Get complete review progress for a form across all stages."""
        form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
        if not form:
            raise HTTPException(status_code=404, detail="Form not found")

        # Get all active stages
        stages = db.query(ReviewStage).filter(
            ReviewStage.is_active == True
        ).order_by(ReviewStage.sequence_order).all()

        # Get all reviews for this form
        reviews = db.query(FormReview).filter(
            FormReview.form_instance_id == form_id
        ).all()

        # Build review lookup by stage_id
        review_by_stage = {r.review_stage_id: r for r in reviews if r.review_stage_id}

        stage_infos = []
        completed_count = 0
        current_stage_id = None
        current_stage_name = None

        for stage in stages:
            review = review_by_stage.get(stage.id)

            status = "not_started"
            if review:
                status = review.status
                if review.status == "approved":
                    completed_count += 1
                elif review.status in ["pending", "assigned", "in_progress"]:
                    if current_stage_id is None:
                        current_stage_id = stage.id
                        current_stage_name = stage.name

            stage_info = StageReviewInfo(
                stage_id=stage.id,
                stage_code=stage.code,
                stage_name=stage.name,
                sequence_order=stage.sequence_order,
                review_id=review.id if review else None,
                reviewer_id=review.reviewer_id if review else None,
                reviewer_name=None,  # Would need user lookup
                status=status,
                deadline=review.deadline if review else None,
                started_at=review.started_at if review else None,
                completed_at=review.completed_at if review else None,
                overall_comments=review.overall_comments if review else None,
            )
            stage_infos.append(stage_info)

        # If no current stage but form is in review, find the first not_started stage
        if current_stage_id is None and form.status in ["in_review"]:
            for info in stage_infos:
                if info.status == "not_started":
                    current_stage_id = info.stage_id
                    current_stage_name = info.stage_name
                    break

        total_stages = len(stages)
        progress_percentage = (completed_count / total_stages * 100) if total_stages > 0 else 0

        return ReviewProgressResponse(
            form_id=form_id,
            form_title=form.title,
            form_status=form.status,
            current_stage_id=current_stage_id,
            current_stage_name=current_stage_name,
            stages=stage_infos,
            completed_stages=completed_count,
            total_stages=total_stages,
            progress_percentage=round(progress_percentage, 1),
        )

    # ==========================================================================
    # Review Assignment and Progression
    # ==========================================================================

    @staticmethod
    def assign_reviewer(
        db: Session,
        form_id: int,
        stage_id: int,
        reviewer_id: UUID,
        deadline: Optional[date] = None
    ) -> FormReview:
        """Assign a reviewer to a specific stage for a form."""
        # Verify form exists
        form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
        if not form:
            raise HTTPException(status_code=404, detail="Form not found")

        # Verify stage exists
        stage = db.query(ReviewStage).filter(ReviewStage.id == stage_id).first()
        if not stage:
            raise HTTPException(status_code=404, detail="Review stage not found")

        # Check if stage requires all previous stages to be completed
        if stage.requires_all_previous:
            previous_stages = db.query(ReviewStage).filter(
                ReviewStage.is_active == True,
                ReviewStage.sequence_order < stage.sequence_order
            ).all()

            for prev_stage in previous_stages:
                prev_review = db.query(FormReview).filter(
                    FormReview.form_instance_id == form_id,
                    FormReview.review_stage_id == prev_stage.id,
                    FormReview.status == "approved"
                ).first()

                if not prev_review:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Previous stage '{prev_stage.name}' must be approved first"
                    )

        # Check if review already exists for this stage
        existing_review = db.query(FormReview).filter(
            FormReview.form_instance_id == form_id,
            FormReview.review_stage_id == stage_id
        ).first()

        if existing_review:
            # Update existing review
            existing_review.reviewer_id = reviewer_id
            existing_review.status = "assigned"
            existing_review.deadline = deadline or (
                datetime.utcnow().date() + timedelta(days=stage.default_deadline_days)
            )
            db.commit()
            db.refresh(existing_review)
            return existing_review

        # Create new review
        calculated_deadline = deadline or (
            datetime.utcnow().date() + timedelta(days=stage.default_deadline_days)
        )

        review = FormReview(
            form_instance_id=form_id,
            review_stage_id=stage_id,
            reviewer_id=reviewer_id,
            status="assigned",
            deadline=calculated_deadline,
        )
        db.add(review)
        db.commit()
        db.refresh(review)
        return review

    @staticmethod
    def complete_stage_review(
        db: Session,
        form_review_id: int,
        status: str,
        comments: Optional[str] = None
    ) -> FormReview:
        """Complete a stage review with a status."""
        valid_statuses = ["approved", "rejected", "revision_required"]
        if status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
            )

        review = db.query(FormReview).filter(FormReview.id == form_review_id).first()
        if not review:
            raise HTTPException(status_code=404, detail="Review not found")

        if review.status in ["approved", "rejected"]:
            raise HTTPException(status_code=400, detail="Review has already been completed")

        review.status = status
        review.overall_comments = comments
        review.completed_at = datetime.utcnow()

        # Update form status based on review result
        form = db.query(FormInstance).filter(FormInstance.id == review.form_instance_id).first()
        if form:
            if status == "rejected":
                form.status = "rejected"
            elif status == "revision_required":
                form.status = "needs_changes"
            elif status == "approved":
                # Check if all stages are approved
                all_stages = db.query(ReviewStage).filter(ReviewStage.is_active == True).all()
                all_approved = True

                for stage in all_stages:
                    stage_review = db.query(FormReview).filter(
                        FormReview.form_instance_id == form.id,
                        FormReview.review_stage_id == stage.id,
                        FormReview.status == "approved"
                    ).first()
                    if not stage_review:
                        all_approved = False
                        break

                if all_approved:
                    form.status = "approved"
                    form.approved_at = datetime.utcnow()

        db.commit()
        db.refresh(review)
        return review

    @staticmethod
    def advance_to_next_stage(
        db: Session,
        form_id: int,
        reviewer_id: Optional[UUID] = None
    ) -> Optional[FormReview]:
        """Automatically advance form to the next review stage."""
        form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
        if not form:
            raise HTTPException(status_code=404, detail="Form not found")

        if form.status != "in_review":
            raise HTTPException(status_code=400, detail="Form is not in review")

        # Get all active stages in order
        stages = db.query(ReviewStage).filter(
            ReviewStage.is_active == True
        ).order_by(ReviewStage.sequence_order).all()

        if not stages:
            raise HTTPException(status_code=400, detail="No review stages configured")

        # Find the next incomplete stage
        for stage in stages:
            existing_review = db.query(FormReview).filter(
                FormReview.form_instance_id == form_id,
                FormReview.review_stage_id == stage.id
            ).first()

            if not existing_review or existing_review.status not in ["approved"]:
                # This is the next stage to handle
                if reviewer_id:
                    return ReviewWorkflowService.assign_reviewer(
                        db, form_id, stage.id, reviewer_id
                    )
                else:
                    # Create pending review without assignment
                    if not existing_review:
                        review = FormReview(
                            form_instance_id=form_id,
                            review_stage_id=stage.id,
                            status="pending",
                        )
                        db.add(review)
                        db.commit()
                        db.refresh(review)
                        return review
                    return existing_review

        # All stages completed
        return None

    @staticmethod
    def start_stage_review(db: Session, form_review_id: int) -> FormReview:
        """Mark a stage review as in progress."""
        review = db.query(FormReview).filter(FormReview.id == form_review_id).first()
        if not review:
            raise HTTPException(status_code=404, detail="Review not found")

        if review.status not in ["pending", "assigned"]:
            raise HTTPException(status_code=400, detail="Review cannot be started from current status")

        review.status = "in_progress"
        review.started_at = datetime.utcnow()
        db.commit()
        db.refresh(review)
        return review


# Create service instance
review_workflow_service = ReviewWorkflowService()
