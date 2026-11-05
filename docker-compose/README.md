# MLflow with Docker Compose (PostgreSQL + S3 + Basic Auth + Workspaces)

This directory runs **MLflow** locally with a **PostgreSQL** backend store, **RustFS** for S3-compatible artifacts, **basic authentication**, and **workspaces**.

The tracking server is `ghcr.io/mlflow/mlflow`. This fork's server CLI supports `--app-name basic-auth` and `--enable-workspaces` (PostgreSQL tracking and model-registry stores are workspace-capable). The official image does not include this fork's Chinese UI; an optional local image is documented below.

---

## Overview

- **MLflow Tracking Server**  
  REST API and UI at `http://localhost:5000`, behind a basic-auth login wall, with workspaces enabled.

- **PostgreSQL**  
  Experiments, runs, params, metrics, and the model registry.

- **RustFS**  
  Artifact storage (`--serve-artifacts`).

- **Auth database**  
  Users and RBAC roles in SQLite on the `authdata` volume (`/mlflow/auth/basic_auth.db`), next to the Postgres data volume. The file is created on first start from `MLFLOW_AUTH_DATABASE_URI`.

---

## Prerequisites

- **Git**
- **Docker** and **Docker Compose**
- On macOS/Windows: Docker Desktop
- On Linux: Docker Engine + compose plugin

Verify installation:

```bash
docker --version
docker compose version
```

---

## 1. Clone the Repository

```bash
git clone https://github.com/mlflow/mlflow.git
cd mlflow/docker-compose/
```

---

## 2. Configure Environment

```bash
cp .env.dev.example .env
```

`.env` is gitignored. The example values are placeholders, not production secrets. Before you start the stack, replace at least:

- `MLFLOW_FLASK_SERVER_SECRET_KEY` — CSRF secret. Required. Use the same value on every server replica.
- `MLFLOW_AUTH_ADMIN_PASSWORD` — initial admin password. **At least 12 characters.** MLflow refuses to boot without it and rejects the old shipped default. The password is applied only when the admin user does not exist yet; it is not written into `basic_auth.ini`.

Leave the Postgres and S3 variables unless you need to change ports or credentials.

**PostgreSQL**

- `POSTGRES_USER=mlflow`
- `POSTGRES_PASSWORD=mlflow`
- `POSTGRES_DB=mlflow`
- `PGPORT=5432`

**S3 / RustFS**

- `AWS_ACCESS_KEY_ID=s3admin`
- `AWS_SECRET_ACCESS_KEY=s3admin`
- `AWS_DEFAULT_REGION=us-east-1`
- `S3_BUCKET=mlflow`
- `RUSTFS_CONSOLE_ENABLE=true`
- `MLFLOW_S3_ENDPOINT_URL=http://storage:9000`
- `MLFLOW_ARTIFACTS_DESTINATION=s3://${S3_BUCKET}`

**MLflow server**

- `MLFLOW_VERSION=latest`
- `MLFLOW_HOST=0.0.0.0`
- `MLFLOW_PORT=5000`
- `MLFLOW_WORKERS=1` (raise this only if the auth database is PostgreSQL)
- `MLFLOW_BACKEND_STORE_URI=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}`

**Basic auth and workspaces**

- `MLFLOW_FLASK_SERVER_SECRET_KEY`
- `MLFLOW_AUTH_ADMIN_USERNAME=admin`
- `MLFLOW_AUTH_ADMIN_PASSWORD` (min 12 characters)
- `MLFLOW_AUTH_CONFIG_PATH=/mlflow/auth/basic_auth.ini` (rewritten on each start)
- `MLFLOW_AUTH_DATABASE_URI=sqlite:////mlflow/auth/basic_auth.db` (the `authdata` volume)
- `MLFLOW_AUTH_DEFAULT_PERMISSION=READ`
- `MLFLOW_AUTH_GRANT_DEFAULT_WORKSPACE_ACCESS=false`

To store auth in PostgreSQL instead of the volume, create a database and point `MLFLOW_AUTH_DATABASE_URI` at it, for example `postgresql://mlflow:mlflow@postgres:5432/mlflow_auth`. The SQLite file is the default because it survives `docker compose down` without an extra database.

`MLFLOW_WORKSPACE` is a client setting. Do not put it in this `.env`; the server refuses to start if that variable is set in the container.

In-repo references:

- [Username and password](../docs/docs/self-hosting/security/basic-http-auth.mdx)
- [Role-based access control](../docs/docs/self-hosting/security/role-based-access-control.mdx)
- [Workspaces](../docs/docs/self-hosting/workspaces/getting-started.mdx)
- [Workspace configuration](../docs/docs/self-hosting/workspaces/configuration.mdx)
- [Workspace permissions](../docs/docs/self-hosting/workspaces/permissions.mdx)

---

## 3. Launch the Stack

Inside `docker-compose/`:

```bash
docker compose up -d
```

This starts PostgreSQL, RustFS, creates the S3 bucket, installs the auth extra (`Flask-WTF`, the `mlflow[auth]` extra) plus `psycopg` and `boto3`, then starts MLflow with `--app-name basic-auth` and `--enable-workspaces`. The first start spends a minute or two in `pip install`.

```bash
docker compose ps
docker compose logs -f mlflow
```

Wait until `mlflow` is healthy. `/health` stays unauthenticated so the container healthcheck can pass; everything else asks for credentials.

---

## 4. Sign In

Open `http://localhost:5000`. The UI and the REST API return `401` until you send basic auth. Sign in as the bootstrap admin:

- Username: `MLFLOW_AUTH_ADMIN_USERNAME` (`admin` in the example)
- Password: the value you set in `MLFLOW_AUTH_ADMIN_PASSWORD`

Check the login wall and that workspaces are on:

```bash
# 401, no credentials
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/api/2.0/mlflow/experiments/search?max_results=1

# 200 after login. Read the password from your .env; do not commit it.
curl -s -u "admin:${MLFLOW_AUTH_ADMIN_PASSWORD}" http://localhost:5000/api/3.0/mlflow/server-info
```

`workspaces_enabled` in that payload should be `true`.

Clients use the same credentials:

```bash
export MLFLOW_TRACKING_URI=http://localhost:5000
export MLFLOW_TRACKING_USERNAME=admin
export MLFLOW_TRACKING_PASSWORD='your-admin-password'
```

Do not export `MLFLOW_BACKEND_STORE_URI` into the client shell. That variable is the server's Postgres URI, not the URL clients should call.

---

## 5. Create a User

Creating a user requires an admin (or a workspace manager). The example password must be at least 12 characters.

```bash
curl -s -u "admin:${MLFLOW_AUTH_ADMIN_PASSWORD}" \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"alice-password-12"}' \
  http://localhost:5000/api/2.0/mlflow/users/create
```

The same call from Python, using this checkout:

```python
import os
from mlflow.server import get_app_client

os.environ["MLFLOW_TRACKING_USERNAME"] = "admin"
os.environ["MLFLOW_TRACKING_PASSWORD"] = "your-admin-password"
auth = get_app_client("basic-auth", tracking_uri="http://localhost:5000")
auth.create_user("alice", "alice-password-12")
```

The UI form is `http://localhost:5000/signup` (admin session required).

---

## 6. Create a Workspace and Grant a Role

With `MLFLOW_AUTH_GRANT_DEFAULT_WORKSPACE_ACCESS=false`, a non-admin does not inherit access to the reserved `default` workspace. Create a workspace, then assign one of the seeded roles. MLflow creates two roles in each new workspace:

| Role    | Grant                      | Use it for                                      |
| ------- | -------------------------- | ----------------------------------------------- |
| `user`  | `(workspace, *, USE)`      | Read and use resources                          |
| `admin` | `(workspace, *, MANAGE)`   | Edit resources and manage roles in that workspace |

Logging runs and metrics needs permission to update. The seeded workspace `admin` role covers that. The platform admin (`admin`) already can.

```python
import os
import mlflow
from mlflow.server import get_app_client

os.environ["MLFLOW_TRACKING_USERNAME"] = "admin"
os.environ["MLFLOW_TRACKING_PASSWORD"] = "your-admin-password"
mlflow.set_tracking_uri("http://localhost:5000")

mlflow.create_workspace("team-a", description="Team A")
auth = get_app_client("basic-auth", tracking_uri="http://localhost:5000")
role = next(item for item in auth.list_roles("team-a") if item.name == "admin")
auth.assign_role(username="alice", role_id=role.id)
```

Alice then works inside that workspace:

```bash
export MLFLOW_TRACKING_URI=http://localhost:5000
export MLFLOW_TRACKING_USERNAME=alice
export MLFLOW_TRACKING_PASSWORD='alice-password-12'
export MLFLOW_WORKSPACE=team-a
```

Permission levels (`READ`, `USE`, `EDIT`, `MANAGE`, `DENY`) and custom roles are documented in [Role-based access control](../docs/docs/self-hosting/security/role-based-access-control.mdx) and [Workspace permissions](../docs/docs/self-hosting/workspaces/permissions.mdx).

---

## 7. Run the Sample Evaluation

[`eval/`](eval/README.md) logs a four-row eval to this server with `mlflow.genai.evaluate`, a code scorer, a logged pyfunc model, and a threshold gate. From the repository root, after the stack is healthy:

```bash
set -a && source docker-compose/.env && set +a
export MLFLOW_TRACKING_URI=http://localhost:5000
export MLFLOW_TRACKING_USERNAME="$MLFLOW_AUTH_ADMIN_USERNAME"
export MLFLOW_TRACKING_PASSWORD="$MLFLOW_AUTH_ADMIN_PASSWORD"
export MLFLOW_WORKSPACE=default
uv run python docker-compose/eval/run_eval.py
```

The sample model scores `0.75`. The default threshold is `0.5`, so the script registers `qa-lookup` and points the `champion` alias at that version. `EVAL_THRESHOLD=0.9` exits `1` and does not move the alias.

---

## 8. Optional Image for This Fork's UI

`ghcr.io/mlflow/mlflow` is the default server image, with auth installed at startup. Chinese UI strings in this branch are compiled into the frontend, so they are not in that image. Build a local image when you need them:

```bash
# repository root; the UI build needs Node 24 and several GB of RAM
docker build -f docker-compose/Dockerfile.fork -t mlflow-fork:local .
cd docker-compose
cp docker-compose.override.example.yml docker-compose.override.yml
docker compose up -d
```

The override only replaces `services.mlflow.image`. Postgres, RustFS, basic auth, and workspaces still come from `docker-compose.yml`. Remove `docker-compose.override.yml` to return to the official image.

---

## 9. Shutdown

```bash
docker compose down
```

To drop Postgres, artifacts, and the auth database:

```bash
docker compose down -v
```

The next start creates a new admin user from `MLFLOW_AUTH_ADMIN_PASSWORD`.

---

## Tips & Troubleshooting

### RustFS Notes (important)

- Set **server domains/host** so virtual-hosted requests can be resolved by RustFS:

  ```env
  RUSTFS_SERVER_DOMAINS=storage:9000
  ```

  (match the compose service DNS name)

- Prefer AWS CLI **`s3api`** for bucket creation. Some S3 clients default to **path-style** on custom endpoints; if bucket creation fails with `InvalidBucketName`, switch to `s3api` or a client like MinIO `mc`.

- Inside MLflow, use the internal endpoint:

  ```env
  MLFLOW_S3_ENDPOINT_URL=http://storage:9000
  MLFLOW_ARTIFACTS_DESTINATION=s3://mlflow/
  ```

### Healthcheck Example

RustFS usually responds on `/health` with a json that contains the status of the server:

```sh
curl -s http://127.0.0.1:9000/health | grep -q '\"status\"\\s*:\\s*\"ok\"'
```

MLflow's `/health` is exempt from basic auth. A `401` on `/` or `/api/2.0/...` means the login wall is up.

### Auth database

The server rewrites `/mlflow/auth/basic_auth.ini` on every start from the variables in `.env`. Users and password hashes stay in `basic_auth.db` on the `authdata` volume. Changing `MLFLOW_AUTH_ADMIN_PASSWORD` after the admin user exists does not reset it. To rotate, call the update-password API as an admin, or `docker compose down -v` and start clean.

`database is locked` on the auth SQLite file usually means too many workers. Keep `MLFLOW_WORKERS=1`, or move `MLFLOW_AUTH_DATABASE_URI` to PostgreSQL before raising the worker count.

### Artifact Upload Issues

Verify:

- `MLFLOW_ARTIFACTS_DESTINATION=s3://<bucket>/`
- `MLFLOW_S3_ENDPOINT_URL=http://<service>:<port>`
- AWS credentials match the backend configuration

To verify S3 storage is working from a shell that can see the endpoint:

```bash
aws --endpoint-url=http://127.0.0.1:9000 s3api list-buckets

echo hi > /tmp/t.txt
aws --endpoint-url=http://127.0.0.1:9000 s3 cp /tmp/t.txt s3://mlflow/t.txt
aws --endpoint-url=http://127.0.0.1:9000 s3 cp s3://mlflow/t.txt -
```

If this passes, MLflow can read and write artifacts to RustFS. From inside the compose network the endpoint stays `http://storage:9000`.

### Troubleshooting

- `InvalidBucketName` on create-bucket → use `s3api` (virtual-host friendly) or MinIO `mc`; ensure `RUSTFS_SERVER_DOMAINS` matches the S3 hostname.
- Endpoint issues from MLflow → make sure `MLFLOW_S3_ENDPOINT_URL` uses the **service name** visible from MLflow (e.g., `http://storage:9000`).
- Server exits immediately complaining about `MLFLOW_FLASK_SERVER_SECRET_KEY` or a short admin password → fix `.env` and `docker compose up -d` again.
- `MLFLOW_WORKSPACE=... is client-only` → that variable was passed into the server container. Remove it from the compose environment.

### Resetting the Environment

```bash
docker compose down -v
docker compose up -d
```

### Logs

```bash
docker compose logs -f mlflow
docker compose logs -f postgres
docker compose logs -f storage
```

### Port Conflicts

Edit `.env` and restart containers:

```bash
docker compose down
docker compose up -d
```

---

## Next Steps

- Point training scripts at the server with `MLFLOW_TRACKING_URI`, `MLFLOW_TRACKING_USERNAME`, and `MLFLOW_TRACKING_PASSWORD`.
- Choose a workspace with `mlflow.set_workspace("team-a")` or `MLFLOW_WORKSPACE`.
- Run [`eval/run_eval.py`](eval/README.md) as a CI-style promotion check.
