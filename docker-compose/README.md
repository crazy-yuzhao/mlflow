# MLflow with Docker Compose (PostgreSQL + S3 + Basic Auth + Workspaces)

This directory runs **MLflow** locally with a **PostgreSQL** backend store, **RustFS** for S3-compatible artifacts, **basic authentication**, and **workspaces**.

The tracking server is `ghcr.io/mlflow/mlflow`. This fork's server CLI supports `--app-name basic-auth` and `--enable-workspaces` (PostgreSQL tracking and model-registry stores are workspace-capable). The official image does not include this fork's Chinese UI; an optional local image is documented below.

服务器部署见 [在服务器上部署](#在服务器上部署)。`docker-compose.prod.yml` 不会被自动加载，本机只执行 `docker compose up` 时行为不变。

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

| Role    | Grant                    | Use it for                                        |
| ------- | ------------------------ | ------------------------------------------------- |
| `user`  | `(workspace, *, USE)`    | Read and use resources                            |
| `admin` | `(workspace, *, MANAGE)` | Edit resources and manage roles in that workspace |

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
docker build -f docker-compose/Dockerfile.fork -t hengjian:latest .
cd docker-compose
cp docker-compose.override.example.yml docker-compose.override.yml
docker compose up -d
```

The override only replaces `services.mlflow.image` with `hengjian:latest`. Postgres, RustFS, basic auth, and workspaces still come from `docker-compose.yml`. Remove `docker-compose.override.yml` to return to the official image.

On a Mac (Apple Silicon) this command builds a native image for local `docker compose up`. A build that will run on a typical x86_64 server needs `--platform linux/amd64`, then `docker save` / `docker load` (see [在服务器上部署](#在服务器上部署)).

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

## 在服务器上部署

Linux 服务器上用生产 overlay 跑本 fork（衡鉴界面）。数据放在宿主机目录里，而不是 Compose 具名卷。只发布衡鉴 UI/API 端口。Postgres 和 RustFS 留在 Compose 网络内。

在 `docker-compose/` 目录、`.env` 准备好之后：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

`docker-compose.prod.yml` 不会被自动加载。不要把它复制成 `docker-compose.override.yml`，否则本机的 `docker compose up` 也会改走生产挂载和端口。

### 克隆与镜像

官方 `ghcr.io/mlflow/mlflow` 没有本分支的中文界面。服务器上的 `mlflow` 服务使用镜像 `hengjian:latest`。

在仓库根目录构建。Mac（Apple Silicon）上构建、准备放到常见 x86_64 Linux 服务器上时，加上 `--platform linux/amd64`：

```bash
git clone -b zh-ui https://github.com/crazy-yuzhao/mlflow.git
cd mlflow
docker build --platform linux/amd64 -f docker-compose/Dockerfile.fork -t hengjian:latest .
```

在 x86_64 机器上构建时使用：

```bash
docker build -f docker-compose/Dockerfile.fork -t hengjian:latest .
```

UI 构建需要 Node 24 和数 GB 内存。

镜像在别的机器上构建时，用 `docker save` / `docker load` 传到服务器。标签是 `hengjian:latest`：

```bash
# 构建机器上
docker save hengjian:latest | gzip > hengjian-latest.tar.gz

# 服务器上
gunzip -c hengjian-latest.tar.gz | docker load
```

`docker load` 会保留镜像里的 `hengjian:latest` 标签。

### 数据目录

默认根路径是 `/data/mlflow_data`，可用 `.env` 里的 `MLFLOW_DATA_DIR` 修改。三个子目录分别绑定进容器：

```text
/data/mlflow_data/
├── postgres/   # PostgreSQL → /var/lib/postgresql/data
├── storage/    # RustFS 对象 → /data
└── auth/       # basic-auth SQLite 与 ini → /mlflow/auth
```

```bash
sudo mkdir -p /data/mlflow_data/{postgres,storage,auth}
sudo chown 999:999 /data/mlflow_data/postgres
sudo chown -R 10001:10001 /data/mlflow_data/storage
sudo chown root:root /data/mlflow_data/auth
sudo chmod 700 /data/mlflow_data/auth
```

- 官方 `postgres:15` 镜像的入口进程以 root 启动，初始化数据目录后降到 uid **999**（`postgres`）。先把 `postgres/` 交给 999，避免绑定目录不可写。
- `rustfs/rustfs:1.0.0-alpha.83` 以 uid/gid **10001** 运行，不会在启动时改宿主目录的属主。`storage/` 必须事先属于 10001，否则对象存储起不来。
- `Dockerfile.fork` 没有改 `USER`，服务进程是 root，并在启动时写入 `/mlflow/auth/basic_auth.ini`（容器内 `chmod 600`）和 `basic_auth.db`。`auth/` 保持 root 可写即可。

目录不存在时，Docker 会在启动时以 root 把绑定路径创建出来。那样 `storage/` 的属主不是 10001，RustFS 会因权限失败。先执行上面的 `mkdir` 和 `chown`，再 `up`。

`MLFLOW_DATA_DIR` 换路径时，同样建好这三个子目录并改属主。不要用带空格的路径。

### 环境变量

```bash
cd docker-compose
cp .env.prod.example .env
```

`.env` 已被 gitignore。至少换掉这些占位值：

- `MLFLOW_FLASK_SERVER_SECRET_KEY`
- `MLFLOW_AUTH_ADMIN_PASSWORD`（至少 12 个字符；只在管理员用户还不存在时生效）
- `POSTGRES_PASSWORD`
- `AWS_ACCESS_KEY_ID` 和 `AWS_SECRET_ACCESS_KEY`

并确认：

- `MLFLOW_DATA_DIR=/data/mlflow_data`（或你的实际根路径）
- `MLFLOW_WORKERS=1`。认证库仍是 SQLite 时不要加大 worker，否则会出现 `database is locked`。只有把 `MLFLOW_AUTH_DATABASE_URI` 改到 PostgreSQL 之后才能提高 worker 数。
- 不要设置 `MLFLOW_WORKSPACE`。它只属于客户端。服务端容器环境里一旦有这个变量，进程会拒绝启动。不要把它写进 `mlflow` 服务的 `environment`。

不要使用 `.env.local`。那是 Mac 开发文件：Compose 里通常只跑 Postgres，服务端跑在宿主机上，路径也是 Mac 路径。Compose 默认只读取项目目录中的 `.env`，不会读取 `.env.local`。不要在服务器上 `cp .env.local .env`，也不要 `docker compose --env-file .env.local`。

从 `.env.dev.example` 复制也可以，但要自己补上 `MLFLOW_DATA_DIR`，并换掉其中的开发口令。生产 overlay 不读取那个示例文件。

### 启动

仍在 `docker-compose/` 目录：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f mlflow
```

后续的 `ps`、`logs`、`down` 都要带上同样的 `-f` 参数，这样项目模型才是生产合并结果。只写 `docker compose` 会回到 `docker-compose.yml`（具名卷，并发布 5432/9000/9001）。

### 数据如何留下来

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

不要加 `-v`。上面这条命令停掉容器，`/data/mlflow_data` 里的 Postgres 数据、对象和认证库都还在。绑定挂载不依赖具名卷。

`docker compose down -v` 会删除**当前项目模型里的具名卷**。生产 overlay 已经拿掉 `pgdata`、`storage-data`、`authdata`，因此带上这两个 `-f` 时，`-v` 不会删除 `/data/mlflow_data`。它仍然危险：

- 不加生产文件时，`docker compose down -v` 会删掉本机开发用的具名卷。
- 如果合并结果里还留着具名卷（例如改坏了 overlay），`-v` 会删掉这些卷里的数据。

不要对还装着数据的卷执行 `-v`。备份时直接打包 `/data/mlflow_data`。

### 端口与 HTTPS

生产文件清掉了 Postgres `${PGPORT}`（5432）和 RustFS `9000`/`9001` 的宿主端口映射，不会绑到 `0.0.0.0`。容器之间仍用服务名访问：`postgres:5432`、`http://storage:9000`。不要为了在宿主机上用 `psql` 或 `aws` 把这些端口重新公布到公网。

衡鉴 UI 和 API 只发布 `${MLFLOW_PORT}`（示例为 5000）。在它前面放 HTTPS 反向代理，由代理对外提供 TLS。代理和衡鉴在同一台机器上时，在 `.env` 里设置 `MLFLOW_BIND_IP=127.0.0.1`，UI 就只监听本机。不设置时，端口发布在 `0.0.0.0`。

本机开发文档里用 `http://127.0.0.1:9000` 检查 RustFS 的命令，在这套生产端口下不适用。

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
