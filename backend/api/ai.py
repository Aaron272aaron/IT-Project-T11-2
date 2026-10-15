"""HTTP boundary for a local AI syntax-fix recommendation."""

import json
from .ai_cache import cached_review

from ai_tools.ai_recommendation import suggest_fix, ModelUnavailable, ModelBusy
from ai_tools.model_download import model_download

MAX_REQUEST_BYTES = 64 * 1024


def model_status(self):
    self.send_json(200, model_download.status())


def download_model(self):
    from .auth import _payload
    from backend.security.accounts import AccountError
    try:
        _payload(self, set())
        model_download.start()
    except AccountError as error:
        self.send_json(error.status, {"message": str(error)})
    except ValueError as error:
        self.send_json(409, {"message": str(error)})
    else:
        self.send_json(202, model_download.status())


def cancel_model_download(self):
    from .auth import _payload
    from backend.security.accounts import AccountError
    try:
        _payload(self, set())
        model_download.cancel()
    except AccountError as error:
        self.send_json(error.status, {"message": str(error)})
    else:
        self.send_json(202, model_download.status())


def recommend_fix(self):
    if self.headers.get_content_type() != "application/json":
        self.send_json(415, {"message": "Send a JSON object containing code."})
        return
    length = self.headers.get("Content-Length", "")
    if self.headers.get("Transfer-Encoding") or not length.isascii() or not length.isdecimal():
        self.send_json(400, {"message": "A valid Content-Length is required."})
        return
    if len(length) > 10 or not 0 < int(length) <= MAX_REQUEST_BYTES:
        self.send_json(413, {"message": "The AI review request is too large or empty."})
        return
    try:
        self.connection.settimeout(15)
        content = self.rfile.read(int(length))
        if len(content) != int(length):
            raise ValueError("The AI review request was incomplete.")
        payload = json.loads(content)
        if not isinstance(payload, dict):
            raise ValueError("Send a JSON object containing code.")
        result = cached_review(self, payload)
    except (ValueError, UnicodeError) as error:
        self.send_json(422, {"message": str(error)})
    except TimeoutError:
        self.send_json(408, {"message": "The AI review request timed out."})
    except ModelBusy as error:
        self.send_json(429, {"message": str(error)})
    except ModelUnavailable as error:
        self.send_json(503, {"message": str(error)})
    except Exception:
        self.send_json(500, {"message": "AI review is unavailable. You can continue marking manually."})
    else:
        self.send_json(200, result)
