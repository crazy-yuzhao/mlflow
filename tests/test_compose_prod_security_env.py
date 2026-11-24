import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[1]
_COMPOSE_FILE = _REPO_ROOT / "docker-compose" / "docker-compose.prod.yml"
_ENV_EXAMPLE = _REPO_ROOT / "docker-compose" / ".env.prod.example"

_IP_HOSTS = "localhost,localhost:*,127.0.0.1,127.0.0.1:*,203.0.113.10:25000"
_IP_ORIGINS = "http://203.0.113.10:25000"
_DOMAIN_HOSTS = "localhost,localhost:*,127.0.0.1,127.0.0.1:*,mlflow.example.com"
_DOMAIN_ORIGINS = "https://mlflow.example.com"


def _parse_env(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key, sep, value = stripped.partition("=")
        if sep:
            values[key] = value
    return values


def _render_prod_compose(tmp_path: Path, updates: dict[str, str | None]) -> dict[str, Any]:
    docker = shutil.which("docker")
    if docker is None:
        pytest.skip("docker compose is required to render docker-compose.prod.yml")

    probe = subprocess.run(
        [docker, "compose", "version"],
        capture_output=True,
        text=True,
        env={"PATH": os.environ["PATH"], "HOME": os.environ.get("HOME", str(tmp_path))},
    )
    if probe.returncode != 0:
        pytest.skip("docker compose is required to render docker-compose.prod.yml")

    values = _parse_env(_ENV_EXAMPLE.read_text())
    for key, value in updates.items():
        if value is None:
            values.pop(key, None)
        else:
            values[key] = value

    env_file = tmp_path / "prod.env"
    env_file.write_text("".join(f"{key}={value}\n" for key, value in values.items()))
    project_dir = tmp_path / "project"
    project_dir.mkdir()

    completed = subprocess.run(
        [
            docker,
            "compose",
            "--project-directory",
            str(project_dir),
            "-f",
            str(_COMPOSE_FILE),
            "--env-file",
            str(env_file),
            "config",
        ],
        check=True,
        capture_output=True,
        text=True,
        env={"PATH": os.environ["PATH"], "HOME": os.environ.get("HOME", str(tmp_path))},
    )
    assert completed.stderr == ""
    return yaml.safe_load(completed.stdout)


def test_prod_env_example_leaves_security_vars_blank():
    values = _parse_env(_ENV_EXAMPLE.read_text())
    assert values["MLFLOW_SERVER_ALLOWED_HOSTS"] == ""
    assert values["MLFLOW_SERVER_CORS_ALLOWED_ORIGINS"] == ""


@pytest.mark.parametrize(
    ("updates", "expected_hosts", "expected_origins", "expected_port"),
    [
        (
            {
                "MLFLOW_SERVER_ALLOWED_HOSTS": None,
                "MLFLOW_SERVER_CORS_ALLOWED_ORIGINS": None,
            },
            "",
            "",
            "5000",
        ),
        (
            {
                "MLFLOW_SERVER_ALLOWED_HOSTS": "",
                "MLFLOW_SERVER_CORS_ALLOWED_ORIGINS": "",
            },
            "",
            "",
            "5000",
        ),
        (
            {
                "MLFLOW_PORT": "25000",
                "MLFLOW_SERVER_ALLOWED_HOSTS": _IP_HOSTS,
                "MLFLOW_SERVER_CORS_ALLOWED_ORIGINS": _IP_ORIGINS,
            },
            _IP_HOSTS,
            _IP_ORIGINS,
            "25000",
        ),
        (
            {
                "MLFLOW_SERVER_ALLOWED_HOSTS": _DOMAIN_HOSTS,
                "MLFLOW_SERVER_CORS_ALLOWED_ORIGINS": _DOMAIN_ORIGINS,
            },
            _DOMAIN_HOSTS,
            _DOMAIN_ORIGINS,
            "5000",
        ),
    ],
)
def test_prod_compose_forwards_security_env(
    tmp_path: Path,
    updates: dict[str, str | None],
    expected_hosts: str,
    expected_origins: str,
    expected_port: str,
):
    config = _render_prod_compose(tmp_path, updates)
    environment = config["services"]["mlflow"]["environment"]
    assert isinstance(environment, dict)
    assert environment["MLFLOW_SERVER_ALLOWED_HOSTS"] == expected_hosts
    assert environment["MLFLOW_SERVER_CORS_ALLOWED_ORIGINS"] == expected_origins
    assert environment["MLFLOW_PORT"] == expected_port
    assert "MLFLOW_WORKSPACE" not in environment

    healthcheck = config["services"]["mlflow"]["healthcheck"]["test"]
    assert f"http://localhost:{expected_port}/health" in healthcheck[-1]
    assert config["services"]["mlflow"]["container_name"] == "mlflow-server"
    assert config["services"]["postgres"]["container_name"] == "mlflow-postgres"
    assert config["services"]["storage"]["container_name"] == "storage"
    assert config["networks"]["default"]["name"] == "mlflow-network"
