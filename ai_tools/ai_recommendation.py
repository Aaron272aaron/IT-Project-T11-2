"""Suggest local syntax repairs; never execute code or change marking data."""

import ast
import difflib
import os
from threading import Event, Lock

from ai_tools.code_repair import SyntaxRepairModel
from ai_tools.code_repair.model import MODEL_ID, MODEL_REVISION, ContextLimitExceeded
from .model_download import CACHE_DIR, cached_model_path

MAX_CODE_BYTES = 12 * 1024
MAX_COMMENT_CHARS = 1000
_model = None
_generation = Lock()
_closing = Event()


class ModelUnavailable(RuntimeError):
    pass


class ModelBusy(RuntimeError):
    pass


def model_enabled():
    return os.environ.get("AI_REPAIR_ENABLED", "1" if cached_model_path() else "0") == "1"


def _get_model():
    """Called with the generation lock held; publish only a fully loaded model."""
    global _model
    if _model is None:
        model = SyntaxRepairModel(
            model_id=os.environ.get("AI_MODEL_ID", MODEL_ID),
            revision=os.environ.get("AI_MODEL_REVISION", MODEL_REVISION),
            device=os.environ.get("AI_MODEL_DEVICE", "auto"),
            cache_dir=str(CACHE_DIR),
            local_files_only=True,
        )
        try:
            model.load()
        except BaseException:
            model.close()
            raise
        _model = model
    return _model


def start_model():
    """Preload once before the API begins accepting requests."""
    _closing.clear()
    if not model_enabled():
        return False
    with _generation:
        try:
            _get_model()
        except Exception:
            raise ModelUnavailable("Local AI could not load. Check its setup and restart the app; manual marking remains available.") from None
    return True


def stop_model():
    """Wait for any current fix, then release this process's shared model."""
    global _model
    _closing.set()
    with _generation:
        model, _model = _model, None
        if model is not None:
            model.close()
            return True
    return False


def suggest_fix(code, comment=""):
    if not isinstance(comment, str):
        raise ValueError("The AI comment must be text.")
    if len(comment) > MAX_COMMENT_CHARS:
        raise ValueError("Keep the AI comment to 1000 characters or fewer.")
    if "\x00" in comment:
        raise ValueError("The AI comment contains invalid characters.")
    comment = comment.strip()
    if not isinstance(code, str) or not code.strip():
        raise ValueError("Choose a non-blank Python response.")
    if len(code.encode("utf-8")) > MAX_CODE_BYTES:
        raise ValueError("AI review supports responses up to 12 KB.")
    if "\x00" in code:
        raise ValueError("This response contains invalid Python characters.")
    try:
        ast.parse(code)
    except SyntaxError as error:
        original_error = {"message": error.msg, "line": error.lineno}
    except (ValueError, RecursionError):
        raise ValueError("This response cannot be checked as Python.") from None
    else:
        return {
            "status": "already_valid", "originalCode": code,
            "suggestedCode": None, "syntaxError": None, "diff": [],
            "message": "No syntax fix is needed. Review the logic and rubric before marking.",
            "modelId": None,
        }

    if not model_enabled():
        raise ModelUnavailable("Local AI is not enabled yet. You can continue marking manually.")
    if _closing.is_set():
        raise ModelUnavailable("Local AI is stopping. You can continue marking manually or restart the app.")
    if not _generation.acquire(blocking=False):
        raise ModelBusy("AI is reviewing another response. Please try again shortly.")
    try:
        if _closing.is_set():
            raise ModelUnavailable("Local AI is stopping. You can continue marking manually or restart the app.")
        try:
            model = _get_model()
            result = model.repair(code, comment=comment) if comment else model.repair(code)
        except ContextLimitExceeded:
            raise ValueError("This response is too long for the local model. Review it manually.") from None
        except Exception:
            # Do not return local paths, loader tracebacks, or submission contents.
            raise ModelUnavailable("The local AI model could not run. Check the model setup or continue marking manually.") from None
        if result.status != "repaired":
            return {
                "status": "invalid_generation", "originalCode": code,
                "suggestedCode": None, "syntaxError": original_error, "diff": [],
                "message": "AI could not produce a valid syntax fix. Review the original response manually.",
                "modelId": result.model_id,
            }
        suggestion = result.suggested_code
        # Re-check at the API boundary, even if an inference implementation changes.
        try:
            ast.parse(suggestion)
        except (SyntaxError, ValueError, RecursionError):
            raise ModelUnavailable("AI returned an invalid suggestion. Continue marking manually.") from None
        if not suggestion.strip() or suggestion == code:
            raise ModelUnavailable("AI returned no usable change. Continue marking manually.")
        diff = list(difflib.unified_diff(
            code.splitlines(), suggestion.splitlines(),
            fromfile="Original response", tofile="AI suggestion", lineterm="",
        ))
        return {
            "status": "repaired", "originalCode": code,
            "suggestedCode": suggestion, "syntaxError": original_error,
            "diff": diff, "modelId": result.model_id,
            "message": "Suggested syntax fix. Review the changes; parsing does not confirm correct behaviour.",
        }
    finally:
        _generation.release()
