"""Contract checks that do not download or execute the model."""

import contextlib
import unittest
from types import SimpleNamespace

from ai_tools.code_repair import SyntaxRepairModel
from ai_tools.code_repair.model import _choose_device, ContextLimitExceeded


class FakeEncoding(dict):
    def to(self, device):
        return self


class FakeTokenizer:
    eos_token_id = 1

    def __init__(self, response):
        self.response = response

    def apply_chat_template(self, messages, **kwargs):
        self.messages = messages
        assert "Make the smallest edit" in messages[0]["content"]
        return "prompt"

    def __call__(self, prompt, **kwargs):
        return FakeEncoding(input_ids=SimpleNamespace(shape=(1, 1)))

    def decode(self, ids, **kwargs):
        return self.response


class FakeModel:
    config = SimpleNamespace(max_position_embeddings=32768)

    def generate(self, **kwargs):
        return [[0, 1]]


class RepairTests(unittest.TestCase):
    def test_valid_code_skips_model_loading(self):
        engine = SyntaxRepairModel()
        result = engine.repair("x = 1\n")
        self.assertEqual(result.status, "already_valid")
        self.assertIsNone(engine._model)

    def test_repair_and_invalid_generation_are_distinct(self):
        engine = SyntaxRepairModel()
        engine._model = FakeModel()
        engine._torch = SimpleNamespace(inference_mode=contextlib.nullcontext)
        engine._device = "cpu"
        engine._backend = "cpu"
        engine._tokenizer = FakeTokenizer("x = 1")
        self.assertEqual(engine.repair("x = ").status, "repaired")

        engine._tokenizer.response = "x = "
        self.assertEqual(engine.repair("x = ").status, "invalid_generation")
        engine._tokenizer.response = ""
        self.assertEqual(engine.repair("x = ").status, "invalid_generation")

    def test_rocm_uses_pytorch_cuda_device(self):
        torch = SimpleNamespace(
            cuda=SimpleNamespace(is_available=lambda: True),
            backends=SimpleNamespace(mps=SimpleNamespace(is_available=lambda: False)),
            version=SimpleNamespace(hip="7.2"),
        )
        self.assertEqual(_choose_device(torch, "rocm"), ("cuda", "rocm"))
        torch.version.hip = None
        with self.assertRaises(RuntimeError):
            _choose_device(torch, "rocm")

    def test_context_overflow_has_its_own_error(self):
        engine = SyntaxRepairModel()
        engine._model = FakeModel()
        engine._model.config = SimpleNamespace(max_position_embeddings=512)
        engine._tokenizer = FakeTokenizer("x = 1")
        with self.assertRaises(ContextLimitExceeded):
            engine.repair("x = ")

    def test_marker_guidance_is_in_the_prompt_and_source_is_preserved(self):
        engine = SyntaxRepairModel()
        engine._model = FakeModel()
        engine._torch = SimpleNamespace(inference_mode=contextlib.nullcontext)
        engine._device = "cpu"
        engine._backend = "cpu"
        engine._tokenizer = FakeTokenizer("x = 1")
        source = "x = "
        comment = "Fix the incomplete assignment on line 1."
        result = engine.repair(source, comment=comment)
        prompt = engine._tokenizer.messages[0]["content"]
        self.assertIn(comment, prompt)
        self.assertIn("including any logical", prompt)
        self.assertTrue(prompt.endswith(source))
        self.assertEqual(result.original_code, source)
        self.assertEqual(result.status, "repaired")


if __name__ == "__main__":
    unittest.main()

class LaptopCompatibilityTests(unittest.TestCase):
    def test_old_download_gets_bundled_template_but_existing_template_is_preserved(self):
        from unittest.mock import Mock, patch
        from ai_tools.code_repair import model as module
        for existing in (None, "checkpoint template"):
            with self.subTest(existing=existing):
                torch = Mock(float32='float32', float16='float16')
                torch.get_num_threads.return_value = 4
                tokenizer = Mock(chat_template=existing)
                transformers = SimpleNamespace(
                    __version__='5.14.1',
                    AutoTokenizer=Mock(from_pretrained=Mock(return_value=tokenizer)),
                    AutoModelForCausalLM=Mock(),
                )
                with patch.dict('sys.modules', {'torch': torch, 'transformers': transformers}), patch.object(module, '_choose_device', return_value=('cpu', 'cpu')):
                    SyntaxRepairModel().load()
                if existing:
                    self.assertEqual(tokenizer.chat_template, existing)
                else:
                    self.assertIn('<|im_start|>', tokenizer.chat_template)
                    self.assertIn('add_generation_prompt', tokenizer.chat_template)

    def test_model_loader_supports_older_intel_mac_and_current_transformers(self):
        from unittest.mock import Mock, patch
        from ai_tools.code_repair import model as module
        for version, argument in [('4.44.2', 'torch_dtype'), ('5.14.1', 'dtype')]:
            with self.subTest(version=version):
                torch = Mock(float32='float32', float16='float16')
                torch.get_num_threads.return_value = 4
                tokenizer, factory = Mock(), Mock()
                transformers = SimpleNamespace(__version__=version, AutoTokenizer=tokenizer, AutoModelForCausalLM=factory)
                with patch.dict('sys.modules', {'torch': torch, 'transformers': transformers}), patch.object(module, '_choose_device', return_value=('cpu', 'cpu')):
                    engine = SyntaxRepairModel()
                    engine.load()
                    self.assertEqual(factory.from_pretrained.call_args.kwargs[argument], 'float32')
                    self.assertNotIn('dtype' if argument == 'torch_dtype' else 'torch_dtype', factory.from_pretrained.call_args.kwargs)
