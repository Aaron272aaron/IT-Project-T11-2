"""Local development API: python3 backend/server.py (no extra packages)."""

import argparse
import json
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from canvas_import import MAX_UPLOAD_BYTES, preview_csv
from rubric_preview import MAX_RUBRIC_BYTES, convert_docx


# Python creates a handler for an incoming connection. The base class reads
# the HTTP request and calls do_GET() when the browser uses the GET method.
class ApiHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Only the prepared local sample is served; no arbitrary file path is accepted.
        if urlsplit(self.path).path == "/api/demo/sample-exam":
            try:
                payload = json.loads((Path(__file__).parent / "demo/sample-exam.json").read_text(encoding="utf-8"))
                self.send_json(200, payload)
            except (OSError, ValueError):
                self.send_json(503, {"message": "Prepare the sample with python3 backend/build_sample_exam.py, then retry."})
            return
        # Read the path without any query parameters, such as ?check=1.
        # Handle only our API route; never serve project files from disk.
        if urlsplit(self.path).path != "/api/health":
            self.send_json(404, {"status": "error", "message": "接口不存在"})
            return

        # Browser tests use this small readiness probe before uploading CSVs.
        # It is infrastructure, not a separate user-facing connection workflow.
        self.send_json(200, {"status": "ok", "service": "automarktic-python"})

    def do_POST(self):
        if urlsplit(self.path).path == "/api/rubric/convert":
            self.convert_rubric()
            return
        # Only this endpoint accepts file bytes; no project path is accepted.
        if urlsplit(self.path).path != "/api/canvas/preview":
            self.send_json(404, {"status": "error", "message": "接口不存在"})
            return
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

    # Convert a Python value into an HTTP response the browser can understand.
    def send_json(self, status, payload):
        # Encode first: Content-Length counts bytes, not Chinese characters.
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
        # Headers describe the response; the body below contains the data.
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # Do not retain student preview responses in the HTTP cache.
        self.send_header("Cache-Control", "no-store")
        # Finish the headers before writing the UTF-8 JSON bytes.
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            # Clearing the page can disconnect while Python finishes parsing.
            pass


def main():
    # Read an optional --port argument; normal development uses port 8000.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")

    # This first-step development server is reachable only on this computer.
    # The context manager closes the listening socket when this block ends.
    with ThreadingHTTPServer(("127.0.0.1", args.port), ApiHandler) as server:
        print(f"Python API: http://127.0.0.1:{args.port}", flush=True)
        print("Keep this terminal open. Press Ctrl+C to stop.", flush=True)
        try:
            # Keep waiting for requests instead of exiting after one reply.
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nPython API stopped.", flush=True)


# Start listening only when this file is run directly, not when imported.
if __name__ == "__main__":
    main()
