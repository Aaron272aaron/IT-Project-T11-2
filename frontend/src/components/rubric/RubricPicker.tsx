import { useEffect, useRef, useState } from "react";
import { prepareRubric } from "../../services/rubricDocument";
import type { ExamAttachment } from "../../models/exams";

// Keep the original document as an attachment; do not infer scoring rules.
// The limit is deliberately small because this prototype uses sessionStorage.
export const MAX_RUBRIC_BYTES = 2 * 1024 * 1024;
export function RubricPicker({
  onChange,
  onBusy,
}: {
  onChange: (file: ExamAttachment | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const version = useRef(0);
  const reader = useRef<FileReader | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      version.current++;
      reader.current?.abort();
      request.current?.abort();
    },
    [],
  );

  async function choose(file?: File) {
    // Ignore an older read if a new file is selected before it completes.
    const token = ++version.current;
    reader.current?.abort();
    request.current?.abort();
    setError("");
    setName("");
    onChange(null);
    onBusy(false);
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setError("Choose a Word document (.docx) or PDF, not a CSV.");
      return;
    }
    if (!file.size || file.size > MAX_RUBRIC_BYTES) {
      setError("Choose a non-empty rubric file no larger than 2 MB.");
      return;
    }
    onBusy(true);
    try {
      // Check the basic file signature without parsing or rewriting the document.
      const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (token !== version.current) return;
      const pdf =
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46 &&
        bytes[4] === 0x2d;
      const docx =
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        bytes[2] === 3 &&
        bytes[3] === 4;
      const matches = /\.pdf$/i.test(file.name) ? pdf : docx;
      if (!matches)
        throw new Error(
          "The file contents do not match its Word/PDF extension. Choose the original document.",
        );
      const content = await new Promise<string>((resolve, reject) => {
        const next = new FileReader();
        reader.current = next;
        next.onload = () => resolve(String(next.result));
        next.onerror = () =>
          reject(
            new Error("The rubric file could not be read. Please try again."),
          );
        next.onabort = () => reject(new Error("Read cancelled."));
        next.readAsDataURL(file);
      });
      if (token !== version.current) return;
      // Force a download-only MIME type while preserving every original byte.
      const dataUrl =
        "data:application/octet-stream;base64," + content.split(",")[1];
      const controller = new AbortController();
      request.current = controller;
      const timer = setTimeout(() => controller.abort(), 75_000);
      let preview;
      try {
        preview = await prepareRubric(file, dataUrl, controller.signal);
      } finally {
        clearTimeout(timer);
      }
      if (token !== version.current) return;
      onChange({
        ...preview,
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        dataUrl,
      });
      setName(file.name);
    } catch (reason) {
      if (token === version.current)
        setError(
          reason instanceof Error ? reason.message : "Could not read rubric.",
        );
    } finally {
      if (token === version.current) onBusy(false);
    }
  }
  return (
    <div className="rubric-picker">
      <label className="field">
        <span>Rubric file (optional)</span>
        <input
          type="file"
          aria-label="Rubric file (optional)"
          accept=".pdf,.docx"
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <p className="helper">
        Word or PDF · Up to 2 MB · You can add or replace it later.
      </p>
      {name && (
        <p className="attachment-name">
          Selected: {name}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => void choose()}
          >
            Remove selection
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
