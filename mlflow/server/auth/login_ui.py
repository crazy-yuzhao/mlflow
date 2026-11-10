"""Browser login / signup pages for the basic-auth app.

The pages are plain HTML so they render before the React bundle, and so a logged-out
browser never has to interpret a ``401 WWW-Authenticate: Basic`` challenge.
Language and theme are presentation-only and do not affect authentication.
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

from jinja2 import Environment, StrictUndefined
from markupsafe import Markup

from mlflow.server.handlers import STATIC_PREFIX_ENV_VAR

SESSION_USERNAME_KEY = "mlflow_basic_auth_username"
SESSION_PASSWORD_TAG_KEY = "mlflow_basic_auth_pw_tag"
# 「7 天内保持登录」. The browser cookie expires after this window when the box is
# checked. Server-side signature checks still use ``permanent_session_lifetime``,
# which ``install_remember_me_session`` raises to at least this long.
REMEMBER_ME_LIFETIME = timedelta(days=7)
_REMEMBER_FORM_VALUES = {"1", "on", "true", "yes"}
# Presentation only. These cookies never participate in authentication.
# The signed-in React UI reads the same cookies and mirrors them into the
# localStorage keys below. Keep the strings aligned with
# mlflow/server/js/src/common/utils/uiPreferences.ts and supportedLocales.ts.
UI_LANG_COOKIE = "mlflow_ui_lang"
UI_THEME_COOKIE = "mlflow_ui_theme"
REACT_LOCALE_STORAGE_KEY = "locale"
REACT_LOCALE_ZH = "zh-CN"
REACT_LOCALE_EN = "en"
REACT_DARK_MODE_STORAGE_KEY = "_mlflow_dark_mode_toggle_enabled"
REACT_NAMED_THEME_STORAGE_KEY = "databricks-dark-mode-pref"
UI_LANG_QUERY = "lang"
UI_THEME_QUERY = "theme"
_DEFAULT_LANG = "zh"
_DEFAULT_THEME = "light"
_LOCALIZED_KEYS = ("error_bad_credentials", "error_missing_credentials", "password_hint")

_TEMPLATE = Environment(autoescape=True, undefined=StrictUndefined).from_string(
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


# Visible copy for the shared login / signup / logout page. Keys match across languages.
_COPY: dict[str, dict[str, str]] = {
    "zh": {
        "html_lang": "zh-CN",
        "code": "ZH",
        "title": "衡鉴 · Agent 评测平台",
        "story_label": "衡鉴平台介绍",
        "brand_label": "衡鉴 Agent 评测平台",
        "brand_name": "衡鉴",
        "brand_tag": "Agent Evaluation",
        "edition": "HENGJIAN · AGENT QUALITY SYSTEM",
        "eyebrow": "从实验追踪，到可信评测",
        "hero_line": "让每一次智能，",
        "hero_em": "都经得起验证。",
        "intro": (
            "把 Agent 的运行轨迹、评测数据与实验结果，汇聚在一个可追踪、可比较、可复现的工作台。"
        ),
        "console_label": "评测工作台示意图",
        "console_title": "Agent 评测概览",
        "console_subject": "生产助手 v2.4",
        "run_id": "RUN #24-0918 · JUST NOW",
        "chart_label": "综合质量得分",
        "metric_success": "任务成功率",
        "metric_factual": "事实准确率",
        "strip_experiment": "当前实验",
        "strip_dataset": "评测集",
        "strip_dataset_value": "客服问题集 · 1,240 条",
        "strip_pass": "全部检查通过",
        "foot_en": "TRACE EVERY RUN. TRUST EVERY RELEASE.",
        "foot_powered": "由衡鉴实验追踪能力驱动",
        "access_login": "登录",
        "access_signup": "注册",
        "access_logout": "退出登录",
        "signup_kicker": "CREATE ACCOUNT · HENGJIAN",
        "signup_title": "创建账号",
        "signup_sub": "注册后即可在授权范围内追踪实验，让每一个评测结论都有迹可循。",
        "username": "用户名",
        "username_ph": "请输入用户名",
        "password": "密码",
        "signup_password_ph": "至少 12 位密码",
        "password_hint": "密码至少 12 位",
        "signup_submit": "注册",
        "show_password": "显示密码",
        "hide_password": "隐藏密码",
        "signup_switch": "已有账号？",
        "signup_switch_link": "登录",
        "signup_note": "新账号默认没有管理权限。创建后由管理员授予实验、评测与 Trace 的访问范围。",
        "logout_kicker": "SIGN OUT · HENGJIAN",
        "logout_title": "正在退出登录",
        "logout_sub": "正在清除登录状态，即将返回登录页。",
        "logout_back": "返回登录",
        "login_kicker": "WELCOME BACK · HENGJIAN",
        "login_title": "登录工作台",
        "login_sub": "继续追踪实验，让每一个评测结论都有迹可循。",
        "account": "账号",
        "account_ph": "请输入工作邮箱或用户名",
        "forgot": "忘记密码？",
        "password_ph": "请输入密码",
        "remember": "7 天内保持登录",
        "login_submit": "登录衡鉴工作台",
        "divider": "或",
        "sso": "使用企业 SSO 登录",
        "login_note": (
            "你的实验与评测记录受到权限保护。登录后可查看授权范围内的 Tracking、Runs 与 Trace。"
        ),
        "footer": "© 2026 HENGJIAN · AGENT EVALUATION PLATFORM",
        "toast_forgot": "请联系平台管理员重置密码。",
        "toast_sso": "企业 SSO 入口待接入身份提供方。",
        "error_bad_credentials": "用户名或密码不正确",
        "error_missing_credentials": "请输入用户名和密码",
        "lang_label": "选择语言",
        "lang_zh": "简体中文",
        "lang_en": "English",
        "theme_to_dark": "切换到深色主题",
        "theme_to_light": "切换到浅色主题",
    },
    "en": {
        "html_lang": "en",
        "code": "EN",
        "title": "Hengjian · Agent Evaluation Platform",
        "story_label": "About Hengjian",
        "brand_label": "Hengjian Agent Evaluation",
        "brand_name": "Hengjian",
        "brand_tag": "Agent Evaluation",
        "edition": "HENGJIAN · AGENT QUALITY SYSTEM",
        "eyebrow": "From experiment tracking to trusted evaluation",
        "hero_line": "Let every intelligence",
        "hero_em": "stand up to verification.",
        "intro": (
            "Bring agent traces, evaluation data, and experiment results together "
            "in one workspace you can track, compare, and reproduce."
        ),
        "console_label": "Evaluation workspace preview",
        "console_title": "Agent evaluation overview",
        "console_subject": "Production assistant v2.4",
        "run_id": "RUN #24-0918 · JUST NOW",
        "chart_label": "Overall quality score",
        "metric_success": "Task success rate",
        "metric_factual": "Factual accuracy",
        "strip_experiment": "Current experiment",
        "strip_dataset": "Evaluation set",
        "strip_dataset_value": "Support questions · 1,240",
        "strip_pass": "All checks passed",
        "foot_en": "TRACE EVERY RUN. TRUST EVERY RELEASE.",
        "foot_powered": "Powered by Hengjian experiment tracking",
        "access_login": "Sign in",
        "access_signup": "Sign up",
        "access_logout": "Sign out",
        "signup_kicker": "CREATE ACCOUNT · HENGJIAN",
        "signup_title": "Create account",
        "signup_sub": (
            "Sign up to track experiments you are authorized to see, "
            "so every evaluation stays traceable."
        ),
        "username": "Username",
        "username_ph": "Enter a username",
        "password": "Password",
        "signup_password_ph": "At least 12 characters",
        "password_hint": "Password must be at least 12 characters",
        "signup_submit": "Sign up",
        "show_password": "Show password",
        "hide_password": "Hide password",
        "signup_switch": "Already have an account? ",
        "signup_switch_link": "Sign in",
        "signup_note": (
            "New accounts have no admin permissions. An administrator grants access "
            "to experiments, evaluations, and traces after the account is created."
        ),
        "logout_kicker": "SIGN OUT · HENGJIAN",
        "logout_title": "Signing out",
        "logout_sub": "Clearing your session and returning to the sign-in page.",
        "logout_back": "Back to sign in",
        "login_kicker": "WELCOME BACK · HENGJIAN",
        "login_title": "Sign in to the workspace",
        "login_sub": "Continue tracking experiments so every evaluation stays traceable.",
        "account": "Account",
        "account_ph": "Work email or username",
        "forgot": "Forgot password?",
        "password_ph": "Enter your password",
        "remember": "Stay signed in for 7 days",
        "login_submit": "Sign in to Hengjian",
        "divider": "or",
        "sso": "Sign in with enterprise SSO",
        "login_note": (
            "Experiments and evaluations are protected by permissions. After signing in "
            "you can view the Tracking, Runs, and Traces you are allowed to access."
        ),
        "footer": "© 2026 HENGJIAN · AGENT EVALUATION PLATFORM",
        "toast_forgot": "Contact a platform admin to reset your password.",
        "toast_sso": "Enterprise SSO is not connected to an identity provider yet.",
        "error_bad_credentials": "Incorrect username or password",
        "error_missing_credentials": "Enter a username and password",
        "lang_label": "Choose language",
        "lang_zh": "简体中文",
        "lang_en": "English",
        "theme_to_dark": "Switch to dark theme",
        "theme_to_light": "Switch to light theme",
    },
}


def _normalize_lang(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    token = value.strip().lower().replace("_", "-")
    if token in {"zh", "zh-cn", "zh-hans", "cn", "chinese"}:
        return "zh"
    if token in {"en", "en-us", "en-gb", "english"}:
        return "en"
    return None


def _normalize_theme(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    token = value.strip().lower()
    if token in {"light", "dark"}:
        return token
    return None


def _read_request_prefs() -> tuple[str | None, str | None, str | None, str | None]:
    """Query lang, cookie lang, query theme, cookie theme. Each is normalized or None."""
    try:
        from flask import has_request_context, request
    except ImportError:
        return None, None, None, None
    if not has_request_context():
        return None, None, None, None
    return (
        _normalize_lang(request.args.get(UI_LANG_QUERY)),
        _normalize_lang(request.cookies.get(UI_LANG_COOKIE)),
        _normalize_theme(request.args.get(UI_THEME_QUERY)),
        _normalize_theme(request.cookies.get(UI_THEME_COOKIE)),
    )


def resolve_auth_page_prefs() -> tuple[str, str]:
    """Language and theme for the auth pages.

    Query parameters win over cookies so a shared link can preview a locale without
    sticking. Unknown values fall back to Simplified Chinese and the light layout.
    """
    query_lang, cookie_lang, query_theme, cookie_theme = _read_request_prefs()
    return (
        query_lang or cookie_lang or _DEFAULT_LANG,
        query_theme or cookie_theme or _DEFAULT_THEME,
    )


def _localize_known(text: str, copy: dict[str, str]) -> str:
    if not text:
        return ""
    for messages in _COPY.values():
        for key in _LOCALIZED_KEYS:
            if text == messages[key]:
                return copy[key]
    return text


def _js_object(value: object) -> Markup:
    encoded = (
        json
        .dumps(value, ensure_ascii=False)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )
    return Markup(encoded)


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
    lang, theme = resolve_auth_page_prefs()
    copy = dict(_COPY[lang])
    copy["theme_label"] = copy["theme_to_dark"] if theme == "light" else copy["theme_to_light"]
    error = _localize_known(str(context.get("error") or ""), copy)
    context["error"] = error
    context["password_hint"] = _localize_known(str(context.get("password_hint") or ""), copy)
    context["lang"] = lang
    context["theme"] = theme
    context["copy"] = copy
    context["error_js"] = _js_string(error)
    context["i18n_js"] = _js_object({
        "showPassword": copy["show_password"],
        "hidePassword": copy["hide_password"],
        "toastForgot": copy["toast_forgot"],
        "toastSso": copy["toast_sso"],
        "themeToDark": copy["theme_to_dark"],
        "themeToLight": copy["theme_to_light"],
    })
    _, cookie_lang, _, cookie_theme = _read_request_prefs()
    # ``stored*`` is the cookie only. The page script mirrors that explicit
    # choice into the React keys and, when the cookie is missing, copies a
    # React choice back into the cookie. The rendered default is not a choice.
    context["prefs_js"] = _js_object({
        "langCookie": UI_LANG_COOKIE,
        "themeCookie": UI_THEME_COOKIE,
        "lang": lang,
        "theme": theme,
        "storedLang": cookie_lang or "",
        "storedTheme": cookie_theme or "",
        "localeKey": REACT_LOCALE_STORAGE_KEY,
        "localeZh": REACT_LOCALE_ZH,
        "localeEn": REACT_LOCALE_EN,
        "darkModeKey": REACT_DARK_MODE_STORAGE_KEY,
        "namedThemeKey": REACT_NAMED_THEME_STORAGE_KEY,
    })
    return _TEMPLATE.render(**context)
