# Local AI fix recommendations

After sign-in and exam loading, the app automatically queues every nonblank Coding/Function response for correction through the Python API on this computer. It processes one response at a time and shows an overall progress bar with checked responses, the total and a percentage. Marking pages reuse these results. You can pause/resume preparation; if model setup is missing, the queue waits and resumes once the model is ready. **Review AI correction** opens the prepared comparison; **Generate again** can request another suggestion with a marker comment. The model suggests minimal Python syntax repairs. It does not correct logical errors, execute submissions, or assign marks. Prepared results are kept in memory for the current session, separately from submitted answers and marks.

The model is `ZhixinYin/qwen2.5-coder-syntax-repair`, pinned at `e99df9cdf2d6657fbfc4f8c2288411ff0dd67e87`. The Python API loads the model once at startup and reuses it for all fixes. A valid Python response still returns without inference. The original response stays unchanged, and recommendations are compared with a coloured diff.

## Running

From `frontend/`, run `npm run dev`. It automatically selects `../.venv-ai/bin/python` when present (Windows: `../.venv-ai/Scripts/python.exe`). Otherwise it uses Python from PATH. `PYTHON` can override this choice. Both services stop with Ctrl+C. The model is released on shutdown; its downloaded cache stays on disk for the next start. Closing a browser tab or the AI review dialog does not stop the local service.

The project's `.ai-model-cache/` holds the downloaded weights. The environment and cache are excluded from Git. Model weights can be downloaded during setup; student answers are processed locally and never sent to Hugging Face. Cached inference works offline.

## Setup on another computer

Double-click `Setup-macOS.command` or `Setup-Windows.cmd` in the project root. They download Python, Node.js and the app dependencies. See [new laptop setup](../../setup/README.md), including Intel Mac compatibility.

Open the demo or create/sign in to a coordinator account. In **Local AI setup** on the dashboard or in **User settings**, choose **Download AI model**. The app shows actual byte progress, pause/resume and retry, verifies the files, then loads the model. Manual marking remains available throughout setup. The API uses cached files for inference; model downloads happen only through this explicit setup action.

## Options

| Variable | Purpose |
| --- | --- |
| `AI_REPAIR_ENABLED=0` | Disable model inference; syntax checks still work |
| `AI_REPAIR_ENABLED=1` | Enable inference even when the local cache is not present |
| `AI_MODEL_ID` / `AI_MODEL_REVISION` | Choose another local checkpoint and pinned 40-character commit revision |
| `AI_MODEL_DEVICE` | `auto`, `cpu`, `mps`, `cuda`, or `rocm` |

The API enables inference only when a complete local snapshot is present, or when explicitly enabled in the local configuration. Startup preloads an installed model. First-time downloads happen through the interface while the API remains available. Only one download and one generation can run at a time. Model-loading errors leave manual marking usable and appear in the setup panel.

Generation has a 60-second time budget and a 512-token output limit. The browser waits up to two minutes and ignores late replies after closing the dialog. Ctrl+C releases the shared model and pauses any active download; the launcher allows up to three minutes for orderly cleanup. Partial model files stay on disk for resume.

Downloads include the model's `chat_template.jinja`. A copy from the pinned
checkpoint is bundled here to support older offline caches that omitted it.
Only a measured context-window overflow is reported as an input-length error;
other inference failures are reported as model errors.

A parseable recommendation is review evidence, not proof of preserved behaviour or correctness. Click **Run recommendation tests** in the review dialog to execute configured cases separately in Docker; **Run original tests** remains on the answer page. Neither runs automatically. See [runner setup](../../auto_marking/test_runner/README.md). The human marker makes the final marking decision separately.
