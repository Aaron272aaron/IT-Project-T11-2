import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from backend.api.ai_cache import cached_review, read_reviews
from ai_tools.ai_recommendation import ModelUnavailable

class AiCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.server = SimpleNamespace(exam_db_path=Path(self.temp.name) / 'exams.sqlite3')
        self.handler = SimpleNamespace(server=self.server)
        self.code = 'def f()\n    return 1'
        self.payload = {'code': self.code, 'reviewKey': json.dumps(['w', 'exam/student', 'q', self.code])}
        self.result = {'status': 'repaired', 'originalCode': self.code, 'suggestedCode': 'def f():\n    return 1'}

    def test_reload_restores_without_running_model_and_retry_replaces_result(self):
        with patch('backend.api.ai_cache.suggest_fix', return_value=self.result) as model:
            self.assertEqual(cached_review(self.handler, self.payload), self.result)
            fresh = SimpleNamespace(server=self.server)
            self.assertEqual(cached_review(fresh, self.payload), self.result)
            self.assertEqual(model.call_count, 1)
            cached_review(fresh, {**self.payload, 'force': True, 'comment': 'Check colon'})
            self.assertEqual(model.call_count, 2)
            replies = []
            fresh.send_json = lambda status, body: replies.append((status, body))
            read_reviews(fresh)
            self.assertEqual(replies[0][1]['reviews'][0]['comment'], 'Check colon')

    def test_changed_source_and_different_workspace_do_not_reuse_results(self):
        with patch('backend.api.ai_cache.suggest_fix', return_value=self.result) as model:
            cached_review(self.handler, self.payload)
            account = SimpleNamespace(server=self.server, account={'workspaceId': 'another'})
            cached_review(account, self.payload)
            changed = self.code + '\n# changed'
            cached_review(self.handler, {'code': changed, 'reviewKey': json.dumps(['w', 'exam/student', 'q', changed])})
            self.assertEqual(model.call_count, 3)

    def test_unavailable_model_is_not_saved_as_completed(self):
        with patch('backend.api.ai_cache.suggest_fix', side_effect=ModelUnavailable('Offline')):
            with self.assertRaises(ModelUnavailable): cached_review(self.handler, self.payload)
        with patch('backend.api.ai_cache.suggest_fix', return_value=self.result) as model:
            cached_review(self.handler, self.payload)
            model.assert_called_once()

    def test_invalid_generation_is_saved_to_avoid_automatic_repeats(self):
        with patch('backend.api.ai_cache.suggest_fix', return_value={**self.result, 'status': 'invalid_generation'}) as model:
            cached_review(self.handler, self.payload)
            cached_review(self.handler, self.payload)
            model.assert_called_once()
