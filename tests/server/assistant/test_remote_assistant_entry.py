from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import mlflow.assistant.config as config_module
from mlflow.assistant.config import AssistantConfig, set_config_user
from mlflow.assistant.config import ProviderConfig as AssistantProviderConfig
from mlflow.assistant.providers import MlflowGatewayProvider
from mlflow.server.assistant.api import assistant_router

CONFIG_URL = "/ajax-api/3.0/mlflow/assistant/config"


@pytest.fixture(autouse=True)
def isolated_config(tmp_path, monkeypatch):
    home = tmp_path / ".mlflow" / "assistant"
    monkeypatch.setattr(config_module, "MLFLOW_ASSISTANT_HOME", home)
    monkeypatch.setattr(config_module, "CONFIG_PATH", home / "config.json")
    set_config_user(None)
    yield
    set_config_user(None)


@pytest.fixture
def remote_client(monkeypatch):
    monkeypatch.setattr("mlflow.server.assistant.api._is_localhost", lambda _request: False)
    app = FastAPI()
    app.include_router(assistant_router)
    return TestClient(app)


def _block_local_providers(monkeypatch):
    monkeypatch.setattr(
        "mlflow.assistant.providers.ClaudeCodeProvider.is_available", lambda self: False
    )
    monkeypatch.setattr("mlflow.assistant.providers.CodexProvider.is_available", lambda self: False)


def test_remote_switch_shows_entry_without_allowing_chat(monkeypatch, remote_client):
    monkeypatch.setenv("MLFLOW_ENABLE_REMOTE_ASSISTANT", "true")
    monkeypatch.setattr("mlflow.server.assistant.api.assistant_sandbox_enabled", lambda: False)
    _block_local_providers(monkeypatch)

    response = remote_client.get(CONFIG_URL)

    assert response.status_code == 200
    body = response.json()
    assert body["remote_assistant_enabled"] is True
    assert body["remote_access_allowed"] is False
    assert body["providers"] == {}
    assert body["can_edit_server_settings"] is False

    denied = remote_client.post("/ajax-api/3.0/mlflow/assistant/message", json={"message": "Hi"})
    assert denied.status_code == 403


def test_remote_switch_off_hides_the_entry_flag(monkeypatch, remote_client):
    monkeypatch.setenv("MLFLOW_ENABLE_REMOTE_ASSISTANT", "false")
    _block_local_providers(monkeypatch)

    response = remote_client.get(CONFIG_URL)

    assert response.status_code == 200
    body = response.json()
    assert body["remote_assistant_enabled"] is False
    assert body["remote_access_allowed"] is False
    assert body["providers"] == {}


def test_selected_gateway_allows_chat_only_when_the_sandbox_is_on(monkeypatch, remote_client):
    monkeypatch.setenv("MLFLOW_ENABLE_REMOTE_ASSISTANT", "true")
    AssistantConfig(
        providers={
            MlflowGatewayProvider.GATEWAY_PROVIDER_NAME: AssistantProviderConfig(
                model="team-chat",
                selected=True,
            )
        }
    ).save()

    monkeypatch.setattr("mlflow.server.assistant.api.assistant_sandbox_enabled", lambda: False)
    blocked = remote_client.get(CONFIG_URL)
    assert blocked.json()["remote_assistant_enabled"] is True
    assert blocked.json()["remote_access_allowed"] is False
    assert blocked.json()["providers"]["mlflow_gateway"]["model"] == "team-chat"

    monkeypatch.setattr("mlflow.server.assistant.api.assistant_sandbox_enabled", lambda: True)
    allowed = remote_client.get(CONFIG_URL)
    assert allowed.json()["remote_access_allowed"] is True


def test_remote_config_write_still_rejects_api_keys(monkeypatch, remote_client):
    monkeypatch.setenv("MLFLOW_ENABLE_REMOTE_ASSISTANT", "true")
    monkeypatch.setattr("mlflow.server.assistant.api.assistant_sandbox_enabled", lambda: True)
    monkeypatch.setattr("mlflow.server.assistant.api.auth_plugin_active", lambda: True)
    with patch("mlflow.server.assistant.api.resolve_authenticated_username", return_value="alice"):
        response = remote_client.put(
            CONFIG_URL,
            json={
                "providers": {
                    "mlflow_gateway": {"api_key": "sk-secret", "gateway_vendor": "openai"},
                }
            },
        )

    assert response.status_code == 403
    assert "API key" in response.json()["detail"] or "Gateway" in response.json()["detail"]


@pytest.mark.parametrize("provider_name", ["claude_code", "codex"])
def test_remote_execution_rejects_providers_that_cannot_run_remotely(
    monkeypatch, remote_client, provider_name
):
    monkeypatch.setenv("MLFLOW_ENABLE_REMOTE_ASSISTANT", "true")
    monkeypatch.setattr("mlflow.server.assistant.api.assistant_sandbox_enabled", lambda: True)
    AssistantConfig(
        providers={provider_name: AssistantProviderConfig(model="default", selected=True)}
    ).save()

    config = remote_client.get(CONFIG_URL)
    assert config.json()["remote_assistant_enabled"] is True
    assert config.json()["remote_access_allowed"] is False

    denied = remote_client.post("/ajax-api/3.0/mlflow/assistant/message", json={"message": "Hi"})
    assert denied.status_code == 403
