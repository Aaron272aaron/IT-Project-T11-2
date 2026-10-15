"""Persistent local accounts. Passwords and session tokens are never stored raw."""
import hashlib
import hmac
from contextlib import contextmanager
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time

from backend.paths import BACKEND_DATA

ITERATIONS = 600_000
SESSION_SECONDS = 8 * 60 * 60
IDLE_SECONDS = 30 * 60
ROLES = {"Coordinator", "Tutor"}


class AccountError(ValueError):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


def _email(value):
    if not isinstance(value, str) or len(value) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value.strip()):
        raise AccountError("Enter a valid email address.")
    return value.strip().lower()


def _password(value):
    if not isinstance(value, str) or not 12 <= len(value) <= 128:
        raise AccountError("Use a password containing 12–128 characters.")
    return value


def _hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), ITERATIONS).hex()
    return f"pbkdf2_sha256${ITERATIONS}${salt}${digest}"


def _verify(password, encoded):
    try:
        algorithm, iterations, salt, expected = encoded.split("$")
        if algorithm != "pbkdf2_sha256" or int(iterations) != ITERATIONS:
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), ITERATIONS).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, AttributeError, UnicodeError):
        return False


def _digest(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class AccountStore:
    def __init__(self, path=None):
        self.path = Path(path or os.environ.get("AUTH_DB_PATH") or BACKEND_DATA / "private/accounts.sqlite3")
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if self.path.parent.name == "private":
            self.path.parent.chmod(0o700)
        if not self.path.exists():
            descriptor = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(descriptor)
        self.path.chmod(0o600)
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
                    username TEXT UNIQUE NOT NULL, role TEXT NOT NULL CHECK(role IN ('Coordinator','Tutor')),
                    password_hash TEXT NOT NULL, created_at REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
                    expires_at REAL NOT NULL, last_used REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS access_codes (
                    token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('invite','reset')),
                    email TEXT NOT NULL, role TEXT, expires_at REAL NOT NULL, created_by TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until REAL NOT NULL);
            """)
            for key in ("workspace_id", "csrf_secret"):
                db.execute("INSERT OR IGNORE INTO settings VALUES (?, ?)", (key, secrets.token_hex(32)))
            self.workspace_id = db.execute("SELECT value FROM settings WHERE key='workspace_id'").fetchone()[0]
            self.secret = bytes.fromhex(db.execute("SELECT value FROM settings WHERE key='csrf_secret'").fetchone()[0])
        self.cookie_name = "automarktic_session_" + self.workspace_id[:12]
        self.dummy_hash = _hash_password(secrets.token_urlsafe(32))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def public(self, row):
        return {**{key: row[key] for key in ("id", "name", "email", "username", "role")}, "workspaceId": self.workspace_id}

    def bootstrap_needed(self):
        with self.connect() as db:
            return not db.execute("SELECT 1 FROM accounts LIMIT 1").fetchone()

    def csrf(self, token):
        return hmac.new(self.secret, token.encode(), hashlib.sha256).hexdigest()

    def session(self, token, *, touch=True):
        if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            return None
        now = time.time()
        with self.connect() as db:
            row = db.execute("SELECT accounts.*, sessions.expires_at, sessions.last_used FROM sessions JOIN accounts ON accounts.id=sessions.account_id WHERE token_hash=?", (_digest(token),)).fetchone()
            if not row or row["expires_at"] <= now or row["last_used"] <= now - IDLE_SECONDS:
                db.execute("DELETE FROM sessions WHERE token_hash=?", (_digest(token),))
                return None
            if touch:
                db.execute("UPDATE sessions SET last_used=? WHERE token_hash=?", (now, _digest(token)))
            return {"user": self.public(row), "csrfToken": self.csrf(token)}

    def _session(self, db, account_id, previous=None):
        if previous:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (_digest(previous),))
        db.execute("DELETE FROM sessions WHERE expires_at <= ? OR last_used <= ?", (time.time(), time.time() - IDLE_SECONDS))
        token = secrets.token_urlsafe(32)
        db.execute("INSERT INTO sessions VALUES (?,?,?,?)", (_digest(token), account_id, time.time() + SESSION_SECONDS, time.time()))
        user = db.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
        return token, {"user": self.public(user), "csrfToken": self.csrf(token)}

    def register(self, payload, previous=None):
        email = _email(payload.get("email"))
        name = payload.get("name")
        username = payload.get("username")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
            raise AccountError("Enter your name (up to 100 characters).")
        if not isinstance(username, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{3,40}", username):
            raise AccountError("Use a username with 3–40 letters, numbers, dots, underscores or hyphens.")
        password_hash = _hash_password(_password(payload.get("password")))
        with self.connect() as db:
            # Serialize bootstrap and single-use invitation consumption.
            db.execute("BEGIN IMMEDIATE")
            first = not db.execute("SELECT 1 FROM accounts LIMIT 1").fetchone()
            role = "Coordinator"
            if not first:
                code = payload.get("inviteCode")
                invitation = db.execute("SELECT * FROM access_codes WHERE token_hash=? AND kind='invite' AND expires_at > ?", (_digest(code) if isinstance(code, str) else "", time.time())).fetchone()
                if not invitation or invitation["email"] != email:
                    raise AccountError("Use a valid invitation code for this email address.", 403)
                role = invitation["role"]
                db.execute("DELETE FROM access_codes WHERE token_hash=?", (invitation["token_hash"],))
            account_id = secrets.token_hex(16)
            try:
                db.execute("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)", (account_id, name.strip(), email, username.lower(), role, password_hash, time.time()))
            except sqlite3.IntegrityError:
                raise AccountError("That email or username is unavailable. Log in or choose a different username.") from None
            token, session = self._session(db, account_id, previous)
            return token, {**session, "firstAccount": first}

    def login(self, identifier, password, peer, previous=None):
        if not isinstance(identifier, str) or not isinstance(password, str) or not 1 <= len(identifier) <= 254 or not 1 <= len(password) <= 128:
            raise AccountError("Invalid email, username or password.", 401)
        identifier = identifier.strip().lower()
        keys = [_digest("account:" + identifier), _digest("peer:" + peer)]
        now = time.time()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM login_attempts WHERE until <= ?", (now,))
            for key, maximum in zip(keys, (10, 50)):
                attempt = db.execute("SELECT count FROM login_attempts WHERE key=?", (key,)).fetchone()
                if attempt and attempt[0] >= maximum:
                    raise AccountError("Too many login attempts. Wait five minutes and try again.", 429)
            # Count attempts before password work, including concurrent requests.
            for key in keys:
                db.execute("INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1", (key, now + 300))
            row = db.execute("SELECT * FROM accounts WHERE email=? OR username=?", (identifier, identifier)).fetchone()
        valid = _verify(password, row["password_hash"] if row else self.dummy_hash)
        if not row or not valid:
            raise AccountError("Invalid email, username or password.", 401)
        with self.connect() as db:
            # A reset racing with verification must not resurrect the old password.
            db.execute("BEGIN IMMEDIATE")
            current = db.execute("SELECT password_hash FROM accounts WHERE id=?", (row["id"],)).fetchone()
            if not current or current[0] != row["password_hash"]:
                raise AccountError("Invalid email, username or password.", 401)
            db.execute("DELETE FROM login_attempts WHERE key=?", (keys[0],))
            return self._session(db, row["id"], previous)

    def logout(self, token):
        if token:
            with self.connect() as db:
                db.execute("DELETE FROM sessions WHERE token_hash=?", (_digest(token),))

    def create_code(self, actor, email, role=None, kind="invite"):
        if actor["role"] != "Coordinator":
            raise AccountError("Coordinator access is required.", 403)
        email = _email(email)
        if kind == "invite" and role not in ROLES:
            raise AccountError("Choose Tutor or Coordinator.")
        token = secrets.token_urlsafe(32)
        expires = time.time() + (48 * 3600 if kind == "invite" else 3600)
        with self.connect() as db:
            existing = db.execute("SELECT id FROM accounts WHERE email=?", (email,)).fetchone()
            if (kind == "invite" and existing) or (kind == "reset" and not existing):
                raise AccountError("Choose an email appropriate for this action.")
            db.execute("DELETE FROM access_codes WHERE email=? AND kind=?", (email, kind))
            db.execute("INSERT INTO access_codes VALUES (?,?,?,?,?,?)", (_digest(token), kind, email, role, expires, actor["id"]))
        return {"code": token, "email": email, "role": role, "expiresAt": expires, "kind": kind}

    def reset_password(self, email, code, password):
        email = _email(email)
        encoded = _hash_password(_password(password))
        if not isinstance(code, str):
            raise AccountError("Enter a valid password-reset code.")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            reset = db.execute("SELECT * FROM access_codes WHERE token_hash=? AND kind='reset' AND email=? AND expires_at>?", (_digest(code), email, time.time())).fetchone()
            if not reset:
                raise AccountError("The reset code is invalid or expired.")
            account = db.execute("SELECT id FROM accounts WHERE email=?", (email,)).fetchone()
            self._replace_password(db, account[0], encoded)
            db.execute("DELETE FROM access_codes WHERE token_hash=?", (reset["token_hash"],))

    def _replace_password(self, db, account_id, encoded):
        db.execute("UPDATE accounts SET password_hash=? WHERE id=?", (encoded, account_id))
        db.execute("DELETE FROM sessions WHERE account_id=?", (account_id,))

    def change_password(self, actor, current, password):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT password_hash FROM accounts WHERE id=?", (actor["id"],)).fetchone()
            if not isinstance(current, str) or not _verify(current, row[0]):
                raise AccountError("Your current password is incorrect.")
            self._replace_password(db, actor["id"], _hash_password(_password(password)))

    def list_accounts(self, actor):
        if actor["role"] != "Coordinator":
            raise AccountError("Coordinator access is required.", 403)
        with self.connect() as db:
            return [self.public(row) for row in db.execute("SELECT * FROM accounts ORDER BY name")]
