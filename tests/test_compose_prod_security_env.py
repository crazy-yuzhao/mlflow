import json
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
_DOCKERFILE = _REPO_ROOT / "docker-compose" / "Dockerfile.fork"
_README = _REPO_ROOT / "docker-compose" / "README.md"
_PRELUDE_BEGIN = "# assistant-sandbox-prelude: begin"
_PRELUDE_END = "# assistant-sandbox-prelude: end"
_ASSISTANT_ENV_KEYS = (
    "MLFLOW_ENABLE_ASSISTANT_SANDBOX",
    "MLFLOW_SANDBOX_DOCKER_IMAGE",
    "MLFLOW_ASSISTANT_SANDBOX_CLI_IMAGE",
    "MLFLOW_SANDBOX_EGRESS_PROXY",
    "TMPDIR",
    "MLFLOW_HOME",
)

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


def _env_str(environment: dict[str, Any], key: str) -> str | None:
    if key not in environment or environment[key] is None:
        return None
    value = environment[key]
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _volume_mounts(service: dict[str, Any]) -> set[tuple[str, str]]:
    mounts: set[tuple[str, str]] = set()
    for volume in service.get("volumes") or []:
        if isinstance(volume, str):
            source, target, *_rest = volume.split(":")
            mounts.add((source, target))
        else:
            mounts.add((volume.get("source"), volume.get("target")))
    return mounts


def _mlflow_command(config: dict[str, Any]) -> str:
    command = config["services"]["mlflow"]["command"]
    if isinstance(command, list):
        return command[-1]
    return str(command)


def _prelude(command: str) -> str:
    begin = command.index(_PRELUDE_BEGIN)
    end = command.index(_PRELUDE_END)
    # `docker compose config` re-escapes literal `$` as `$$` in its YAML. The
    # container runs the single-dollar script.
    return command[begin:end].replace("$$", "$")


def _run_prelude(command: str, env: dict[str, str]) -> dict[str, str | None]:
    script = "\n".join([
        "set -euo pipefail",
        _prelude(command),
        "python3 - <<'PY'",
        "import json, os",
        f"keys = {list(_ASSISTANT_ENV_KEYS)!r}",
        "print(json.dumps({key: os.environ.get(key) for key in keys}))",
        "PY",
    ])
    completed = subprocess.run(
        ["bash", "-c", script],
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    return json.loads(completed.stdout)


def test_prod_env_example_leaves_remote_assistant_off():
    values = _parse_env(_ENV_EXAMPLE.read_text())
    assert values["MLFLOW_ENABLE_REMOTE_ASSISTANT"] == "false"
    assert values["MLFLOW_ENABLE_ASSISTANT_SANDBOX"] == ""
    assert values["MLFLOW_ASSISTANT_DOCKER_SOCKET"] == "/dev/null"
    assert values["MLFLOW_SANDBOX_DOCKER_IMAGE"] == ""
    assert values["MLFLOW_ASSISTANT_SANDBOX_CLI_IMAGE"] == ""
    assert values["MLFLOW_SANDBOX_EGRESS_PROXY"] == ""
    assert "MLFLOW_WORKSPACE" not in values


def test_prod_compose_assistant_defaults_and_persistence(tmp_path: Path):
    config = _render_prod_compose(tmp_path, {})
    service = config["services"]["mlflow"]
    environment = service["environment"]
    assert _env_str(environment, "MLFLOW_ENABLE_REMOTE_ASSISTANT") == "false"
    assert _env_str(environment, "MLFLOW_ENABLE_ASSISTANT_SANDBOX") in (None, "")
    assert "MLFLOW_WORKSPACE" not in environment
    assert "MLFLOW_HOME" not in environment
    assert "TMPDIR" not in environment
    assert set(config["services"]) == {"postgres", "storage", "create-bucket", "mlflow"}
    assert config["networks"]["default"]["name"] == "mlflow-network"

    mounts = _volume_mounts(service)
    data = "/data/mlflow_data"
    assert (f"{data}/assistant/config", "/root/.mlflow/assistant") in mounts
    assert (f"{data}/assistant/sandbox", f"{data}/assistant/sandbox") in mounts
    assert (f"{data}/assistant/projects", f"{data}/assistant/projects") in mounts
    assert ("/dev/null", "/var/run/docker.sock") in mounts
    assert (f"{data}/auth", "/mlflow/auth") in mounts
    assert (
        f"{data}/postgres",
        "/var/lib/postgresql/data",
    ) in _volume_mounts(config["services"]["postgres"])
    assert service["container_name"] == "mlflow-server"


def test_prod_compose_omitted_assistant_vars_stay_disabled(tmp_path: Path):
    config = _render_prod_compose(
        tmp_path,
        {
            "MLFLOW_ENABLE_REMOTE_ASSISTANT": None,
            "MLFLOW_ENABLE_ASSISTANT_SANDBOX": None,
            "MLFLOW_ASSISTANT_DOCKER_SOCKET": None,
            "MLFLOW_SANDBOX_DOCKER_IMAGE": None,
            "MLFLOW_ASSISTANT_SANDBOX_CLI_IMAGE": None,
            "MLFLOW_SANDBOX_EGRESS_PROXY": None,
        },
    )
    environment = config["services"]["mlflow"]["environment"]
    assert _env_str(environment, "MLFLOW_ENABLE_REMOTE_ASSISTANT") == "false"
    assert _env_str(environment, "MLFLOW_ENABLE_ASSISTANT_SANDBOX") in (None, "")
    mounts = _volume_mounts(config["services"]["mlflow"])
    assert ("/dev/null", "/var/run/docker.sock") in mounts
    assert "MLFLOW_WORKSPACE" not in environment


def test_prod_compose_remote_assistant_wires_socket_and_paths(tmp_path: Path):
    data = tmp_path / "mlflow_data"
    config = _render_prod_compose(
        tmp_path,
        {
            "MLFLOW_DATA_DIR": str(data),
            "MLFLOW_ENABLE_REMOTE_ASSISTANT": "true",
            "MLFLOW_ENABLE_ASSISTANT_SANDBOX": "false",
            "MLFLOW_ASSISTANT_DOCKER_SOCKET": "/var/run/docker.sock",
            "MLFLOW_SANDBOX_DOCKER_IMAGE": "example/mlflow-sandbox:1",
            "MLFLOW_ASSISTANT_SANDBOX_CLI_IMAGE": "example/mlflow-assistant-sandbox:1",
            "MLFLOW_SANDBOX_EGRESS_PROXY": "http://proxy.internal:3128",
        },
    )
    environment = config["services"]["mlflow"]["environment"]
    assert _env_str(environment, "MLFLOW_ENABLE_REMOTE_ASSISTANT") == "true"
    assert _env_str(environment, "MLFLOW_ENABLE_ASSISTANT_SANDBOX") == "false"
    assert _env_str(environment, "MLFLOW_SANDBOX_DOCKER_IMAGE") == "example/mlflow-sandbox:1"
    assert (
        _env_str(environment, "MLFLOW_ASSISTANT_SANDBOX_CLI_IMAGE")
        == "example/mlflow-assistant-sandbox:1"
    )
    assert _env_str(environment, "MLFLOW_SANDBOX_EGRESS_PROXY") == "http://proxy.internal:3128"
    assert "MLFLOW_WORKSPACE" not in environment
    assert "MLFLOW_HOME" not in environment

    mounts = _volume_mounts(config["services"]["mlflow"])
    root = str(data)
    assert (f"{root}/assistant/config", "/root/.mlflow/assistant") in mounts
    assert (f"{root}/assistant/sandbox", f"{root}/assistant/sandbox") in mounts
    assert (f"{root}/assistant/projects", f"{root}/assistant/projects") in mounts
    assert ("/var/run/docker.sock", "/var/run/docker.sock") in mounts
    assert config["services"]["mlflow"]["container_name"] == "mlflow-server"
    assert config["services"]["postgres"]["container_name"] == "mlflow-postgres"
    assert config["networks"]["default"]["name"] == "mlflow-network"
    assert set(config["services"]) == {"postgres", "storage", "create-bucket", "mlflow"}

    command = _mlflow_command(config)
    assert f'_assistant_root="{root}/assistant"' in command
    assert "export TMPDIR=" in command
    assert "export MLFLOW_HOME=/opt/mlflow" in command


@pytest.mark.parametrize(
    ("extra_env", "expected"),
    [
        (
            {"MLFLOW_ENABLE_REMOTE_ASSISTANT": "false", "MLFLOW_ENABLE_ASSISTANT_SANDBOX": ""},
            {
                "MLFLOW_ENABLE_ASSISTANT_SANDBOX": None,
                "MLFLOW_SANDBOX_DOCKER_IMAGE": None,
                "MLFLOW_ASSISTANT_SANDBOX_CLI_IMAGE": None,
                "MLFLOW_SANDBOX_EGRESS_PROXY": None,
                "TMPDIR": None,
                "MLFLOW_HOME": None,
            },
        ),
        (
            {
                "MLFLOW_ENABLE_REMOTE_ASSISTANT": "true",
                "MLFLOW_SANDBOX_DOCKER_IMAGE": "example/mlflow-sandbox:1",
                "MLFLOW_ENABLE_ASSISTANT_SANDBOX": "false",
            },
            {
                "MLFLOW_ENABLE_ASSISTANT_SANDBOX": "false",
                "MLFLOW_SANDBOX_DOCKER_IMAGE": "example/mlflow-sandbox:1",
                "MLFLOW_ASSISTANT_SANDBOX_CLI_IMAGE": None,
                "MLFLOW_SANDBOX_EGRESS_PROXY": None,
                "TMPDIR": "sandbox-tmp",
                "MLFLOW_HOME": "/opt/mlflow",
            },
        ),
        (
            {"MLFLOW_ENABLE_REMOTE_ASSISTANT": "true", "MLFLOW_HOME": "/custom/mlflow"},
            {
                "MLFLOW_ENABLE_ASSISTANT_SANDBOX": None,
                "MLFLOW_SANDBOX_DOCKER_IMAGE": None,
                "MLFLOW_ASSISTANT_SANDBOX_CLI_IMAGE": None,
                "MLFLOW_SANDBOX_EGRESS_PROXY": None,
                "TMPDIR": "sandbox-tmp",
                "MLFLOW_HOME": "/custom/mlflow",
            },
        ),
    ],
)
def test_assistant_prelude_sanitizes_env_and_tmpdir(
    tmp_path: Path,
    extra_env: dict[str, str],
    expected: dict[str, str | None],
):
    data = tmp_path / "mlflow_data"
    config = _render_prod_compose(tmp_path, {"MLFLOW_DATA_DIR": str(data)})
    env = {"PATH": os.environ["PATH"], "HOME": str(tmp_path), **extra_env}
    observed = _run_prelude(_mlflow_command(config), env)
    expected = dict(expected)
    if expected["TMPDIR"] == "sandbox-tmp":
        expected["TMPDIR"] = str(data / "assistant" / "sandbox" / "tmp")
    assert observed == expected
    assert (data / "assistant" / "sandbox" / "tmp").is_dir()
    assert (data / "assistant" / "projects").is_dir()


def test_fork_dockerfile_installs_pinned_docker_cli():
    text = _DOCKERFILE.read_text()
    assert "ARG DOCKER_CLI_VERSION=27.5.1" in text
    assert "https://download.docker.com/linux/static/stable/" in text
    assert "4f798b3ee1e0140eab5bf30b0edc4e84f4cdb53255a429dc3bbae9524845d640" in text
    assert "e6b53725a73763ab3f988c73f8772eaed429754c1a579db5ff11f21990fd1817" in text
    assert 'extractfile("docker/docker")' in text
    assert "dockerd" not in text.split("ARG DOCKER_CLI_VERSION", 1)[1]


def test_prod_readme_documents_remote_assistant_runbook():
    text = _README.read_text()
    assert "MLFLOW_ENABLE_REMOTE_ASSISTANT" in text
    assert "/var/run/docker.sock" in text
    assert "host.docker.internal" in text
    assert "mlflow_gateway" in text
    assert "assistant/config" in text
    assert "docker:dind" in text
