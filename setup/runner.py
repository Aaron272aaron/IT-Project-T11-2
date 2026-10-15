"""Install the app on a fresh Windows/macOS laptop, then open its interface.

Uses only Python's standard library. The OS-native launchers fetch uv and a
managed Python before invoking this file; Node, Git and package managers are
not prerequisites. Never downloads model weights: that happens in the app.
"""
import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.request import Request, urlopen
import zipfile

PROJECT = Path(__file__).resolve().parents[1]
RUNTIME = PROJECT / ".runtime"
NODE_VERSION = "v24.21.0"
LIBREOFFICE_VERSION = "26.8.1"


class RestartRequired(RuntimeError):
    pass


@dataclass(frozen=True)
class Laptop:
    system: str
    arch: str

    @classmethod
    def detect(cls, system=None, machine=None):
        system = system or platform.system()
        if system == 'Windows' and machine is None:
            machine = os.environ.get('PROCESSOR_ARCHITEW6432') or os.environ.get('PROCESSOR_ARCHITECTURE')
        machine = (machine or platform.machine()).lower()
        arch = {"amd64": "x64", "x86_64": "x64", "arm64": "arm64", "aarch64": "arm64"}.get(machine)
        if system not in {"Darwin", "Windows"} or not arch:
            raise RuntimeError("This setup supports 64-bit Windows and macOS laptops.")
        return cls(system, arch)

    @property
    def node_archive(self):
        suffix = "zip" if self.system == "Windows" else "tar.gz"
        name = "win" if self.system == "Windows" else "darwin"
        return f"node-{NODE_VERSION}-{name}-{self.arch}.{suffix}"

    @property
    def requirements(self):
        return PROJECT / "setup" / ("requirements-intel-mac.txt" if self.system == "Darwin" and self.arch == "x64" else "requirements.txt")


def run(args, *, cwd=PROJECT, env=None, allowed=(0,)):
    print('> ' + ' '.join(map(str, args)), flush=True)
    result = subprocess.run(list(map(str, args)), cwd=cwd, env=env, check=False)
    if result.returncode not in allowed:
        raise RuntimeError(f"{Path(str(args[0])).name} stopped (code {result.returncode}). Fix the issue above and run setup again.")
    return result.returncode


def fetch(url, destination):
    """Atomic HTTPS download with visible byte progress and retry."""
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + '.part')
    if not url.startswith('https://'):
        raise ValueError('Setup downloads must use HTTPS.')
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={"User-Agent": "AutoMarktic-Setup/1"}), timeout=30) as response, partial.open('wb') as output:
                if not response.url.startswith('https://'):
                    raise ValueError('The setup download redirected away from HTTPS.')
                total = int(response.headers.get('Content-Length', '0'))
                received, last = 0, 0
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
                    received += len(chunk)
                    if time.monotonic() - last >= 1:
                        label = f'{received / 1e6:.1f} MB' + (f' / {total / 1e6:.1f} MB ({100 * received / total:.0f}%)' if total else '')
                        print('Downloading ' + destination.name + ': ' + label, flush=True)
                        last = time.monotonic()
                if total and received != total:
                    raise OSError('Download incomplete')
            partial.replace(destination)
            return destination
        except (OSError, TimeoutError):
            if attempt == 2:
                raise RuntimeError(f'Could not download {destination.name}. Check your internet connection and retry.') from None
            time.sleep(1)


def digest_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def verify_node(archive, sums):
    matches = [line.split() for line in Path(sums).read_text().splitlines() if line.split() and line.split()[-1] == Path(archive).name]
    if len(matches) != 1 or digest_file(archive) != matches[0][0]:
        raise RuntimeError('Node.js failed its checksum check. Delete the downloaded archive and retry setup.')


def install_node(laptop):
    node_home = RUNTIME / f'node-{NODE_VERSION}-{laptop.system.lower()}-{laptop.arch}'
    executable = node_home / ('node.exe' if laptop.system == 'Windows' else 'bin/node')
    if executable.is_file():
        return node_home
    if node_home.exists():
        shutil.rmtree(node_home)
    url = f'https://nodejs.org/dist/{NODE_VERSION}/'
    archive = fetch(url + laptop.node_archive, RUNTIME / 'downloads' / laptop.node_archive)
    sums = fetch(url + 'SHASUMS256.txt', RUNTIME / 'downloads' / 'SHASUMS256.txt')
    verify_node(archive, sums)
    with tempfile.TemporaryDirectory(dir=RUNTIME) as directory:
        if laptop.system == 'Windows':
            with zipfile.ZipFile(archive) as bundle:
                for item in bundle.namelist():
                    if Path(item).is_absolute() or '..' in Path(item).parts or '\\' in item:
                        raise RuntimeError('Node.js archive contains an unsafe path.')
                bundle.extractall(directory)
        else:
            with tarfile.open(archive) as bundle:
                bundle.extractall(directory, filter='data')
        extracted = Path(directory) / laptop.node_archive.removesuffix('.tar.gz').removesuffix('.zip')
        shutil.move(str(extracted), str(node_home))
    return node_home


def app_environment(laptop, node_home):
    env = os.environ.copy()
    paths = [str(node_home if laptop.system == 'Windows' else node_home / 'bin')]
    if laptop.system == 'Darwin':
        paths += ['/Applications/Docker.app/Contents/Resources/bin', str(Path.home() / '.docker/bin')]
        soffice = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    else:
        local = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local')))
        program_files = Path(os.environ.get('ProgramFiles', 'C:/Program Files'))
        paths += [str(local / 'Programs/DockerDesktop/resources/bin'), str(program_files / 'Docker/Docker/resources/bin')]
        soffice = str(program_files / 'LibreOffice/program/soffice.exe')
    env['PATH'] = os.pathsep.join(paths + [env.get('PATH', '')])
    env['PYTHON'] = str(PROJECT / '.venv-ai' / ('Scripts/python.exe' if laptop.system == 'Windows' else 'bin/python'))
    if not env.get('SOFFICE_BIN') and Path(soffice).is_file():
        env['SOFFICE_BIN'] = soffice
    return env


@contextmanager
def mounted_image(image):
    with tempfile.TemporaryDirectory(prefix='automarktic-mount-') as directory:
        run(['hdiutil', 'attach', '-nobrowse', '-mountpoint', directory, image])
        try:
            yield Path(directory)
        finally:
            subprocess.run(['hdiutil', 'detach', directory], check=False)


def install_docker(laptop, env):
    if shutil.which('docker', path=env['PATH']):
        return
    arch = 'arm64' if laptop.arch == 'arm64' else 'amd64'
    if laptop.system == 'Darwin':
        image = fetch(f'https://desktop.docker.com/mac/main/{arch}/Docker.dmg', RUNTIME / 'downloads/Docker.dmg')
        with mounted_image(image) as mount:
            run(['sudo', mount / 'Docker.app/Contents/MacOS/install', '--user=' + os.environ.get('USER', '')])
    else:
        installer = fetch(f'https://desktop.docker.com/win/main/{arch}/Docker%20Desktop%20Installer.exe', RUNTIME / 'downloads/Docker Desktop Installer.exe')
        # Let the normal installer present its own licence and configuration screens.
        run([installer, 'install', '--user'], allowed=(0, 3010))
    if not shutil.which('docker', path=env['PATH']):
        raise RuntimeError('Docker installation is incomplete. Finish its installer, then run setup again.')


def ensure_wsl(laptop):
    if laptop.system != 'Windows':
        return
    result = subprocess.run(['wsl.exe', '--status'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    if result.returncode == 0:
        return
    print('Windows needs WSL 2 for isolated test runs. Approve the Windows administrator prompt.', flush=True)
    # OS-owned installer; no automatic reboot or pre-acceptance of vendor terms.
    run(['powershell.exe', '-NoProfile', '-Command',
         "$p = Start-Process wsl.exe -ArgumentList '--install','--no-distribution' -Verb RunAs -Wait -PassThru; exit $p.ExitCode"], allowed=(0, 3010))
    raise RestartRequired('Restart Windows to finish WSL 2 installation, then double-click Setup-Windows.cmd again.')


def install_windows_runtime(laptop):
    if laptop.system != 'Windows':
        return
    import ctypes
    try:
        for name in ('msvcp140.dll', 'vcruntime140_1.dll'):
            ctypes.WinDLL(name)
        return
    except OSError:
        pass
    installer = fetch('https://aka.ms/vc14/vc_redist.x64.exe', RUNTIME / 'downloads/vc_redist.x64.exe')
    print('Windows needs the Microsoft C++ runtime for local AI. Complete its installer and administrator prompt.', flush=True)
    path = str(installer).replace("'", "''")
    run(['powershell.exe', '-NoProfile', '-Command',
         f"$p = Start-Process -FilePath '{path}' -ArgumentList '/norestart' -Verb RunAs -Wait -PassThru; exit $p.ExitCode"],
        allowed=(0, 1638, 3010))


def install_libreoffice(laptop, env):
    if env.get('SOFFICE_BIN') or shutil.which('soffice', path=env['PATH']):
        return
    base = f'https://download.documentfoundation.org/libreoffice/stable/{LIBREOFFICE_VERSION}/'
    if laptop.system == 'Darwin':
        arch = 'aarch64' if laptop.arch == 'arm64' else 'x86_64'
        name = f'LibreOffice_{LIBREOFFICE_VERSION}_MacOS_{arch}.dmg'
        image = fetch(base + f'mac/{arch}/' + name, RUNTIME / 'downloads' / name)
        with mounted_image(image) as mount:
            run(['sudo', 'ditto', mount / 'LibreOffice.app', '/Applications/LibreOffice.app'])
    else:
        arch = 'aarch64' if laptop.arch == 'arm64' else 'x86_64'
        suffix = 'aarch64' if laptop.arch == 'arm64' else 'x86-64'
        name = f'LibreOffice_{LIBREOFFICE_VERSION}_Win_{suffix}.msi'
        installer = fetch(base + f'win/{arch}/' + name, RUNTIME / 'downloads' / name)
        run(['msiexec.exe', '/i', installer, '/passive', '/norestart'], allowed=(0, 3010))


def wait_for_docker(laptop, env):
    def ready():
        try:
            return subprocess.run(['docker', 'info'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10).returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            return False
    if ready():
        return
    print('Starting Docker Desktop. Complete its first-run screens and any licence prompt.', flush=True)
    if laptop.system == 'Darwin':
        run(['open', '-a', 'Docker'])
    else:
        candidates = [Path(os.environ.get('LOCALAPPDATA', '')) / 'Programs/DockerDesktop/Docker Desktop.exe',
                      Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Docker/Docker/Docker Desktop.exe']
        desktop = next((p for p in candidates if p.is_file()), None)
        if not desktop:
            raise RuntimeError('Docker Desktop could not be found. Finish its installer and rerun setup.')
        subprocess.Popen([str(desktop)], env=env)
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        if ready():
            return
        time.sleep(2)
    raise RuntimeError('Docker did not become ready. Finish its setup or restart the laptop, then run setup again.')


def fingerprint(laptop):
    files = [laptop.requirements, PROJECT / 'requirements.txt', PROJECT / 'ai_tools/code_repair/requirements.txt', PROJECT / 'frontend/package-lock.json']
    return hashlib.sha256((laptop.system + laptop.arch + NODE_VERSION + ''.join(digest_file(p) for p in files)).encode()).hexdigest()


def prepare(laptop, uv, *, extras=True):
    RUNTIME.mkdir(parents=True, exist_ok=True)
    node_home = install_node(laptop)
    env = app_environment(laptop, node_home)
    python = Path(env['PYTHON'])
    marker = RUNTIME / 'dependencies-ready.json'
    key = fingerprint(laptop)
    try:
        complete = json.loads(marker.read_text()).get('fingerprint') == key
    except (OSError, ValueError):
        complete = False
    if not python.is_file():
        run([uv, 'venv', '--clear', '--seed', '--python', sys.executable, PROJECT / '.venv-ai'])
        complete = False
    if not complete or not (PROJECT / 'frontend/node_modules/vite/package.json').is_file():
        print('Installing Python and interface dependencies…', flush=True)
        run([uv, 'pip', 'install', '--python', python, '--only-binary', ':all:', '-r', laptop.requirements])
        node = node_home / ('node.exe' if laptop.system == 'Windows' else 'bin/node')
        npm = node_home / ('node_modules/npm/bin/npm-cli.js' if laptop.system == 'Windows' else 'lib/node_modules/npm/bin/npm-cli.js')
        run([node, npm, 'ci'], cwd=PROJECT / 'frontend', env=env)
    # Detect an unusable/copied virtual environment before claiming setup success.
    install_windows_runtime(laptop)
    run([python, '-c', 'import torch, transformers, huggingface_hub, yaml; print("Python dependencies ready.")'], env=env)
    marker.write_text(json.dumps({'fingerprint': key, 'platform': laptop.system, 'arch': laptop.arch}, indent=2))
    if extras:
        ensure_wsl(laptop)
        install_docker(laptop, env)
        install_libreoffice(laptop, env)
        env = app_environment(laptop, node_home)
        if not env.get('SOFFICE_BIN'):
            raise RuntimeError('LibreOffice installation is incomplete. Finish its installer, then run setup again.')
        wait_for_docker(laptop, env)
        run(['docker', 'build', '-t', 'automarktic-runner:local', PROJECT / 'auto_marking/test_runner'], env=env)
    else:
        env['DOCKER_AUTOSTART'] = '0'
    (RUNTIME / 'setup-complete.json').write_text(json.dumps({'fingerprint': key, 'extras': extras}, indent=2))
    return node_home, env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--uv', default=str(RUNTIME / 'uv' / ('uv.exe' if os.name == 'nt' else 'uv')))
    parser.add_argument('--plan', action='store_true', help='Print the plan without downloading or installing anything.')
    parser.add_argument('--skip-extras', action='store_true', help='Skip Docker and LibreOffice; AI/manual marking still work.')
    parser.add_argument('--setup-only', action='store_true', help='Install dependencies without launching the app.')
    args = parser.parse_args()
    try:
        laptop = Laptop.detect()
        if args.plan:
            print(json.dumps({'platform': laptop.system, 'arch': laptop.arch, 'pythonArch': 'x64' if laptop.system == 'Windows' else laptop.arch, 'nodeArchive': laptop.node_archive,
                              'requirements': str(laptop.requirements.relative_to(PROJECT)),
                              'steps': ['managed Python', 'Node.js with checksum verification', 'Python dependencies', 'interface dependencies']
                              + (['Microsoft C++ runtime'] if laptop.system == 'Windows' else [])
                              + ([] if args.skip_extras else (['WSL 2'] if laptop.system == 'Windows' else []) + ['Docker Desktop', 'LibreOffice', 'isolated test image'])
                              + ['open app', 'download AI model from Local AI setup in the interface']}, indent=2))
            return 0
        if not Path(args.uv).is_file():
            raise RuntimeError('Run Setup-macOS.command or Setup-Windows.cmd to download the Python setup tool first.')
        node_home, env = prepare(laptop, args.uv, extras=not args.skip_extras)
        print('Setup is complete. Open the demo or sign in as a coordinator, then choose Download AI model in Local AI setup.', flush=True)
        if args.setup_only:
            return 0
        env['OPEN_BROWSER'] = '1'
        node = node_home / ('node.exe' if laptop.system == 'Windows' else 'bin/node')
        return subprocess.call([str(node), 'scripts/dev.mjs'], cwd=PROJECT / 'frontend', env=env)
    except RestartRequired as error:
        print(str(error), file=sys.stderr)
        return 3
    except (RuntimeError, OSError) as error:
        print('Setup could not finish: ' + str(error), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('\nSetup stopped. Run the launcher again to continue.', file=sys.stderr)
        return 130


if __name__ == '__main__':
    raise SystemExit(main())
