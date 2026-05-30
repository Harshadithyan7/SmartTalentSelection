from pathlib import Path

from pypdf import PdfReader


def extract_text_from_pdf(file_path: str) -> str:
    path = Path(file_path)
    reader = PdfReader(str(path))

    extracted_chunks: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            extracted_chunks.append(page_text.strip())

    return "\n\n".join(extracted_chunks).strip()

