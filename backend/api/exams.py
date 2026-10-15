"""Durable, workspace-scoped exam snapshots with optimistic concurrency."""
from contextlib import contextmanager
import json
import os
import sqlite3
from pathlib import Path
from backend.paths import BACKEND_DATA

MAX_BYTES = 128 * 1024 * 1024


@contextmanager
def database(handler):
    path = Path(getattr(handler.server, 'exam_db_path', None) or os.environ.get('EXAM_DB_PATH', str(BACKEND_DATA / 'private/exams.sqlite3')))
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=30)
    connection.execute('CREATE TABLE IF NOT EXISTS exams (scope TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL)')
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def scope(handler):
    account = getattr(handler, 'account', None)
    return 'workspace:' + account['workspaceId'] if account else 'local-demo'


def valid_registry(data):
    return isinstance(data, dict) and all(
        isinstance(items, list) and all(isinstance(item, dict) and all(isinstance(item.get(k), str) for k in ('id', 'title', 'description')) for item in items)
        and len({item['id'] for item in items}) == len(items)
        for items in data.values())


def read_exams(handler):
    try:
        with database(handler) as db:
            row = db.execute('SELECT revision, data FROM exams WHERE scope=?', (scope(handler),)).fetchone()
        handler.send_json(200, {'revision': row[0] if row else 0, 'registry': json.loads(row[1]) if row else {}})
    except (OSError, sqlite3.Error, ValueError):
        handler.send_json(503, {'message': 'Saved exams could not be opened. Check the backend and retry.'})


def save_exams(handler):
    if handler.headers.get_content_type() != 'application/json':
        handler.send_json(415, {'message': 'Send exam data as JSON.'})
        return
    length = handler.headers.get('Content-Length', '')
    if handler.headers.get('Transfer-Encoding') or not length.isascii() or not length.isdecimal() or len(length) > 10 or not 0 < int(length) <= MAX_BYTES:
        handler.send_json(413, {'message': 'The exam request must be between 1 byte and 128 MB.'})
        return
    try:
        handler.connection.settimeout(60)
        content = handler.rfile.read(int(length))
        if len(content) != int(length):
            raise ValueError()
        payload = json.loads(content)
        if not isinstance(payload, dict) or set(payload) != {'revision', 'registry'} or type(payload['revision']) is not int or payload['revision'] < 0 or not valid_registry(payload['registry']):
            raise ValueError()
        encoded = json.dumps(payload['registry'], ensure_ascii=False, allow_nan=False, separators=(',', ':'))
        with database(handler) as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT revision, data FROM exams WHERE scope=?', (scope(handler),)).fetchone()
            if payload['revision'] != (row[0] if row else 0):
                handler.send_json(409, {'message': 'Another save changed this workspace. Reload before saving again; saved exams are unchanged.'})
                return
            account = getattr(handler, 'account', None)
            if account and account['role'] != 'Coordinator':
                # Tutors can record marking and grouping, but cannot replace exams,
                # uploaded answers, classifications or rubric definitions.
                def structure(registry):
                    return {key: [{k: v for k, v in exam.items() if k not in {'marks', 'groupMarkHistory', 'answerGrouping'}} for exam in items] for key, items in registry.items()}
                if structure(payload['registry']) != structure(json.loads(row[1]) if row else {}):
                    handler.send_json(403, {'message': 'Coordinator access is required to change exam setup.'})
                    return
            revision = payload['revision'] + 1
            db.execute('INSERT INTO exams VALUES (?, ?, ?) ON CONFLICT(scope) DO UPDATE SET revision=excluded.revision, data=excluded.data', (scope(handler), revision, encoded))
        handler.send_json(200, {'revision': revision})
    except (ValueError, UnicodeError):
        handler.send_json(422, {'message': 'The exam data is invalid. Previous saved exams are unchanged.'})
    except (OSError, sqlite3.Error):
        handler.send_json(503, {'message': 'The backend could not save this exam. Check disk space and retry; previous saved exams are unchanged.'})
