"""Cross-platform setup plans and installation boundaries, without installing tools."""
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from setup import runner


class SetupTests(unittest.TestCase):
    def test_supported_laptops_select_native_binaries_and_intel_compatibility(self):
        for system, machine, suffix in [('Darwin', 'arm64', 'darwin-arm64.tar.gz'), ('Darwin', 'x86_64', 'darwin-x64.tar.gz'), ('Windows', 'AMD64', 'win-x64.zip'), ('Windows', 'ARM64', 'win-arm64.zip')]:
            laptop = runner.Laptop.detect(system, machine)
            self.assertTrue(laptop.node_archive.endswith(suffix))
            self.assertTrue(laptop.requirements.is_file())
        self.assertEqual(runner.Laptop.detect('Darwin', 'x86_64').requirements.name, 'requirements-intel-mac.txt')
        with self.assertRaises(RuntimeError): runner.Laptop.detect('Linux', 'x86_64')

    def test_checksum_failure_prevents_extracting_or_running_an_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder) / 'node.zip'
            archive.write_bytes(b'archive')
            sums = Path(folder) / 'sums'
            sums.write_text('0' * 64 + '  node.zip\n')
            with self.assertRaises(RuntimeError): runner.verify_node(archive, sums)
            sums.write_text(hashlib.sha256(b'archive').hexdigest() + '  node.zip\n')
            runner.verify_node(archive, sums)

    def test_windows_environment_uses_project_python_and_per_user_docker(self):
        laptop = runner.Laptop.detect('Windows', 'AMD64')
        with patch.dict(runner.os.environ, {'LOCALAPPDATA': 'C:/Users/Example/AppData/Local', 'ProgramFiles': 'C:/Program Files'}):
            env = runner.app_environment(laptop, Path('node'))
        self.assertTrue(env['PYTHON'].endswith('.venv-ai/Scripts/python.exe'))
        self.assertIn('Programs/DockerDesktop/resources/bin', env['PATH'])
        self.assertNotIn('AI_MODEL_ALLOW_DOWNLOAD', env)

    def test_missing_wsl_requests_os_install_and_requires_rerun_after_restart(self):
        with patch.object(runner.subprocess, 'run', return_value=Mock(returncode=1)), patch.object(runner, 'run') as command:
            with self.assertRaises(runner.RestartRequired): runner.ensure_wsl(runner.Laptop.detect('Windows', 'AMD64'))
            args = command.call_args.args[0]
            self.assertIn('Start-Process wsl.exe', args[-1])
            self.assertNotIn('--accept-license', args[-1])

    def test_setup_command_failure_does_not_claim_success(self):
        with patch.object(runner.subprocess, 'run', return_value=Mock(returncode=1)):
            with self.assertRaises(RuntimeError): runner.run(['tool', 'install'])

    def test_bootstraps_require_only_os_tools_and_do_not_accept_docker_terms(self):
        mac = (runner.PROJECT / 'Setup-macOS.command').read_text()
        windows = (runner.PROJECT / 'setup/bootstrap-windows.ps1').read_text()
        self.assertIn('curl ', mac)
        self.assertIn('UV_UNMANAGED_INSTALL', mac)
        self.assertIn('Invoke-WebRequest', windows)
        self.assertIn('python install $pythonRequest', windows)
        self.assertIn('cpython-3.12-windows-x86_64-none', windows)
        self.assertIn('UV_PYTHON_BIN_DIR', windows)
        self.assertNotIn('brew ', mac)
        self.assertNotIn('winget ', windows)
        self.assertNotIn('--accept-license', (runner.PROJECT / 'setup/runner.py').read_text())

    def test_windows_cpp_runtime_is_installed_when_required_without_accepting_terms(self):
        ctypes = Mock()
        ctypes.WinDLL.side_effect = OSError('missing runtime')
        with patch.dict('sys.modules', {'ctypes': ctypes}), patch.object(runner, 'fetch', return_value=Path("C:/User's Folder/vc_redist.x64.exe")) as download, patch.object(runner, 'run') as command:
            runner.install_windows_runtime(runner.Laptop.detect('Windows', 'AMD64'))
            self.assertEqual(download.call_args.args[0], 'https://aka.ms/vc14/vc_redist.x64.exe')
            script = command.call_args.args[0][-1]
            self.assertIn("User''s Folder", script)
            self.assertIn('-Verb RunAs', script)
            self.assertIn('/norestart', script)
            self.assertNotIn('/quiet', script)
