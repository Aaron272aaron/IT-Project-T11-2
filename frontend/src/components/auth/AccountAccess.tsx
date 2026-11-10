import { useEffect, useState, type FormEvent } from "react";
import { accountRequest, type AccountUser } from "../../api/auth";
import { Badge, Button, Card, Field, Notice } from "../UI";

type AccessCode = {
  code: string;
  email: string;
  role: string | null;
  expiresAt: number;
  kind: "invite" | "reset";
};
export function AccountAccess() {
  const [accounts, setAccounts] = useState<AccountUser[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Tutor");
  const [target, setTarget] = useState("");
  const [issued, setIssued] = useState<AccessCode | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    void accountRequest<{ accounts: AccountUser[] }>("accounts")
      .then((value) => {
        if (active) setAccounts(value.accounts);
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function issue(event: FormEvent, kind: "invite" | "reset") {
    event.preventDefault();
    setBusy(true);
    setError("");
    setIssued(null);
    setCopied(false);
    try {
      setIssued(
        await accountRequest<AccessCode>(
          kind === "invite" ? "invite" : "reset-code",
          {
            email: kind === "invite" ? email.trim() : target,
            ...(kind === "invite" ? { role } : {}),
          },
        ),
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <Card
        title="Registered accounts"
        description="Roles are verified by the local server."
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Username</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>{account.email}</td>
                  <td>{account.username}</td>
                  <td>
                    <Badge>{account.role}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="settings-grid">
        <Card
          title="Invite an account"
          description="Choose who can join this local marking workspace."
        >
          <form onSubmit={(event) => void issue(event, "invite")}>
            <Field label="Invitation email">
              <input
                required
                type="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="Account role">
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <option>Tutor</option>
                <option>Coordinator</option>
              </select>
            </Field>
            <Button variant="primary" disabled={busy}>
              Create invitation
            </Button>
          </form>
        </Card>
        <Card
          title="Password recovery"
          description="Generate a one-time reset code for a registered account."
        >
          <form onSubmit={(event) => void issue(event, "reset")}>
            <Field label="Account to recover">
              <select
                required
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                <option value="">Choose an account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.email}>
                    {account.name} · {account.email}
                  </option>
                ))}
              </select>
            </Field>
            <Button disabled={busy || !target}>Create reset code</Button>
          </form>
        </Card>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {issued && (
        <Card
          title={
            issued.kind === "invite" ? "Invitation ready" : "Reset code ready"
          }
        >
          <Notice>
            Share this one-time code with {issued.email}.{" "}
            {issued.kind === "invite"
              ? "They enter it on Sign up."
              : "They enter it under Forgot password."}{" "}
            No email is sent by this app.
          </Notice>
          <Field label="One-time access code">
            <input
              readOnly
              value={issued.code}
              onFocus={(event) => event.target.select()}
            />
          </Field>
          <p className="helper">
            Expires {new Date(issued.expiresAt * 1000).toLocaleString("en-AU")}.
            Each code can be used once.
          </p>
          <Button
            onClick={() => {
              void navigator.clipboard
                .writeText(issued.code)
                .then(() => setCopied(true))
                .catch(() =>
                  setError("Select the code above and copy it manually."),
                );
            }}
          >
            {copied ? "Copied" : "Copy code"}
          </Button>
        </Card>
      )}
    </div>
  );
}
