import { useState, type FormEvent } from "react";
import type { Member } from "../../models/domain";
import { Button, Card, Field } from "../UI";

// Presentation codes stay in this component and never reach account services.
export function DemoPasswordRecovery({ members }: { members: Member[] }) {
  const [target, setTarget] = useState("");
  const [issued, setIssued] = useState<{ code: string; name: string; email: string; expires: number } | null>(null);
  const [message, setMessage] = useState("");
  function generate(event: FormEvent) {
    event.preventDefault();
    const member = members.find((item) => item.id === target);
    if (!member) return;
    setIssued({ code: `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, name: member.name, email: member.email, expires: Date.now() + 30 * 60 * 1000 });
    setMessage("");
  }
  return (
    <Card title="Password recovery" description="Generate a password reset code for a workspace member.">
      <form onSubmit={generate}>
        <Field label="Account to recover">
          <select required value={target} onChange={(event) => { setTarget(event.target.value); setIssued(null); setMessage(""); }}>
            <option value="">Choose an account</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}
          </select>
        </Field>
        <Button variant="primary" disabled={!members.some((member) => member.id === target)}>Create reset code</Button>
      </form>
      {issued && <div className="stack">
        <h3>Reset code ready</h3>
        <p>Share this code with {issued.name} ({issued.email}).</p>
        <Field label="One-time access code"><input readOnly value={issued.code} onFocus={(event) => event.target.select()} /></Field>
        <p className="helper">Expires {new Date(issued.expires).toLocaleString("en-AU")}.</p>
        <Button onClick={() => { void navigator.clipboard.writeText(issued.code).then(() => setMessage("Copied")).catch(() => setMessage("Select the code above and copy it manually.")); }}>Copy code</Button>
        {message && <p role="status">{message}</p>}
      </div>}
      <p className="helper">Demo code · No email is sent and real account passwords are unchanged.</p>
    </Card>
  );
}
