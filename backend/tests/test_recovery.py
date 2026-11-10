"""Recovery guarantees against disposable SQLite databases and authenticated HTTP."""
import copy
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import subprocess
import sys
from backend.tests import test_marking_locks as locks
from backend.api.exams import database_path
from auto_marking import results, jobs
from backend.backup import backup, restore, runtime_lock, AutomaticBackups
from backend.security.accounts import AccountStore


class HistoryTests(unittest.TestCase):
    setUp = locks.MarkingLockTests.setUp
    tearDown = locks.MarkingLockTests.tearDown
    request = locks.MarkingLockTests.request
    lock = locks.MarkingLockTests.lock
    save = locks.MarkingLockTests.save

    def history(self):
        return self.request(self.coordinator, '/api/mark-history?examId=exam&questionId=q&studentId=s')[1]['entries']

    def test_actor_before_after_reason_and_conflicts(self):
        token = self.lock()[1]['token']
        self.assertEqual(self.save(0, token)[0],200)
        first=self.history()[0]
        self.assertEqual(first['actorName'],'Alice'); self.assertIsNone(first['before']); self.assertEqual(first['after']['score'],1)
        self.assertEqual(self.save(1)[0],409)
        self.assertEqual(len(self.history()),1)
        self.lock(action='release',token=token)
        changed=copy.deepcopy(self.registry)
        changed['comp10001'][0]['marks']={'q':{'s':{'score':2,'comment':'Reviewed','changeReason':'Second review'}}}
        self.assertEqual(self.request(self.coordinator,'/api/exams',{'registry':changed,'revision':2})[0],200)
        row=self.history()[0]
        self.assertEqual((row['before']['score'],row['after']['score'],row['actorName'],row['reason']),(1,2,'Coordinator','Second review'))
        self.assertEqual(self.request(self.coordinator,'/api/exams',{'registry':changed,'revision':3})[0],200)
        self.assertEqual(len(self.history()),2)
        self.assertEqual(self.request(self.coordinator,'/api/exams',{'registry':{},'revision':4})[0],200)
        self.assertIsNone(self.history()[0]['after'])

    def test_result_restore_is_scoped_and_invalidated_when_suite_changes(self):
        path=self.server.exam_db_path
        account=self.server.account_store.workspace_id
        scope='workspace:'+account
        job={'runId':'a'*32,'questionKey':'canvas:3081194','codeDigest':'b'*64,'variant':'original','status':'completed','passed':1,'total':1,'cases':[]}
        results.save(path,scope,results.suite_version(job['questionKey']),job)
        with patch.dict(jobs._jobs,{},clear=True):
            self.assertEqual(self.request(self.users[0],'/api/test-runs/'+'a'*32),(200,job))
            url='/api/test-runs?questionKey=canvas:3081194&codeDigest='+('b'*64)+'&variant=original'
            self.assertEqual(self.request(self.users[0],url)[1]['result'],job)
            with patch.object(results,'suite_version',return_value='changed'):
                self.assertIsNone(self.request(self.users[0],url)[1]['result'])
            output = subprocess.check_output([sys.executable, '-c', 'import json,sys; from auto_marking.results import read; print(json.dumps(read(sys.argv[1],sys.argv[2],sys.argv[3])))', str(path), scope, 'a'*32], text=True)
            self.assertEqual(json.loads(output), job)
            self.assertIsNone(results.read(path,'other-workspace','a'*32))
            self.assertIsNone(results.read(path,scope,question=job['questionKey'],digest='different',variant='original'))
        job.update(runId='c'*32,status='running')
        results.save(path,scope,results.suite_version(job['questionKey']),job)
        self.assertEqual(self.request(self.users[0],'/api/test-runs/'+'c'*32)[1]['status'],'runner_error')

    def test_background_failure_is_saved_without_browser_polling(self):
        path=self.server.exam_db_path; scope='workspace:'+self.server.account_store.workspace_id
        with patch.object(jobs._pool,'submit'):
            job=jobs.create_run('canvas:3081194','print(1)','original',storage=(path,scope))
        with patch.object(jobs,'run_marking',return_value={'status':'runner_error','error':'unavailable'}):
            jobs._execute(job['runId'],'canvas:3081194','print(1)')
        with jobs._lock:
            jobs._jobs.pop(job['runId'])
        self.assertEqual(results.read(path,scope,job['runId'])['status'],'runner_error')


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.root=Path(self.temp.name)
        self.files={key:self.root/(key+'.sqlite3') for key in ('accounts','exams')}
        self.store=AccountStore(self.files['accounts'])
        with sqlite3.connect(self.files['exams']) as db:
            db.execute('CREATE TABLE exams(scope TEXT PRIMARY KEY, revision INTEGER, data TEXT)')
            db.execute("INSERT INTO exams VALUES ('workspace',1,'original')")
            db.execute('CREATE TABLE mark_history(id INTEGER, before_json TEXT)')
            db.execute("INSERT INTO mark_history VALUES (1,'previous mark')")
        self.directory=self.root/'backups'

    def tearDown(self): self.temp.cleanup()

    def test_pair_roundtrip_safety_copy_and_live_restore_rejected(self):
        snap=backup(self.files,self.directory)
        with sqlite3.connect(self.files['exams']) as db: db.execute("UPDATE exams SET data='changed'")
        with runtime_lock(self.files):
            with self.assertRaises(RuntimeError): restore(snap,self.files,self.directory)
        safety=restore(snap,self.files,self.directory)
        with sqlite3.connect(self.files['exams']) as db:
            self.assertEqual(db.execute('SELECT data FROM exams').fetchone()[0],'original')
            self.assertEqual(db.execute('SELECT count(*) FROM mark_history').fetchone()[0],1)
        with sqlite3.connect(safety/'exams.sqlite3') as db:
            self.assertEqual(db.execute('SELECT data FROM exams').fetchone()[0],'changed')

    def test_corrupt_backup_cannot_overwrite_databases(self):
        snap=backup(self.files,self.directory)
        (snap/'exams.sqlite3').write_bytes(b'broken')
        with self.assertRaises(ValueError): restore(snap,self.files,self.directory)
        with sqlite3.connect(self.files['exams']) as db:
            self.assertEqual(db.execute('SELECT data FROM exams').fetchone()[0],'original')

    def test_retention_preserves_manual_backups_and_automatic_worker(self):
        manual=backup(self.files,self.directory)
        for _ in range(9): backup(self.files,self.directory,automatic=True)
        self.assertTrue(manual.exists()); self.assertEqual(len(list(self.directory.glob('*/manifest.json'))),8)
        worker=AutomaticBackups(self.files,self.directory)
        with patch('backend.backup.backup') as create, patch.object(worker.stop_event,'wait',side_effect=lambda _: worker.stop_event.set()):
            worker.work(); create.assert_not_called()

    def test_restore_rollback_if_second_database_write_fails(self):
        from backend.backup import copy_database
        snap=backup(self.files,self.directory)
        with sqlite3.connect(self.files['exams']) as db: db.execute("UPDATE exams SET data='keep me'")
        def fail(source,destination):
            if source == snap/'exams.sqlite3': raise OSError('simulated disk error')
            return copy_database(source,destination)
        with patch('backend.backup.copy_database',side_effect=fail), self.assertRaises(OSError):
            restore(snap,self.files,self.directory)
        with sqlite3.connect(self.files['exams']) as db:
            self.assertEqual(db.execute('SELECT data FROM exams').fetchone()[0],'keep me')

    def test_automatic_first_snapshot_and_session_revocation(self):
        token, session=self.store.register({'name':'Backup owner','username':'backup','email':'backup@example.edu','password':'Synthetic password 123!'})
        worker=AutomaticBackups(self.files,self.directory)
        with patch.object(worker.stop_event,'wait',side_effect=lambda _: worker.stop_event.set()): worker.work()
        snapshot=next(self.directory.glob('*/manifest.json')).parent
        restore(snapshot,self.files,self.directory)
        self.assertIsNone(self.store.session(token))
