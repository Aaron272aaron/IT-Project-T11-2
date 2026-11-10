"""Verified account permissions and explicit access to local demo features."""
from http.cookies import SimpleCookie
import hmac
import json
import os
from urllib.parse import urlsplit

from backend.security.accounts import AccountError, SESSION_SECONDS

PUBLIC_AUTH = {"/api/auth/status", "/api/auth/session", "/api/auth/login", "/api/auth/register", "/api/auth/reset-password", "/api/auth/logout"}
COORDINATOR_ROUTES = {"/api/canvas/preview", "/api/rubric/import", "/api/rubric/convert", "/api/auth/accounts", "/api/auth/invite", "/api/auth/reset-code", "/api/ai/model/download", "/api/ai/model/cancel"}
MODEL_MUTATIONS = {"/api/ai/model/download", "/api/ai/model/cancel"}


def demo_api_enabled():
    """The local demo supports app features unless the owner disables it."""
    return os.environ.get("ALLOW_DEMO_API", "1") == "1"


def cookie_token(handler):
    store = getattr(handler.server, "account_store", None)
    if not store:
        return None
    cookie = SimpleCookie()
    try:
        cookie.load(handler.headers.get("Cookie", ""))
        morsel = cookie.get(store.cookie_name)
        return morsel.value if morsel else None
    except Exception:
        return None


def _is_public_origin(origin):
    """Opt in to one HTTPS origin reached through the local frontend proxy."""
    configured = os.environ.get("APP_PUBLIC_ORIGIN", "")
    if not configured or any(character.isspace() for character in configured):
        return False
    try:
        public = urlsplit(configured)
        _ = public.port  # Reject malformed or out-of-range ports.
    except ValueError:
        return False
    if (public.scheme != "https" or not public.hostname
            or public.username is not None or public.password is not None
            or public.path not in {"", "/"} or public.query or public.fragment):
        return False
    return origin == f"https://{public.netloc.lower()}"


def _local_request(handler, *, mutation=False):
    host = urlsplit("//" + handler.headers.get("Host", "")).hostname
    if host not in {"localhost", "127.0.0.1", "::1"}:
        raise AccountError("Use the local app address.", 403)
    origin = handler.headers.get("Origin")
    if origin:
        parsed = urlsplit(origin)
        local_origin = (parsed.scheme in {"http", "https"}
                        and parsed.hostname in {"localhost", "127.0.0.1", "::1"})
        if not local_origin and not _is_public_origin(origin):
            raise AccountError("This request did not come from the local app.", 403)
    if handler.headers.get("Sec-Fetch-Site") == "cross-site":
        raise AccountError("This request did not come from the local app.", 403)
    if mutation and handler.headers.get("X-App-Request") != "AutoMarktic":
        raise AccountError("Send this request from the app.", 403)


def authorize(handler, path, *, mutation=False):
    try:
        _local_request(handler, mutation=mutation)
        if path in MODEL_MUTATIONS:
            origin = handler.headers.get("Origin")
            if origin and urlsplit(origin).hostname not in {"localhost", "127.0.0.1", "::1"}:
                raise AccountError("Download the model from the app on this laptop.", 403)
        # Demo requests use the same local services, but cannot manage real accounts.
        if (getattr(handler.server, "allow_demo_api", False)
                and handler.headers.get("X-Automarktic-Demo") == "1"
                and not path.startswith("/api/auth/")):
            return True
        store = getattr(handler.server, "account_store", None)
        token = cookie_token(handler)
        session = store.session(token) if store else None
        if not session:
            raise AccountError("Log in to continue.", 401)
        if mutation and not hmac.compare_digest(handler.headers.get("X-CSRF-Token", ""), session["csrfToken"]):
            raise AccountError("Your session could not verify this request. Refresh and retry.", 403)
        if path in COORDINATOR_ROUTES and session["user"]["role"] != "Coordinator":
            raise AccountError("Coordinator access is required.", 403)
        handler.account = session["user"]
        return True
    except AccountError as error:
        handler.send_json(error.status, {"message": str(error)})
        return False


def _payload(handler, allowed, required=()):
    if handler.headers.get_content_type() != "application/json":
        raise AccountError("Send a JSON account request.", 415)
    length = handler.headers.get("Content-Length", "")
    if handler.headers.get("Transfer-Encoding") or not length.isascii() or not length.isdecimal():
        raise AccountError("A valid Content-Length is required.", 400)
    if len(length) > 10 or not 0 < int(length) <= 8192:
        raise AccountError("The account request is too large or empty.", 413)
    handler.connection.settimeout(15)
    content = handler.rfile.read(int(length))
    if len(content) != int(length):
        raise AccountError("The account request was incomplete.", 400)
    try:
        value = json.loads(content)
    except (ValueError, UnicodeError):
        raise AccountError("Send a valid JSON account request.") from None
    if not isinstance(value, dict) or set(value) - set(allowed) or set(required) - set(value):
        raise AccountError("The account request has missing or unsupported fields.")
    return value


def _cookie(store, token=None):
    value = f"{store.cookie_name}={token or ''}; Path=/api; HttpOnly; SameSite=Strict; Max-Age={SESSION_SECONDS if token else 0}"
    if os.environ.get("AUTH_COOKIE_SECURE") == "1":
        value += "; Secure"
    return {"Set-Cookie": value}


def auth_request(handler, path):
    store = getattr(handler.server, "account_store", None)
    if not store:
        handler.send_json(503, {"message": "Account storage is unavailable. Start the app with npm run dev."})
        return
    try:
        mutation = handler.command == "POST"
        _local_request(handler, mutation=mutation)
        token = cookie_token(handler)
        if path not in PUBLIC_AUTH and not authorize(handler, path, mutation=mutation):
            return
        if path == "/api/auth/status" and not mutation:
            handler.send_json(200, {"bootstrapNeeded": store.bootstrap_needed()})
        elif path == "/api/auth/session" and not mutation:
            handler.send_json(200, store.session(token, touch=False) or {"user": None, "csrfToken": None})
        elif path == "/api/auth/activity" and mutation:
            _payload(handler, set())
            handler.send_json(200, {"status": "ok"})
        elif path == "/api/auth/accounts" and not mutation:
            handler.send_json(200, {"accounts": store.list_accounts(handler.account)})
        elif path == "/api/auth/login" and mutation:
            payload = _payload(handler, {"identifier", "password"}, {"identifier", "password"})
            new_token, session = store.login(payload["identifier"], payload["password"], handler.client_address[0], token)
            handler.send_json(200, session, _cookie(store, new_token))
        elif path == "/api/auth/register" and mutation:
            payload = _payload(handler, {"name", "email", "username", "password", "inviteCode"}, {"name", "email", "username", "password"})
            new_token, session = store.register(payload, token)
            handler.send_json(201, session, _cookie(store, new_token))
        elif path == "/api/auth/logout" and mutation:
            _payload(handler, set())
            session = store.session(token)
            if session and not hmac.compare_digest(handler.headers.get("X-CSRF-Token", ""), session["csrfToken"]):
                raise AccountError("Refresh before logging out.", 403)
            store.logout(token)
            handler.send_json(200, {"message": "Logged out."}, _cookie(store))
        elif path in {"/api/auth/invite", "/api/auth/reset-code"} and mutation:
            payload = _payload(handler, {"email", "role"}, {"email"})
            handler.send_json(201, store.create_code(handler.account, payload["email"], payload.get("role", "Tutor"), "invite" if path.endswith("invite") else "reset"))
        elif path == "/api/auth/reset-password" and mutation:
            payload = _payload(handler, {"email", "code", "password"}, {"email", "code", "password"})
            store.reset_password(payload["email"], payload["code"], payload["password"])
            handler.send_json(200, {"message": "Password reset. Log in with your new password."}, _cookie(store))
        elif path == "/api/auth/change-password" and mutation:
            payload = _payload(handler, {"currentPassword", "password"}, {"currentPassword", "password"})
            store.change_password(handler.account, payload["currentPassword"], payload["password"])
            handler.send_json(200, {"message": "Password changed. Log in again."}, _cookie(store))
        else:
            handler.send_json(404, {"message": "Account route not found."})
    except AccountError as error:
        handler.send_json(error.status, {"message": str(error)})
    except TimeoutError:
        handler.send_json(408, {"message": "The account request timed out. Retry."})
    except Exception:
        handler.send_json(503, {"message": "Account storage could not complete this request. Retry."})
