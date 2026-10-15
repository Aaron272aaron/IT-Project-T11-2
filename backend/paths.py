"""Stable project paths shared by the API, services and preparation scripts."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DATA = PROJECT_ROOT / "backend/data"
SAMPLE_INPUTS = PROJECT_ROOT / "data/samples"

AI_TOOLS = PROJECT_ROOT / "ai_tools"
AUTO_MARKING = PROJECT_ROOT / "auto_marking"
MARKING_DIR = AUTO_MARKING / "test_runner"
