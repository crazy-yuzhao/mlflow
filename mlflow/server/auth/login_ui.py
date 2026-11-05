"""Browser login / signup pages for the basic-auth app.

The pages are plain HTML so they render before the React bundle, and so a logged-out
browser never has to interpret a ``401 WWW-Authenticate: Basic`` challenge.
"""

from __future__ import annotations

import hmac
import json
import os
import re
import urllib.parse
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from jinja2 import Environment
from markupsafe import Markup

from mlflow.server.handlers import STATIC_PREFIX_ENV_VAR

SESSION_USERNAME_KEY = "mlflow_basic_auth_username"
SESSION_PASSWORD_TAG_KEY = "mlflow_basic_auth_pw_tag"
# 「7 天内保持登录」. The browser cookie expires after this window when the box is
# checked. Server-side signature checks still use ``permanent_session_lifetime``,
# which ``install_remember_me_session`` raises to at least this long.
REMEMBER_ME_LIFETIME = timedelta(days=7)
_REMEMBER_FORM_VALUES = {"1", "on", "true", "yes"}

_TEMPLATE = Environment(autoescape=True).from_string(
    (Path(__file__).parent / "templates" / "auth_page.html").read_text(encoding="utf-8")
)
# ASCII-only so a crafted `next` cannot smuggle whitespace, quotes, or header breaks.
_SAFE_URL_RE = re.compile(r"\A/[\w\-./~%:@!$&'()*+,;=?]*\Z", re.ASCII)
_SAFE_FRAGMENT_RE = re.compile(r"\A[\w\-./~%:@!$&'()*+,;=?]*\Z", re.ASCII)
_MAX_NEXT_LENGTH = 2048


def _static_prefix() -> str:
    return os.environ.get(STATIC_PREFIX_ENV_VAR, "").rstrip("/")


def home_path() -> str:
    prefix = _static_prefix()
    return f"{prefix}/" if prefix else "/"


def login_path() -> str:
    prefix = _static_prefix()
    return f"{prefix}/login" if prefix else "/login"


def logout_path() -> str:
    prefix = _static_prefix()
    return f"{prefix}/logout" if prefix else "/logout"


def safe_next_url(candidate: str | None) -> str:
    """Same-origin relative URL, or the app root when ``candidate`` is unsafe.

    Rejects absolute URLs, protocol-relative URLs, backslashes, and control characters
    so ``next`` cannot be used as an open redirect.
    """
    home = home_path()
    if candidate is None:
        return home
    raw = candidate.strip()
    if not raw or len(raw) > _MAX_NEXT_LENGTH:
        return home
    if raw.startswith("//") or any(ord(ch) < 32 or ord(ch) == 127 or ch == "\\" for ch in raw):
        return home
    parsed = urllib.parse.urlsplit(raw)
    if parsed.scheme or parsed.netloc:
        return home
    path = parsed.path or ""
    if not path.startswith("/") or path.startswith("//"):
        return home
    bare = path[:-1] if len(path) > 1 and path.endswith("/") else path
    prefix = _static_prefix()
    if prefix and bare.startswith(prefix):
        bare = bare[len(prefix) :] or "/"
    if bare in {"/login", "/logout"}:
        return home
    rebuilt = urllib.parse.urlunsplit(("", "", path, parsed.query, parsed.fragment))
    if any(ch.isspace() or ord(ch) < 32 or ord(ch) == 127 for ch in rebuilt):
        return home
    # Fragments are kept (the UI is hash-routed). The path/query must stay a single
    # relative URL token so the Location header cannot be split.
    path_and_query = urllib.parse.urlunsplit(("", "", path, parsed.query, ""))
    if not _SAFE_URL_RE.fullmatch(path_and_query):
        return home
    if parsed.fragment and _SAFE_FRAGMENT_RE.fullmatch(parsed.fragment) is None:
        return home
    return rebuilt


def login_redirect_location(path: str, query: str = "") -> str:
    raw = path or "/"
    if query:
        raw = f"{raw}?{query}"
    target = safe_next_url(raw)
    return f"{login_path()}?next={urllib.parse.quote(target, safe='')}"


def prefers_browser_login_page(headers: Mapping[str, str] | None) -> bool:
    """True for a human navigation, false for API clients and XHR/fetch.

    ``curl`` and the MLflow client send no ``Sec-Fetch-Mode`` and no explicit
    ``text/html`` Accept entry (``*/*`` does not count). Browser document loads send
    ``Sec-Fetch-Mode: navigate`` and/or an Accept list that prefers ``text/html``.
    ``fetch`` / XHR send ``Sec-Fetch-Mode: cors`` (or ``X-Requested-With``) and stay
    on the Basic challenge so programmatic callers keep working.
    """
    if headers is None:
        return False
    requested_with = _header(headers, "X-Requested-With")
    if requested_with.lower() == "xmlhttprequest":
        return False
    mode = _header(headers, "Sec-Fetch-Mode").lower()
    if mode in {"cors", "no-cors", "same-origin", "websocket"}:
        return False
    dest = _header(headers, "Sec-Fetch-Dest").lower()
    if mode == "navigate" or dest == "document":
        return True
    return _accept_prefers_html(_header(headers, "Accept"))


def _header(headers: Mapping[str, str], name: str) -> str:
    getter = getattr(headers, "get", None)
    if not callable(getter):
        return ""
    value = getter(name)
    if value is None:
        value = getter(name.lower())
    return value if isinstance(value, str) else ""


def _accept_prefers_html(accept: str) -> bool:
    if not accept:
        return False
    html_q = 0.0
    json_q = 0.0
    saw_html = False
    for raw in accept.split(","):
        part = raw.strip()
        if not part:
            continue
        pieces = [piece.strip() for piece in part.split(";")]
        mime = pieces[0].lower()
        quality = 1.0
        for param in pieces[1:]:
            if param.lower().startswith("q="):
                try:
                    quality = float(param[2:])
                except ValueError:
                    quality = 0.0
        if mime == "text/html":
            saw_html = True
            html_q = max(html_q, quality)
        elif mime == "application/json":
            json_q = max(json_q, quality)
    return saw_html and html_q > 0 and html_q >= json_q


def password_tag(password_hash: str) -> str:
    """HMAC of the password hash, stored in the session so a password change logs the user out.

    The session cookie is signed but not encrypted, so the raw hash must not be stored in it.
    """
    from mlflow.server import app

    secret = app.secret_key
    if not secret or not isinstance(password_hash, str) or not password_hash:
        return ""
    key = secret.encode() if isinstance(secret, str) else bytes(secret)
    return hmac.new(key, password_hash.encode(), "sha256").hexdigest()


def decode_flask_session(cookie_value: str) -> dict[str, Any] | None:
    from mlflow.server import app

    if not isinstance(cookie_value, str) or not cookie_value:
        return None
    serializer = app.session_interface.get_signing_serializer(app)
    if serializer is None:
        return None
    max_age = int(app.permanent_session_lifetime.total_seconds())
    try:
        data = serializer.loads(cookie_value, max_age=max_age)
    except Exception:
        return None
    return data if isinstance(data, dict) else None


def session_cookie_name() -> str:
    from mlflow.server import app

    return app.config.get("SESSION_COOKIE_NAME", "session")


def remember_requested(value: str | None) -> bool:
    return (value or "").strip().lower() in _REMEMBER_FORM_VALUES


def install_remember_me_session(app) -> None:
    """Let a checked remember-me box issue a cookie the server will still accept.

    Flask validates the session signature against ``permanent_session_lifetime``
    (31 days by default). A deployment that configured a shorter lifetime would
    drop a seven-day cookie early, so raise that floor once at startup. The
    browser expiry itself is applied per login in ``apply_remember_me``.
    """
    if app.permanent_session_lifetime < REMEMBER_ME_LIFETIME:
        app.permanent_session_lifetime = REMEMBER_ME_LIFETIME
    interface = app.session_interface
    if getattr(interface, "_mlflow_remember_wrapped", False):
        return
    original = interface.get_expiration_time

    def get_expiration_time(app, session):
        lifetime = getattr(session, "mlflow_auth_lifetime", None)
        if lifetime is not None and session.permanent:
            return datetime.now(timezone.utc) + lifetime
        return original(app, session)

    interface.get_expiration_time = get_expiration_time
    interface._mlflow_remember_wrapped = True


def apply_remember_me(session, *, remember: bool) -> None:
    """Checked: persistent cookie for seven days. Unchecked: browser session cookie.

    The basic-auth login already stores a permanent session. Checking the box
    keeps that persistence and sets the browser expiry to seven days (shorter
    than Flask's 31-day default, which is what the label promises). Leaving it
    unchecked drops ``Expires`` so the cookie ends when the browser closes.
    """
    if remember:
        session.permanent = True
        session.mlflow_auth_lifetime = REMEMBER_ME_LIFETIME
        return
    session.permanent = False
    if hasattr(session, "mlflow_auth_lifetime"):
        del session.mlflow_auth_lifetime


def render_login_page(
    *,
    csrf_token: str,
    username: str = "",
    next_url: str = "/",
    error: str | None = None,
    remember: bool = True,
) -> str:
    return _render(
        page="login",
        csrf_token=csrf_token,
        form_action=login_path(),
        username=username,
        next_url=next_url,
        error=error or "",
        remember=remember,
        password_autocomplete="current-password",
        show_fields=True,
    )


def render_signup_page(*, csrf_token: str) -> str:
    return _render(
        page="signup",
        csrf_token=csrf_token,
        form_action=_signup_action(),
        username="",
        next_url="",
        error="",
        password_autocomplete="new-password",
        alt_href=login_path(),
        show_fields=True,
        username_minlength="4",
        password_minlength="12",
        password_hint="密码至少 12 位",
    )


def render_logout_page(*, bogus_user: str) -> str:
    from mlflow.server.auth.routes import AJAX_GET_CURRENT_USER

    login_url = login_path()
    login_js = json.dumps(login_url)
    users_js = json.dumps(AJAX_GET_CURRENT_USER)
    bogus_js = json.dumps(bogus_user)
    script = (
        "(function(){"
        f"var loginUrl={login_js};"
        "try{"
        "var xhr=new XMLHttpRequest();"
        f"xhr.open('GET',{users_js},true,{bogus_js},{bogus_js});"
        "xhr.onloadend=function(){window.location.replace(loginUrl);};"
        "xhr.send();"
        "}catch(e){window.location.replace(loginUrl);}"
        "})();"
    )
    return _render(
        page="logout",
        csrf_token="",
        form_action="",
        username="",
        next_url="",
        error="",
        alt_href=login_url,
        show_fields=False,
        logout_script=Markup(f"<script>{script}</script>"),
    )


def _signup_action() -> str:
    from mlflow.server.auth.routes import CREATE_USER_UI

    return CREATE_USER_UI


def _js_string(value: str) -> Markup:
    encoded = (
        json
        .dumps(value, ensure_ascii=False)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )
    return Markup(encoded)


def _render(**context: object) -> str:
    context.setdefault("logout_script", Markup(""))
    context.setdefault("error", "")
    context.setdefault("remember", True)
    context.setdefault("username", "")
    context.setdefault("next_url", "/")
    context.setdefault("username_minlength", "")
    context.setdefault("password_minlength", "")
    context.setdefault("password_hint", "")
    context.setdefault("password_autocomplete", "")
    context.setdefault("alt_href", "")
    context.setdefault("show_fields", False)
    context["error_js"] = _js_string(str(context.get("error") or ""))
    return _TEMPLATE.render(**context)
