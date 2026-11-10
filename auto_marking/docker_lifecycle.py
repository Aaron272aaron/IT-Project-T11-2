"""Manage the local macOS Docker Desktop session used by the marking runner."""

import os
import subprocess
import sys
import time


class DockerUnavailable(RuntimeError):
    pass


class DockerLifecycle:
    def __init__(self):
        self.started_here = False
        self.engine_id = None

    @staticmethod
    def _run(*args, timeout=5):
        return subprocess.run(
            args, capture_output=True, text=True, timeout=timeout, check=False,
        )

    def _engine(self):
        try:
            result = self._run("docker", "info", "--format", "{{.ID}}")
            return result.stdout.strip() if result.returncode == 0 else None
        except (OSError, subprocess.SubprocessError):
            return None

    def start(self):
        if os.environ.get("DOCKER_AUTOSTART", "1") == "0":
            print("Automatic Docker startup is disabled.", flush=True)
            return
        if self._engine():
            print("Docker is already running; it will stay running on exit.", flush=True)
            return
        try:
            # Never start Desktop for an unavailable remote or alternative engine.
            context = self._run("docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}")
            endpoint = os.environ.get("DOCKER_HOST") or context.stdout.strip()
            if (sys.platform != "darwin" or context.returncode != 0
                    or not endpoint.startswith("unix://")
                    or not ("/.docker/" in endpoint or endpoint == "unix:///var/run/docker.sock")):
                raise DockerUnavailable("Start your Docker engine manually; manual marking remains available.")
            # A running Desktop may still be starting its engine. Wait without
            # claiming it, so shutdown cannot close a session the user opened.
            desktop = self._run("pgrep", "-x", "Docker|Docker Desktop|com.docker.backend")
            if desktop.returncode not in (0, 1):
                raise DockerUnavailable("Could not check Docker Desktop. Start it manually; manual marking remains available.")
            if desktop.returncode == 1:
                print("Starting Docker Desktop…", flush=True)
                # Record ownership before launching, including interrupted starts.
                self.started_here = True
                launched = self._run("docker", "desktop", "start", "--detach", timeout=15)
                if launched.returncode != 0:
                    self.started_here = False
                    raise DockerUnavailable("Docker Desktop could not start. Start it manually; manual marking remains available.")
            else:
                print("Waiting for Docker Desktop…", flush=True)
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                self.engine_id = self._engine()
                if self.engine_id:
                    print("Docker is ready.", flush=True)
                    return
                time.sleep(0.5)
            raise DockerUnavailable("Docker did not become ready. Check Docker Desktop; manual marking remains available.")
        except (OSError, subprocess.SubprocessError):
            raise DockerUnavailable("Docker is unavailable. Install or start Docker Desktop; manual marking remains available.") from None

    def stop(self):
        if not self.started_here:
            return False
        self.started_here = False
        try:
            current_engine = self._engine()
            if not current_engine or (self.engine_id and current_engine != self.engine_id):
                print("Docker left running because its engine could not be verified.", flush=True)
                return False
            containers = self._run("docker", "ps", "-q")
            # Runner jobs have already finished. Anything still running belongs
            # to another workflow, including a separately started database.
            if containers.returncode != 0 or containers.stdout.strip():
                print("Docker left running because containers are active or could not be checked.", flush=True)
                return False
            result = self._run("docker", "desktop", "stop", "--timeout", "20", timeout=25)
            if result.returncode == 0:
                print("Docker Desktop stopped.", flush=True)
                return True
        except (OSError, subprocess.SubprocessError):
            pass
        print("Docker Desktop could not stop automatically; quit it manually if needed.", flush=True)
        return False
