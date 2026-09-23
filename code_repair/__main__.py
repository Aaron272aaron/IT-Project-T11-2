"""Command-line smoke test: python -m code_repair --file broken.py."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .model import MODEL_ID, MODEL_REVISION, SyntaxRepairModel


def main() -> int:
    parser = argparse.ArgumentParser(description="Suggest a Python syntax repair")
    parser.add_argument("--file", type=Path, help="Python file to repair; else stdin")
    parser.add_argument("--output", type=Path, help="Save a valid suggestion here")
    parser.add_argument("--json", action="store_true", help="Print structured result")
    parser.add_argument(
        "--device", choices=("auto", "cpu", "mps", "cuda", "rocm"),
        default="auto",
    )
    parser.add_argument("--model", default=MODEL_ID)
    parser.add_argument("--revision", default=MODEL_REVISION)
    parser.add_argument("--max-new-tokens", type=int, default=512)
    args = parser.parse_args()

    try:
        code = args.file.read_text(encoding="utf-8") if args.file else sys.stdin.read()
        engine = SyntaxRepairModel(
            model_id=args.model,
            revision=args.revision,
            device=args.device,
            max_new_tokens=args.max_new_tokens,
        )
        result = engine.repair(code)
    except (OSError, ValueError, RuntimeError, ImportError) as error:
        print(f"Repair failed: {error}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
        if result.status == "already_valid":
            print(
                "Input already parses; the model was not loaded or downloaded.",
                file=sys.stderr,
            )
    else:
        print(result.suggested_code)
        print(
            f"status={result.status} device={result.device or 'not loaded'}",
            file=sys.stderr,
        )
        if result.syntax_error:
            print(result.syntax_error, file=sys.stderr)

    if args.output and result.status != "invalid_generation":
        args.output.write_text(result.suggested_code + "\n", encoding="utf-8")
    return 2 if result.status == "invalid_generation" else 0


if __name__ == "__main__":
    raise SystemExit(main())
