import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from backend.api.server import ApiHandler, ThreadingHTTPServer
from backend.services.canvas_import import preview_csv
from backend.security.accounts import AccountStore

class ExamStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), ApiHandler)
        self.server.exam_db_path = Path(self.temp.name) / 'exams.sqlite3'
        self.server.allow_demo_api = True
        self.server.account_store = AccountStore(Path(self.temp.name) / "accounts.sqlite3")
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, payload=None, demo=True):
        conn = http.client.HTTPConnection(*self.server.server_address, timeout=60)
        headers = {'Content-Type': 'application/json', 'X-App-Request': 'AutoMarktic'}
        if demo: headers['X-Automarktic-Demo'] = '1'
        conn.request('GET' if payload is None else 'POST', '/api/exams', None if payload is None else json.dumps(payload).encode(), headers)
        res = conn.getresponse()
        result = res.status, json.loads(res.read())
        conn.close()
        return result

    def test_roundtrip_conflicts_validation_and_auth(self):
        self.assertEqual(self.request(demo=False)[0], 401)
        registry = {'course': [{'id': 'exam', 'title': 'Exam', 'description': '', 'marks': {'q': {'s': {'score': 2}}}}]}
        self.assertEqual(self.request({'revision': 0, 'registry': registry}), (200, {'revision': 1}))
        self.assertEqual(self.request({'revision': 0, 'registry': {}})[0], 409)
        self.assertEqual(self.request({'revision': 1, 'registry': {'bad': [None]}})[0], 422)
        self.assertEqual(self.request(), (200, {'revision': 1, 'registry': registry}))
        # Each request opens a fresh database connection; data is durable on disk.
        self.assertTrue(self.server.exam_db_path.is_file())

    def test_large_exam_roundtrip(self):
        fixture = Path(__file__).resolve().parents[2] / 'sample-exam-2000-students.csv'
        parsed = preview_csv(fixture.read_bytes())
        self.assertEqual(parsed['status'], 'ok')
        registry = {'course': [{'id': 'large', 'title': '2000 students', 'description': '', 'answers': {'name': fixture.name, 'uploadedAt': 'now', 'preview': parsed['preview']}}]}
        self.assertGreater(len(json.dumps(registry)), 10 * 1024 * 1024)
        self.assertEqual(self.request({'revision': 0, 'registry': registry})[0], 200)
        self.assertEqual(self.request()[1]['registry'], registry)

    def test_account_workspace_is_separate_from_demo(self):
        self.request({'revision': 0, 'registry': {'demo': []}})
        conn = http.client.HTTPConnection(*self.server.server_address)
        headers = {'Content-Type': 'application/json', 'X-App-Request': 'AutoMarktic'}
        conn.request('POST', '/api/auth/register', json.dumps({'name': 'Storage Owner', 'username': 'storageowner', 'email': 'storage@example.edu', 'password': 'Synthetic password 123!'}), headers)
        response = conn.getresponse()
        self.assertEqual(response.status, 201)
        cookie = response.getheader('Set-Cookie').split(';')[0]
        session = json.loads(response.read())
        headers.update({'Cookie': cookie, 'X-CSRF-Token': session['csrfToken']})
        conn.request('GET', '/api/exams', headers=headers)
        response = conn.getresponse()
        self.assertEqual(json.loads(response.read()), {'revision': 0, 'registry': {}})
        conn.request('POST', '/api/exams', json.dumps({'revision': 0, 'registry': {'account': []}}), headers)
        response = conn.getresponse()
        self.assertEqual(response.status, 200)
        response.read()
        conn.close()
        self.assertEqual(self.request()[1]['registry'], {'demo': []})
