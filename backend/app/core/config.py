import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(PROJECT_ROOT / "backend" / ".env")

DATABASE_DIR = PROJECT_ROOT / "database"
STORAGE_DIR = PROJECT_ROOT / "storage" / "resumes"
DATABASE_URL = f"sqlite:///{(DATABASE_DIR / 'app.db').as_posix()}"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
