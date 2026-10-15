"""Persist completed reviews before replying, so refresh never repeats inference."""
import hashlib
import json
from threading import Lock
from .exams import database, scope
from ai_tools.model_download import model_identity
from ai_tools.ai_recommendation import suggest_fix, ModelBusy

_review_lock = Lock()


def version():
    return json.dumps(model_identity())


def table(db):
    db.execute('CREATE TABLE IF NOT EXISTS ai_reviews (scope TEXT, version TEXT, digest TEXT, review_key TEXT, comment TEXT, result TEXT, PRIMARY KEY(scope, version, digest))')


def read_reviews(handler):
    try:
        with database(handler) as db:
            table(db)
            rows = db.execute('SELECT review_key, comment, result FROM ai_reviews WHERE scope=? AND version=?', (scope(handler), version())).fetchall()
        handler.send_json(200, {'reviews': [{'key': key, 'comment': comment, 'result': json.loads(result)} for key, comment, result in rows]})
    except Exception:
        handler.send_json(503, {'message': 'Saved AI reviews could not be loaded. Retry after checking the backend.'})


def cached_review(handler, payload):
    key = payload.get('reviewKey')
    if key is None:
        return suggest_fix(payload.get('code'), payload.get('comment', ''))
    if not isinstance(key, str) or len(key) > 20000:
        raise ValueError('Invalid submission review key.')
    parts = json.loads(key)
    if not isinstance(parts, list) or len(parts) != 4 or not all(isinstance(p, str) for p in parts) or parts[3] != payload.get('code'):
        raise ValueError('The review key must match the submitted code.')
    comment = payload.get('comment', '')
    force = payload.get('force', False)
    if not isinstance(comment, str) or len(comment) > 1000 or type(force) is not bool:
        raise ValueError('Invalid AI review options.')
    digest = hashlib.sha256(key.encode()).hexdigest()
    identity = (scope(handler), version(), digest)
    # Includes the second cache lookup and commit. A refresh arriving while the
    # first browser request finishes gets busy, then reuses the committed result.
    if not _review_lock.acquire(blocking=False):
        raise ModelBusy('AI is reviewing another response. Please try again shortly.')
    try:
        with database(handler) as db:
            table(db)
            row = db.execute('SELECT result FROM ai_reviews WHERE scope=? AND version=? AND digest=?', identity).fetchone()
        if row and not force:
            return json.loads(row[0])
        result = suggest_fix(payload.get('code'), comment)
        with database(handler) as db:
            db.execute('INSERT INTO ai_reviews VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(scope,version,digest) DO UPDATE SET comment=excluded.comment, result=excluded.result', (*identity, key, comment, json.dumps(result, ensure_ascii=False)))
        return result
    finally:
        _review_lock.release()
