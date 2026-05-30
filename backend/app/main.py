from fastapi import FastAPI
from sqlalchemy import text

from app.api.resume_routes import router as resume_router
from app.db.database import Base, engine
from app.models.resume import Resume  # noqa: F401

Base.metadata.create_all(bind=engine)


def ensure_resume_columns() -> None:
    with engine.begin() as conn:
        columns = conn.execute(text("PRAGMA table_info(resumes)")).fetchall()
        column_names = {column[1] for column in columns}

        if "extracted_text" not in column_names:
            conn.execute(text("ALTER TABLE resumes ADD COLUMN extracted_text TEXT"))
        if "analysis_json" not in column_names:
            conn.execute(text("ALTER TABLE resumes ADD COLUMN analysis_json TEXT"))
        if "ats_score" not in column_names:
            conn.execute(text("ALTER TABLE resumes ADD COLUMN ats_score INTEGER"))
        if "error_message" not in column_names:
            conn.execute(text("ALTER TABLE resumes ADD COLUMN error_message TEXT"))
        if "processed_at" not in column_names:
            conn.execute(text("ALTER TABLE resumes ADD COLUMN processed_at DATETIME"))


ensure_resume_columns()

app = FastAPI(title="Smart Talent Selection API")

app.include_router(resume_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
