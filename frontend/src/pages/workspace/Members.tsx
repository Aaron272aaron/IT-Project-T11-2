import { DemoPasswordRecovery } from "../../components/auth/DemoPasswordRecovery";
import { useState, type FormEvent } from "react";
import type { Member, Role } from "../../models/domain";
import { Avatar } from "../../components/profile/Avatar";
import { useAuth } from "../../auth/AuthProvider";
import { AccountAccess } from "../../components/auth/AccountAccess";
import { useApp, go } from "../../state";
import {
  Header,
  Card,
  Button,
  Field,
  Badge,
  Modal,
  Empty,
} from "../../components/UI";
export function Members() {
  const auth = useAuth();
  const { data, workspace, setData, notify, isCoordinator } = useApp();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("All roles");
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  // Use the same profile as the sidebar, including for older saved demo sessions.
  const members = workspace.members.map((member) =>
    member.id === "me"
      ? { ...member, name: data.profile.name, email: data.profile.email }
      : member,
  ).filter(
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
  if (auth.mode === "account")
    return (
      <>
        <Header
          title="Workspace members"
          subtitle="Manage local accounts, invitations and password recovery."
        />
        <AccountAccess />
      </>
    );
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
                      <Avatar
                        name={m.name}
                        src={m.id === "me" ? data.profile.avatar : undefined}
                      />
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
      {isCoordinator && <DemoPasswordRecovery members={workspace.members.map((member) => member.id === "me" ? { ...member, name: data.profile.name, email: data.profile.email } : member)} />}
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
