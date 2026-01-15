"""Document export endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional
import os

from app.database import get_db
from app.models.form import FormInstance, FormVersion
from app.services.document import DocumentService

router = APIRouter(prefix="/api/export", tags=["export"])


@router.post("/form/{form_id}/generate")
async def generate_documents(
    form_id: int,
    version_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Generate DOCX and PDF documents for a form."""
    # Verify form exists
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    # Generate documents (uses current form data if no version_id provided)
    docx_path, pdf_path = DocumentService.generate_documents(db, form_id, version_id)

    return {
        "success": True,
        "docx_path": docx_path,
        "pdf_path": pdf_path,
    }


@router.get("/form/{form_id}/docx")
async def download_docx(
    form_id: int,
    version_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Download DOCX document for a form."""
    # Verify form exists
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    # Check if documents exist
    if version_id:
        version = db.query(FormVersion).filter(FormVersion.id == version_id).first()
        if version and version.generated_docx_path and os.path.exists(version.generated_docx_path):
            return FileResponse(
                path=version.generated_docx_path,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                filename=f"{form.title.replace(' ', '_')}.docx",
            )

    # Generate documents if they don't exist
    docx_path, _ = DocumentService.generate_documents(db, form_id, version_id)

    return FileResponse(
        path=docx_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"{form.title.replace(' ', '_')}.docx",
    )


@router.get("/form/{form_id}/pdf")
async def download_pdf(
    form_id: int,
    version_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Download PDF document for a form."""
    # Verify form exists
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    # Check if documents exist
    if version_id:
        version = db.query(FormVersion).filter(FormVersion.id == version_id).first()
        if version and version.generated_pdf_path and os.path.exists(version.generated_pdf_path):
            return FileResponse(
                path=version.generated_pdf_path,
                media_type="application/pdf",
                filename=f"{form.title.replace(' ', '_')}.pdf",
            )

    # Generate documents if they don't exist
    _, pdf_path = DocumentService.generate_documents(db, form_id, version_id)

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"{form.title.replace(' ', '_')}.pdf",
    )
