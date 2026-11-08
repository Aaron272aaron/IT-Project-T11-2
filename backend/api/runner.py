"""Start isolated test jobs and retrieve their progress/results."""

import json
import sqlite3
from urllib.parse import urlsplit, parse_qs
from .exams import database, database_path, scope
from auto_marking import results

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
        job = create_run(payload.get("questionKey"), payload.get("code"), payload.get("variant"), storage=(database_path(self), scope(self)))
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
    try:
        with database(self):
            pass
        url = urlsplit(self.path)
        run_id = url.path.removeprefix('/api/test-runs/') if url.path != '/api/test-runs' else None
        if run_id:
            saved = results.read(database_path(self), scope(self), run_id)
            job = get_run(run_id) if saved else None
            if job and job["status"] == "completed" and saved["status"] != "completed":
                job = saved  # Wait until completion is durable before reporting success.
            job = job or saved
            if job and job['status'] in ('queued', 'running') and not get_run(run_id):
                job.update(status='runner_error', cases=[], message='This run was interrupted by a restart. Run the tests again.')
            self.send_json(200 if job else 404, job or {'message': 'Test result not found in this workspace.'})
        else:
            query = parse_qs(url.query)
            job = results.read(database_path(self), scope(self), question=query.get('questionKey', [''])[0], digest=query.get('codeDigest', [''])[0], variant=query.get('variant', [''])[0])
            self.send_json(200, {'result': job})
    except (OSError, sqlite3.Error, ValueError):
        self.send_json(503, {'message': 'Saved test results could not be opened. Retry later.'})
