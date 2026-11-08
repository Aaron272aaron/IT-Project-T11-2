"""Workspace-scoped answer leases, checked in the same transaction as marks."""
import json
import secrets
import sqlite3
import time
from .auth import _payload
from backend.security.accounts import AccountError

LEASE_SECONDS = 45


def schema(db):
    db.execute("CREATE TABLE IF NOT EXISTS marking_locks (scope TEXT, exam TEXT, question TEXT, student TEXT, owner TEXT, name TEXT, token TEXT, expires REAL, PRIMARY KEY(scope,exam,question,student))")


def identity(handler):
    account = getattr(handler, 'account', None)
    return (account['id'], account['name']) if account else ('demo', 'Demo tutor')


def lock_request(handler):
    from .exams import database, scope
    try:
        body = _payload(handler, {'examId', 'questionId', 'studentId', 'action', 'token'}, {'examId', 'questionId', 'studentId', 'action'})
        if any(not isinstance(body[k], str) or not 0 < len(body[k]) <= 300 for k in ('examId', 'questionId', 'studentId')) or body['action'] not in ('acquire', 'renew', 'release', 'inspect'):
            raise AccountError('Invalid answer lock request.', 422)
        key = (scope(handler), body['examId'], body['questionId'], body['studentId'])
        owner, name = identity(handler)
        now = time.time()
        with database(handler) as db:
            schema(db)
            db.execute('BEGIN IMMEDIATE')
            saved = db.execute('SELECT data FROM exams WHERE scope=?', (key[0],)).fetchone()
            exams = [e for items in json.loads(saved[0]).values() for e in items] if saved else []
            exam = next((e for e in exams if e['id'] == key[1]), None)
            students = (exam or {}).get('answers', {}).get('preview', {}).get('students', [])
            if not any(s.get('id') == key[3] and any(a.get('questionId') == key[2] for a in s.get('answers', [])) for s in students):
                raise AccountError('This answer is not available in your workspace.', 404)
            row = db.execute('SELECT owner,name,token,expires FROM marking_locks WHERE scope=? AND exam=? AND question=? AND student=?', key).fetchone()
            ours = bool(row and row[0] == owner and isinstance(body.get('token'), str) and secrets.compare_digest(row[2], body['token']))
            active = bool(row and row[3] > now)
            if body['action'] == 'release':
                if ours:
                    # Retain the expired lease to reject delayed saves after release.
                    db.execute('UPDATE marking_locks SET expires=0 WHERE scope=? AND exam=? AND question=? AND student=?', key)
                result = {'editable': False, 'available': not active or ours}
            elif body['action'] == 'inspect':
                result = {'editable': False, 'available': not active, 'owner': row[1] if active else None}
            elif body['action'] == 'renew' and (not ours or not active):
                handler.send_json(409, {'message': 'Your marking lock has expired or changed. Reopen this answer before saving.'})
                return
            elif active and not ours:
                result = {'editable': False, 'available': False, 'owner': row[1]}
            else:
                token = row[2] if ours and active else secrets.token_urlsafe(32)
                expires = now + LEASE_SECONDS
                db.execute('INSERT OR REPLACE INTO marking_locks VALUES (?,?,?,?,?,?,?,?)', (*key, owner, name, token, expires))
                result = {'editable': True, 'token': token, 'expiresAt': expires, 'owner': name}
        handler.send_json(200, result)
    except AccountError as error:
        handler.send_json(error.status, {'message': str(error)})
    except (ValueError, TypeError, KeyError):
        handler.send_json(422, {'message': 'Invalid answer lock request.'})
    except (OSError, sqlite3.Error):
        handler.send_json(503, {'message': 'Marking locks are unavailable. This answer remains read only.'})


def check_marking_locks(handler, db, old, new):
    """Reject stale leases and conflicting individual, group or rubric writes."""
    from .exams import scope
    schema(db)
    try:
        tokens = json.loads(handler.headers.get('X-Marking-Locks', '{}'))
    except (ValueError, TypeError):
        return 'Invalid marking lock credentials.'
    if not isinstance(tokens, dict):
        return 'Invalid marking lock credentials.'
    before = {e['id']: e for items in old.values() for e in items}
    after = {e['id']: e for items in new.values() for e in items}
    owner, _ = identity(handler)
    now = time.time()
    for exam_id, question, student, lock_owner, name, token, expires in db.execute('SELECT exam,question,student,owner,name,token,expires FROM marking_locks WHERE scope=?', (scope(handler),)):
        a, b = before.get(exam_id, {}), after.get(exam_id, {})
        old_mark = a.get('marks', {}).get(question, {}).get(student)
        new_mark = b.get('marks', {}).get(question, {}).get(student)
        setup_changed = any(a.get(k) != b.get(k) for k in ('answers', 'categories', 'questionTypes')) or bool(a) != bool(b)
        if old_mark == new_mark and not setup_changed:
            continue
        supplied = tokens.get(json.dumps([exam_id, question, student], separators=(',', ':')))
        ours = lock_owner == owner and isinstance(supplied, str) and secrets.compare_digest(token, supplied)
        if expires > now and not ours:
            return f'{name} is marking this answer. Your changes were not saved.'
        if expires <= now and (old_mark != new_mark) and supplied is not None:
            return 'Your marking lock has expired. Reopen the answer before saving.'
    return None
