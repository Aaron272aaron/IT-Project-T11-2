"""Dispatch HTTP routes and send JSON responses."""

import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlsplit

from .ai_cache import read_reviews
from .exams import read_exams, save_exams
from .canvas import preview_canvas
from .demo import sample_exam
from .rubric import import_rubric, convert_rubric
from .ai import recommend_fix, model_status, download_model, cancel_model_download
from .runner import start_run, read_run
from .grouping import group_responses
from .auth import authorize, auth_request


class ApiHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/health":
            self.send_json(200, {"status": "ok", "service": "automarktic-python"})
        elif path.startswith("/api/auth/"):
            auth_request(self, path)
        elif not authorize(self, path):
            return
        elif path == "/api/ai/reviews":
            read_reviews(self)
        elif path == "/api/exams":
            read_exams(self)
        elif path == "/api/demo/sample-exam":
            sample_exam(self)
        elif path == "/api/ai/model":
            model_status(self)
        elif path.startswith("/api/test-runs/"):
            read_run(self)
        else:
            self.send_json(404, {"status": "error", "message": "API route not found."})

    def do_POST(self):
        path = urlsplit(self.path).path
        if path.startswith("/api/auth/"):
            auth_request(self, path)
            return
        if not authorize(self, path, mutation=True):
            return
        routes = {
            "/api/exams": save_exams,
            "/api/canvas/preview": preview_canvas,
            "/api/rubric/import": import_rubric,
            "/api/rubric/convert": convert_rubric,
            "/api/ai/suggest-fix": recommend_fix,
            "/api/ai/model/download": download_model,
            "/api/ai/model/cancel": cancel_model_download,
            "/api/test-runs": start_run,
            "/api/answer-groups": group_responses,
        }
        route = routes.get(urlsplit(self.path).path)
        if route is None:
            self.send_json(404, {"status": "error", "message": "API route not found."})
        else:
            route(self)

    def send_json(self, status, payload, headers=None):
        # Encode first: Content-Length counts bytes, not Chinese characters.
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
        # Headers describe the response; the body below contains the data.
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # Do not retain student preview responses in the HTTP cache.
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        # Finish the headers before writing the UTF-8 JSON bytes.
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            # Clearing the page can disconnect while Python finishes parsing.
            pass
