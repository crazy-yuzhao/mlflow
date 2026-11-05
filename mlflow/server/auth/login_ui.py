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
from pathlib import Path
from typing import Any

from jinja2 import Environment
from markupsafe import Markup

from mlflow.server.handlers import STATIC_PREFIX_ENV_VAR

SESSION_USERNAME_KEY = "mlflow_basic_auth_username"
SESSION_PASSWORD_TAG_KEY = "mlflow_basic_auth_pw_tag"

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


def render_login_page(
    *,
    csrf_token: str,
    username: str = "",
    next_url: str = "/",
    error: str | None = None,
) -> str:
    return _render(
        page="login",
        csrf_token=csrf_token,
        form_action=login_path(),
        username=username,
        next_url=next_url,
        error=error or "",
        subtitle="企业级模型评测与追踪",
        submit_label="登录",
        username_placeholder="请输入用户名",
        password_placeholder="请输入密码",
        password_autocomplete="current-password",
        alt_prefix="还没有账号？",
        alt_label="注册",
        alt_href=_signup_path(),
        show_next=True,
        show_fields=True,
        username_minlength="",
        password_minlength="",
        password_hint="",
    )


def render_signup_page(*, csrf_token: str) -> str:
    return _render(
        page="signup",
        csrf_token=csrf_token,
        form_action=_signup_action(),
        username="",
        next_url="",
        error="",
        subtitle="创建账号",
        submit_label="注册",
        username_placeholder="请输入用户名",
        password_placeholder="至少 12 位密码",
        password_autocomplete="new-password",
        alt_prefix="已有账号？",
        alt_label="登录",
        alt_href=login_path(),
        show_next=False,
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
        subtitle="正在退出登录",
        submit_label="",
        username_placeholder="",
        password_placeholder="",
        password_autocomplete="",
        alt_prefix="",
        alt_label="返回登录",
        alt_href=login_url,
        show_next=False,
        show_fields=False,
        username_minlength="",
        password_minlength="",
        password_hint="",
        logout_script=Markup(f"<script>{script}</script>"),
    )


def _signup_path() -> str:
    from mlflow.server.auth.routes import SIGNUP

    return SIGNUP


def _signup_action() -> str:
    from mlflow.server.auth.routes import CREATE_USER_UI

    return CREATE_USER_UI


def _render(**context: object) -> str:
    context.setdefault("logout_script", Markup(""))
    return _TEMPLATE.render(**context)
