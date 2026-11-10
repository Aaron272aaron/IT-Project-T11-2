"""Online SQLite snapshots and offline, validated restore for the running app."""
import argparse
from contextlib import contextmanager, ExitStack, closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import threading
import time
from uuid import uuid4
from backend.paths import BACKEND_DATA


def paths():
    return {'accounts': Path(os.environ.get('AUTH_DB_PATH', str(BACKEND_DATA / 'private/accounts.sqlite3'))),
            'exams': Path(os.environ.get('EXAM_DB_PATH', str(BACKEND_DATA / 'private/exams.sqlite3')))}


@contextmanager
def runtime_lock(files):
    """Server and offline restore share OS locks; stale lock files are harmless."""
    with ExitStack() as stack:
        for path in sorted(set(Path(p).resolve() for p in files.values())):
            path.parent.mkdir(parents=True, exist_ok=True)
            file = stack.enter_context(open(str(path) + '.runtime-lock', 'a+b'))
            file.seek(0); file.write(b'0'); file.flush(); file.seek(0)
            try:
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                raise RuntimeError('Stop the AutoMarktic server before restoring or starting another instance.') from None
        yield


def checked(path, required):
    if not path.is_file():
        raise ValueError(f'Missing database: {path.name}')
    db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    try:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('SQLite integrity check failed.')
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not required <= tables:
            raise ValueError(f'Unexpected database schema: {path.name}')
    finally:
        db.close()


def copy_database(source, destination):
    with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True, timeout=30)) as src:
        with closing(sqlite3.connect(destination, timeout=30)) as dst:
            src.backup(dst)
    destination.chmod(0o600)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def backup(files, directory, *, automatic=False):
    files = {k: Path(v).resolve() for k,v in files.items()}
    for key, path in files.items():
        checked(path, {'accounts','settings'} if key == 'accounts' else {'exams'})
    directory = Path(directory).resolve(); directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    name = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid4().hex[:8]
    target = directory / name; temporary = directory / ('.' + name)
    temporary.mkdir(mode=0o700)
    try:
        # Freeze writers to both databases while taking the paired snapshot.
        with ExitStack() as stack:
            for path in sorted(files.values()):
                db = sqlite3.connect(path, timeout=30)
                stack.callback(db.close)
                db.execute('BEGIN IMMEDIATE')
            hashes = {}
            for key, path in files.items():
                output = temporary / (key + '.sqlite3')
                copy_database(path, output)
                hashes[key] = digest(output)
        (temporary / 'manifest.json').write_text(json.dumps({'format':1,'createdAt':datetime.now(timezone.utc).isoformat(),'automatic':automatic,'sources':{k:str(v) for k,v in files.items()},'sha256':hashes}, indent=2))
        temporary.rename(target)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    # Retain seven completed automatic backups; manual and pre-restore copies remain.
    if automatic:
        completed = []
        for item in directory.iterdir():
            try:
                if not item.name.startswith('.') and json.loads((item/'manifest.json').read_text()).get('automatic'):
                    completed.append(item)
            except (OSError, ValueError):
                pass
        for item in sorted(completed, key=lambda p: (p/'manifest.json').stat().st_mtime_ns, reverse=True)[7:]:
            shutil.rmtree(item)
    return target


def restore(snapshot, files, directory):
    snapshot = Path(snapshot).resolve()
    manifest = json.loads((snapshot/'manifest.json').read_text())
    if manifest.get('format') != 1 or set(manifest.get('sha256', {})) != {'accounts','exams'}:
        raise ValueError('Unsupported backup manifest.')
    for key in ('accounts','exams'):
        source = snapshot/(key+'.sqlite3')
        if source.is_symlink() or digest(source) != manifest['sha256'][key]:
            raise ValueError('Backup checksum mismatch; nothing restored.')
        checked(source, {'accounts','settings'} if key == 'accounts' else {'exams'})
    files = {k:Path(v).resolve() for k,v in files.items()}
    if any(files[k] == snapshot/(k+'.sqlite3') for k in files):
        raise ValueError('Restore destination cannot be the backup itself.')
    with runtime_lock(files):
        existing = [p.exists() for p in files.values()]
        if any(existing) and not all(existing):
            raise ValueError('Keep the current database pair together before restoring.')
        safety = backup(files, directory) if all(existing) else None
        try:
            for key, destination in files.items():
                copy_database(snapshot/(key+'.sqlite3'), destination)
            # Restored sessions and answer leases must not revive stale ownership.
            with closing(sqlite3.connect(files['accounts'])) as db, db:
                db.execute('DELETE FROM sessions')
            with closing(sqlite3.connect(files['exams'])) as db, db:
                if db.execute("SELECT 1 FROM sqlite_master WHERE name='marking_locks'").fetchone():
                    db.execute('DELETE FROM marking_locks')
        except BaseException:
            if safety:
                for key,destination in files.items():
                    copy_database(safety/(key+'.sqlite3'),destination)
            else:
                for destination in files.values():
                    destination.unlink(missing_ok=True)
            raise
    return safety


class AutomaticBackups:
    def __init__(self, files, directory):
        self.files, self.directory = files, Path(directory)
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self.work, name='database-backup', daemon=True)

    def start(self):
        self.thread.start()

    def work(self):
        while not self.stop_event.is_set():
            try:
                recent = []
                for manifest in self.directory.glob('*/manifest.json'):
                    data = json.loads(manifest.read_text())
                    if data.get('automatic') and data.get('sources') == {k:str(Path(v).resolve()) for k,v in self.files.items()}:
                        recent.append(manifest.stat().st_mtime)
                if not recent or time.time() - max(recent) >= 86400:
                    print('Database backup saved:', backup(self.files, self.directory, automatic=True), flush=True)
            except (OSError, ValueError, sqlite3.Error) as error:
                print(f'Database backup failed: {error}. Check storage and run python -m backend.backup create.', flush=True)
            self.stop_event.wait(3600)

    def stop(self):
        self.stop_event.set()
        self.thread.join()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['create','restore'])
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--directory', type=Path, default=Path(os.environ.get('BACKUP_DIR', str(BACKEND_DATA/'private/backups'))))
    parser.add_argument('--confirm-restore', action='store_true')
    args = parser.parse_args()
    if args.action == 'create':
        print(backup(paths(), args.directory))
    else:
        if not args.snapshot or not args.confirm_restore:
            parser.error('Restore requires --snapshot PATH --confirm-restore; stop the app first.')
        safety = restore(args.snapshot, paths(), args.directory)
        print(f'Restored. Sign in again. Previous data backup: {safety or "empty destination"}')

if __name__ == '__main__':
    main()
