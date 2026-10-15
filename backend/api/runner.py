"""Start isolated test jobs and retrieve their progress/results."""

import json
from urllib.parse import urlsplit

from auto_marking.jobs import create_run, get_run, RunnerBusy


def start_run(self):
    if self.headers.get_content_type() != "application/json":
        self.send_json(415, {"message": "Send a JSON test request."})
        return
    length = self.headers.get("Content-Length", "")
    if self.headers.get("Transfer-Encoding") or not length.isascii() or not length.isdecimal():
        self.send_json(400, {"message": "A valid Content-Length is required."})
        return
    if len(length) > 10 or not 0 < int(length) <= 64 * 1024:
        self.send_json(413, {"message": "The test request is too large or empty."})
        return
    try:
        self.connection.settimeout(15)
        content = self.rfile.read(int(length))
        if len(content) != int(length):
            raise ValueError("The test request was incomplete.")
        payload = json.loads(content)
        if not isinstance(payload, dict):
            raise ValueError("Send a JSON test request.")
        job = create_run(payload.get("questionKey"), payload.get("code"), payload.get("variant"))
    except (ValueError, UnicodeError) as error:
        self.send_json(422, {"message": str(error)})
    except TimeoutError:
        self.send_json(408, {"message": "The test upload timed out."})
    except RunnerBusy as error:
        self.send_json(429, {"message": str(error)})
    except Exception:
        self.send_json(500, {"message": "The test run could not be started."})
    else:
        self.send_json(202, job)


def read_run(self):
    job = get_run(urlsplit(self.path).path.removeprefix("/api/test-runs/"))
    if job is None:
        self.send_json(404, {"message": "This test result has expired. Run the tests again."})
    else:
        self.send_json(200, job)
