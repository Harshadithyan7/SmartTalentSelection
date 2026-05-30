import json
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import STORAGE_DIR
from app.db.database import get_db
from app.models.resume import Resume
from app.services.gemini_analyzer import analyze_resume_text
from app.services.resume_extractor import extract_text_from_pdf

router = APIRouter(prefix="/api/resumes", tags=["resumes"])


@router.post("/upload")
async def upload_resumes(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files were uploaded.",
        )

    uploaded_items = []

    for file in files:
        filename = file.filename or "unknown.pdf"
        extension = Path(filename).suffix.lower()

        if extension != ".pdf":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only PDF files are allowed: {filename}",
            )

        stored_file_name = f"{uuid4()}.pdf"
        stored_path = STORAGE_DIR / stored_file_name

        content = await file.read()
        stored_path.write_bytes(content)

        resume = Resume(
            original_file_name=filename,
            stored_file_name=stored_file_name,
            file_path=str(stored_path),
            status="queued",
        )
        db.add(resume)
        db.flush()

        uploaded_items.append(
            {
                "id": resume.id,
                "original_file_name": resume.original_file_name,
                "status": resume.status,
                "uploaded_at": resume.uploaded_at.isoformat(),
            }
        )

    db.commit()

    return {"message": "Resumes uploaded successfully.", "items": uploaded_items}


@router.get("")
def list_resumes(db: Session = Depends(get_db)):
    resumes = db.query(Resume).order_by(Resume.uploaded_at.desc()).all()
    return {
        "items": [
            {
                "id": resume.id,
                "original_file_name": resume.original_file_name,
                "status": resume.status,
                "uploaded_at": resume.uploaded_at.isoformat(),
                "processed_at": resume.processed_at.isoformat() if resume.processed_at else None,
                "ats_score": resume.ats_score,
                "has_analysis": bool(resume.analysis_json),
                "error_message": resume.error_message,
            }
            for resume in resumes
        ]
    }


@router.post("/process")
def process_resumes(db: Session = Depends(get_db)):
    queued_resumes = db.query(Resume).filter(Resume.status == "queued").all()

    if not queued_resumes:
        return {"message": "No queued resumes found.", "processed": 0, "failed": 0}

    processed_count = 0
    failed_count = 0

    for resume in queued_resumes:
        resume.status = "processing"
        resume.error_message = None
        db.flush()

        try:
            extracted_text = extract_text_from_pdf(resume.file_path)
            if not extracted_text:
                raise ValueError("No extractable text found in the PDF.")

            resume.extracted_text = extracted_text
            resume.status = "completed"
            resume.processed_at = datetime.utcnow()
            processed_count += 1
        except Exception as exc:  # noqa: BLE001
            resume.status = "failed"
            resume.error_message = str(exc)
            resume.processed_at = datetime.utcnow()
            failed_count += 1

    db.commit()

    return {
        "message": "Resume processing completed.",
        "processed": processed_count,
        "failed": failed_count,
    }


@router.post("/analyze")
def analyze_resumes(db: Session = Depends(get_db)):
    resumes_for_analysis = (
        db.query(Resume)
        .filter(Resume.status.in_(["completed", "analysis_failed"]))
        .filter(Resume.extracted_text.is_not(None))
        .all()
    )

    if not resumes_for_analysis:
        return {"message": "No completed resumes ready for analysis.", "analyzed": 0, "failed": 0}

    analyzed_count = 0
    failed_count = 0

    for resume in resumes_for_analysis:
        resume.status = "analyzing"
        resume.error_message = None
        db.flush()

        try:
            analysis = analyze_resume_text(resume.extracted_text or "")
            resume.analysis_json = json.dumps(analysis)
            resume.ats_score = int(analysis.get("ats_score", 0))
            resume.status = "analyzed"
            analyzed_count += 1
        except Exception as exc:  # noqa: BLE001
            resume.status = "analysis_failed"
            resume.error_message = str(exc)
            failed_count += 1

    db.commit()

    return {
        "message": "Resume analysis completed.",
        "analyzed": analyzed_count,
        "failed": failed_count,
    }
