"""Local short-answer and expression-output grouping."""

import json

from auto_marking.answer_grouping import handle_grouping_request

MAX_REQUEST_BYTES = 10 * 1024 * 1024


def group_responses(self):
    if self.headers.get_content_type() != "application/json":
        self.send_json(415, {"message": "Send a JSON grouping request."})
        return
    length = self.headers.get("Content-Length", "")
    if self.headers.get("Transfer-Encoding") or not length.isascii() or not length.isdecimal():
        self.send_json(400, {"message": "A valid Content-Length is required."})
        return
    if len(length) > 10 or not 0 < int(length) <= MAX_REQUEST_BYTES:
        self.send_json(413, {"message": "Group up to 10,000 responses within 10 MB."})
        return
    try:
        self.connection.settimeout(15)
        content = self.rfile.read(int(length))
        if len(content) != int(length):
            raise ValueError("The grouping request was incomplete.")
        payload = json.loads(content)
        if not isinstance(payload, dict) or set(payload) != {"question_type", "unicode_spaces", "answers"}:
            raise ValueError("Send question_type, unicode_spaces and answers.")
        if payload["question_type"] not in ("short-answer", "expression-output"):
            raise ValueError("Grouping is available for short-answer and expression-output questions.")
        spaces = payload["unicode_spaces"]
        if not isinstance(spaces, list) or len(spaces) > 16 or not all(isinstance(char, str) and len(char) == 1 for char in spaces):
            raise ValueError("Choose supported Unicode space replacements.")
        mode = "exact" if payload["question_type"] == "expression-output" else "spaces"
        result = handle_grouping_request({"answers": payload["answers"]}, mode=mode, unicode_spaces=spaces)
    except (TypeError, ValueError, UnicodeError):
        self.send_json(422, {"message": "Invalid grouping request. Use one short-answer or expression-output question and unique submission IDs. Space replacements apply only to short answers."})
    except TimeoutError:
        self.send_json(408, {"message": "The grouping upload timed out. Retry."})
    except Exception:
        self.send_json(500, {"message": "Grouping could not finish. Retry or mark students individually."})
    else:
        self.send_json(200, result)
