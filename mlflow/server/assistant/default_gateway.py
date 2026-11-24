"""Decide whether the deployment default Gateway endpoint may serve this caller.

The check is read-only. It does not grant USE, and it does not run at server startup: a missing
endpoint or a store error is logged and reported as "do not apply the default".
"""

import logging

from mlflow.assistant.default_gateway import configured_default_gateway_endpoint
from mlflow.exceptions import MlflowException
from mlflow.server.assistant.identity import auth_plugin_active, user_is_admin

_logger = logging.getLogger(__name__)


def usable_default_gateway_endpoint(username: str | None) -> str | None:
    """Return the deployment default endpoint name when this caller may use it.

    ``None`` when the default is unset, the endpoint cannot be loaded, or the caller would not
    pass the Gateway chat route's USE check. Admins are allowed, matching the auth middleware
    that skips Gateway validators for them. No grant is written.
    """
    name = configured_default_gateway_endpoint()
    if not name or not _endpoint_exists(name):
        return None
    if not _caller_may_use(username, name):
        return None
    return name


def _endpoint_exists(name: str) -> bool:
    from mlflow.tracking._tracking_service.utils import _get_store

    try:
        _get_store().get_gateway_endpoint(name=name)
    except MlflowException as exc:
        _logger.warning(
            "Assistant default gateway endpoint %r is not available (%s); "
            "users without a saved provider are not switched to it",
            name,
            exc,
        )
        return False
    except (AttributeError, NotImplementedError):
        _logger.warning(
            "Tracking store cannot resolve assistant default gateway endpoint %r; "
            "users without a saved provider are not switched to it",
            name,
        )
        return False
    except Exception:
        _logger.warning(
            "Could not look up assistant default gateway endpoint %r; "
            "users without a saved provider are not switched to it",
            name,
            exc_info=True,
        )
        return False
    return True


def _caller_may_use(username: str | None, endpoint_name: str) -> bool:
    if not auth_plugin_active():
        return True
    if not username:
        _logger.info(
            "Not applying assistant default gateway endpoint %r without an authenticated user",
            endpoint_name,
        )
        return False
    if user_is_admin(username):
        return True
    try:
        # Same read the Gateway chat route uses. Imported lazily so a no-auth server never
        # loads the auth package (it binds to the auth database on import).
        from mlflow.server.auth import _validate_gateway_use_permission

        allowed = bool(_validate_gateway_use_permission(endpoint_name, username))
    except Exception:
        _logger.warning(
            "Could not check USE on assistant default gateway endpoint %r for %s; "
            "not applying the default",
            endpoint_name,
            username,
            exc_info=True,
        )
        return False
    if not allowed:
        _logger.info(
            "User %s does not have USE on assistant default gateway endpoint %r; "
            "not applying the default",
            username,
            endpoint_name,
        )
    return allowed
