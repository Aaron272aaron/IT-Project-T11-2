# AI tools

All local AI source code is grouped here.

| Folder / file | Contents |
| --- | --- |
| [`code_repair/`](code_repair/README.md) | Local Qwen model, Python syntax repair and model dependencies |
| `ai_recommendation.py` | Validate source code, coordinate inference and release the model on shutdown |
| `model_download.py` | Download the pinned model with byte progress, pause/resume and integrity checks |

HTTP routes remain in `backend/api/ai.py`; interface controls remain in `frontend/`. Integration tests live in `backend/tests/test_ai_api.py`, `test_ai_lifecycle.py` and `test_code_repair.py`.

From the project root, import the model with `from ai_tools.code_repair import SyntaxRepairModel`. See [model setup](code_repair/README.md) for installation and options. The existing Python environment and downloaded weights remain in `.venv-ai/` and `.ai-model-cache/` at the project root.

New laptops can use the [Windows/macOS setup runners](../setup/README.md). Download the model explicitly from **Local AI setup** in the app.
