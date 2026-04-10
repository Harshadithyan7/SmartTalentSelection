"""
Smart Talent Selection — HR Resume Comparison API
Accepts multiple PDF, DOCX, or image resumes and returns a structured
comparison table powered by Google Gemini AI.
"""

import io
import json
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from PIL import Image

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Smart Talent Selection",
    description="Upload multiple resumes and get an AI‑powered comparison table.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Gemini client (reads GEMINI_API_KEY from environment, lazy init)
# ---------------------------------------------------------------------------
_client: genai.Client | None = None


def _get_client() -> genai.Client:
    """Lazily initialise and return the Gemini client."""
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            raise HTTPException(
                status_code=500,
                detail=(
                    "GEMINI_API_KEY environment variable is not set. "
                    "Export it and restart the server."
                ),
            )
        _client = genai.Client(api_key=api_key)
    return _client

MODEL = "gemini-2.5-flash-preview-04-17"

# ---------------------------------------------------------------------------
# Allowed file types
# ---------------------------------------------------------------------------
ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB per file
MAX_FILES = 20  # Maximum number of files per comparison

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------
RESUME_SUMMARY_PROMPT = """You are an expert HR assistant. Analyse the following resume and 
return a **structured summary** in the format below. If a section is missing from the 
resume, write "Not mentioned".

## Candidate Summary

**Name:**  
**Email:**  
**Phone:**  
**Location:**  

### Professional Summary
(2‑3 sentence overview of the candidate)

### Skills
- (list key skills)

### Experience
| Company | Role | Duration | Highlights |
|---------|------|----------|------------|
| … | … | … | … |

### Education
| Institution | Degree | Year |
|-------------|--------|------|
| … | … | … |

### Certifications
- (list certifications, if any)

### Projects
- (list notable projects, if any)

### Overall Assessment
(Brief assessment of the candidate's profile — strengths, potential fit areas, and gaps)
"""

RESUME_JSON_PROMPT = """You are an expert HR assistant. Analyse the following resume and 
return a **structured JSON object** (no markdown, no code fences, just pure JSON) with 
exactly this schema:

{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "+1234567890",
  "location": "City, Country",
  "professional_summary": "2-3 sentence overview",
  "skills": ["skill1", "skill2", "skill3"],
  "experience": [
    {
      "company": "Company Name",
      "role": "Job Title",
      "duration": "Start - End",
      "highlights": "Key achievements"
    }
  ],
  "total_experience_years": 5,
  "education": [
    {
      "institution": "University Name",
      "degree": "Degree Name",
      "year": "2020"
    }
  ],
  "certifications": ["cert1", "cert2"],
  "projects": ["project1", "project2"],
  "strengths": ["strength1", "strength2"],
  "gaps": ["gap1", "gap2"]
}

If a field is missing from the resume, use null for strings/numbers or an empty 
array [] for lists. For total_experience_years, estimate from the experience entries 
if not stated explicitly. Return ONLY valid JSON, nothing else.
"""


# ---------------------------------------------------------------------------
# Helper: extract text from DOCX
# ---------------------------------------------------------------------------
def _extract_text_from_docx(file_bytes: bytes) -> str:
    """Return plain‑text content of a .docx file."""
    from docx import Document

    doc = Document(io.BytesIO(file_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


# ---------------------------------------------------------------------------
# Helper: extract text from PDF (with image fallback for scanned PDFs)
# ---------------------------------------------------------------------------
def _extract_content_from_pdf(file_bytes: bytes) -> tuple[str | None, list[bytes]]:
    """Return (text, images) extracted from a PDF.

    If the PDF contains selectable text it is returned directly.
    For scanned / image‑only PDFs the page images are returned so Gemini
    can perform OCR via its vision capabilities.
    """
    import fitz  # PyMuPDF

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    full_text = ""
    images: list[bytes] = []

    for page in doc:
        page_text = page.get_text()
        if page_text.strip():
            full_text += page_text + "\n"
        else:
            # Scanned page — render as image
            pix = page.get_pixmap(dpi=200)
            images.append(pix.tobytes("png"))

    doc.close()
    return (full_text.strip() or None, images)


def extract_text_and_images(file_bytes: bytes, ext: str):
    """Extract text and/or images from a resume file."""
    text = None
    images = []

    if ext == ".docx":
        text = _extract_text_from_docx(file_bytes)
    elif ext == ".pdf":
        text, images = _extract_content_from_pdf(file_bytes)
    elif ext in IMAGE_EXTENSIONS:
        try:
            img = Image.open(io.BytesIO(file_bytes))
            img.verify()
            images = [file_bytes]
        except Exception:
            raise HTTPException(status_code=422, detail="Uploaded file is not a valid image.")

    return text, images


# ---------------------------------------------------------------------------
# Core: call Gemini
# ---------------------------------------------------------------------------
async def _summarise_with_gemini(
    text: str | None = None,
    image_bytes_list: list[bytes] | None = None,
    prompt: str = RESUME_SUMMARY_PROMPT,
) -> str:
    """Send content to Gemini and return the response text."""

    parts: list[types.Part] = []

    # Add text if available
    if text:
        parts.append(types.Part.from_text(text=text))

    # Add images if available
    if image_bytes_list:
        for img_bytes in image_bytes_list:
            parts.append(
                types.Part.from_bytes(data=img_bytes, mime_type="image/png")
            )

    # Always append the instruction prompt last
    parts.append(types.Part.from_text(text=prompt))

    response = _get_client().models.generate_content(
        model=MODEL,
        contents=[types.Content(role="user", parts=parts)],
    )

    return response.text


def _parse_json_response(raw: str) -> dict:
    """Attempt to parse a JSON response from Gemini, stripping markdown fences if present."""
    text = raw.strip()
    # Remove markdown code fences
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json or ```) and last line (```)
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    return json.loads(text)


# ---------------------------------------------------------------------------
# Endpoint: Single resume summary (backward compatible)
# ---------------------------------------------------------------------------
@app.post("/summarise")
async def summarise_resume(file: UploadFile = File(...)):
    """Upload a resume file and receive an AI‑generated summary."""

    # Validate file extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type '{ext}'. "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            ),
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {MAX_FILE_SIZE // (1024*1024)}MB)."
        )

    return await process_upload(file.filename, file_bytes, ext)


@app.post("/upload")
async def upload_resume(file: UploadFile = File(...)):
    """Handle file upload separately; returns the summary and storage info."""

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type '{ext}'. "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            ),
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {MAX_FILE_SIZE // (1024*1024)}MB)."
        )

    saved_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext, prefix="resume-") as tmp:
            tmp.write(file_bytes)
            saved_path = tmp.name

        summary = await _summarise_with_gemini(*extract_text_and_images(file_bytes, ext))

        return {
            "filename": file.filename,
            "path": saved_path,
            "summary": summary,
            "message": "Upload successful",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Upload/process error: {exc}")


async def process_upload(filename: str, file_bytes: bytes, ext: str):
    text, images = extract_text_and_images(file_bytes, ext)

    if ext == ".docx" and not text:
        raise HTTPException(status_code=422, detail="Could not extract any text from the DOCX file.")

    if ext == ".pdf" and not text and not images:
        raise HTTPException(status_code=422, detail="Could not extract text or images from the PDF.")

    if ext in IMAGE_EXTENSIONS and not images:
        raise HTTPException(status_code=422, detail="Could not process the image file.")

    summary = await _summarise_with_gemini(text=text, image_bytes_list=images or None)
    return {
        "filename": filename,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Endpoint: Multi‑resume comparison
# ---------------------------------------------------------------------------
@app.post("/compare")
async def compare_resumes(files: list[UploadFile] = File(...)):
    """Upload multiple resume files and receive a structured comparison."""

    if len(files) < 2:
        raise HTTPException(
            status_code=400,
            detail="Please upload at least 2 resumes for comparison.",
        )
    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files. Maximum {MAX_FILES} resumes per comparison.",
        )

    candidates = []
    errors = []

    for idx, file in enumerate(files):
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            errors.append({
                "filename": file.filename,
                "error": f"Unsupported file type '{ext}'",
            })
            continue

        file_bytes = await file.read()
        if not file_bytes:
            errors.append({"filename": file.filename, "error": "File is empty"})
            continue
        if len(file_bytes) > MAX_FILE_SIZE:
            errors.append({
                "filename": file.filename,
                "error": f"File too large (max {MAX_FILE_SIZE // (1024*1024)}MB)",
            })
            continue

        try:
            text, images = extract_text_and_images(file_bytes, ext)

            # Request structured JSON from Gemini
            raw_response = await _summarise_with_gemini(
                text=text,
                image_bytes_list=images or None,
                prompt=RESUME_JSON_PROMPT,
            )

            candidate_data = _parse_json_response(raw_response)
            candidate_data["_filename"] = file.filename
            candidate_data["_index"] = idx
            candidates.append(candidate_data)

        except json.JSONDecodeError:
            # Retry once if JSON parsing fails
            try:
                raw_response = await _summarise_with_gemini(
                    text=text,
                    image_bytes_list=images or None,
                    prompt=RESUME_JSON_PROMPT + "\n\nIMPORTANT: Return ONLY valid JSON. No markdown formatting.",
                )
                candidate_data = _parse_json_response(raw_response)
                candidate_data["_filename"] = file.filename
                candidate_data["_index"] = idx
                candidates.append(candidate_data)
            except Exception as e:
                errors.append({
                    "filename": file.filename,
                    "error": f"Failed to parse AI response: {str(e)}",
                })
        except Exception as e:
            errors.append({
                "filename": file.filename,
                "error": str(e),
            })

    if not candidates:
        raise HTTPException(
            status_code=422,
            detail="Could not process any of the uploaded resumes.",
        )

    # Build comparison data
    all_skills = set()
    for c in candidates:
        for s in (c.get("skills") or []):
            all_skills.add(s.strip().lower())

    return {
        "candidates": candidates,
        "total_processed": len(candidates),
        "errors": errors,
        "all_skills": sorted(all_skills),
    }


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    return {"status": "ok", "message": "Smart Talent Selection API v2.0 is running."}


# ---------------------------------------------------------------------------
# Run with: uvicorn main:app --reload
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
