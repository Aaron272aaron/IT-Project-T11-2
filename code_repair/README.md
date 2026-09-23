# Local syntax repair

This package loads [the published model](https://huggingface.co/ZhixinYin/qwen2.5-coder-syntax-repair) directly from Hugging Face. It uses the same Python code on macOS and Windows. PyTorch chooses Apple MPS on a supported Mac or ROCm on a supported AMD GPU. The first repair downloads the model; later calls use the local cache.

The model suggests **minimal Python syntax repairs only**. A parseable result is not proof that the program still behaves the same. Review the suggestion before using it. The package never runs submitted code.

For a first test, use a file containing `def greet()\n    print("hi")` (missing the colon). Code such as `a = aaaaaaa + 3` already parses, even if it would fail when executed. For parseable input, the result is `already_valid` and the model is not downloaded or loaded.

## macOS

From the repository root:

```sh
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install torch
python -m pip install -r code_repair/requirements.txt
python -c "import torch; print('MPS:', torch.backends.mps.is_available())"
python -m code_repair --device auto --file path/to/broken.py --json
```

An Apple Silicon Mac with MPS uses its GPU. Other Macs use CPU and need more memory. The checkpoint is FP16 on GPU and FP32 on CPU.

## AMD GPU on Windows

Use Windows 11, Python 3.12, a GPU listed in [AMD's Windows compatibility matrix](https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/compatibility/compatibilityrad/windows/windows_compatibility.html), and the matching driver. Install AMD's **Windows ROCm PyTorch wheels** using [AMD's current installation guide](https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/windows/install-pytorch.html). Do this before the remaining Python dependencies; ordinary CPU or CUDA PyTorch wheels will not use an AMD GPU here.

In PowerShell, from the repository root:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
# Follow AMD's linked guide here to install its ROCm PyTorch wheel.
python -m pip install -r code_repair/requirements.txt
python -c "import torch; print(torch.cuda.is_available(), torch.version.hip)"
python -m code_repair --device rocm --file path\to\broken.py --json
```

PyTorch calls a ROCm GPU `cuda`, so `torch.cuda.is_available()` should print `True` and `torch.version.hip` should have a version. `--device rocm` fails clearly if the AMD GPU is unavailable. `--device auto` can fall back to CPU.

## Use from a future API

```python
from code_repair import SyntaxRepairModel

repair_model = SyntaxRepairModel(device="auto")  # Reuse this object.
result = repair_model.repair("def greet()\n    print('hi')")
print(result.to_dict())
```

`result.status` is `already_valid`, `repaired`, or `invalid_generation`. Only `repaired` has a model-generated, parseable suggestion. An API should return the suggestion for review rather than replace a student's answer automatically. One shared instance loads once and serializes generation when requests arrive concurrently.

The default checkpoint revision is pinned for repeatable results. Pass `--revision main` only when you intend to use a newer published version. Use `--max-new-tokens` for longer programs; the default is 512. The CLI returns exit code 2 when model output does not parse, and `--output` saves only a parseable result.

Run the checks without downloading the model with `python -m unittest discover -s tests -p test_code_repair.py`.
