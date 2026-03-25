"""
Smart Talent Selection — Resume Summariser API
Accepts PDF, DOCX, or image files and returns a structured resume summary
powered by Google Gemini AI.
"""

import io
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
    description="Upload a resume (PDF / DOCX / Image) and get an AI‑generated summary.",
    version="1.0.0",
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
MODEL = "gemini-3-flash-preview"

# ---------------------------------------------------------------------------
# Allowed file types
# ---------------------------------------------------------------------------
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}

# ---------------------------------------------------------------------------
# Prompt
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


# ---------------------------------------------------------------------------
# Core: call Gemini
# ---------------------------------------------------------------------------
async def _summarise_with_gemini(
    text: str | None = None,
    image_bytes_list: list[bytes] | None = None,
) -> str:
    """Send content to Gemini and return the summary."""

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
    parts.append(types.Part.from_text(text=RESUME_SUMMARY_PROMPT))

    response = _get_client().models.generate_content(
        model=MODEL,
        contents=[types.Content(role="user", parts=parts)],
    )

    return response.text


# ---------------------------------------------------------------------------
# Endpoint
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

    text: str | None = None
    images: list[bytes] = []

    try:
        if ext == ".docx":
            text = _extract_text_from_docx(file_bytes)
            if not text:
                raise HTTPException(
                    status_code=422,
                    detail="Could not extract any text from the DOCX file.",
                )

        elif ext == ".pdf":
            text, images = _extract_content_from_pdf(file_bytes)
            if not text and not images:
                raise HTTPException(
                    status_code=422,
                    detail="Could not extract text or images from the PDF.",
                )

        elif ext in IMAGE_EXTENSIONS:
            # Validate it's a real image, then pass raw bytes
            try:
                img = Image.open(io.BytesIO(file_bytes))
                img.verify()
            except Exception:
                raise HTTPException(
                    status_code=422, detail="Uploaded file is not a valid image."
                )
            images = [file_bytes]

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Error processing the file: {exc}"
        )

    # Call Gemini
    try:
        summary = await _summarise_with_gemini(text=text, image_bytes_list=images or None)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Gemini API error: {exc}"
        )

    return {
        "filename": file.filename,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    return {"status": "ok", "message": "Smart Talent Selection API is running."}


# ---------------------------------------------------------------------------
# Run with: uvicorn main:app --reload
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
