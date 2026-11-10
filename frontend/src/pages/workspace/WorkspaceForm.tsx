import { useState, type FormEvent } from "react";
import type { Workspace } from "../../models/domain";
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
export function WorkspaceForm({ create = false }: { create?: boolean }) {
  const { workspace, setData, notify, exams } = useApp();
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
                <dd>{exams.length}</dd>
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
