"""Deployment default for the Assistant's in-server Gateway provider.

The name comes from ``MLFLOW_ASSISTANT_DEFAULT_GATEWAY_ENDPOINT``. It is not written into a
user's config. A request that is actually serving that default binds the name on a ContextVar
so the Gateway provider uses it instead of listing endpoints and picking one.
"""

import contextvars

from mlflow.environment_variables import MLFLOW_ASSISTANT_DEFAULT_GATEWAY_ENDPOINT

_default_gateway_model: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "mlflow_assistant_default_gateway_model", default=None
)


def configured_default_gateway_endpoint() -> str | None:
    """The configured endpoint name, or None when unset or blank."""
    value = MLFLOW_ASSISTANT_DEFAULT_GATEWAY_ENDPOINT.get()
    if value is None:
        return None
    name = value.strip()
    return name or None


def get_default_gateway_model() -> str | None:
    return _default_gateway_model.get()


def set_default_gateway_model(model: str | None) -> contextvars.Token:
    return _default_gateway_model.set(model)


def reset_default_gateway_model(token: contextvars.Token) -> None:
    _default_gateway_model.reset(token)
