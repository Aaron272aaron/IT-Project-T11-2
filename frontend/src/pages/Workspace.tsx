import { useState, type FormEvent } from "react";
import { useApp, go } from "../state";
import { type Workspace, type Member, type Role } from "../domain";
import {
  Header,
  Card,
  Button,
  Field,
  Badge,
  Modal,
  Empty,
} from "../components/UI";
export function WorkspaceForm({ create = false }: { create?: boolean }) {
  const { workspace, setData, notify } = useApp();
  const blank = {
    name: "",
    subject: "",
    year: "2026",
    period: "Semester 1",
    configuration: "None",
  };
  const [form, setForm] = useState(create ? blank : workspace);
  const change = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.subject.trim()) return;
    const clean = {
      ...form,
      name: form.name.trim(),
      subject: form.subject.trim(),
    };
    if (create) {
      const id = crypto.randomUUID();
      const newWorkspace: Workspace = {
        ...clean,
        id,
        members: [workspace.members.find((m) => m.id === "me")!],
      };
      setData((d) => ({
        ...d,
        workspaces: [...d.workspaces, newWorkspace],
        active: id,
        answers: { ...d.answers, [id]: [] },
      }));
      notify("Workspace created. Add members or import your first responses.");
      go("/dashboard");
    } else {
      setData((d) => ({
        ...d,
        workspaces: d.workspaces.map((w) =>
          w.id === workspace.id ? { ...w, ...clean } : w,
        ),
      }));
      notify("Workspace settings saved.");
    }
  }
  return (
    <>
      <Header
        crumb={`COMP10001 / ${create ? "Create workspace" : "Workspace settings"}`}
        title={create ? "Create workspace" : "Workspace settings"}
        subtitle={
          create
            ? "Set up a workspace for your subject and teaching team."
            : "Manage the details and configuration of your workspace."
        }
      />
      <div className="settings-grid">
        <Card
          title="Workspace details"
          description="Fields marked with * are required."
        >
          <form onSubmit={submit}>
            <Field label="Workspace name *">
              <input
                required
                maxLength={100}
                value={form.name}
                placeholder="e.g. COMP10001 · Semester 1, 2026"
                onChange={(e) => change("name", e.target.value)}
              />
            </Field>
            <Field label="Subject *">
              <input
                required
                value={form.subject}
                placeholder="e.g. Foundations of Computing"
                onChange={(e) => change("subject", e.target.value)}
              />
            </Field>
            <div className="two-cols">
              <Field label="Academic year *">
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  required
                  value={form.year}
                  onChange={(e) => change("year", e.target.value)}
                />
              </Field>
              <Field label="Teaching period">
                <select
                  value={form.period}
                  onChange={(e) => change("period", e.target.value)}
                >
                  <option>Semester 1</option>
                  <option>Semester 2</option>
                  <option>Summer term</option>
                </select>
              </Field>
            </div>
            <Field
              label="Configurations *"
              hint="A configuration can be connected when the backend is available."
            >
              <select
                value={form.configuration}
                onChange={(e) => change("configuration", e.target.value)}
              >
                <option>None</option>
              </select>
            </Field>
            <div className="form-actions">
              <Button
                type="button"
                onClick={() => {
                  if (create) go("/dashboard");
                  else {
                    setForm(workspace);
                    notify("Unsaved changes discarded.");
                  }
                }}
              >
                {create ? "Cancel" : "Discard changes"}
              </Button>
              <Button variant="primary">
                {create ? "Create workspace" : "Save changes"}
              </Button>
            </div>
            <p className="helper">
              {create
                ? "You will become the coordinator of this workspace."
                : "Changes apply to this workspace and its members."}
            </p>
          </form>
        </Card>
        <Card title={create ? "What happens next" : "Workspace information"}>
          {create ? (
            <ol className="steps-list">
              <li>
                <b>Your workspace is ready</b>
                <p>You become the subject coordinator.</p>
              </li>
              <li>
                <b>Bring your team together</b>
                <p>Add tutors and manage workspace members.</p>
              </li>
              <li>
                <b>Start marking</b>
                <p>Open an exam and import student answers.</p>
              </li>
            </ol>
          ) : (
            <>
              <Badge tone="success">Active</Badge>
              <dl className="details">
                <dt>Managed by</dt>
                <dd>Subject coordinator</dd>
                <dt>Workspace members</dt>
                <dd>{workspace.members.length} members</dd>
                <dt>Exams</dt>
                <dd>{workspace.id === "comp10001" ? 3 : 1}</dd>
                <dt>Academic period</dt>
                <dd>
                  {workspace.period}, {workspace.year}
                </dd>
              </dl>
              <Button onClick={() => go("/members")}>Manage members</Button>
              <p className="helper">
                Workspace access is managed by the subject coordinator.
              </p>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
export function Members() {
  const { workspace, setData, notify } = useApp();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("All roles");
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const members = workspace.members.filter(
    (m) =>
      (role === "All roles" || m.role === role) &&
      `${m.name} ${m.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  function remove(m: Member) {
    setData((d) => ({
      ...d,
      workspaces: d.workspaces.map((w) =>
        w.id === workspace.id
          ? { ...w, members: w.members.filter((x) => x.id !== m.id) }
          : w,
      ),
    }));
    setRemoving(null);
    setEditing(null);
    notify(`${m.name} removed from this demo workspace.`);
  }
  return (
    <>
      <Header
        crumb="COMP10001 / Workspace members"
        title="Workspace members"
        subtitle="Manage who can access and mark in this workspace."
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            + Add member
          </Button>
        }
      />
      <Card
        title="Members"
        description={`${workspace.members.length} members in this workspace`}
        className="table-card"
      >
        <div className="toolbar">
          <input
            aria-label="Search members"
            placeholder="Search by name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Filter member role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option>All roles</option>
            <option>Subject coordinator</option>
            <option>Tutor</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="person">
                      <span className="avatar">
                        {m.name
                          .split(" ")
                          .map((x) => x[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <div>
                        <b>
                          {m.name} {m.id === "me" && <Badge>You</Badge>}
                        </b>
                        <small>{m.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>{m.role}</td>
                  <td>
                    <Badge tone="success">Active</Badge>
                  </td>
                  <td className="right">
                    <Button
                      disabled={m.id === "me"}
                      onClick={() => setEditing(m)}
                    >
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!members.length && (
          <Empty title="No members found">
            <p>Try a different name, email or role.</p>
          </Empty>
        )}
        <p className="table-note">
          Only coordinators can manage workspace access. Member changes here are
          a local demo; no invitations are sent.
        </p>
      </Card>
      {editing && (
        <MemberDialog
          member={editing}
          onClose={() => setEditing(null)}
          onRemove={setRemoving}
        />
      )}
      {removing && (
        <Modal
          title="Remove workspace member?"
          onClose={() => setRemoving(null)}
        >
          <p>{removing.name} will be removed from this demo workspace.</p>
          <div className="form-actions">
            <Button onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => remove(removing)}>
              Remove member
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function MemberDialog({
  member,
  onClose,
  onRemove,
}: {
  member: Member | "new";
  onClose: () => void;
  onRemove: (m: Member) => void;
}) {
  const { workspace, setData, notify } = useApp();
  const [name, setName] = useState(member === "new" ? "" : member.name);
  const [email, setEmail] = useState(member === "new" ? "" : member.email);
  const [role, setRole] = useState<Role>(
    member === "new" ? "Tutor" : member.role,
  );
  const [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (
      workspace.members.some(
        (m) =>
          m.email.toLowerCase() === normalized &&
          (member === "new" || m.id !== member.id),
      )
    ) {
      setError("This email is already a workspace member.");
      return;
    }
    if (!name.trim()) return;
    const next: Member = {
      id: member === "new" ? crypto.randomUUID() : member.id,
      name: name.trim(),
      email: normalized,
      role,
    };
    setData((d) => ({
      ...d,
      workspaces: d.workspaces.map((w) =>
        w.id !== workspace.id
          ? w
          : {
              ...w,
              members:
                member === "new"
                  ? [...w.members, next]
                  : w.members.map((m) => (m.id === next.id ? next : m)),
            },
      ),
    }));
    notify(
      member === "new"
        ? "Demo member added. No invitation was sent."
        : "Member updated.",
    );
    onClose();
  }
  return (
    <Modal
      title={
        member === "new" ? "Add workspace member" : "Manage workspace member"
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <Field label="Full name *">
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email *">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option>Tutor</option>
            <option>Subject coordinator</option>
          </select>
        </Field>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          {member !== "new" && (
            <Button
              type="button"
              variant="danger-text"
              onClick={() => onRemove(member)}
            >
              Remove member
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary">
            {member === "new" ? "Add member" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function UserSettings() {
  const { data, setData, workspace, notify } = useApp();
  const [form, setForm] = useState(data.profile);
  function save(e: FormEvent) {
    e.preventDefault();
    setData((d) => ({
      ...d,
      profile: form,
      workspaces: d.workspaces.map((w) => ({
        ...w,
        members: w.members.map((m) =>
          m.id === "me" ? { ...m, name: form.name, email: form.email } : m,
        ),
      })),
    }));
    notify("Your profile preferences were saved for this session.");
  }
  return (
    <>
      <Header
        crumb="COMP10001 / User settings"
        title="User settings"
        subtitle="Manage your personal profile and preferences."
      />
      <div className="settings-grid">
        <Card
          title="Profile details"
          description="Fields marked with * are required."
        >
          <form onSubmit={save}>
            <Field label="Display name *">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Email *">
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <div className="two-cols">
              <Field label="Username">
                <input
                  required
                  value={form.username}
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                />
              </Field>
              <Field label="Language">
                <select
                  value={form.language}
                  onChange={(e) =>
                    setForm({ ...form, language: e.target.value })
                  }
                >
                  <option>English</option>
                </select>
              </Field>
            </div>
            <Field label="Time zone">
              <select
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              >
                <option>Australia/Melbourne</option>
                <option>Australia/Sydney</option>
                <option>UTC</option>
                <option>Asia/Shanghai</option>
              </select>
            </Field>
            <div className="form-actions">
              <Button
                type="button"
                onClick={() => {
                  setForm(data.profile);
                  notify("Unsaved changes discarded.");
                }}
              >
                Discard changes
              </Button>
              <Button variant="primary">Save changes</Button>
            </div>
            <p className="helper">
              These preferences apply to your account in this demo session.
            </p>
          </form>
        </Card>
        <Card title="Your account">
          <Badge tone="success">Active</Badge>
          <dl className="details">
            <dt>Current workspace role</dt>
            <dd>Subject coordinator</dd>
            <dt>Current workspace</dt>
            <dd>{workspace.name.split(" · ")[0]}</dd>
            <dt>Teaching period</dt>
            <dd>
              {workspace.period}, {workspace.year}
            </dd>
          </dl>
          <Button onClick={() => go("/dashboard")}>
            Back to subject dashboard
          </Button>
          <p className="helper">
            Workspace roles are managed by your subject coordinator.
          </p>
        </Card>
      </div>
    </>
  );
}
