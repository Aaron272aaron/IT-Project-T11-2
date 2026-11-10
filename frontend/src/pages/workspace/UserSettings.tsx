import { useState, useRef, type FormEvent } from "react";
import { Avatar, readAvatar } from "../../components/profile/Avatar";
import { useAuth } from "../../auth/AuthProvider";
import { ChangePassword } from "../../components/auth/ChangePassword";
import { ModelSetup } from "../../components/setup/ModelSetup";
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
export function UserSettings() {
  const auth = useAuth();
  const { data, setData, workspace, notify } = useApp();
  const [form, setForm] = useState(data.profile);
  const [avatarError, setAvatarError] = useState("");
  const [avatarLoading, setAvatarLoading] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  // A request counter prevents an older file read from replacing a newer choice.
  const avatarRequest = useRef(0);
  async function uploadAvatar(file?: File) {
    if (!file) return;
    const request = ++avatarRequest.current;
    setAvatarError("");
    setAvatarLoading(true);
    try {
      const avatar = await readAvatar(file);
      if (request === avatarRequest.current) setForm((f) => ({ ...f, avatar }));
    } catch (error) {
      if (request === avatarRequest.current)
        setAvatarError((error as Error).message);
    } finally {
      if (request === avatarRequest.current) setAvatarLoading(false);
    }
  }
  function resetAvatarRead() {
    avatarRequest.current++;
    setAvatarLoading(false);
    setAvatarError("");
    if (avatarInput.current) avatarInput.current.value = "";
  }
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
            <div className="avatar-settings">
              <Avatar name={form.name} src={form.avatar} large />
              <div>
                <Field label="Profile photo">
                  <input
                    ref={avatarInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => void uploadAvatar(e.target.files?.[0])}
                  />
                </Field>
                <p className="helper">
                  PNG, JPG or WebP · Up to 5 MB. Without a photo, your initials
                  are shown.
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    resetAvatarRead();
                    setForm((f) => ({ ...f, avatar: null }));
                  }}
                >
                  Use initials instead
                </Button>
                {avatarLoading && <p role="status">Preparing photo…</p>}
                {avatarError && (
                  <p className="error" role="alert">
                    {avatarError}
                  </p>
                )}
              </div>
            </div>
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
                readOnly={auth.mode === "account"}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <div className="two-cols">
              <Field label="Username">
                <input
                  required
                  readOnly={auth.mode === "account"}
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
                  resetAvatarRead();
                  setForm(data.profile);
                  notify("Unsaved changes discarded.");
                }}
              >
                Discard changes
              </Button>
              <Button variant="primary" disabled={avatarLoading}>
                Save changes
              </Button>
            </div>
            <p className="helper">
              {auth.mode === "account"
                ? "Your email and username identify your account. Profile preferences are saved in this browser session."
                : "These preferences apply to your account in this demo session."}
            </p>
          </form>
        </Card>
        <Card title="Your account">
          <Badge tone="success">Active</Badge>
          <dl className="details">
            <dt>Current workspace role</dt>
            <dd>
              {auth.mode === "account"
                ? auth.user!.role
                : "Subject coordinator"}
            </dd>
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
      <ModelSetup />
      {auth.mode === "account" && <ChangePassword />}
    </>
  );
}
