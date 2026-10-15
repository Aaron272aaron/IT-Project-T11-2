"""Docker ownership and API cleanup checks without starting Desktop."""

import contextlib
import io
import os
import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from backend.api import server
from auto_marking import docker_lifecycle as docker
from auto_marking import jobs as runner


def result(code=0, output=""):
    return SimpleNamespace(returncode=code, stdout=output)


class DockerTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"DOCKER_AUTOSTART": "1", "DOCKER_HOST": ""})
        environment.start()
        self.addCleanup(environment.stop)
        platform = patch.object(docker.sys, "platform", "darwin")
        platform.start()
        self.addCleanup(platform.stop)
        output = contextlib.redirect_stdout(io.StringIO())
        output.__enter__()
        self.addCleanup(output.__exit__, None, None, None)
        self.runtime = docker.DockerLifecycle()

    def test_existing_engine_is_reused_and_never_stopped(self):
        with patch.object(self.runtime, "_run", return_value=result(output="engine")) as command:
            self.runtime.start()
            self.assertFalse(self.runtime.stop())
        command.assert_called_once_with("docker", "info", "--format", "{{.ID}}")

    def test_disabled_docker_never_runs_commands(self):
        with patch.dict(os.environ, {"DOCKER_AUTOSTART": "0"}), patch.object(self.runtime, "_run") as command:
            self.runtime.start()
            self.assertFalse(self.runtime.stop())
        command.assert_not_called()

    def test_new_desktop_starts_waits_and_stops_after_last_container(self):
        commands = []
        engines = iter([result(1), result(1), result(output="engine"), result(output="engine")])
        def execute(*args, **kwargs):
            commands.append(args)
            if args[:2] == ("docker", "info"):
                return next(engines)
            if args[:3] == ("docker", "context", "inspect"):
                return result(output="unix:///Users/demo/.docker/run/docker.sock")
            if args[0] == "pgrep":
                return result(1)
            return result()
        with patch.object(self.runtime, "_run", side_effect=execute), patch.object(docker.time, "sleep"):
            self.runtime.start()
            self.assertTrue(self.runtime.started_here)
            self.assertTrue(self.runtime.stop())
            self.assertFalse(self.runtime.stop())
        self.assertIn(("docker", "desktop", "start", "--detach"), commands)
        self.assertLess(commands.index(("docker", "ps", "-q")), commands.index(("docker", "desktop", "stop", "--timeout", "20")))

    def test_desktop_already_starting_is_not_owned(self):
        with patch.object(self.runtime, "_engine", side_effect=[None, "engine"]), patch.object(self.runtime, "_run", side_effect=[result(output="unix:///var/run/docker.sock"), result(output="123")]) as command:
            self.runtime.start()
            self.assertFalse(self.runtime.stop())
        self.assertEqual(command.call_count, 2)

    def test_remote_and_alternative_contexts_are_not_started(self):
        for endpoint in ("ssh://remote", "unix:///Users/demo/.colima/default/docker.sock"):
            with self.subTest(endpoint=endpoint), patch.object(self.runtime, "_engine", return_value=None), patch.object(self.runtime, "_run", return_value=result(output=endpoint)) as command:
                with self.assertRaises(docker.DockerUnavailable):
                    self.runtime.start()
                self.assertFalse(self.runtime.started_here)
                self.assertEqual(command.call_count, 1)

    def test_missing_cli_and_launch_failure_are_recoverable(self):
        for responses in ([FileNotFoundError()], [result(output="unix:///var/run/docker.sock"), result(1), result(1)]):
            with self.subTest(responses=responses), patch.object(self.runtime, "_engine", return_value=None), patch.object(self.runtime, "_run", side_effect=responses):
                with self.assertRaises(docker.DockerUnavailable):
                    self.runtime.start()
                self.assertFalse(self.runtime.stop())

    def test_timeout_still_allows_owned_engine_cleanup(self):
        with patch.object(self.runtime, "_engine", side_effect=[None, "engine"]), patch.object(self.runtime, "_run", side_effect=[result(output="unix:///var/run/docker.sock"), result(1), result(), result(), result()]), patch.object(docker.time, "monotonic", side_effect=[0, 91]):
            with self.assertRaises(docker.DockerUnavailable):
                self.runtime.start()
            self.assertTrue(self.runtime.stop())

    def test_active_or_unverifiable_containers_leave_docker_running(self):
        for containers in (result(output="other-container"), result(1)):
            self.runtime.started_here = True
            self.runtime.engine_id = "engine"
            with self.subTest(containers=containers), patch.object(self.runtime, "_engine", return_value="engine"), patch.object(self.runtime, "_run", return_value=containers) as command:
                self.assertFalse(self.runtime.stop())
                command.assert_called_once_with("docker", "ps", "-q")

    def test_changed_or_unavailable_engine_is_not_stopped(self):
        for engine in (None, "different-engine"):
            self.runtime.started_here = True
            self.runtime.engine_id = "engine"
            with self.subTest(engine=engine), patch.object(self.runtime, "_engine", return_value=engine), patch.object(self.runtime, "_run") as command:
                self.assertFalse(self.runtime.stop())
                command.assert_not_called()

    def test_stop_errors_do_not_prevent_api_exit(self):
        for failure in (result(1), subprocess.TimeoutExpired("docker", 25)):
            self.runtime.started_here = True
            with self.subTest(failure=failure), patch.object(self.runtime, "_engine", return_value="engine"), patch.object(self.runtime, "_run", side_effect=[result(), failure]):
                self.assertFalse(self.runtime.stop())


class ServerDockerTests(unittest.TestCase):
    def run_server(self, *, start_error=None, bind_error=None):
        events = []
        with patch.object(server, "AccountStore"), patch.object(server, "DockerLifecycle") as factory, patch.object(server, "ThreadingHTTPServer") as http, patch.object(server, "model_enabled", return_value=True), patch.object(server, "start_model", side_effect=lambda: events.append("model-start")), patch.object(server, "stop_model", side_effect=lambda: events.append("model-stop")), patch.object(server, "stop_runner", side_effect=lambda: events.append("runner-stop")), patch.object(server.signal, "signal"), patch("sys.argv", ["server"]), contextlib.redirect_stdout(io.StringIO()):
            def start():
                events.append("docker-start")
                if start_error:
                    raise start_error
            factory.return_value.start.side_effect = start
            factory.return_value.stop.side_effect = lambda: events.append("docker-stop")
            def serve():
                events.append("serve")
                raise KeyboardInterrupt
            http.return_value.__enter__.return_value.serve_forever.side_effect = serve
            if bind_error:
                http.side_effect = bind_error
                with self.assertRaises(OSError):
                    server.main()
            else:
                server.main()
        return events

    def test_start_before_serving_and_drain_jobs_before_stopping_docker(self):
        self.assertEqual(self.run_server(), ["docker-start", "model-start", "serve", "runner-stop", "model-stop", "docker-stop"])

    def test_docker_failure_keeps_manual_marking_available(self):
        self.assertIn("serve", self.run_server(start_error=docker.DockerUnavailable("Unavailable")))

    def test_interrupted_start_runs_cleanup(self):
        self.assertEqual(self.run_server(start_error=KeyboardInterrupt()), ["docker-start", "runner-stop", "model-stop", "docker-stop"])

    def test_occupied_api_port_does_not_start_docker(self):
        self.assertNotIn("docker-start", self.run_server(bind_error=OSError("Port occupied")))

    def test_runner_shutdown_waits_for_active_jobs_and_cancels_queue(self):
        with patch.object(runner, "_pool", Mock()) as pool:
            runner.stop_runner()
        pool.shutdown.assert_called_once_with(wait=True, cancel_futures=True)
