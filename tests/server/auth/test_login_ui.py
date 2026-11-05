import base64
import re
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests

from mlflow.environment_variables import MLFLOW_AUTH_ADMIN_PASSWORD, MLFLOW_FLASK_SERVER_SECRET_KEY
from mlflow.server import auth as auth_module
from mlflow.server.auth.login_ui import (
    SESSION_PASSWORD_TAG_KEY,
    SESSION_USERNAME_KEY,
    login_redirect_location,
    password_tag,
    prefers_browser_login_page,
    safe_next_url,
)
from mlflow.server.handlers import STATIC_PREFIX_ENV_VAR
from mlflow.utils.os import is_windows
from mlflow.version import VERSION

from tests.server.auth.auth_test_utils import ADMIN_PASSWORD, ADMIN_USERNAME
from tests.tracking.integration_test_utils import _init_server

_PACKAGED_BASIC_AUTH_INI = Path(auth_module.__file__).parent / "basic_auth.ini"

_BROWSER = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Dest": "document",
}
_PAGE_COPY = (
    "衡鉴 · Agent 评测平台",
    "衡鉴",
    "Agent Evaluation",
    "让每一次智能",
    "都经得起验证。",
    "登录工作台",
    "账号",
    "请输入工作邮箱或用户名",
    "忘记密码？",
    "请输入密码",
    "7 天内保持登录",
    "登录衡鉴工作台",
    "使用企业 SSO 登录",
    "企业 SSO 入口待接入",
    "请联系平台管理员重置密码。",
    'name="username"',
    'name="csrf_token"',
    'name="remember"',
)


def _csrf_token(page_text: str) -> str:
    match = re.search(r'name="csrf_token" value="([^"]+)"', page_text)
    assert match is not None
    return match.group(1)


def _post_login(
    session: requests.Session,
    base: str,
    username: str,
    password: str,
    nxt: str | None,
    remember: str | None = None,
):
    page = session.get(f"{base}/login")
    assert page.status_code == 200
    data = {
        "username": username,
        "password": password,
        "csrf_token": _csrf_token(page.text),
    }
    if nxt is not None:
        data["next"] = nxt
    if remember is not None:
        data["remember"] = remember
    return session.post(f"{base}/login", data=data, allow_redirects=False)


def _session_cookie(response: requests.Response):
    matches = [cookie for cookie in response.cookies if cookie.name == "mlflow_session"]
    assert len(matches) == 1
    return matches[0]


def _isolate_auth_config(tmp_path: Path) -> dict[str, str]:
    isolated_db = tmp_path / "basic_auth.db"
    isolated_text = re.sub(
        r"^database_uri\s*=.*$",
        f"database_uri = sqlite:///{isolated_db}",
        _PACKAGED_BASIC_AUTH_INI.read_text(),
        flags=re.MULTILINE,
    )
    dst_path = tmp_path / "basic_auth.ini"
    dst_path.write_text(isolated_text)
    return {
        MLFLOW_AUTH_ADMIN_PASSWORD.name: ADMIN_PASSWORD,
        "MLFLOW_AUTH_CONFIG_PATH": str(dst_path),
    }


@pytest.fixture(scope="module")
def auth_server(tmp_path_factory):
    tmp_path = tmp_path_factory.mktemp("login-ui")
    extra_env = _isolate_auth_config(tmp_path)
    extra_env[MLFLOW_FLASK_SERVER_SECRET_KEY.name] = "my-secret-key"
    extra_env["_MLFLOW_SGI_NAME"] = "uvicorn"
    db_path = tmp_path.joinpath("sqlalchemy.db").as_uri()
    backend_uri = ("sqlite://" if is_windows() else "sqlite:////") + db_path[len("file://") :]
    with _init_server(
        backend_uri=backend_uri,
        root_artifact_uri=tmp_path.joinpath("artifacts").as_uri(),
        extra_env=extra_env,
        app="mlflow.server.auth:create_app",
        server_type="fastapi",
    ) as url:
        yield url


def test_safe_next_url_rejects_off_site_targets():
    assert safe_next_url(None) == "/"
    assert safe_next_url("") == "/"
    assert safe_next_url("https://evil.example/phish") == "/"
    assert safe_next_url("//evil.example") == "/"
    assert safe_next_url("/\\evil.example") == "/"
    assert safe_next_url("javascript:alert(1)") == "/"
    assert safe_next_url("/login") == "/"
    assert safe_next_url("/logout") == "/"
    assert safe_next_url("/version") == "/version"
    assert safe_next_url("/version?x=1") == "/version?x=1"
    assert safe_next_url("/#/experiments/1") == "/#/experiments/1"
    assert safe_next_url("  /version  ") == "/version"
    assert safe_next_url("/version\nSet-Cookie: evil") == "/"


def test_safe_next_url_respects_static_prefix(monkeypatch):
    monkeypatch.setenv(STATIC_PREFIX_ENV_VAR, "/mlflow")
    assert safe_next_url("/mlflow/login") == "/mlflow/"
    assert safe_next_url("/mlflow/version") == "/mlflow/version"
    assert login_redirect_location("/mlflow/", "").startswith("/mlflow/login?next=")


def test_prefers_browser_login_page_splits_navigation_from_clients():
    assert prefers_browser_login_page(_BROWSER) is True
    assert prefers_browser_login_page({"Accept": "text/html"}) is True
    assert prefers_browser_login_page({"Accept": "*/*"}) is False
    assert prefers_browser_login_page({}) is False
    assert prefers_browser_login_page(None) is False
    assert (
        prefers_browser_login_page({
            "Accept": "text/html",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
        })
        is False
    )
    assert (
        prefers_browser_login_page({"Accept": "text/html", "X-Requested-With": "XMLHttpRequest"})
        is False
    )
    assert prefers_browser_login_page({"Accept": "application/json, text/html;q=0.5"}) is False


def test_login_and_logout_are_public_and_exact(monkeypatch):
    monkeypatch.delenv(STATIC_PREFIX_ENV_VAR, raising=False)
    assert auth_module.is_unprotected_route("/login")
    assert auth_module.is_unprotected_route("/logout")
    assert auth_module.is_unprotected_route("/login/")
    assert not auth_module.is_unprotected_route("/login-admin")
    assert not auth_module.is_unprotected_route("/signup")
    monkeypatch.setenv(STATIC_PREFIX_ENV_VAR, "/mlflow")
    assert auth_module.is_unprotected_route("/mlflow/login")
    assert auth_module.is_unprotected_route("/mlflow/logout")
    assert not auth_module.is_unprotected_route("/mlflow/api/2.0/mlflow/users/list")


def test_browser_challenge_redirects_without_www_authenticate():
    import flask

    app = flask.Flask(__name__)
    with app.test_request_context("/", headers=_BROWSER):
        response = auth_module.make_basic_auth_response()
    assert response.status_code == 302
    assert response.headers["Location"].startswith("/login?next=")
    assert "WWW-Authenticate" not in response.headers

    with app.test_request_context("/api/2.0/mlflow/experiments/search", headers={"Accept": "*/*"}):
        response = auth_module.make_basic_auth_response()
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == 'Basic realm="mlflow"'


def test_custom_authorization_keeps_the_basic_challenge(monkeypatch):
    import flask

    monkeypatch.setattr(
        auth_module,
        "auth_config",
        auth_module.auth_config._replace(authorization_function="custom.plugin:authenticate"),
    )
    app = flask.Flask(__name__)
    with app.test_request_context("/", headers=_BROWSER):
        response = auth_module.make_basic_auth_response()
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == 'Basic realm="mlflow"'


def test_fastapi_session_cookie_authenticates_and_password_change_invalidates(monkeypatch):
    from mlflow.server import app

    previous_secret = app.secret_key
    previous_cookie = app.config.get("SESSION_COOKIE_NAME")
    app.secret_key = "login-test-secret"
    app.config["SESSION_COOKIE_NAME"] = "mlflow_session"
    user = SimpleNamespace(username="alice", password_hash="hash-a")
    monkeypatch.setattr(auth_module.store, "get_user", lambda username: user)
    try:
        tag = password_tag("hash-a")
        serializer = app.session_interface.get_signing_serializer(app)
        cookie = serializer.dumps({SESSION_USERNAME_KEY: "alice", SESSION_PASSWORD_TAG_KEY: tag})
        request = SimpleNamespace(
            cookies={"mlflow_session": cookie},
            headers={},
            scope={"path": "/ajax-api/3.0/jobs/search"},
            url=SimpleNamespace(path="/ajax-api/3.0/jobs/search", query=""),
        )
        authenticated = auth_module._authenticate_fastapi_request(request)
        assert authenticated is user

        user.password_hash = "hash-b"
        assert auth_module._authenticate_fastapi_request(request) is None
    finally:
        app.secret_key = previous_secret
        if previous_cookie is None:
            app.config.pop("SESSION_COOKIE_NAME", None)
        else:
            app.config["SESSION_COOKIE_NAME"] = previous_cookie


def test_login_page_session_and_basic_auth(auth_server: str):
    base = auth_server
    page = requests.get(f"{base}/login")
    assert page.status_code == 200
    assert "WWW-Authenticate" not in page.headers
    for text in _PAGE_COPY:
        assert text in page.text
    assert re.search(r'name="remember" value="1" checked', page.text)

    browser_home = requests.get(f"{base}/", headers=_BROWSER, allow_redirects=False)
    assert browser_home.status_code == 302
    assert browser_home.headers["Location"].startswith("/login?next=")
    assert "WWW-Authenticate" not in browser_home.headers

    curl_home = requests.get(f"{base}/", allow_redirects=False)
    assert curl_home.status_code == 401
    assert curl_home.headers["WWW-Authenticate"] == 'Basic realm="mlflow"'

    api = requests.post(f"{base}/api/2.0/mlflow/experiments/search", json={"max_results": 1})
    assert api.status_code == 401
    assert api.headers["WWW-Authenticate"].startswith("Basic")
    authed_api = requests.post(
        f"{base}/api/2.0/mlflow/experiments/search",
        json={"max_results": 1},
        auth=(ADMIN_USERNAME, ADMIN_PASSWORD),
    )
    assert authed_api.status_code == 200

    jobs = requests.post(f"{base}/ajax-api/3.0/jobs/search", json={}, allow_redirects=False)
    assert jobs.status_code == 401
    assert jobs.headers["WWW-Authenticate"].startswith("Basic")
    browser_jobs = requests.post(
        f"{base}/ajax-api/3.0/jobs/search",
        json={},
        headers=_BROWSER,
        allow_redirects=False,
    )
    assert browser_jobs.status_code == 302
    assert browser_jobs.headers["Location"].startswith("/login?next=")
    assert "WWW-Authenticate" not in browser_jobs.headers

    missing_csrf = requests.post(
        f"{base}/login",
        data={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
    )
    assert missing_csrf.status_code == 400
    assert "CSRF" in missing_csrf.text

    with requests.Session() as session:
        wrong = _post_login(session, base, ADMIN_USERNAME, "not-the-admin-password", "/")
        assert wrong.status_code == 401
        assert "用户名或密码不正确" in wrong.text
        assert "WWW-Authenticate" not in wrong.headers
        assert session.get(f"{base}/version").status_code == 401

        evil = _post_login(
            session, base, ADMIN_USERNAME, ADMIN_PASSWORD, "https://evil.example/phish"
        )
        assert evil.status_code == 303
        assert evil.headers["Location"] == "/"

        logged_in = _post_login(session, base, ADMIN_USERNAME, ADMIN_PASSWORD, "/version")
        assert logged_in.status_code == 303
        assert logged_in.headers["Location"] == "/version"
        version = session.get(f"{base}/version")
        assert version.status_code == 200
        assert version.text == VERSION

        stale_basic = base64.b64encode(f"{ADMIN_USERNAME}:not-the-admin-password".encode()).decode()
        with_stale = session.get(
            f"{base}/version", headers={"Authorization": f"Basic {stale_basic}"}
        )
        assert with_stale.status_code == 200
        jobs_with_session = session.post(f"{base}/ajax-api/3.0/jobs/search", json={})
        assert jobs_with_session.status_code != 401

        signup = session.get(f"{base}/signup", auth=(ADMIN_USERNAME, ADMIN_PASSWORD))
        assert signup.status_code == 200
        assert "衡鉴" in signup.text
        assert "创建账号" in signup.text
        assert "密码至少 12 位" in signup.text
        assert "#10211f" in signup.text
        assert _csrf_token(signup.text)

        logged_out = session.get(f"{base}/logout")
        assert logged_out.status_code == 200
        assert "衡鉴" in logged_out.text
        assert "正在退出登录" in logged_out.text
        assert "mlflow-logged-out-" in logged_out.text
        assert session.get(f"{base}/version").status_code == 401

    no_session = requests.get(
        f"{base}/version",
        headers={
            "Authorization": "Basic "
            + base64.b64encode(f"{ADMIN_USERNAME}:not-the-admin-password".encode()).decode()
        },
    )
    assert no_session.status_code == 401
    assert no_session.headers["WWW-Authenticate"].startswith("Basic")
    basic_ok = requests.get(f"{base}/version", auth=(ADMIN_USERNAME, ADMIN_PASSWORD))
    assert basic_ok.status_code == 200


def test_remember_me_extends_cookie_to_seven_days(auth_server: str):
    base = auth_server
    with requests.Session() as session:
        kept = _post_login(session, base, ADMIN_USERNAME, ADMIN_PASSWORD, "/version", remember="1")
    assert kept.status_code == 303
    assert "WWW-Authenticate" not in kept.headers
    kept_cookie = _session_cookie(kept)
    assert kept_cookie.expires is not None
    remaining = kept_cookie.expires - time.time()
    assert 6.9 * 86400 < remaining < 7.1 * 86400

    with requests.Session() as session:
        transient = _post_login(session, base, ADMIN_USERNAME, ADMIN_PASSWORD, "/version")
    assert transient.status_code == 303
    transient_cookie = _session_cookie(transient)
    assert transient_cookie.expires is None
    version = session.get(f"{base}/version")
    assert version.status_code == 200
