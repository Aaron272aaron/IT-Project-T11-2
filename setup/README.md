# Set up AutoMarktic on a laptop

Copy the project source to a writable local folder, then double-click:

- **macOS:** `Setup-macOS.command`
- **Windows:** `Setup-Windows.cmd`

No preinstalled Python, Node.js, Git, Homebrew or winget is required. Use a supported 64-bit Windows or macOS system with an internet connection. Docker needs virtualization support; Windows may require a restart after WSL 2 is enabled. Administrator or installer prompts must be completed on the laptop. Allow roughly 10 GB of free disk space for app dependencies and the model, plus Docker's storage. Local AI works best with at least 16 GB RAM.

## What the runner does

1. Downloads uv from Astral and a managed Python 3.12 runtime.
2. Downloads a native Node.js 24 LTS archive and checks its SHA-256 against the official checksum list.
3. Creates the project's `.venv-ai/`, installs Python dependencies, and installs the interface dependencies. On Windows, it also installs the Microsoft C++ runtime when its required libraries are missing; complete that installer yourself.
4. Installs Docker Desktop and LibreOffice when missing. Windows gets a WSL 2 installation prompt when needed. You complete Docker's first-run licence screen yourself.
5. Builds the isolated marking image, starts the app, and opens your browser.

The runner uses Python/Node runtimes in `.runtime/`; it does not require editing your system PATH. Reopening the same launcher checks setup and starts the app. If Windows requests a restart, restart and run the same launcher again. A failed step stops setup with its error; it never reports full setup success before the tools are ready.

First-run dependency downloads show progress in the terminal. The model download happens in the app so its progress is visible in the interface.

## Download the AI model

1. Open **Explore demo workspace**, log in with the demo account, or sign in as a real coordinator.
2. In **Local AI setup** on the dashboard or under **User settings**, choose **Download AI model**.
3. Watch the percentage and downloaded/total bytes. **Pause download**, **Resume download** and **Retry model setup** are available when appropriate.
4. When the download finishes, the app checks the files and loads the model. **Local AI is ready** confirms that it can generate fixes.

The model is approximately 3 GB and comes from the pinned Hugging Face revision. Files are stored in `.ai-model-cache/`. Completed and incomplete downloads are retained for retry/resume. Reloading the page restores progress from the running backend. Closing the app pauses a transfer; start the app and resume it later. The download request contains no student answers, model URLs, executable paths or access credentials. Real-account tutors can see progress; coordinators and the enabled local demo can start/pause the download on the laptop. Demo access is disabled when `ALLOW_DEMO_API=0`.

Manual marking works while the model downloads. No model weights are included with the project, and the runner does not download them silently.

## Platform notes

- Apple Silicon Macs use native Python, Node and PyTorch. MPS is selected when available.
- Intel Macs use the last official Intel macOS PyTorch wheel (`2.2.2`) and compatible Transformers (`4.44.2`); inference uses CPU.
- Windows uses CPU inference. Windows x64 uses native Python; Windows 11 on ARM uses x64 Python through the OS's built-in emulation because PyTorch has no native Windows ARM wheel. Node and Docker installers match the laptop's native processor. GPU drivers are not required. Optional CUDA/ROCm configurations remain advanced manual setup.
- Docker supports specific OS versions and hardware; check its current [macOS](https://docs.docker.com/desktop/setup/install/mac-install/) or [Windows](https://docs.docker.com/desktop/setup/install/windows-install/) requirements. Windows on ARM Docker support may have additional vendor limitations.

The macOS bootstrap was tested in a clean temporary project with only OS tools on PATH: it downloaded Python/Node, installed dependencies, reopened successfully and built the app. Intel Mac and Windows x64 Python dependencies were verified to resolve to binary wheels; Windows ARM uses that x64 Python dependency set. Platform selection, paths, checksum rejection and restart behavior have automated tests. The interface was tested on macOS with synthetic downloads. Full fresh-OS Docker/LibreOffice installation and Windows execution still need target-laptop testing.

## Optional commands

From the project root, once Python is available:

```bash
python3 setup/runner.py --plan
```

This prints the installation plan without downloading anything. The OS launchers still need to obtain uv/Python before they can run a Python plan.

Pass `--skip-extras` to the launcher to set up the interface and local AI dependencies without Docker or LibreOffice. Automated tests and Word preview will then need those tools separately. `--setup-only` installs the selected tools without opening the app.

For developers with dependencies already installed, `cd frontend` followed by `npm run dev` still works. Press **Ctrl+C** to stop the app and release its AI memory.

## Sharing the source

Share the source files and the two launchers. Exclude `.runtime/`, `.venv-ai/`, `.ai-model-cache/`, `frontend/node_modules/`, generated reports, and private files under `backend/data/private/`. Those folders are machine-specific or private. Setup recreates dependencies on the target laptop.

## Download sources

- [Astral uv installer](https://docs.astral.sh/uv/getting-started/installation/) and [managed Python](https://docs.astral.sh/uv/guides/install-python/)
- [Node.js downloads](https://nodejs.org/en/download)
- [Docker Desktop installation](https://docs.docker.com/desktop/setup/install/)
- [LibreOffice downloads](https://www.libreoffice.org/download/)
- [Hugging Face download and progress API](https://huggingface.co/docs/huggingface_hub/package_reference/file_download)

- [Microsoft C++ runtime downloads](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
