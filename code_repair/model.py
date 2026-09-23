"""Run the published syntax-repair model locally on CPU, Apple MPS, or ROCm.

This module never executes submitted code. The model is loaded once, on the
first invalid Python program passed to ``repair``.
"""

from __future__ import annotations

import ast
from dataclasses import asdict, dataclass
from threading import Lock
from typing import Any


MODEL_ID = "ZhixinYin/qwen2.5-coder-syntax-repair"
# A fixed revision makes the same code use the same checkpoint on both hosts.
MODEL_REVISION = "e99df9cdf2d6657fbfc4f8c2288411ff0dd67e87"

# Keep this aligned with the instruction in LoRA dataset/LoRA.jsonl.
INSTRUCTION = (
    "The following Python program does not parse. Make the smallest edit that\n"
    "allows it to parse.\n\n"
    "Preserve the program's behaviour exactly as written, including any logical\n"
    "errors. Do not correct wrong algorithms, wrong operators, wrong variable\n"
    "usage, off-by-one errors, or missing cases. Do not add, remove, or reorder\n"
    "statements beyond what is strictly required to make the code parse. Keep\n"
    "the original variable names. Change whitespace only where the indentation\n"
    "itself is the error.\n\n"
    "Output only the corrected code — no explanations, no markdown fences, no\n"
    "leading or trailing text. The result must differ from the input by as few\n"
    "tokens as possible."
)


def _syntax_error(code: str) -> str | None:
    try:
        ast.parse(code)
    except SyntaxError as error:
        return f"{error.msg} (line {error.lineno})"
    return None


def _choose_device(torch: Any, requested: str) -> tuple[str, str]:
    """Return (PyTorch device, human-readable backend)."""
    if requested not in {"auto", "cpu", "mps", "cuda", "rocm"}:
        raise ValueError("device must be auto, cpu, mps, cuda, or rocm")

    cuda_available = torch.cuda.is_available()
    mps_available = torch.backends.mps.is_available()
    has_rocm = bool(getattr(torch.version, "hip", None))

    if requested == "rocm":
        if not (cuda_available and has_rocm):
            raise RuntimeError(
                "ROCm PyTorch cannot see an AMD GPU. Install AMD's supported "
                "Windows PyTorch build and check torch.cuda.is_available()."
            )
        return "cuda", "rocm"
    if requested == "cuda":
        if not cuda_available:
            raise RuntimeError("PyTorch cannot see a CUDA/ROCm GPU.")
        return "cuda", "rocm" if has_rocm else "cuda"
    if requested == "mps":
        if not mps_available:
            raise RuntimeError("PyTorch MPS is unavailable on this Mac.")
        return "mps", "mps"
    if requested == "cpu":
        return "cpu", "cpu"
    if cuda_available:
        return "cuda", "rocm" if has_rocm else "cuda"
    if mps_available:
        return "mps", "mps"
    return "cpu", "cpu"


@dataclass(frozen=True)
class RepairResult:
    original_code: str
    suggested_code: str
    status: str  # already_valid, repaired, or invalid_generation
    syntax_error: str | None
    device: str | None
    model_id: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SyntaxRepairModel:
    """Reusable inference object; construct once per process for a future API."""

    def __init__(
        self,
        model_id: str = MODEL_ID,
        revision: str = MODEL_REVISION,
        device: str = "auto",
        max_new_tokens: int = 512,
    ) -> None:
        if max_new_tokens < 1:
            raise ValueError("max_new_tokens must be positive")
        if device not in {"auto", "cpu", "mps", "cuda", "rocm"}:
            raise ValueError("device must be auto, cpu, mps, cuda, or rocm")
        self.model_id = model_id
        self.revision = revision
        self.requested_device = device
        self.max_new_tokens = max_new_tokens
        self._model: Any = None
        self._tokenizer: Any = None
        self._torch: Any = None
        self._device: str | None = None
        self._backend: str | None = None
        self._load_lock = Lock()
        self._generate_lock = Lock()

    def load(self) -> None:
        """Download (first run) and load the checkpoint into the selected device."""
        if self._model is not None:
            return
        with self._load_lock:
            if self._model is not None:
                return

            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer

            device, backend = _choose_device(torch, self.requested_device)
            dtype = torch.float32 if device == "cpu" else torch.float16
            tokenizer = AutoTokenizer.from_pretrained(
                self.model_id, revision=self.revision
            )
            model = AutoModelForCausalLM.from_pretrained(
                self.model_id,
                revision=self.revision,
                dtype=dtype,
                low_cpu_mem_usage=True,
            ).to(device)
            model.eval()

            self._torch = torch
            self._tokenizer = tokenizer
            self._model = model
            self._device = device
            self._backend = backend

    def repair(self, code: str) -> RepairResult:
        """Suggest a minimal syntax repair without running the supplied code."""
        if not isinstance(code, str) or not code.strip():
            raise ValueError("code must be a non-empty string")

        original_error = _syntax_error(code)
        if original_error is None:
            return RepairResult(
                code, code, "already_valid", None, None, self.model_id
            )

        self.load()
        tokenizer = self._tokenizer
        messages = [{"role": "user", "content": f"{INSTRUCTION}\n\n{code}"}]
        prompt = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        encoded = tokenizer(prompt, return_tensors="pt", add_special_tokens=False)
        prompt_tokens = encoded["input_ids"].shape[-1]
        context_limit = self._model.config.max_position_embeddings
        if prompt_tokens + self.max_new_tokens > context_limit:
            raise ValueError(
                f"Input is too long: {prompt_tokens} prompt tokens plus "
                f"{self.max_new_tokens} output tokens exceed {context_limit}."
            )
        encoded = encoded.to(self._device)

        with self._generate_lock:
            with self._torch.inference_mode():
                generated = self._model.generate(
                    **encoded,
                    max_new_tokens=self.max_new_tokens,
                    do_sample=False,
                    pad_token_id=tokenizer.eos_token_id,
                )
        suggestion = tokenizer.decode(
            generated[0][prompt_tokens:], skip_special_tokens=True
        ).strip("\r\n")
        generation_error = (
            "Model returned empty code" if not suggestion.strip()
            else _syntax_error(suggestion)
        )
        return RepairResult(
            original_code=code,
            suggested_code=suggestion,
            status="repaired" if generation_error is None else "invalid_generation",
            syntax_error=generation_error,
            device=self._backend,
            model_id=self.model_id,
        )
