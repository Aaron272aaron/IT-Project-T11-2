import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api/auth";
import { Button } from "../UI";
type Mark = {
  score: number;
  comment?: string;
  categoryDescription?: string;
} | null;
type Entry = {
  id: number;
  actorName: string;
  at: string;
  before: Mark;
  after: Mark;
  reason: string | null;
};
export function MarkHistory({
  examId,
  questionId,
  studentId,
  version,
}: {
  examId: string;
  questionId: string;
  studentId: string;
  version: string;
}) {
  const epoch = useRef(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setEntries([]);
    setNext(null);
    setError("");
  }, [examId, questionId, studentId, version]);
  useEffect(() => {
    epoch.current++;
    const controller = new AbortController();
    void load(null, controller.signal);
    return () => {
      epoch.current++;
      controller.abort();
    };
  }, [examId, questionId, studentId, version, retry]);
  async function load(before: number | null, signal?: AbortSignal) {
    const token = epoch.current;
    const current = () => !signal?.aborted && token === epoch.current;
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({
        examId,
        questionId,
        studentId,
        ...(before ? { before: String(before) } : {}),
      });
      const response = await apiFetch(`/api/mark-history?${query}`, { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "History unavailable.");
      if (current()) {
        setEntries((old) =>
          before ? [...old, ...data.entries] : data.entries,
        );
        setNext(data.next);
      }
    } catch (reason) {
      if (current()) setError((reason as Error).message);
    } finally {
      if (current()) setBusy(false);
    }
  }
  return (
    <details className="mark-history">
      <summary>Marking history</summary>
      <p className="helper">
        Changes recorded from this version onward. Earlier edits cannot be
        reconstructed.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <Button onClick={() => setRetry((x) => x + 1)}>Retry history</Button>
        </p>
      )}
      {busy && <p role="status">Loading history…</p>}
      {!busy && !error && !entries.length && <p>No recorded changes.</p>}
      <ol>
        {entries.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.actorName}</strong> ·{" "}
            {new Date(entry.at).toLocaleString()}
            <p>
              Score: {entry.before?.score ?? "Unmarked"} →{" "}
              {entry.after?.score ?? "Removed"}
            </p>
            <p className="preserve">
              Previous comment: {entry.before?.comment || "—"}
            </p>
            <p className="preserve">
              New comment: {entry.after?.comment || "—"}
            </p>
            <p className="preserve">
              Previous rubric option: {entry.before?.categoryDescription || "—"}
            </p>
            <p className="preserve">
              New rubric option: {entry.after?.categoryDescription || "—"}
            </p>
            {entry.reason && <p className="preserve">Reason: {entry.reason}</p>}
          </li>
        ))}
      </ol>
      {next && (
        <Button disabled={busy} onClick={() => void load(next)}>
          Load older changes
        </Button>
      )}
    </details>
  );
}
