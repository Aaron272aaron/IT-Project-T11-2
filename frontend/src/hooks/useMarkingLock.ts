import { useEffect, useState } from "react";
import { markingLock, targetKey, type AnswerTarget, type Lease } from "../api/markingLocks";

// Fail closed during acquisition, network failures and lease expiry.
export function useMarkingLock(target: AnswerTarget, enabled: boolean, refresh: () => Promise<void>) {
  const key = targetKey(target);
  const [state, setState] = useState<{key: string; lease: Lease; error: string}>({key: "", lease: {editable: false}, error: ""});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false, token: string | undefined, timer: ReturnType<typeof setTimeout>;
    let expiry: ReturnType<typeof setTimeout>;
    const publish = (lease: Lease, error = "") => { if (!disposed) setState({key, lease, error}); };
    async function update(action: "acquire" | "renew" | "inspect") {
      try {
        const lease = await markingLock(target, action, token);
        if (disposed) {
          if (lease.token) void markingLock(target, "release", lease.token).catch(() => {});
          return;
        }
        if (lease.editable) {
          token = lease.token;
          if (action === "acquire") await refresh();
          if (disposed) { if (token) void markingLock(target, "release", token).catch(() => {}); return; }
          clearTimeout(expiry);
          expiry = setTimeout(() => publish({editable: false}, "Marking lock expired. Reopen this answer before saving."), Math.max(0, (lease.expiresAt! * 1000) - Date.now()));
        }
        publish(lease);
        timer = setTimeout(() => void update(lease.editable ? "renew" : "inspect"), 10000);
      } catch (error) {
        publish({editable: false}, error instanceof Error ? error.message : "Marking lock unavailable.");
      }
    }
    publish({editable: false});
    // Defer acquisition so React StrictMode cleanup cannot race its next mount.
    timer = setTimeout(() => void update("acquire"), 0);
    const release = () => { if (token) void markingLock(target, "release", token).catch(() => {}); };
    window.addEventListener("pagehide", release);
    return () => { disposed = true; clearTimeout(timer); clearTimeout(expiry); window.removeEventListener("pagehide", release); release(); };
  }, [key, enabled, refresh, retry]);
  const current: {lease: Lease; error: string} = state.key === key ? state : {lease: {editable: false}, error: ""};
  return { ...current, editable: !enabled || current.lease.editable, retry: () => setRetry(n => n + 1) };
}
