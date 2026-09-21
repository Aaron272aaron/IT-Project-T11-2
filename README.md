# IT Project T11 2

This repository currently contains two prototype modules:

- `marking/`: a Docker-based Python submission runner and pytest report interpreter.
- `Code Repairing Model/`: an experimental notebook and LoRA dataset for Python syntax repair.

## Local Python setup

Create and activate a virtual environment from the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Run the report interpreter:

```bash
python marking/interpret.py marking/out/report.json --cases marking/questions/q3/cases.yaml
```

## Docker marking runner

Build the marking image:

```bash
cd marking
docker build -t marking .
```

Run the sample question and submission:

```bash
./run.sh q3 s1
cd ..
python marking/interpret.py marking/out/report.json --cases marking/questions/q3/cases.yaml
```

Expected result for the current sample:

```text
All cases passed   (2/2 cases, 3/3 marks, ...)
```

## Code repairing notebook

`Code Repairing Model/Code_Fixing_Demo.ipynb` depends on machine-learning packages such as `torch` and `transformers`. Those dependencies are intentionally not included in the lightweight root `requirements.txt`, because they are large and should be installed only when working on the model experiment.

## React frontend

The Figma-based React prototype is in [`frontend/`](frontend/README.md). It includes workspace, member, settings, import and marking screens. The Python prototypes above remain separate; the frontend currently uses browser-session demo data.

```bash
cd frontend
npm ci
npm run dev
```

See [the frontend README](frontend/README.md) for the full page map, demo credentials, verification commands, and backend integration boundaries.
