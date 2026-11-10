"""Serve the prepared local demonstration; never accept arbitrary file paths."""

import json
from pathlib import Path


def sample_exam(self):
    try:
        payload = json.loads((Path(__file__).parent.parent / "data/sample-exam.json").read_text(encoding="utf-8"))
        self.send_json(200, payload)
    except (OSError, ValueError):
        self.send_json(503, {"message": "Prepare the sample with python3 -m backend.scripts.build_sample_exam, then retry."})
