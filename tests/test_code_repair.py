"""Contract checks that do not download or execute the model."""

import contextlib
import unittest
from types import SimpleNamespace

from code_repair import SyntaxRepairModel
from code_repair.model import _choose_device


class FakeEncoding(dict):
    def to(self, device):
        return self


class FakeTokenizer:
    eos_token_id = 1

    def __init__(self, response):
        self.response = response

    def apply_chat_template(self, messages, **kwargs):
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


if __name__ == "__main__":
    unittest.main()
