"""Durable test evidence, isolated by workspace and exact suite/code versions."""
import hashlib
import json
import sqlite3
import time
from contextlib import closing
from pathlib import Path
from backend.paths import MARKING_DIR


def suite_version(question_key):
    from .jobs import SUITES
    suite = SUITES.get(question_key)
    if not suite:
        return None
    digest = hashlib.sha256()
    paths = [MARKING_DIR / 'questions' / suite / 'cases.yaml', MARKING_DIR / 'Dockerfile']
    paths += sorted((MARKING_DIR / 'runner').rglob('*.py'))
    for path in paths:
        digest.update(str(path.relative_to(MARKING_DIR)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def schema(db):
    db.execute('CREATE TABLE IF NOT EXISTS test_results (scope TEXT, run_id TEXT, version TEXT, question TEXT, digest TEXT, variant TEXT, result TEXT, updated INTEGER, PRIMARY KEY(scope,run_id))')
    db.execute('CREATE INDEX IF NOT EXISTS test_result_lookup ON test_results(scope,question,digest,variant,version,updated)')


def save(path, scope, version, job):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path, timeout=30)) as db, db:
        schema(db)
        db.execute('INSERT OR REPLACE INTO test_results VALUES (?,?,?,?,?,?,?,?)', (scope, job['runId'], version, job['questionKey'], job['codeDigest'], job['variant'], json.dumps(job), time.time_ns()))


def read(path, scope, run_id=None, *, question=None, digest=None, variant=None):
    with closing(sqlite3.connect(path, timeout=30)) as db, db:
        schema(db)
        if run_id:
            row = db.execute('SELECT result FROM test_results WHERE scope=? AND run_id=?', (scope,run_id)).fetchone()
        else:
            rows = db.execute('SELECT result FROM test_results WHERE scope=? AND question=? AND digest=? AND variant=? AND version=? ORDER BY updated DESC', (scope,question,digest,variant,suite_version(question))).fetchall()
            row = next((item for item in rows if json.loads(item[0])['status'] == 'completed'), None)
    return json.loads(row[0]) if row else None
