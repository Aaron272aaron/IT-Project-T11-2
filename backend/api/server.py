"""Local development API: python3 -m backend.api.server."""

import argparse
import signal
import os
import tempfile
from pathlib import Path
from http.server import ThreadingHTTPServer

# Also allow running this file directly from any working directory.
if not __package__:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.api.handler import ApiHandler
from backend.api.auth import demo_api_enabled
from ai_tools.ai_recommendation import start_model, stop_model, model_enabled, ModelUnavailable
from ai_tools.model_download import model_download
from auto_marking.docker_lifecycle import DockerLifecycle, DockerUnavailable
from auto_marking.jobs import stop_runner
from backend.security.accounts import AccountStore


def main():
    # Read an optional --port argument; normal development uses port 8000.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")

    signals = [signal.SIGINT, signal.SIGTERM]
    if hasattr(signal, "SIGHUP"):
        signals.append(signal.SIGHUP)
    previous = {name: signal.getsignal(name) for name in signals}

    def request_stop(signum, frame):
        # A second terminal signal must not interrupt memory cleanup.
        for name in signals:
            signal.signal(name, signal.SIG_IGN)
        raise KeyboardInterrupt

    for name in signals:
        signal.signal(name, request_stop)
    docker = DockerLifecycle()
    temporary_accounts = None
    try:
        # Bind first so an occupied port does not load a second model.
        with ThreadingHTTPServer(("127.0.0.1", args.port), ApiHandler) as server:
            if os.environ.get("AUTH_DB_PATH") == ":temporary:":
                temporary_accounts = tempfile.TemporaryDirectory(prefix="automarktic-accounts-")
                account_path = Path(temporary_accounts.name) / "accounts.sqlite3"
            else:
                account_path = None
            server.account_store = AccountStore(account_path)
            if temporary_accounts:
                server.exam_db_path = Path(temporary_accounts.name) / "exams.sqlite3"
            server.allow_demo_api = demo_api_enabled()
            try:
                docker.start()
            except DockerUnavailable as error:
                print(str(error), flush=True)
            if model_enabled():
                model_download.update(status="loading", message="Loading the installed local AI model…")
                print("Loading local AI model…", flush=True)
                try:
                    start_model()
                except ModelUnavailable as error:
                    model_download.update(status="error", message=str(error))
                    print(str(error), flush=True)
                else:
                    model_download.update(status="ready", message="Local AI is ready. You can generate fixes.")
                    print("Local AI model ready.", flush=True)
            else:
                print("Local AI is disabled.", flush=True)
            print(f"Python API: http://127.0.0.1:{args.port}", flush=True)
            print("Keep this terminal open. Press Ctrl+C to stop.", flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Python API…", flush=True)
    finally:
        try:
            model_download.stop()
            try:
                stop_runner()
            finally:
                try:
                    if stop_model():
                        print("Local AI model released.", flush=True)
                finally:
                    docker.stop()
            print("Python API stopped.", flush=True)
        finally:
            if temporary_accounts:
                temporary_accounts.cleanup()
            for name, handler in previous.items():
                signal.signal(name, handler)


if __name__ == "__main__":
    main()
