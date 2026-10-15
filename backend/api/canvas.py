"""Canvas CSV upload endpoint."""

from ..services.canvas_import import MAX_UPLOAD_BYTES, preview_csv


def preview_canvas(self):
    if self.headers.get_content_type() != "text/csv":
        self.send_json(415, {"status": "error", "message": "Send a CSV file with Content-Type: text/csv."})
        return
    # Bound requests on the server too: browser checks can be bypassed.
    length = self.headers.get("Content-Length", "")
    if self.headers.get("Transfer-Encoding") or not length.isascii() or not length.isdecimal():
        self.send_json(400, {"status": "error", "message": "A valid Content-Length is required."})
        return
    if len(length) > 10 or int(length) > MAX_UPLOAD_BYTES:
        self.send_json(413, {"status": "error", "message": "Choose a CSV no larger than 10 MB."})
        return
    try:
        # A stalled or truncated upload must not wait forever or be parsed.
        self.connection.settimeout(15)
        content = self.rfile.read(int(length))
        if len(content) != int(length):
            self.send_json(400, {"status": "error", "message": "The CSV upload was incomplete. Try again."})
            return
        result = preview_csv(content)
    except TimeoutError:
        self.send_json(408, {"status": "error", "message": "The CSV upload timed out. Try again."})
        return
    except Exception:
        # Keep answers, decoder details and local paths out of error replies.
        self.send_json(500, {"status": "error", "message": "Python could not process the CSV. Please retry."})
        return
    self.send_json(422 if result["status"] == "invalid" else 200, result)
