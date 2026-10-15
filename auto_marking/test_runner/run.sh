#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(dirname -- "$(dirname -- "$script_dir")")"
cd "$project_root"
exec python3 -m auto_marking.test_runner.execute "$@"
