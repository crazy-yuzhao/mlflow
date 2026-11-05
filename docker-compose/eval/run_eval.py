"""Log a small GenAI eval to the compose tracking server and gate promotion.

The candidate answers live in ``data/qa_sample.json`` (``served_response``).
``mlflow.genai.evaluate`` scores them with a code ``@scorer`` (no judge model),
logs the aggregate metric, and logs the lookup model on the same run. The
registered-model ``champion`` alias moves only when the metric clears
``EVAL_THRESHOLD``. A miss exits 1 so CI can fail the job.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path

import mlflow
from mlflow.exceptions import MlflowException
from mlflow.genai.scorers import scorer
from mlflow.tracking import MlflowClient

_logger = logging.getLogger("enterprise_eval")

HERE = Path(__file__).resolve().parent
DEFAULT_DATASET = HERE / "data" / "qa_sample.json"
DEFAULT_TRACKING_URI = "http://localhost:5000"
METRIC_NAME = "exact_match/mean"


@scorer
def exact_match(outputs: str, expectations: dict) -> bool:
    return outputs == expectations.get("expected_response")


class LookupModel(mlflow.pyfunc.PythonModel):
    def __init__(self, answers: dict[str, str]) -> None:
        self.answers = answers

    def predict(self, context, model_input, params=None):
        questions = model_input["question"].tolist()
        return [self.answers.get(question, "I don't know") for question in questions]


def _env(name: str, fallback: str | None = None) -> str:
    value = os.environ.get(name, "").strip()
    if value:
        return value
    if fallback:
        value = os.environ.get(fallback, "").strip()
    return value


def _load_rows(path: Path) -> list[dict]:
    rows = json.loads(path.read_text())
    if not isinstance(rows, list) or not rows:
        raise SystemExit(f"{path} must be a non-empty JSON list")
    for row in rows:
        question = row.get("inputs", {}).get("question")
        served = row.get("served_response")
        expected = row.get("expectations", {}).get("expected_response")
        if not question or served is None or expected is None:
            raise SystemExit(
                "Each row needs inputs.question, served_response, and "
                "expectations.expected_response"
            )
    return rows


def _ensure_workspace(name: str) -> None:
    mlflow.set_workspace(name)
    if name == "default":
        return
    try:
        mlflow.get_workspace(name)
    except MlflowException:
        mlflow.create_workspace(name, description="Created by docker-compose/eval/run_eval.py")
    mlflow.set_workspace(name)


def main() -> int:
    tracking_uri = _env("MLFLOW_TRACKING_URI") or DEFAULT_TRACKING_URI
    if tracking_uri.startswith("postgresql"):
        raise SystemExit(
            "MLFLOW_TRACKING_URI points at PostgreSQL. Point it at the tracking "
            f"server instead, for example {DEFAULT_TRACKING_URI}."
        )
    username = _env("MLFLOW_TRACKING_USERNAME", "MLFLOW_AUTH_ADMIN_USERNAME")
    password = _env("MLFLOW_TRACKING_PASSWORD", "MLFLOW_AUTH_ADMIN_PASSWORD")
    if not username or not password:
        raise SystemExit(
            "Set MLFLOW_TRACKING_USERNAME and MLFLOW_TRACKING_PASSWORD "
            "(or source docker-compose/.env so the admin placeholders are set)."
        )
    os.environ["MLFLOW_TRACKING_USERNAME"] = username
    os.environ["MLFLOW_TRACKING_PASSWORD"] = password

    dataset_path = Path(os.environ.get("EVAL_DATASET", DEFAULT_DATASET))
    threshold = float(os.environ.get("EVAL_THRESHOLD", "0.5"))
    experiment = os.environ.get("EVAL_EXPERIMENT", "enterprise-eval")
    model_name = os.environ.get("EVAL_REGISTERED_MODEL", "qa-lookup")
    alias = os.environ.get("EVAL_PROMOTION_ALIAS", "champion")
    workspace = os.environ.get("MLFLOW_WORKSPACE", "default").strip() or "default"

    rows = _load_rows(dataset_path)
    answers = {row["inputs"]["question"]: row["served_response"] for row in rows}
    eval_data = [{"inputs": row["inputs"], "expectations": row["expectations"]} for row in rows]

    mlflow.set_tracking_uri(tracking_uri)
    _ensure_workspace(workspace)
    mlflow.set_experiment(experiment)

    with mlflow.start_run(run_name="enterprise-eval-gate") as run:
        mlflow.log_params({
            "eval_threshold": threshold,
            "eval_metric": METRIC_NAME,
            "workspace": workspace,
        })
        mlflow.log_artifact(str(dataset_path), artifact_path="eval_dataset")
        model_info = mlflow.pyfunc.log_model(
            name="qa-lookup",
            python_model=LookupModel(answers),
            pip_requirements=["mlflow"],
            input_example={"question": rows[0]["inputs"]["question"]},
        )

        def predict_fn(question: str) -> str:
            return answers.get(question, "I don't know")

        result = mlflow.genai.evaluate(
            data=eval_data,
            predict_fn=predict_fn,
            scorers=[exact_match],
            model_id=model_info.model_id,
        )
        score = result.metrics.get(METRIC_NAME)
        if score is None:
            _logger.error("Metric %s missing from %s", METRIC_NAME, result.metrics)
            return 1
        passed = float(score) >= threshold
        mlflow.set_tag("promotion_gate", "pass" if passed else "fail")
        summary = {
            "run_id": run.info.run_id,
            "metric": METRIC_NAME,
            "score": float(score),
            "threshold": threshold,
            "passed": passed,
            "model_uri": model_info.model_uri,
            "workspace": workspace,
        }
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(summary, handle, indent=2)
            summary_path = handle.name
        mlflow.log_artifact(summary_path, artifact_path="eval_gate")
        os.unlink(summary_path)

    _logger.info(
        "workspace=%s run_id=%s %s=%.3f threshold=%.3f",
        workspace,
        summary["run_id"],
        METRIC_NAME,
        score,
        threshold,
    )
    if not passed:
        _logger.error(
            "Promotion gate failed: %s %.3f < %.3f. Alias %r was not moved.",
            METRIC_NAME,
            score,
            threshold,
            alias,
        )
        return 1

    registered = mlflow.register_model(model_info.model_uri, model_name)
    MlflowClient().set_registered_model_alias(model_name, alias, registered.version)
    _logger.info("Promoted %s version %s to alias %r", model_name, registered.version, alias)
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    raise SystemExit(main())
