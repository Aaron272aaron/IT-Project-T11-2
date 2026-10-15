"""Real byte accounting, resume/cancel and incomplete-cache checks without weights."""
import json
import os
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from ai_tools import model_download as md


class DownloadTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {'AI_REPAIR_ENABLED': '1'})
        environment.start()
        self.addCleanup(environment.stop)
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        cache = patch.object(md, 'CACHE_DIR', self.root)
        cache.start()
        self.addCleanup(cache.stop)

    def test_empty_or_partial_cache_does_not_enable_ai(self):
        self.assertIsNone(md.cached_model_path())
        repo, revision = md.model_identity()
        folder = self.root / ('models--' + repo.replace('/', '--')) / 'snapshots' / revision
        folder.mkdir(parents=True)
        for name in ['config.json', 'tokenizer_config.json', 'tokenizer.json']:
            (folder / name).write_text('{}')
        self.assertIsNone(md.cached_model_path())
        (folder / 'model.safetensors').write_bytes(b'weights')
        self.assertEqual(md.cached_model_path(), folder)
        (folder / 'model.safetensors').unlink()
        (folder / 'model.safetensors.index.json').write_text(json.dumps({'weight_map': {'one': 'part1.safetensors', 'two': 'part2.safetensors'}}))
        (folder / 'part1.safetensors').write_bytes(b'one')
        self.assertIsNone(md.cached_model_path())
        (folder / 'part2.safetensors').write_bytes(b'two')
        self.assertEqual(md.cached_model_path(), folder)

    def test_progress_counts_resumed_bytes_and_small_files(self):
        files = [SimpleNamespace(rfilename=n, size=10, lfs=None) for n in ['config.json', 'tokenizer_config.json', 'tokenizer.json', 'model.safetensors', 'chat_template.jinja']]
        events = []
        def fake_download(repo, filename, **options):
            with options['tqdm_class'](total=10, initial=4, unit='B') as bar:
                bar.update(3)
                bar.update(3)
            local = self.root / filename
            local.write_bytes(b'1234567890')
            return str(local)
        with patch('huggingface_hub.HfApi') as api, patch('huggingface_hub.hf_hub_download', side_effect=fake_download), patch.object(md, 'cached_model_path', return_value=self.root), patch.object(md.shutil, 'disk_usage', return_value=SimpleNamespace(free=10**10)):
            api.return_value.model_info.return_value = SimpleNamespace(siblings=files)
            md.download_files(lambda **values: events.append(values), threading.Event())
        counts = [e['downloadedBytes'] for e in events if 'downloadedBytes' in e]
        self.assertIn(4, counts)
        self.assertIn(7, counts)
        self.assertEqual(counts[-1], 50)
        self.assertTrue(all(a <= b for a, b in zip(counts, counts[1:])))
        self.assertEqual(next(e['totalBytes'] for e in events if 'totalBytes' in e), 50)
        self.assertTrue((self.root / 'chat_template.jinja').is_file())

    def test_cancel_stops_before_downloading_files(self):
        cancelled = threading.Event()
        cancelled.set()
        files = [SimpleNamespace(rfilename=n, size=10, lfs=None) for n in ['config.json', 'tokenizer_config.json', 'model.safetensors']]
        with patch('huggingface_hub.HfApi') as api, patch('huggingface_hub.hf_hub_download') as download, patch.object(md.shutil, 'disk_usage', return_value=SimpleNamespace(free=10**10)):
            api.return_value.model_info.return_value = SimpleNamespace(siblings=files)
            with self.assertRaises(md.DownloadCancelled):
                md.download_files(Mock(), cancelled)
            download.assert_not_called()

    def test_one_download_runs_at_a_time_and_retry_is_available(self):
        manager = md.ModelDownload()
        entered, release = threading.Event(), threading.Event()
        def downloading(update, cancelled):
            entered.set()
            release.wait(3)
            raise md.DownloadCancelled()
        with patch.dict(os.environ, {'AI_REPAIR_ENABLED': '1'}), patch.object(md, 'download_files', side_effect=downloading):
            self.assertTrue(manager.start())
            self.assertTrue(entered.wait(1))
            self.assertFalse(manager.start())
            manager.cancel()
            release.set()
            manager.thread.join(3)
            self.assertEqual(manager.status()['status'], 'cancelled')
            self.assertTrue(manager.start())
            manager.thread.join(3)

    def test_loading_and_failure_never_claim_the_model_is_ready(self):
        manager = md.ModelDownload()
        states = []
        original = manager.update
        def record(**values):
            states.append(values.get('status'))
            original(**values)
        manager.update = record
        with patch.object(md, 'download_files'), patch('ai_tools.ai_recommendation.start_model', side_effect=RuntimeError('https://private.invalid/token')):
            manager.work()
        self.assertIn('loading', states)
        self.assertNotIn('ready', states)
        self.assertEqual(manager.status()['status'], 'error')
        self.assertNotIn('private', manager.status()['message'])

    def test_disabled_download_never_starts(self):
        manager = md.ModelDownload()
        with patch.dict(os.environ, {'AI_REPAIR_ENABLED': '0'}):
            with self.assertRaises(ValueError): manager.start()
            self.assertEqual(manager.status()['status'], 'disabled')


class ModelApiTests(unittest.TestCase):
    def setUp(self):
        import http.client
        from http.server import ThreadingHTTPServer
        from backend.api.server import ApiHandler
        from backend.security.accounts import AccountStore
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), ApiHandler)
        self.server.account_store = AccountStore(Path(self.directory.name) / 'accounts.sqlite3')
        self.server.allow_demo_api = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.connection_factory = http.client.HTTPConnection
        self.addCleanup(self.close)

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(3)

    def request(self, path, payload=None, headers=None):
        connection = self.connection_factory(*self.server.server_address, timeout=5)
        try:
            connection.request('GET' if payload is None else 'POST', path, None if payload is None else json.dumps(payload),
                               {'X-App-Request': 'AutoMarktic', 'Content-Type': 'application/json', **(headers or {})})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), json.loads(response.read())
        finally: connection.close()

    def test_real_account_roles_and_client_cannot_choose_a_model_or_path(self):
        with patch.object(md.model_download, 'start') as start:
            self.assertEqual(self.request('/api/ai/model')[0], 401)
            code, headers, session = self.request('/api/auth/register', {'name': 'Setup Owner', 'username': 'setupowner', 'email': 'setup@example.edu', 'password': 'Synthetic password 123!'})
            self.assertEqual(code, 201)
            account_headers = {'Cookie': headers['Set-Cookie'].split(';')[0], 'X-CSRF-Token': session['csrfToken']}
            self.assertEqual(self.request('/api/ai/model/download', {'modelId': '../../bad'}, account_headers)[0], 422)
            self.assertEqual(self.request('/api/ai/model/download', {}, {'Cookie': account_headers['Cookie']})[0], 403)
            start.assert_not_called()
            self.assertEqual(self.request('/api/ai/model/download', {}, account_headers)[0], 202)
            start.assert_called_once()
            _, _, invitation = self.request('/api/auth/invite', {'email': 'tutor@example.edu', 'role': 'Tutor'}, account_headers)
            _, tutor_cookie, tutor = self.request('/api/auth/register', {'name': 'Tutor', 'username': 'setuptutor', 'email': 'tutor@example.edu', 'password': 'Synthetic password 123!', 'inviteCode': invitation['code']})
            tutor_headers = {'Cookie': tutor_cookie['Set-Cookie'].split(';')[0], 'X-CSRF-Token': tutor['csrfToken']}
            self.assertEqual(self.request('/api/ai/model', headers=tutor_headers)[0], 200)
            self.assertEqual(self.request('/api/ai/model/download', {}, tutor_headers)[0], 403)
            self.assertEqual(start.call_count, 1)

    def test_local_demo_can_download_and_pause_but_cannot_manage_accounts(self):
        demo = {'X-Automarktic-Demo': '1', 'Origin': 'http://127.0.0.1:5173'}
        with patch.object(md.model_download, 'start') as start, patch.object(md.model_download, 'cancel') as cancel:
            self.assertEqual(self.request('/api/ai/model', headers=demo)[0], 200)
            self.assertEqual(self.request('/api/ai/model/download', {}, demo)[0], 202)
            self.assertEqual(self.request('/api/ai/model/cancel', {}, demo)[0], 202)
            start.assert_called_once()
            cancel.assert_called_once()
            self.assertEqual(self.request('/api/auth/accounts', headers=demo)[0], 401)
            self.assertEqual(self.request('/api/ai/model/download', {}, {**demo, 'X-App-Request': ''})[0], 403)
            with patch.dict(os.environ, {'APP_PUBLIC_ORIGIN': 'https://example.test'}):
                self.assertEqual(self.request('/api/ai/model/download', {}, {**demo, 'Origin': 'https://example.test'})[0], 403)
            self.server.allow_demo_api = False
            self.assertEqual(self.request('/api/ai/model/download', {}, demo)[0], 401)
            self.assertEqual(start.call_count, 1)
