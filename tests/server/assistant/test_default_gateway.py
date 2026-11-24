import base64
import shutil
import sys
import types
from types import SimpleNamespace
from unittest import mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import mlflow.assistant.config as config_module
from mlflow.assistant.config import AssistantConfig, ProviderConfig, set_config_user
from mlflow.assistant.default_gateway import (
    configured_default_gateway_endpoint,
    reset_default_gateway_model,
    set_default_gateway_model,
)
from mlflow.assistant.providers.mlflow_gateway import MlflowGatewayProvider
from mlflow.assistant.types import Event
from mlflow.exceptions import MlflowException
from mlflow.protos.databricks_pb2 import RESOURCE_DOES_NOT_EXIST
from mlflow.server.assistant.api import assistant_router
from mlflow.server.assistant.default_gateway import usable_default_gateway_endpoint
from mlflow.server.assistant.session import SESSION_DIR

_ENDPOINT = "example-chat"


@pytest.fixture(autouse=True)
def isolated_config(tmp_path, monkeypatch):
    home = tmp_path / ".mlflow" / "assistant"
    monkeypatch.setattr(config_module, "MLFLOW_ASSISTANT_HOME", home)
    monkeypatch.setattr(config_module, "CONFIG_PATH", home / "config.json")
    monkeypatch.delenv("MLFLOW_ASSISTANT_DEFAULT_GATEWAY_ENDPOINT", raising=False)
    set_config_user(None)
    token = set_default_gateway_model(None)
    if SESSION_DIR.exists():
        shutil.rmtree(SESSION_DIR)
    yield home
    set_config_user(None)
    reset_default_gateway_model(token)
    if SESSION_DIR.exists():
        shutil.rmtree(SESSION_DIR)


@pytest.fixture
def no_config_writes(monkeypatch):
    saved = []
    original = AssistantConfig._save_file

    def _spy(path, config):
        saved.append(path)
        return original(path, config)

    monkeypatch.setattr(AssistantConfig, "_save_file", staticmethod(_spy))
    return saved


def _install_store(monkeypatch, *, exists=True, error=None, listed=None):
    store = mock.MagicMock()
    if error is not None:
        store.get_gateway_endpoint.side_effect = error
    elif exists:
        store.get_gateway_endpoint.return_value = SimpleNamespace(name=_ENDPOINT, endpoint_id="e-1")
    else:
        store.get_gateway_endpoint.side_effect = MlflowException(
            "not found", error_code=RESOURCE_DOES_NOT_EXIST
        )
    if listed is None:
        store.list_gateway_endpoints.side_effect = AssertionError("must not list gateway endpoints")
    else:
        store.list_gateway_endpoints.return_value = listed
    monkeypatch.setattr("mlflow.tracking._tracking_service.utils._get_store", lambda: store)
    return store


def _install_auth(monkeypatch, *, username, is_admin, allowed):
    module = types.ModuleType("mlflow.server.auth")
    module.is_auth_enabled = lambda: True
    module.authenticate_fastapi_request_user = mock.Mock(
        return_value=SimpleNamespace(username=username)
    )
    grant = mock.Mock()
    module.store = SimpleNamespace(
        get_user=lambda name: SimpleNamespace(is_admin=is_admin),
        grant_user_permission=grant,
    )
    validator = mock.Mock(return_value=allowed)
    module._validate_gateway_use_permission = validator
    monkeypatch.setitem(sys.modules, "mlflow.server.auth", module)
    return validator, grant


def _disable_auth(monkeypatch):
    monkeypatch.delitem(sys.modules, "mlflow.server.auth", raising=False)


def _client(monkeypatch, *, remote):
    app = FastAPI()
    app.include_router(assistant_router)
    monkeypatch.setattr("mlflow.server.assistant.api._is_localhost", lambda _request: not remote)
    return TestClient(app)


def _auth_header(username="alice"):
    token = base64.b64encode(f"{username}:pw".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def _open_remote(monkeypatch, *, enabled="true", sandbox=True):
    monkeypatch.setenv("MLFLOW_ENABLE_REMOTE_ASSISTANT", enabled)
    monkeypatch.setenv("MLFLOW_ASSISTANT_DEFAULT_GATEWAY_ENDPOINT", f"  {_ENDPOINT}  ")
    monkeypatch.setattr("mlflow.server.assistant.api.assistant_sandbox_enabled", lambda: sandbox)


def _block_other_providers(monkeypatch):
    monkeypatch.setattr(
        "mlflow.assistant.providers.ClaudeCodeProvider.is_available", lambda self: False
    )
    monkeypatch.setattr("mlflow.assistant.providers.CodexProvider.is_available", lambda self: False)


def test_configured_name_strips_blank_values(monkeypatch):
    assert configured_default_gateway_endpoint() is None
    monkeypatch.setenv("MLFLOW_ASSISTANT_DEFAULT_GATEWAY_ENDPOINT", "   ")
    assert configured_default_gateway_endpoint() is None
    monkeypatch.setenv("MLFLOW_ASSISTANT_DEFAULT_GATEWAY_ENDPOINT", f"  {_ENDPOINT}  ")
    assert configured_default_gateway_endpoint() == _ENDPOINT


def test_lookup_failure_does_not_raise(monkeypatch):
    monkeypatch.setenv("MLFLOW_ASSISTANT_DEFAULT_GATEWAY_ENDPOINT", _ENDPOINT)
    _disable_auth(monkeypatch)
    _install_store(monkeypatch, error=RuntimeError("database starting"))

    assert usable_default_gateway_endpoint(None) is None


def test_new_user_gets_default_gateway_without_writing_config(
    monkeypatch, no_config_writes, isolated_config
):
    _disable_auth(monkeypatch)
    _open_remote(monkeypatch)
    store = _install_store(
        monkeypatch, listed=[SimpleNamespace(name="paid-other"), SimpleNamespace(name=_ENDPOINT)]
    )
    client = _client(monkeypatch, remote=True)

    config = client.get("/ajax-api/3.0/mlflow/assistant/config")
    providers = client.get("/ajax-api/3.0/mlflow/assistant/providers")

    assert config.status_code == 200
    body = config.json()
    assert body["remote_access_allowed"] is True
    gateway = body["providers"]["mlflow_gateway"]
    assert gateway["selected"] is True
    assert gateway["model"] == _ENDPOINT
    assert gateway["permissions"]["full_access"] is False
    assert providers.status_code == 200
    resolved = providers.json()["resolved"]
    assert resolved["name"] == "mlflow_gateway"
    assert resolved["model"] == _ENDPOINT
    assert resolved["auto_selected"] is True
    assert providers.json()["providers"]
    assert all(
        item["selected"] is False
        for item in providers.json()["providers"]
        if item["name"] == "mlflow_gateway"
    )
    store.get_gateway_endpoint.assert_called_with(name=_ENDPOINT)
    assert no_config_writes == []
    assert not (isolated_config / "config.json").exists()
    assert not (isolated_config / "users").exists()


@pytest.mark.parametrize(
    ("enabled", "sandbox", "expected"),
    [
        ("false", True, False),
        ("true", False, False),
    ],
)
def test_default_gateway_stays_hidden_when_remote_or_sandbox_is_off(
    monkeypatch, no_config_writes, enabled, sandbox, expected
):
    _disable_auth(monkeypatch)
    _open_remote(monkeypatch, enabled=enabled, sandbox=sandbox)
    _install_store(monkeypatch)
    _block_other_providers(monkeypatch)
    client = _client(monkeypatch, remote=True)

    response = client.get("/ajax-api/3.0/mlflow/assistant/config")

    assert response.status_code == 200
    assert response.json()["remote_access_allowed"] is expected
    assert no_config_writes == []


def test_missing_default_endpoint_does_not_select_another_model(monkeypatch, no_config_writes):
    _disable_auth(monkeypatch)
    _open_remote(monkeypatch)
    _install_store(monkeypatch, exists=False)
    _block_other_providers(monkeypatch)
    monkeypatch.setattr(
        "mlflow.assistant.providers.MlflowGatewayProvider.is_available",
        lambda self: (_ for _ in ()).throw(AssertionError("must not probe other endpoints")),
    )
    client = _client(monkeypatch, remote=True)

    response = client.get("/ajax-api/3.0/mlflow/assistant/config")

    assert response.status_code == 200
    body = response.json()
    assert body["remote_access_allowed"] is False
    assert body["providers"] == {}
    assert no_config_writes == []


def test_user_without_use_is_not_granted_the_default(monkeypatch, no_config_writes):
    validator, grant = _install_auth(monkeypatch, username="alice", is_admin=False, allowed=False)
    _open_remote(monkeypatch)
    _install_store(monkeypatch)
    _block_other_providers(monkeypatch)
    client = _client(monkeypatch, remote=True)

    response = client.get(
        "/ajax-api/3.0/mlflow/assistant/config",
        headers=_auth_header(),
    )

    assert response.status_code == 200
    assert response.json()["remote_access_allowed"] is False
    assert response.json()["providers"] == {}
    validator.assert_called_with(_ENDPOINT, "alice")
    grant.assert_not_called()
    assert no_config_writes == []


def test_user_with_use_gets_the_default_without_a_grant(monkeypatch, no_config_writes):
    validator, grant = _install_auth(monkeypatch, username="alice", is_admin=False, allowed=True)
    _open_remote(monkeypatch)
    _install_store(monkeypatch)
    client = _client(monkeypatch, remote=True)

    response = client.get(
        "/ajax-api/3.0/mlflow/assistant/config",
        headers=_auth_header(),
    )

    assert response.status_code == 200
    assert response.json()["remote_access_allowed"] is True
    assert response.json()["providers"]["mlflow_gateway"]["model"] == _ENDPOINT
    validator.assert_called_with(_ENDPOINT, "alice")
    grant.assert_not_called()
    assert no_config_writes == []


def test_admin_uses_default_without_a_use_grant(monkeypatch, no_config_writes):
    validator, grant = _install_auth(monkeypatch, username="admin", is_admin=True, allowed=False)
    validator.side_effect = AssertionError("admins skip the USE validator")
    _open_remote(monkeypatch)
    _install_store(monkeypatch)
    client = _client(monkeypatch, remote=True)

    response = client.get(
        "/ajax-api/3.0/mlflow/assistant/config",
        headers=_auth_header("admin"),
    )

    assert response.status_code == 200
    assert response.json()["remote_access_allowed"] is True
    assert response.json()["providers"]["mlflow_gateway"]["model"] == _ENDPOINT
    validator.assert_not_called()
    grant.assert_not_called()
    assert no_config_writes == []


def test_permission_lookup_error_hides_the_default(monkeypatch, no_config_writes):
    validator, grant = _install_auth(monkeypatch, username="alice", is_admin=False, allowed=True)
    validator.side_effect = RuntimeError("auth store unavailable")
    _open_remote(monkeypatch)
    _install_store(monkeypatch)
    _block_other_providers(monkeypatch)
    client = _client(monkeypatch, remote=True)

    response = client.get(
        "/ajax-api/3.0/mlflow/assistant/config",
        headers=_auth_header(),
    )

    assert response.status_code == 200
    assert response.json()["remote_access_allowed"] is False
    grant.assert_not_called()
    assert no_config_writes == []


def test_saved_provider_preference_wins_and_is_not_rewritten(monkeypatch, no_config_writes):
    _disable_auth(monkeypatch)
    _open_remote(monkeypatch)
    store = _install_store(monkeypatch, error=AssertionError("must not look up the default"))
    set_config_user(None)
    AssistantConfig(
        providers={
            "claude_code": ProviderConfig(model="opus", selected=True),
            "mlflow_gateway": ProviderConfig(model="user-endpoint", selected=False),
        }
    ).save()
    before = config_module.CONFIG_PATH.read_bytes()
    no_config_writes.clear()
    client = _client(monkeypatch, remote=True)

    response = client.get("/ajax-api/3.0/mlflow/assistant/config")

    assert response.status_code == 200
    body = response.json()
    assert body["providers"]["claude_code"]["selected"] is True
    assert body["providers"]["claude_code"]["model"] == "opus"
    assert body["providers"]["mlflow_gateway"]["selected"] is False
    assert body["providers"]["mlflow_gateway"]["model"] == "user-endpoint"
    assert body["remote_access_allowed"] is False
    assert config_module.CONFIG_PATH.read_bytes() == before
    assert no_config_writes == []
    store.get_gateway_endpoint.assert_not_called()


def test_saved_unselected_provider_is_not_replaced_by_the_default(monkeypatch, no_config_writes):
    _disable_auth(monkeypatch)
    _open_remote(monkeypatch)
    _install_store(monkeypatch, error=AssertionError("must not look up the default"))
    _block_other_providers(monkeypatch)
    set_config_user(None)
    AssistantConfig(
        providers={"mlflow_gateway": ProviderConfig(model="user-endpoint", selected=False)}
    ).save()
    before = config_module.CONFIG_PATH.read_bytes()
    no_config_writes.clear()
    client = _client(monkeypatch, remote=True)

    response = client.get("/ajax-api/3.0/mlflow/assistant/config")

    assert response.status_code == 200
    body = response.json()
    assert body["remote_access_allowed"] is False
    assert body["providers"]["mlflow_gateway"]["selected"] is False
    assert body["providers"]["mlflow_gateway"]["model"] == "user-endpoint"
    assert config_module.CONFIG_PATH.read_bytes() == before
    assert no_config_writes == []


def test_saved_gateway_model_is_kept(monkeypatch, no_config_writes):
    _disable_auth(monkeypatch)
    _open_remote(monkeypatch)
    _install_store(monkeypatch, error=AssertionError("must not look up the default"))
    set_config_user(None)
    AssistantConfig(
        providers={"mlflow_gateway": ProviderConfig(model="user-endpoint", selected=True)}
    ).save()
    before = config_module.CONFIG_PATH.read_bytes()
    no_config_writes.clear()
    client = _client(monkeypatch, remote=True)

    response = client.get("/ajax-api/3.0/mlflow/assistant/config")

    assert response.status_code == 200
    gateway = response.json()["providers"]["mlflow_gateway"]
    assert gateway["selected"] is True
    assert gateway["model"] == "user-endpoint"
    assert response.json()["remote_access_allowed"] is True
    assert config_module.CONFIG_PATH.read_bytes() == before
    assert no_config_writes == []


def _record_gateway_model(monkeypatch):
    recorded = {}

    async def _astream(
        self,
        prompt,
        tracking_uri,
        session_id=None,
        mlflow_session_id=None,
        cwd=None,
        context=None,
    ):
        recorded["model"] = self._load_config().model
        yield Event.from_result(result="complete", session_id="recorded-session")

    monkeypatch.setattr(MlflowGatewayProvider, "astream", _astream)
    monkeypatch.setattr(
        MlflowGatewayProvider,
        "list_models",
        lambda self, base_url=None, api_key=None: (_ for _ in ()).throw(
            AssertionError("must not list models")
        ),
    )
    return recorded


def test_unconfigured_turn_uses_the_named_endpoint(monkeypatch, no_config_writes):
    _disable_auth(monkeypatch)
    _open_remote(monkeypatch)
    _install_store(monkeypatch, listed=[SimpleNamespace(name="paid-other")])
    recorded = _record_gateway_model(monkeypatch)
    client = _client(monkeypatch, remote=False)

    created = client.post("/ajax-api/3.0/mlflow/assistant/message", json={"message": "Hi"})
    assert created.status_code == 200
    streamed = client.get(created.json()["stream_url"])

    assert streamed.status_code == 200
    assert recorded["model"] == _ENDPOINT
    assert no_config_writes == []


def test_configured_turn_keeps_the_saved_model(monkeypatch, no_config_writes):
    _disable_auth(monkeypatch)
    _open_remote(monkeypatch)
    _install_store(monkeypatch, error=AssertionError("must not look up the default"))
    set_config_user(None)
    AssistantConfig(
        providers={"mlflow_gateway": ProviderConfig(model="user-endpoint", selected=True)}
    ).save()
    no_config_writes.clear()
    recorded = _record_gateway_model(monkeypatch)
    client = _client(monkeypatch, remote=False)

    created = client.post("/ajax-api/3.0/mlflow/assistant/message", json={"message": "Hi"})
    assert created.status_code == 200
    streamed = client.get(created.json()["stream_url"])

    assert streamed.status_code == 200
    assert recorded["model"] == "user-endpoint"
    assert no_config_writes == []
