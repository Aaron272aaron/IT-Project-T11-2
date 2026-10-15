"""One local, resumable model download with real byte progress."""
from fnmatch import fnmatch
import hashlib
import json
import os
from pathlib import Path
import shutil
from threading import Event, Lock, Thread

from backend.paths import PROJECT_ROOT
from .code_repair.model import MODEL_ID, MODEL_REVISION

CACHE_DIR = PROJECT_ROOT / ".ai-model-cache"
PATTERNS = ("*.json", "*.jinja", "*.safetensors", "*.model", "merges.txt", "vocab.txt")
ACTIVE = {"checking", "downloading", "verifying", "loading"}


class DownloadCancelled(RuntimeError):
    pass


def model_identity():
    return os.environ.get("AI_MODEL_ID", MODEL_ID), os.environ.get("AI_MODEL_REVISION", MODEL_REVISION)


def cached_model_path():
    repo, revision = model_identity()
    if not repo or "/" not in repo or not all(c in "0123456789abcdef" for c in revision) or len(revision) != 40:
        return None
    path = CACHE_DIR / ("models--" + repo.replace("/", "--")) / "snapshots" / revision
    if not (path / "config.json").is_file() or not (path / "tokenizer_config.json").is_file():
        return None
    # Partial downloads must never enable inference.
    index = path / "model.safetensors.index.json"
    try:
        weights = set(json.loads(index.read_text())["weight_map"].values()) if index.is_file() else {"model.safetensors"}
        if not weights or not all((path / name).is_file() and (path / name).stat().st_size > 0 for name in weights):
            return None
        if not ((path / "tokenizer.json").is_file() or (path / "tokenizer.model").is_file()):
            return None
    except (OSError, ValueError, KeyError, TypeError):
        return None
    return path


def download_files(update, cancelled):
    """Use Hub metadata and its HTTP/Xet progress callbacks, including resume."""
    import io
    from huggingface_hub import HfApi, hf_hub_download
    from tqdm.auto import tqdm

    repo, revision = model_identity()
    if len(revision) != 40 or any(c not in "0123456789abcdef" for c in revision):
        raise ValueError("Choose a pinned model revision in the local configuration.")
    info = HfApi(token=False).model_info(repo, revision=revision, files_metadata=True, timeout=15)
    files = [f for f in info.siblings if "/" not in f.rfilename and any(fnmatch(f.rfilename, p) for p in PATTERNS)]
    names = {f.rfilename for f in files}
    if not {"config.json", "tokenizer_config.json"} <= names or not any(n.endswith(".safetensors") for n in names):
        raise ValueError("The configured model does not include the required inference files.")
    if any(not isinstance(f.size, int) or f.size <= 0 for f in files):
        raise ValueError("The model download size could not be verified. Retry later.")
    total = sum(f.size for f in files)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    # Conservative allowance covers download, filesystem overhead and incomplete files.
    if shutil.disk_usage(CACHE_DIR).free < total + 512 * 1024 * 1024:
        raise ValueError("Not enough disk space for the model. Free space and retry.")
    completed = 0
    update(status="downloading", totalBytes=total, downloadedBytes=0, message="Downloading the local AI model…")
    for item in files:
        if cancelled.is_set():
            raise DownloadCancelled()
        filename, size = item.rfilename, item.size
        update(filename=filename)

        class FileProgress(tqdm):
            def __init__(self, *args, **kwargs):
                kwargs.update(disable=False, file=io.StringIO(), leave=False)
                super().__init__(*args, **kwargs)
                self.publish()

            def publish(self):
                if cancelled.is_set():
                    raise DownloadCancelled()
                if getattr(self, "unit", None) == "B":
                    update(downloadedBytes=completed + min(size, max(0, int(self.n))))

            def update(self, n=1):
                result = super().update(n)
                self.publish()
                return result

            def refresh(self, *args, **kwargs):
                result = super().refresh(*args, **kwargs)
                if hasattr(self, "n"):
                    self.publish()
                return result

        local = Path(hf_hub_download(repo, filename, revision=revision, cache_dir=str(CACHE_DIR), tqdm_class=FileProgress, token=False))
        if local.stat().st_size != size:
            raise ValueError("The model download was incomplete. Retry to resume it.")
        sha = getattr(getattr(item, "lfs", None), "sha256", None)
        if sha:
            update(status="verifying", message="Checking the downloaded model…")
            digest = hashlib.sha256()
            with local.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    if cancelled.is_set():
                        raise DownloadCancelled()
                    digest.update(chunk)
            if digest.hexdigest() != sha:
                # Remove only the corrupt blob, allowing the next attempt to fetch it again.
                local.resolve().unlink()
                raise ValueError("The downloaded model failed its integrity check. Retry the download.")
            update(status="downloading", message="Downloading the local AI model…")
        completed += size
        update(downloadedBytes=completed)
    if not cached_model_path():
        raise ValueError("Some required model files are missing. Retry the download.")


class ModelDownload:
    def __init__(self):
        self.lock = Lock()
        self.cancelled = Event()
        self.thread = None
        self.state = {"status": "missing", "downloadedBytes": 0, "totalBytes": 0,
                      "filename": "", "message": "Download the model to enable local AI fixes."}

    def update(self, **values):
        with self.lock:
            self.state.update(values)

    def status(self):
        with self.lock:
            state = dict(self.state)
        if os.environ.get("AI_REPAIR_ENABLED") == "0":
            state.update(status="disabled", message="Local AI is disabled in this app's configuration.")
        elif state["status"] == "missing" and cached_model_path():
            state.update(status="ready", message="The local AI model is installed.")
        state["installed"] = cached_model_path() is not None
        state["modelId"] = model_identity()[0]
        total = state["totalBytes"]
        state["percent"] = min(100, round(100 * state["downloadedBytes"] / total, 1)) if total else 0
        return state

    def start(self):
        if os.environ.get("AI_REPAIR_ENABLED") == "0":
            raise ValueError("Local AI is disabled in this app's configuration.")
        with self.lock:
            if self.thread and self.thread.is_alive():
                return False
            self.cancelled.clear()
            self.state.update(status="checking", downloadedBytes=0, totalBytes=0, filename="",
                              message="Checking the model download…")
            self.thread = Thread(target=self.work, name="model-download", daemon=True)
            self.thread.start()
        return True

    def work(self):
        try:
            if not cached_model_path():
                download_files(self.update, self.cancelled)
            if self.cancelled.is_set():
                raise DownloadCancelled()
            self.update(status="loading", message="Download complete. Loading the model into memory…")
            from .ai_recommendation import start_model
            start_model()
            if self.cancelled.is_set():
                raise DownloadCancelled()
            self.update(status="ready", filename="", message="Local AI is ready. You can generate fixes.")
        except DownloadCancelled:
            self.update(status="cancelled", message="Download paused. Choose Resume download to continue.")
        except Exception as error:
            # Never expose credentials, signed download URLs or loader tracebacks.
            message = (str(error) if isinstance(error, ValueError)
                       and "http" not in str(error) and len(str(error)) < 180 else
                       "The model could not be downloaded or loaded. Check your connection, disk space and setup, then retry.")
            self.update(status="error", message=message)

    def cancel(self):
        self.cancelled.set()

    def stop(self):
        self.cancel()
        thread = self.thread
        if thread and thread.is_alive():
            thread.join(timeout=30)


model_download = ModelDownload()
