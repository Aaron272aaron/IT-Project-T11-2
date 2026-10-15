"""Rubric import and document conversion endpoints."""

import json

from ..services.rubric_preview import MAX_RUBRIC_BYTES, convert_docx
from ..services.rubric_import import docx_lines, parse_rubric


def import_rubric(self):
    # DOCX is read directly; PDF text is extracted locally by the existing PDF.js viewer.
    kind = self.headers.get_content_type()
    if kind not in ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/json"):
        self.send_json(415, {"message": "Send a DOCX or extracted PDF text."})
        return
    length = self.headers.get("Content-Length", "")
    if self.headers.get("Transfer-Encoding") or not length.isascii() or not length.isdecimal():
        self.send_json(400, {"message": "A valid Content-Length is required."})
        return
    if len(length) > 10 or not 0 < int(length) <= MAX_RUBRIC_BYTES:
        self.send_json(413, {"message": "Choose a DOCX or extracted text no larger than 2 MB."})
        return
    try:
        self.connection.settimeout(15)
        content = self.rfile.read(int(length))
        if len(content) != int(length):
            raise ValueError("The document upload was incomplete.")
        if kind == "application/json":
            payload = json.loads(content)
            if not isinstance(payload, dict) or not isinstance(payload.get("text"), str):
                raise ValueError("PDF text must be a string.")
            lines = payload["text"].splitlines()
        else:
            lines = docx_lines(content)
        self.send_json(200, parse_rubric(lines))
    except (ValueError, UnicodeError) as error:
        self.send_json(422, {"message": str(error)})
    except TimeoutError:
        self.send_json(408, {"message": "The rubric upload timed out."})
    except Exception:
        self.send_json(500, {"message": "Python could not read the rubric. Check its format and retry."})


def convert_rubric(self):
    # DOCX conversion is separate from CSV parsing and accepts bytes only.
    if self.headers.get_content_type() != "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        self.send_json(415, {"message": "Send a DOCX document."})
        return
    length = self.headers.get("Content-Length", "")
    if self.headers.get("Transfer-Encoding") or not length.isascii() or not length.isdecimal():
        self.send_json(400, {"message": "A valid Content-Length is required."})
        return
    if len(length) > 10 or not 0 < int(length) <= MAX_RUBRIC_BYTES:
        self.send_json(413, {"message": "Choose a non-empty DOCX no larger than 2 MB."})
        return
    try:
        self.connection.settimeout(15)
        content = self.rfile.read(int(length))
        if len(content) != int(length):
            raise ValueError("The document upload was incomplete.")
        result = convert_docx(content)
    except ValueError as error:
        self.send_json(422, {"message": str(error)})
    except RuntimeError as error:
        self.send_json(503, {"message": str(error)})
    except TimeoutError:
        self.send_json(408, {"message": "The document upload timed out."})
    except Exception:
        self.send_json(500, {"message": "Python could not prepare the rubric preview."})
    else:
        self.send_json(200, result)
