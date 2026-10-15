#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
project_dir="$PWD"
export UV_PYTHON_INSTALL_DIR="$project_dir/.runtime/python"
export UV_PYTHON_BIN_DIR="$project_dir/.runtime/bin"
export UV_CACHE_DIR="$project_dir/.runtime/uv-cache"
export UV_UNMANAGED_INSTALL="$project_dir/.runtime/uv"
mkdir -p "$project_dir/.runtime"
trap 'code=$?; if [ "$code" -ne 0 ]; then echo "Setup stopped. Read the message above, then run this file again."; read -r -p "Press Return to close…"; fi' EXIT
if [ ! -x "$UV_UNMANAGED_INSTALL/uv" ]; then
  echo "Downloading the Python setup tool…"
  curl --proto '=https' --tlsv1.2 --fail --location --retry 3 https://astral.sh/uv/install.sh -o "$project_dir/.runtime/install-uv.sh"
  /bin/sh "$project_dir/.runtime/install-uv.sh"
fi
uv_bin="$UV_UNMANAGED_INSTALL/uv"
"$uv_bin" python install 3.12
python_bin="$("$uv_bin" python find --managed-python 3.12)"
"$python_bin" setup/runner.py --uv "$uv_bin" "$@"
