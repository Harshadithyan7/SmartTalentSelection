import json
from textwrap import dedent

import google.generativeai as genai

from app.core.config import GEMINI_API_KEY, GEMINI_MODEL

FIXED_JOB_DESCRIPTION = dedent(
    """
    Software Engineer role.
    Required skills: Python, FastAPI, SQL, REST APIs, Git, problem solving, communication.
    Preferred skills: React, cloud basics, Docker.
    Education: Bachelor's degree in Computer Science or related field preferred.
    """
).strip()


def _extract_json_text(raw_text: str) -> str:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    return cleaned


def analyze_resume_text(resume_text: str) -> dict:
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set.")

    genai.configure(api_key=GEMINI_API_KEY)
    candidate_models = []
    if GEMINI_MODEL:
        candidate_models.append(GEMINI_MODEL)
    for fallback in ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"]:
        if fallback not in candidate_models:
            candidate_models.append(fallback)

    prompt = dedent(
        f"""
        You are an ATS resume analyst.
        Use this fixed job description:
        {FIXED_JOB_DESCRIPTION}

        Analyze the resume text and return ONLY valid JSON with this exact schema:
        {{
          "candidate_name": "string",
          "email": "string",
          "phone": "string",
          "summary": "string",
          "education": ["string"],
          "skills": ["string"],
          "relevant_projects": ["string"],
          "years_of_experience": 0,
          "ats_score": 0,
          "match_reasons": ["string"],
          "missing_skills": ["string"]
        }}

        Rules:
        - ats_score must be integer between 0 and 100.
        - If missing data, use empty string/empty array/0.
        - Do not include markdown, explanations, or extra keys.

        Resume text:
        {resume_text}
        """
    ).strip()

    last_error = None
    data = None

    for model_name in candidate_models:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            raw_text = response.text or ""
            json_text = _extract_json_text(raw_text)
            data = json.loads(json_text)
            break
        except Exception as exc:  # noqa: BLE001
            last_error = exc

    if data is None:
        raise ValueError(f"All Gemini model attempts failed: {last_error}")

    ats_score = int(data.get("ats_score", 0))
    data["ats_score"] = max(0, min(100, ats_score))
    return data
