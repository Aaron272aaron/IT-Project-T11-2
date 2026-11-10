"""Convert an uploaded DOCX into a local, consistently paginated PDF."""
import base64
import io
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

MAX_RUBRIC_BYTES = 2 * 1024 * 1024


def convert_docx(content):
    # A ZIP signature alone does not prove that an upload is a Word document.
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            names = archive.namelist()
            if "word/document.xml" not in names or "[Content_Types].xml" not in names:
                raise ValueError("Choose a valid DOCX document.")
            if sum(item.file_size for item in archive.infolist()) > 50 * 1024 * 1024:
                raise ValueError("The expanded Word document is too large.")
    except zipfile.BadZipFile:
        raise ValueError("Choose a valid DOCX document.") from None
    executable = os.environ.get("SOFFICE_BIN") or shutil.which("soffice")
    if not executable:
        # Common macOS installations, including this development machine's bundled runtime.
        candidates = [
            Path("/Applications/LibreOffice.app/Contents/MacOS/soffice"),
            Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice",
        ]
        executable = next((str(path) for path in candidates if path.is_file() and os.access(path, os.X_OK)), None)
    if not executable:
        raise RuntimeError("DOCX preview requires LibreOffice. Install it and set SOFFICE_BIN, or upload an exported PDF.")
    # Fixed filenames and an isolated profile keep concurrent uploads separate.
    # The original bytes are never overwritten and all temporary files are removed.
    with tempfile.TemporaryDirectory(prefix="rubric-preview-") as directory:
        root = Path(directory)
        source = root / "rubric.docx"
        source.write_bytes(content)
        try:
            result = subprocess.run(
                [executable, "-env:UserInstallation=" + (root / "profile").as_uri(),
                 "--headless", "--convert-to", "pdf:writer_pdf_Export",
                 "--outdir", str(root), str(source)],
                capture_output=True, timeout=60, check=False,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError("Word preview timed out. Export the document to PDF and upload that file.") from None
        except OSError:
            raise RuntimeError("LibreOffice could not start. Check SOFFICE_BIN or upload a PDF.") from None
        pdf = root / "rubric.pdf"
        if result.returncode or not pdf.is_file():
            raise ValueError("Word could not be converted. Try exporting it to PDF first.")
        if pdf.stat().st_size > 8 * 1024 * 1024:
            raise ValueError("The converted PDF is too large. Upload a smaller PDF.")
        payload = pdf.read_bytes()
        if not payload.startswith(b"%PDF-"):
            raise ValueError("Word conversion did not produce a valid PDF.")
        return {"status": "ok", "pdf": base64.b64encode(payload).decode("ascii")}
