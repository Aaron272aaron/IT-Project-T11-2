"""Build the local demonstration from the two supplied original files."""
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from canvas_import import preview_csv
from rubric_preview import convert_docx

ROOT = Path(__file__).resolve().parent.parent
CSV_NAME = "COMP10001 2025 Exam (only relevant for T01_11) Quiz Student Analysis Report.csv"
DOCX_NAME = "final-2025s1-marking-rubric (guide) to be updated.docx"
OUTPUT = ROOT / "backend/demo/sample-exam.json"


def build():
    csv_bytes = (ROOT / CSV_NAME).read_bytes()
    docx_bytes = (ROOT / DOCX_NAME).read_bytes()
    preview = preview_csv(csv_bytes)
    if preview["status"] == "invalid":
        raise ValueError("The supplied CSV no longer passes validation.")
    questions = [q for q in preview["preview"]["questions"] if not q["instruction"]]
    expected_ids = [3081158,3081159,3081160,3081161,3081162,3081163,3081164,3081165,3081166,
                    3081168,3081169,3081170,3081171,3081173,3081174,3081175,3081176,
                    3081178,3081179,3081180,3081181,3081182,3081184,3081185,3081186,
                    3081187,3081188,3081189,3081190,3081191,3081192,3081194,3081195,
                    3081196,3081198,3081199,3081200]
    if [q["id"] for q in questions] != list(map(str, expected_ids)):
        raise ValueError("Sample question IDs changed. Review the page mapping before rebuilding.")
    # Manually checked against the 24-page PDF preview of the supplied guide.
    ranges = [(7,8)]*9 + [(9,10)]*4 + [(10,10)]*4 + [(11,11)]*5 + [
        (12,12),(12,12),(12,13),(13,13),(13,13),(13,14),(14,14),(14,14),(15,15),
        (16,17),(18,18),(19,20),(21,21),(21,22),(22,22)]
    metadata = json.loads((ROOT / "backend/sample_rubric.json").read_text(encoding="utf-8"))
    if hashlib.sha256(docx_bytes).hexdigest() != metadata["docxSha256"]:
        raise ValueError("The rubric changed. Review its page ranges and categories before rebuilding.")
    document = convert_docx(docx_bytes)
    now = datetime.now(timezone.utc).isoformat()
    exam = {
        "id": "final", "title": "Sample exam", "sampleVersion": 1,
        "description": "COMP10001 2025 · 4 students · 37 questions · Supplied Canvas answers and marking guide",
        "rubric": {"name": DOCX_NAME, "size": len(docx_bytes), "uploadedAt": now,
                   "dataUrl": "data:application/octet-stream;base64," + base64.b64encode(docx_bytes).decode(),
                   "previewPdf": "data:application/pdf;base64," + document["pdf"], "pageCount": 24},
        "categories": {q["id"]: metadata["categoriesByQuestionNumber"].get(str(i+1), []) for i,q in enumerate(questions)},
        "autoMarkedQuestionIds": [questions[n-1]["id"] for n in metadata["autoMarkedQuestionNumbers"]],
        "rubricPages": {"canvas:"+q["id"]: {"start": start, "end": end} for q,(start,end) in zip(questions,ranges)},
        "answers": {"name": CSV_NAME, "uploadedAt": now, "preview": preview["preview"]},
        "sourceHashes": {CSV_NAME: hashlib.sha256(csv_bytes).hexdigest(), DOCX_NAME: hashlib.sha256(docx_bytes).hexdigest()},
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(exam, ensure_ascii=False), encoding="utf-8")
    print("Prepared local Sample exam: 4 students, 37 questions, 24 rubric pages.")

if __name__ == "__main__":
    build()
