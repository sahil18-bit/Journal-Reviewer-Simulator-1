"""Small, rule-based journal review simulator endpoints.

This is a transparent demo engine, not an expert peer-review system or an LLM.
Manuscript contents are processed in memory and are not saved to disk.
"""

from __future__ import annotations

import io
import re
import uuid
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter(tags=["reviews"])
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
# Only the generated review report is kept in memory; source manuscript text is not retained.
_REVIEWS: dict[str, dict[str, Any]] = {}

PANEL_FOCI = {
    "general": ["Research contribution and overall clarity", "Methods and reproducibility", "Evidence, limitations and presentation"],
    "methods": ["Study design and methodology", "Statistical analysis and reproducibility", "Results and interpretation"],
    "clinical": ["Ethics and participant protection", "Study design and outcome reporting", "Clinical relevance and limitations"],
    "theory": ["Novelty and theoretical contribution", "Related work and conceptual clarity", "Evidence and implications"],
}


def _extract_text(filename: str, content: bytes) -> str:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    try:
        if ext == "txt":
            return content.decode("utf-8-sig", errors="replace")
        if ext == "pdf":
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        if ext == "docx":
            from docx import Document
            doc = Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read the uploaded {ext.upper()} file. Try a text file or paste the manuscript.") from exc
    raise HTTPException(status_code=415, detail="Unsupported file type. Upload a PDF, DOCX, or TXT file.")


def _has_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def _build_review(text: str, journal: str, reviewers: int, strictness: str, panel: str) -> dict[str, Any]:
    clean = re.sub(r"\s+", " ", text).strip()
    lower = clean.lower()
    words = re.findall(r"\b[\w'-]+\b", clean)
    word_count = len(words)
    sections = {
        "Abstract": ("abstract",),
        "Introduction": ("introduction", "background"),
        "Methods": ("methods", "methodology", "materials and methods", "study design"),
        "Results": ("results", "findings"),
        "Discussion": ("discussion",),
        "Conclusion": ("conclusion", "concluding remarks"),
        "References": ("references", "bibliography"),
    }
    present = [name for name, variants in sections.items() if _has_any(lower, variants)]
    missing = [name for name in sections if name not in present]
    abstract_words = 0
    m = re.search(r"(?:abstract)\s*[:\n-]?\s*(.{20,1500}?)(?=\b(?:keywords|introduction|1\.?\s*introduction)\b|$)", clean, re.I)
    if m:
        abstract_words = len(re.findall(r"\b[\w'-]+\b", m.group(1)))

    findings: list[dict[str, str]] = []
    def add(severity: str, section: str, text_msg: str, quote: str | None = None) -> None:
        item = {"id": f"c{len(findings)+1}", "severity": severity, "section": section, "text": text_msg}
        if quote:
            item["quote"] = quote
        findings.append(item)

    if "Methods" in missing:
        add("major", "Methods", "A clearly labelled methods or methodology section was not detected. Describe the study design, data sources, procedures, and analysis steps so readers can assess reproducibility.")
    if "Results" in missing:
        add("major", "Results", "A clearly labelled results or findings section was not detected. Present the main findings directly and connect them to the research questions.")
    if "References" in missing:
        add("major", "References", "A references or bibliography section was not detected. Add complete, consistently formatted citations for the sources used.")
    if "Abstract" in missing:
        add("major", "Abstract", "An abstract section was not detected. Consider summarizing the research question, approach, principal findings, and contribution in a structured abstract.")
    elif abstract_words and abstract_words < 100:
        add("minor", "Abstract", "The detected abstract appears short. Check the target journal's word limit and ensure it covers the objective, method, main result, and contribution.")
    if "Introduction" in missing:
        add("minor", "Introduction", "A clearly labelled introduction or background section was not detected. Make the research gap and objectives easy to identify.")
    if "Discussion" in missing and "Conclusion" not in missing:
        add("minor", "Discussion", "A discussion section was not detected. Explain how the findings relate to prior work, and acknowledge limitations.")
    if not _has_any(lower, ("limitation", "limitations", "future work", "future research")):
        add("minor", "Limitations", "No explicit limitations or future-work discussion was detected. State the main constraints and what they mean for interpreting the findings.")
    if not _has_any(lower, ("data availability", "available at", "github.com", "doi.org", "supplementary material", "code availability")):
        add("minor", "Data and code availability", "No data/code availability statement or repository link was detected. Add one if appropriate for the study and journal.")
    if not _has_any(lower, ("ethics approval", "ethical approval", "informed consent", "institutional review board", "irb")) and panel == "clinical":
        add("major", "Ethics", "For clinical or human-participant research, state the relevant ethics approval and consent arrangements, or explain why they do not apply.")
    if word_count < 250:
        add("major", "Overall manuscript", "The submitted text is very short for a full manuscript. The simulator may not have enough context to assess the study; provide the full paper for a more useful checklist.")
    elif word_count < 700:
        add("minor", "Overall manuscript", "The supplied text is relatively short. Confirm that the complete manuscript, including relevant tables, figures, methods, and references, was provided.")
    if not findings:
        add("minor", "Overall manuscript", "The basic section checks did not flag a major structural omission. This is not evidence that the methods, results, citations, or claims are scientifically valid; those require expert assessment.")

    strictness = strictness if strictness in {"lenient", "standard", "harsh"} else "standard"
    if strictness == "harsh":
        for item in findings:
            if item["severity"] == "minor":
                item["severity"] = "major"
    elif strictness == "lenient":
        for item in findings:
            if item["severity"] == "major" and item["section"] not in {"Methods", "Results", "References", "Ethics", "Overall manuscript"}:
                item["severity"] = "minor"

    focus = PANEL_FOCI.get(panel, PANEL_FOCI["general"])
    names = ["Reviewer 1", "Reviewer 2", "Reviewer 3"]
    reviewer_results = []
    for i in range(reviewers):
        reviewer_comments = findings[i::reviewers] or findings[:1]
        major_count = sum(c["severity"] == "major" for c in reviewer_comments)
        if major_count >= 2:
            recommendation = "major_revision"
        elif major_count == 1 or any(c["severity"] == "minor" for c in reviewer_comments):
            recommendation = "minor_revision" if major_count == 0 else "major_revision"
        else:
            recommendation = "accept"
        summary = (
            f"This simulated review checked the provided text ({word_count} words) for common manuscript structure and reporting signals. "
            f"It identified {sum(c['severity']=='major' for c in reviewer_comments)} major and "
            f"{sum(c['severity']=='minor' for c in reviewer_comments)} minor checklist concern(s). "
            "It does not verify scientific correctness, novelty, data validity, or the accuracy of citations."
        )
        reviewer_results.append({
            "id": f"r{i+1}", "name": names[i], "focus": focus[i % len(focus)],
            "recommendation": recommendation, "summary": summary,
            "strengths": [
                f"The submission contains approximately {word_count} words for the simulator to inspect.",
                "The report identifies common reporting items for the author to verify manually.",
            ],
            "comments": reviewer_comments,
        })

    recs = [r["recommendation"] for r in reviewer_results]
    if "major_revision" in recs:
        decision = "major_revision"
    elif "minor_revision" in recs:
        decision = "minor_revision"
    elif all(x == "accept" for x in recs):
        decision = "accept"
    else:
        decision = "reject"
    return {"status": "done", "decision": decision, "reviewers": reviewer_results, "simulated": True}


@router.post("/reviews", summary="Create a simulated manuscript review")
async def create_review(
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    journal: str = Form(default=""),
    reviewers: int = Form(default=3, ge=1, le=3),
    strictness: str = Form(default="standard"),
    panel: str = Form(default="general"),
) -> dict[str, str]:
    """Accept a manuscript and return an ID for the generated simulated review."""
    if file is not None:
        content = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="The uploaded file exceeds the 20 MB limit.")
        manuscript = _extract_text(file.filename or "upload.txt", content)
    else:
        manuscript = text or ""
    if len(manuscript.strip()) < 100:
        raise HTTPException(status_code=400, detail="Provide at least 100 characters of manuscript text or upload a readable document.")
    if strictness not in {"lenient", "standard", "harsh"}:
        raise HTTPException(status_code=400, detail="Strictness must be lenient, standard, or harsh.")
    if panel not in PANEL_FOCI:
        raise HTTPException(status_code=400, detail="Choose a supported reviewer panel.")

    report_id = str(uuid.uuid4())
    result = _build_review(manuscript, journal.strip(), reviewers, strictness, panel)
    result["id"] = report_id
    _REVIEWS[report_id] = result
    return {"id": report_id}


@router.get("/reviews/{review_id}", summary="Retrieve a simulated manuscript review")
async def get_review(review_id: str) -> dict[str, Any]:
    """Return a generated report while the API process remains running."""
    result = _REVIEWS.get(review_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Review not found. It may have expired after a server restart.")
    return result
