# Evaluation starter for the compose tracking server

Logs a four-row Q&A eval to the Docker Compose MLflow server, stores the dataset and a pyfunc model on the run, and promotes a registered-model alias only when the score clears a threshold.

The script calls [`mlflow.genai.evaluate`](../../docs/docs/genai/eval-monitor/index.mdx) with a code [`@scorer`](../../docs/docs/genai/eval-monitor/scorers/custom/index.mdx). No judge model or API key is required. Built-in LLM judges (`Correctness`, `Safety`, and the rest) are the same API with a different scorer list; they need a configured judge endpoint and are not part of this offline run.

## What the gate does

`data/qa_sample.json` is the dataset (`data/qa_sample.csv` is the same four rows). Three `served_response` values match `expectations.expected_response`, one does not, so `exact_match/mean` is **0.75**.

1. Authenticate to `http://localhost:5000` with basic auth.
2. Select `MLFLOW_WORKSPACE` (`default` unless you set another).
3. Log the JSON dataset as an artifact and log a pyfunc lookup model.
4. Score the rows with `mlflow.genai.evaluate`.
5. If `exact_match/mean` is below `EVAL_THRESHOLD`, exit **1** and leave the alias where it is.
6. Otherwise register `qa-lookup` and set the `champion` alias to that version.

## One-click run

Start the stack first ([../README.md](../README.md)):

```bash
cd docker-compose
cp .env.dev.example .env
docker compose up -d
```

From the **repository root**, using this checkout:

```bash
set -a && source docker-compose/.env && set +a
export MLFLOW_TRACKING_URI=http://localhost:5000
export MLFLOW_TRACKING_USERNAME="$MLFLOW_AUTH_ADMIN_USERNAME"
export MLFLOW_TRACKING_PASSWORD="$MLFLOW_AUTH_ADMIN_PASSWORD"
export MLFLOW_WORKSPACE=default
uv run python docker-compose/eval/run_eval.py
```

Sourcing `.env` also exports `MLFLOW_BACKEND_STORE_URI`. The script refuses that value as a tracking URI and uses `MLFLOW_TRACKING_URI` instead.

Standalone virtualenv, from `docker-compose/eval`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export MLFLOW_TRACKING_URI=http://localhost:5000
export MLFLOW_TRACKING_USERNAME=admin
export MLFLOW_TRACKING_PASSWORD='your-admin-password'
python run_eval.py
```

## Fail the gate on purpose

```bash
EVAL_THRESHOLD=0.9 uv run python docker-compose/eval/run_eval.py
echo "exit=$?"
```

Expect exit code `1` and no change to the `champion` alias.

## Use another workspace

Create `team-a` and grant a role as in the compose README, then:

```bash
export MLFLOW_TRACKING_USERNAME=alice
export MLFLOW_TRACKING_PASSWORD='alice-password-12'
export MLFLOW_WORKSPACE=team-a
uv run python docker-compose/eval/run_eval.py
```

The account needs permission to update experiments and the model registry in that workspace (the seeded workspace `admin` role).

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `MLFLOW_TRACKING_URI` | `http://localhost:5000` | Compose server. Not the Postgres URI. |
| `MLFLOW_TRACKING_USERNAME` | `MLFLOW_AUTH_ADMIN_USERNAME` | Basic-auth user. |
| `MLFLOW_TRACKING_PASSWORD` | `MLFLOW_AUTH_ADMIN_PASSWORD` | Basic-auth password. |
| `MLFLOW_WORKSPACE` | `default` | Workspace for the run and the registered model. |
| `EVAL_THRESHOLD` | `0.5` | Minimum `exact_match/mean`. |
| `EVAL_DATASET` | `data/qa_sample.json` | Dataset path. |
| `EVAL_EXPERIMENT` | `enterprise-eval` | Experiment name. |
| `EVAL_REGISTERED_MODEL` | `qa-lookup` | Name used when the gate passes. |
| `EVAL_PROMOTION_ALIAS` | `champion` | Alias moved when the gate passes. |

Open the run in the UI (experiment `enterprise-eval`) to see the metric, the dataset artifact, and `eval_gate/`.
