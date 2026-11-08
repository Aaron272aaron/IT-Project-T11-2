"""Append-only mark changes recorded in the exam-save transaction."""
import json
import sqlite3
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit
from .exams import database, scope


def schema(db):
    db.execute('CREATE TABLE IF NOT EXISTS mark_history (id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, exam TEXT NOT NULL, question TEXT NOT NULL, student TEXT NOT NULL, actor_id TEXT, actor_name TEXT NOT NULL, at TEXT NOT NULL, revision INTEGER NOT NULL, before_json TEXT, after_json TEXT, reason TEXT)')
    db.execute('CREATE INDEX IF NOT EXISTS mark_history_answer ON mark_history(scope,exam,question,student,id)')


def record(db, workspace, old, new, actor, revision):
    schema(db)
    before = {e['id']: e for items in old.values() for e in items}
    after = {e['id']: e for items in new.values() for e in items}
    at = datetime.now(timezone.utc).isoformat()
    for exam in before.keys() | after.keys():
        a, b = before.get(exam, {}), after.get(exam, {})
        reason = None
        changes = b.get('rubricChanges')
        if a.get('rubricChanges') != changes and isinstance(changes, list) and changes and isinstance(changes[-1], dict):
            reason = changes[-1].get('reason')
        left, right = a.get('marks', {}), b.get('marks', {})
        if not isinstance(left, dict) or not isinstance(right, dict):
            raise ValueError('Invalid marks.')
        for question in left.keys() | right.keys():
            lm, rm = left.get(question, {}), right.get(question, {})
            if not isinstance(lm, dict) or not isinstance(rm, dict):
                raise ValueError('Invalid marks.')
            for student in lm.keys() | rm.keys():
                previous, current = lm.get(student), rm.get(student)
                if previous == current:
                    continue
                explanation = reason or (current.get('changeReason') if isinstance(current, dict) else None)
                if explanation is not None and (not isinstance(explanation, str) or len(explanation) > 10000):
                    raise ValueError('Invalid change reason.')
                db.execute('INSERT INTO mark_history(scope,exam,question,student,actor_id,actor_name,at,revision,before_json,after_json,reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)', (workspace,exam,question,student,actor.get('id'),actor.get('name','Demo marker'),at,revision,json.dumps(previous),json.dumps(current),explanation))


def read_history(handler):
    query = parse_qs(urlsplit(handler.path).query)
    try:
        values = [query[key][0] for key in ('examId','questionId','studentId')]
        cursor = int(query.get('before', ['9223372036854775807'])[0])
        with database(handler) as db:
            schema(db)
            rows = db.execute('SELECT id,actor_id,actor_name,at,revision,before_json,after_json,reason FROM mark_history WHERE scope=? AND exam=? AND question=? AND student=? AND id<? ORDER BY id DESC LIMIT 101', (scope(handler),*values,cursor)).fetchall()
        entries = [dict(id=r[0],actorId=r[1],actorName=r[2],at=r[3],revision=r[4],before=json.loads(r[5]),after=json.loads(r[6]),reason=r[7]) for r in rows[:100]]
        handler.send_json(200, {'entries':entries,'next':entries[-1]['id'] if len(rows)>100 else None})
    except (KeyError,ValueError):
        handler.send_json(422, {'message':'Choose an exam, question and student.'})
    except (OSError,sqlite3.Error):
        handler.send_json(503, {'message':'Marking history is unavailable. Retry later.'})
