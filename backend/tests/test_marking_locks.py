"""Real authenticated clients and SQLite transactions; no AI or Docker needed."""
import copy
import json
import http.client
import tempfile
import threading
import sqlite3
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from backend.api.server import ApiHandler, ThreadingHTTPServer
from backend.security.accounts import AccountStore

PASSWORD = "Synthetic password 123!"

class MarkingLockTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), ApiHandler)
        self.server.exam_db_path = Path(self.temp.name) / 'exams.sqlite3'
        store = AccountStore(Path(self.temp.name) / 'accounts.sqlite3')
        self.server.account_store = store
        self.server.allow_demo_api = False
        token, session = store.register({'name': 'Coordinator', 'email': 'c@example.edu', 'username': 'coordinator', 'password': PASSWORD})
        def headers(token, session):
            return {'Content-Type': 'application/json', 'X-App-Request': 'AutoMarktic', 'Cookie': store.cookie_name + '=' + token, 'X-CSRF-Token': session['csrfToken']}
        self.coordinator = headers(token, session)
        self.users = []
        for name in ('Alice', 'Bob'):
            code = store.create_code(session['user'], name.lower() + '@example.edu', 'Tutor')['code']
            token, user = store.register({'name': name, 'email': name.lower() + '@example.edu', 'username': name.lower(), 'password': PASSWORD, 'inviteCode': code})
            self.users.append(headers(token, user))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
        self.registry = {'comp10001': [{'id': 'exam', 'title': 'Test', 'description': '', 'answers': {'preview': {'students': [{'id': s, 'answers': [{'questionId': q, 'original': 'answer'} for q in ('q', 'q2')]} for s in ('s', 's2')]}}, 'marks': {}}]}
        self.assertEqual(self.request(self.coordinator, '/api/exams', {'registry': self.registry, 'revision': 0})[0], 200)

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join(); self.temp.cleanup()

    def request(self, headers, path, body=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=10)
        connection.request('GET' if body is None else 'POST', path, None if body is None else json.dumps(body), headers)
        response = connection.getresponse(); result = response.status, json.loads(response.read()); connection.close(); return result

    def lock(self, who=0, action='acquire', token=None, student='s', question='q'):
        return self.request(self.users[who], '/api/marking-locks', {'examId': 'exam', 'questionId': question, 'studentId': student, 'action': action, 'token': token})

    def save(self, who, token=None, student='s', revision=1):
        registry = copy.deepcopy(self.registry); registry['comp10001'][0]['marks'] = {'q': {student: {'score': 1, 'comment': 'checked'}}}
        headers = dict(self.users[who])
        if token: headers['X-Marking-Locks'] = json.dumps({json.dumps(['exam', 'q', student], separators=(',', ':')): token})
        return self.request(headers, '/api/exams', {'registry': registry, 'revision': revision})

    def test_single_owner_read_access_and_server_rejects_competing_save(self):
        status, lease = self.lock(); self.assertEqual(status, 200); self.assertTrue(lease['editable'])
        second = self.lock(1)[1]; self.assertFalse(second['editable']); self.assertEqual(second['owner'], 'Alice'); self.assertNotIn('token', second)
        self.assertEqual(self.request(self.users[1], '/api/exams')[0], 200)
        self.assertEqual(self.save(1)[0], 409)
        self.assertEqual(self.save(1, lease['token'])[0], 409)  # A different account cannot use the owner's token.
        self.assertEqual(self.save(0, lease['token'])[0], 200)

    def test_distinct_answers_questions_and_same_account_tabs(self):
        lease = self.lock()[1]
        self.assertFalse(self.lock()[1]['editable'])
        self.assertTrue(self.lock(1, student='s2')[1]['editable'])
        self.assertTrue(self.lock(1, question='q2')[1]['editable'])
        self.assertTrue(self.lock(action='renew', token=lease['token'])[1]['editable'])

    def test_release_expiry_takeover_and_stale_save(self):
        token = self.lock()[1]['token']
        self.lock(1, 'release', token)  # Another user cannot release Alice's lease.
        self.assertFalse(self.lock(1)[1]['editable'])
        self.lock(action='release', token=token)
        self.assertEqual(self.save(0, token)[0], 409)
        next_token = self.lock(1)[1]['token']
        self.assertEqual(self.save(0, token)[0], 409)
        with sqlite3.connect(self.server.exam_db_path) as db: db.execute('UPDATE marking_locks SET expires=0')
        self.assertEqual(self.lock(1, 'renew', next_token)[0], 409)
        self.assertTrue(self.lock()[1]['editable'])

    def test_simultaneous_acquisition_has_exactly_one_owner(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            replies = list(pool.map(lambda who: self.lock(who), [0, 1]))
        self.assertEqual(sum(result['editable'] for _, result in replies), 1)

    def test_group_and_setup_updates_cannot_bypass_locks(self):
        self.lock()
        registry = copy.deepcopy(self.registry)
        registry['comp10001'][0]['marks'] = {'q': {'s': {'score': 2}, 's2': {'score': 2}}}
        self.assertEqual(self.request(self.users[1], '/api/exams', {'registry': registry, 'revision': 1})[0], 409)
        self.assertEqual(self.request(self.coordinator, '/api/exams', {'registry': {}, 'revision': 1})[0], 409)
        self.assertEqual(self.request(self.users[0], '/api/exams')[1]['registry'], self.registry)

    def test_auth_and_unknown_answers_are_rejected(self):
        self.assertEqual(self.request({'Content-Type': 'application/json', 'X-App-Request': 'AutoMarktic'}, '/api/marking-locks', {})[0], 401)
        self.assertEqual(self.lock(student='missing')[0], 404)
