"""Real credentials, invitation consumption, session revocation and HTTP access."""
import http.client
from http.cookies import SimpleCookie
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer

from backend.api.handler import ApiHandler
from backend.api.auth import demo_api_enabled, _is_public_origin
from backend.security.accounts import AccountStore, AccountError, IDLE_SECONDS

PASSWORD = "Synthetic password 123!"


class PublicOriginTests(unittest.TestCase):
    def test_only_the_configured_https_origin_is_allowed(self):
        with patch.dict(os.environ, {"APP_PUBLIC_ORIGIN": "https://group.trycloudflare.com/"}):
            self.assertTrue(_is_public_origin("https://group.trycloudflare.com"))
            for origin in ("http://group.trycloudflare.com", "https://other.trycloudflare.com",
                           "https://group.trycloudflare.com:444", "https://group.trycloudflare.com.evil.example"):
                with self.subTest(origin=origin):
                    self.assertFalse(_is_public_origin(origin))

    def test_missing_and_invalid_configuration_fail_closed(self):
        for configured in ("", "http://group.example", "https://user@group.example",
                           "https://group.example/path", "https://group.example?query=1",
                           "https://group.example#fragment", "https://group.example:bad",
                           "https://group.example:99999", "https://group.\nexample"):
            with self.subTest(configured=configured), patch.dict(os.environ, {"APP_PUBLIC_ORIGIN": configured}):
                self.assertFalse(_is_public_origin("https://group.example"))


class AccountTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.store = AccountStore(Path(self.directory.name) / "accounts.sqlite3")
        self.token, session = self.store.register({"name": "Coordinator", "email": "coordinator@example.edu", "username": "coordinator", "password": PASSWORD})
        self.user = session["user"]

    def test_bootstrap_hashes_and_sessions_are_persistent_without_raw_credentials(self):
        self.assertFalse(self.store.bootstrap_needed())
        with self.store.connect() as db:
            account = db.execute("SELECT password_hash, role FROM accounts").fetchone()
            token_hash = db.execute("SELECT token_hash FROM sessions").fetchone()[0]
        self.assertIn("pbkdf2_sha256$600000$", account[0])
        self.assertNotIn(PASSWORD, account[0])
        self.assertNotEqual(token_hash, self.token)
        self.assertEqual(account[1], "Coordinator")
        reopened = AccountStore(self.store.path)
        self.assertEqual(reopened.session(self.token)["user"]["id"], self.user["id"])
        self.assertEqual(self.store.path.stat().st_mode & 0o777, 0o600)

    def test_invalid_login_is_generic_and_email_or_username_is_case_insensitive(self):
        for identifier in ("coordinator", "missing"):
            with self.assertRaisesRegex(AccountError, "Invalid email, username or password"):
                self.store.login(identifier, "wrong password", "test-peer")
        token, session = self.store.login("COORDINATOR@EXAMPLE.EDU", PASSWORD, "test-peer", self.token)
        self.assertEqual(session["user"]["role"], "Coordinator")
        self.assertIsNone(self.store.session(self.token))
        self.assertIsNotNone(self.store.session(token))

    def test_invitation_is_email_bound_single_use_and_controls_role(self):
        payload = {"name": "Tutor", "email": "tutor@example.edu", "username": "tutor", "password": PASSWORD}
        with self.assertRaises(AccountError):
            self.store.register(payload)
        code = self.store.create_code(self.user, payload["email"], "Tutor")["code"]
        with self.assertRaises(AccountError):
            self.store.register({**payload, "email": "other@example.edu", "inviteCode": code})
        _, session = self.store.register({**payload, "inviteCode": code, "role": "Coordinator"})
        self.assertEqual(session["user"]["role"], "Tutor")
        with self.assertRaises(AccountError):
            self.store.register({**payload, "username": "another", "inviteCode": code})
        with self.assertRaises(AccountError):
            self.store.create_code(session["user"], "someone@example.edu", "Coordinator")

    def test_failed_registration_does_not_consume_an_invite(self):
        code = self.store.create_code(self.user, "tutor@example.edu", "Tutor")["code"]
        payload = {"name": "Tutor", "email": "tutor@example.edu", "username": "coordinator", "password": PASSWORD, "inviteCode": code}
        with self.assertRaises(AccountError):
            self.store.register(payload)
        self.assertEqual(self.store.register({**payload, "username": "tutor"})[1]["user"]["role"], "Tutor")

    def test_logout_idle_and_absolute_expiry_block_the_old_cookie(self):
        self.store.logout(self.token)
        self.assertIsNone(self.store.session(self.token))
        for column, timestamp in (("last_used", time.time() - IDLE_SECONDS - 1), ("expires_at", time.time() - 1)):
            token, _ = self.store.login("coordinator", PASSWORD, "test-peer")
            with self.store.connect() as db:
                db.execute(f"UPDATE sessions SET {column}=?", (timestamp,))
            self.assertIsNone(self.store.session(token))

    def test_background_session_checks_do_not_extend_idle_timeout(self):
        with self.store.connect() as db:
            before = db.execute("SELECT last_used FROM sessions").fetchone()[0]
        self.assertIsNotNone(self.store.session(self.token, touch=False))
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT last_used FROM sessions").fetchone()[0], before)

    def test_password_reset_revokes_every_session_and_consumes_code(self):
        second, _ = self.store.login("coordinator", PASSWORD, "test-peer")
        code = self.store.create_code(self.user, self.user["email"], kind="reset")["code"]
        self.store.reset_password(self.user["email"], code, "Replacement password 456!")
        self.assertIsNone(self.store.session(self.token))
        self.assertIsNone(self.store.session(second))
        with self.assertRaises(AccountError):
            self.store.login("coordinator", PASSWORD, "test-peer")
        self.assertIsNotNone(self.store.login("coordinator", "Replacement password 456!", "test-peer"))
        with self.assertRaises(AccountError):
            self.store.reset_password(self.user["email"], code, PASSWORD)

    def test_password_change_requires_current_password_and_revokes_sessions(self):
        with self.assertRaises(AccountError):
            self.store.change_password(self.user, "wrong", "Replacement password 456!")
        self.assertIsNotNone(self.store.session(self.token))
        self.store.change_password(self.user, PASSWORD, "Replacement password 456!")
        self.assertIsNone(self.store.session(self.token))

    def test_expired_invite_and_weak_password_are_rejected(self):
        code = self.store.create_code(self.user, "tutor@example.edu", "Tutor")["code"]
        with self.store.connect() as db:
            db.execute("UPDATE access_codes SET expires_at=?", (time.time() - 1,))
        for password in ("short", PASSWORD):
            with self.assertRaises(AccountError):
                self.store.register({"name": "Tutor", "email": "tutor@example.edu", "username": "tutor", "password": password, "inviteCode": code})

    def test_login_rate_limit_rejects_before_password_work(self):
        with self.store.connect() as db:
            from backend.security.accounts import _digest
            db.execute("INSERT INTO login_attempts VALUES (?,10,?)", (_digest("account:coordinator"), time.time() + 300))
        with patch("backend.security.accounts._verify") as verify, self.assertRaises(AccountError) as caught:
            self.store.login("coordinator", PASSWORD, "test-peer")
        self.assertEqual(caught.exception.status, 429)
        verify.assert_not_called()


class AccountApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.store = AccountStore(Path(cls.directory.name) / "accounts.sqlite3")
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ApiHandler)
        cls.server.account_store = cls.store
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.token, session = cls.store.register({"name": "Coordinator", "email": "coordinator@example.edu", "username": "coordinator", "password": PASSWORD})
        cls.csrf = session["csrfToken"]
        cls.user = session["user"]
        invitation = cls.store.create_code(cls.user, "tutor@example.edu", "Tutor")
        cls.tutor_token, session = cls.store.register({"name": "Tutor", "email": "tutor@example.edu", "username": "tutor", "password": PASSWORD, "inviteCode": invitation["code"]})
        cls.tutor_csrf = session["csrfToken"]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join(); cls.directory.cleanup()

    def request(self, method, path, payload=None, token=None, csrf=None, extra=None):
        headers = {"X-App-Request": "AutoMarktic", "Content-Type": "application/json"}
        if token: headers["Cookie"] = f"{self.store.cookie_name}={token}"
        if csrf: headers["X-CSRF-Token"] = csrf
        headers.update(extra or {})
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        try:
            connection.request(method, path, None if payload is None else json.dumps(payload), headers)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), json.loads(response.read())
        finally:
            connection.close()

    def test_health_public_and_private_routes_fail_closed(self):
        self.assertEqual(self.request("GET", "/api/health")[0], 200)
        self.assertEqual(self.request("GET", "/api/demo/sample-exam")[0], 401)
        self.assertEqual(self.request("POST", "/api/answer-groups", {})[0], 401)
        self.assertEqual(self.request("POST", "/api/ai/suggest-fix", {"code": "pass"}, extra={"X-Automarktic-Demo": "1"})[0], 401)
        self.assertEqual(self.request("GET", "/api/auth/session")[2]["user"], None)

    def test_login_cookie_and_logout_invalidate_server_access(self):
        status, headers, session = self.request("POST", "/api/auth/login", {"identifier": "coordinator", "password": PASSWORD})
        self.assertEqual(status, 200)
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertIn("SameSite=Strict", headers["Set-Cookie"])
        self.assertNotIn(PASSWORD, json.dumps(session))
        cookie = SimpleCookie(); cookie.load(headers["Set-Cookie"])
        token = cookie[self.store.cookie_name].value
        self.assertEqual(self.request("GET", "/api/auth/accounts", token=token)[0], 200)
        self.assertEqual(self.request("POST", "/api/auth/logout", {}, token=token, csrf=session["csrfToken"])[0], 200)
        self.assertEqual(self.request("GET", "/api/auth/accounts", token=token)[0], 401)

    def test_csrf_and_foreign_origin_are_rejected(self):
        self.assertEqual(self.request("POST", "/api/auth/invite", {"email": "new@example.edu", "role": "Tutor"}, token=self.token)[0], 403)
        self.assertEqual(self.request("POST", "/api/auth/login", {"identifier": "coordinator", "password": PASSWORD}, extra={"Origin": "https://foreign.example"})[0], 403)

    def test_tunnel_login_still_requires_a_session_and_csrf(self):
        origin = {"Origin": "https://group.trycloudflare.com", "Sec-Fetch-Site": "same-origin"}
        with patch.dict(os.environ, {"APP_PUBLIC_ORIGIN": origin["Origin"], "AUTH_COOKIE_SECURE": "1"}):
            status, headers, session = self.request("POST", "/api/auth/login", {"identifier": "coordinator", "password": PASSWORD}, extra=origin)
            self.assertEqual(status, 200)
            self.assertIn("; Secure", headers["Set-Cookie"])
            cookie = SimpleCookie(); cookie.load(headers["Set-Cookie"])
            token = cookie[self.store.cookie_name].value
            self.assertEqual(self.request("GET", "/api/auth/accounts", extra=origin)[0], 401)
            self.assertEqual(self.request("GET", "/api/auth/accounts", token=token, extra=origin)[0], 200)
            self.assertEqual(self.request("POST", "/api/auth/activity", {}, token=token, extra=origin)[0], 403)
            self.assertEqual(self.request("POST", "/api/auth/activity", {}, token=token, csrf=session["csrfToken"], extra=origin)[0], 200)
            self.assertEqual(self.request("GET", "/api/auth/session", token=token, extra={**origin, "Host": "foreign.example"})[0], 403)
            self.assertEqual(self.request("GET", "/api/auth/session", token=token, extra={**origin, "Sec-Fetch-Site": "cross-site"})[0], 403)
            self.store.logout(token)

    def test_tutor_roles_cannot_be_forged_to_import_or_manage_accounts(self):
        for method, path, payload in (("POST", "/api/canvas/preview", {}), ("POST", "/api/auth/invite", {"email": "new@example.edu", "role": "Coordinator"}), ("GET", "/api/auth/accounts", None)):
            self.assertEqual(self.request(method, path, payload, token=self.tutor_token, csrf=self.tutor_csrf, extra={"X-Role": "Coordinator"})[0], 403)

    def test_supported_tutor_grouping_route_requires_real_session_and_csrf(self):
        payload = {"question_type": "short-answer", "unicode_spaces": [], "answers": [{"submission_id": "s", "student_id": "s", "question_id": "q", "answer": "hello world"}]}
        self.assertEqual(self.request("POST", "/api/answer-groups", payload, token=self.tutor_token, csrf=self.tutor_csrf)[0], 200)


class DemoApiTests(unittest.TestCase):
    request = AccountApiTests.request

    @classmethod
    def setUpClass(cls):
        AccountApiTests.setUpClass.__func__(cls)
        cls.server.allow_demo_api = True

    @classmethod
    def tearDownClass(cls):
        AccountApiTests.tearDownClass.__func__(cls)

    def test_demo_is_enabled_by_default_and_can_be_disabled(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertTrue(demo_api_enabled())
        with patch.dict(os.environ, {"ALLOW_DEMO_API": "0"}):
            self.assertFalse(demo_api_enabled())

    def test_demo_can_request_code_fixes_and_test_runs(self):
        from ai_tools import ai_recommendation as ai
        from auto_marking import jobs as runner
        from ai_tools.code_repair.model import RepairResult, MODEL_ID
        demo = {"X-Automarktic-Demo": "1"}
        broken = "def clean_text(s)\n    return s.strip().lower()\n"
        fixed = broken.replace("(s)\n", "(s):\n")
        with patch.dict(os.environ, {"AI_REPAIR_ENABLED": "1"}), patch.object(ai, "_model") as model:
            model.repair.return_value = RepairResult(broken, fixed, "repaired", None, "cpu", MODEL_ID)
            status, _, result = self.request("POST", "/api/ai/suggest-fix", {"code": broken}, extra=demo)
        self.assertEqual(status, 200)
        self.assertEqual(result["suggestedCode"], fixed)
        with patch.object(runner._pool, "submit"):
            status, _, run = self.request("POST", "/api/test-runs", {"questionKey": "demo:5", "code": fixed, "variant": "recommendation"}, extra=demo)
        try:
            self.assertEqual(status, 202)
            self.assertEqual(self.request("GET", f"/api/test-runs/{run['runId']}", extra=demo)[0], 200)
        finally:
            with runner._lock:
                runner._jobs.pop(run["runId"], None)

    def test_demo_does_not_grant_real_account_management_or_anonymous_access(self):
        demo = {"X-Automarktic-Demo": "1"}
        self.assertEqual(self.request("GET", "/api/auth/accounts", extra=demo)[0], 401)
        self.assertEqual(self.request("POST", "/api/auth/invite", {"email": "new@example.edu"}, extra=demo)[0], 401)
        self.assertEqual(self.request("GET", "/api/auth/accounts", token=self.tutor_token, extra=demo)[0], 403)
        self.assertEqual(self.request("POST", "/api/ai/suggest-fix", {"code": "pass"})[0], 401)

    def test_demo_requires_local_requests_and_the_app_header(self):
        payload = {"code": "pass"}
        for extra in ({"X-Automarktic-Demo": "1", "Origin": "https://foreign.example"},
                      {"X-Automarktic-Demo": "1", "Host": "foreign.example"},
                      {"X-Automarktic-Demo": "1", "X-App-Request": ""}):
            self.assertEqual(self.request("POST", "/api/ai/suggest-fix", payload, extra=extra)[0], 403)
