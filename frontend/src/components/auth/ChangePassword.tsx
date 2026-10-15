import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Button, Card, Field } from "../UI";
export function ChangePassword() {
  const auth = useAuth();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (password !== confirmation)
        throw new Error("The passwords do not match.");
      await auth.changePassword(current, password);
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }
  return (
    <Card
      title="Change password"
      description="Changing your password signs out every account session."
    >
      <form onSubmit={(event) => void submit(event)}>
        <Field label="Current password">
          <input
            required
            type="password"
            maxLength={128}
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </Field>
        <Field label="New account password">
          <input
            required
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field label="Confirm new account password">
          <input
            required
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <Button disabled={busy}>
          {busy ? "Changing password…" : "Change password"}
        </Button>
      </form>
    </Card>
  );
}
