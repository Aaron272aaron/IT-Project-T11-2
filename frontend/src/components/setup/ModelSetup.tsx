import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import {
  modelDownloadRequest,
  modelDownloadActive,
  downloadSize,
  type ModelDownloadStatus,
} from "../../api/modelDownload";
import { Button, Card } from "../UI";

export function ModelSetup({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const [status, setStatus] = useState<ModelDownloadStatus | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const alive = useRef(false);
  const refresh = useRef<(() => void) | null>(null);
  const signedIn = auth.mode === "account" || auth.mode === "demo";
  const canDownload =
    auth.mode === "demo" ||
    (auth.mode === "account" && auth.user?.role === "Coordinator");
  useEffect(() => {
    if (auth.mode === "anonymous") return;
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    let stopped = false;
    let version = 0;
    async function poll() {
      const requestVersion = ++version;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      // A stalled request must not stop polling forever.
      const timeout = setTimeout(() => current.abort(), 10_000);
      let active = false;
      try {
        const next = await modelDownloadRequest("status", current.signal);
        if (stopped || version !== requestVersion) return;
        setStatus(next);
        setError("");
        active = modelDownloadActive(next.status);
      } catch {
        if (!stopped && version === requestVersion)
          setError(
            "Cannot reach local AI setup. Keep the app runner open and retry.",
          );
      } finally {
        clearTimeout(timeout);
        if (!stopped && version === requestVersion)
          timer = setTimeout(() => void poll(), active ? 1000 : 10_000);
      }
    }
    refresh.current = () => {
      clearTimeout(timer);
      void poll();
    };
    void poll();
    return () => {
      alive.current = false;
      stopped = true;
      refresh.current = null;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [auth.mode, auth.user?.id]);

  async function act(action: "download" | "cancel") {
    setPending(true);
    setError("");
    try {
      const next = await modelDownloadRequest(
        action,
        AbortSignal.timeout(10_000),
      );
      if (alive.current) {
        setStatus(next);
        refresh.current?.();
      }
    } catch (reason) {
      if (alive.current) setError((reason as Error).message);
    } finally {
      if (alive.current) setPending(false);
    }
  }
  if (
    compact &&
    (!signedIn ||
      !status ||
      status.status === "ready" ||
      status.status === "disabled")
  )
    return null;
  const active = status && modelDownloadActive(status.status);
  const bytesKnown = !!status?.totalBytes;
  const determinate =
    bytesKnown &&
    ["downloading", "verifying", "ready"].includes(status!.status);
  return (
    <Card
      title="Local AI setup"
      description="Download the model once to generate AI code fixes on this laptop."
      className="model-setup"
    >
      {!signedIn ? (
        <p>Log in or open the demo workspace to set up the local AI model.</p>
      ) : (
        <>
          <p role="status">{status?.message ?? "Checking local AI setup…"}</p>
          {status && (active || status.totalBytes > 0) && (
            <div className="model-download-progress">
              <progress
                aria-label="AI model download progress"
                max={100}
                value={determinate ? status.percent : undefined}
              />
              <div className="model-progress-details">
                <strong>
                  {determinate
                    ? `${status.percent.toFixed(1)}%`
                    : status.status === "loading"
                      ? "Loading model…"
                      : "Preparing…"}
                </strong>
                {bytesKnown && (
                  <span>
                    {downloadSize(status.downloadedBytes)} /{" "}
                    {downloadSize(status.totalBytes)}
                  </span>
                )}
              </div>
              {status.filename && <p className="helper">{status.filename}</p>}
            </div>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {status?.status === "error" && (
            <p className="helper">
              Completed files are kept so you can retry without starting over.
            </p>
          )}
          {canDownload &&
            status &&
            !["ready", "disabled"].includes(status.status) && (
              <div className="form-actions">
                {active ? (
                  <Button
                    disabled={
                      pending ||
                      ["loading", "verifying"].includes(status.status)
                    }
                    onClick={() => void act("cancel")}
                  >
                    Pause download
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled={pending}
                    onClick={() => void act("download")}
                  >
                    {pending
                      ? "Starting…"
                      : status.status === "cancelled"
                        ? "Resume download"
                        : status.status === "error"
                          ? "Retry model setup"
                          : "Download AI model"}
                  </Button>
                )}
                {!active && (
                  <span className="helper">
                    About 3 GB · Internet required for the download
                  </span>
                )}
              </div>
            )}
          {!canDownload && status?.status !== "ready" && (
            <p className="helper">
              A coordinator needs to download the model on this laptop.
            </p>
          )}
          {error && (
            <Button onClick={() => refresh.current?.()}>
              Retry connection
            </Button>
          )}
          <p className="helper">
            You can keep marking while the model downloads. Student answers stay
            on this laptop.
          </p>
        </>
      )}
    </Card>
  );
}
