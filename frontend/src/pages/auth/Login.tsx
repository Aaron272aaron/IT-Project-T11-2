import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { accountRequest } from "../../api/auth";
import { go } from "../../state";
import { Logo } from "../../components/Layout";
import { Field, Button, Notice } from "../../components/UI";

export function Login({
  errorState = false,
  ocean = false,
}: {
  errorState?: boolean;
  ocean?: boolean;
}) {
  const auth = useAuth();
  const [view, setView] = useState<"login" | "register" | "reset">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [bootstrap, setBootstrap] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    errorState ? "Invalid email or password. Please try again." : "",
  );
  const [notice, setNotice] = useState("");
  async function changeView(next: typeof view) {
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
    setCode("");
    if (next === "register") {
      setBusy(true);
      try {
        setBootstrap(
          (await accountRequest<{ bootstrapNeeded: boolean }>("status"))
            .bootstrapNeeded,
        );
        setView(next);
      } catch (reason) {
        setError((reason as Error).message);
      } finally {
        setBusy(false);
      }
    } else setView(next);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (view !== "login" && password !== confirmPassword)
        throw new Error("The passwords do not match.");
      if (view === "login") await auth.login(identifier.trim(), password);
      else if (view === "register")
        await auth.register({
          name: name.trim(),
          email: identifier.trim(),
          username: username.trim(),
          password,
          ...(bootstrap ? {} : { inviteCode: code.trim() }),
        });
      else {
        const result = await accountRequest<{ message: string }>(
          "reset-password",
          { email: identifier.trim(), code: code.trim(), password },
        );
        setView("login");
        setPassword("");
        setConfirmPassword("");
        setCode("");
        setNotice(result.message);
        return;
      }
      setPassword("");
      setConfirmPassword("");
      go("/dashboard");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={`login-screen ${ocean ? "ocean" : ""}`}>
      <div className="login-decoration" />
      <div className="login-content">
        <Logo text="AutoMarktic" />
        <h1>AI-Assisted Exam Marking</h1>
        <p>
          {view === "login"
            ? "Log in to your local marking workspace."
            : view === "register"
              ? bootstrap
                ? "Set up the first coordinator account."
                : "Join with an invitation from your coordinator."
              : "Reset your password with a code from your coordinator."}
        </p>
        <div className="login-card">
          <form onSubmit={(event) => void submit(event)}>
            {view === "register" && (
              <>
                <Field label="Full name">
                  <input
                    required
                    maxLength={100}
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field label="Username">
                  <input
                    required
                    minLength={3}
                    maxLength={40}
                    pattern="[A-Za-z0-9_.-]+"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </Field>
              </>
            )}
            <Field
              label={view === "login" ? "Email or Username" : "Email address"}
            >
              <input
                autoComplete={view === "login" ? "username" : "email"}
                type={view === "login" ? "text" : "email"}
                autoFocus
                required
                maxLength={254}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder={
                  view === "login" ? "Email or username" : "you@example.edu"
                }
              />
            </Field>
            {((view === "register" && !bootstrap) || view === "reset") && (
              <Field
                label={
                  view === "reset" ? "Password-reset code" : "Invitation code"
                }
              >
                <input
                  required
                  autoComplete="off"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </Field>
            )}
            <Field label={view === "reset" ? "New password" : "Password"}>
              <span className="password-field">
                <input
                  aria-label={view === "reset" ? "New password" : "Password"}
                  autoComplete={
                    view === "login" ? "current-password" : "new-password"
                  }
                  type={show ? "text" : "password"}
                  required
                  minLength={view === "login" ? undefined : 12}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    view === "login"
                      ? "Enter your password"
                      : "At least 12 characters"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </span>
            </Field>
            {view !== "login" && (
              <Field label="Confirm password">
                <input
                  type={show ? "text" : "password"}
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </Field>
            )}
            {view === "register" && bootstrap && (
              <Notice>
                This first account becomes the coordinator. Additional accounts
                need a coordinator invitation.
              </Notice>
            )}
            {(notice || auth.message) && (
              <p role="status">{notice || auth.message}</p>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <Button variant="primary full" disabled={busy}>
              {busy
                ? "Please wait…"
                : view === "login"
                  ? "Log in"
                  : view === "register"
                    ? "Create account"
                    : "Reset password"}
            </Button>
            {view === "login" ? (
              <button
                type="button"
                className="forgot"
                disabled={busy}
                onClick={() => void changeView("reset")}
              >
                Forgot password?
              </button>
            ) : (
              <button
                type="button"
                className="forgot"
                disabled={busy}
                onClick={() => void changeView("login")}
              >
                Back to login
              </button>
            )}
            {view === "reset" && (
              <p className="helper">
                Ask your coordinator for a one-time reset code. The coordinator
                can recover their own account using the local account recovery
                tool.
              </p>
            )}
          </form>
        </div>
        {view === "login" && (
          <p className="signup">
            Don’t have an account?{" "}
            <button disabled={busy} onClick={() => void changeView("register")}>
              Sign up
            </button>
          </p>
        )}
        <div className="demo-login">
          <b>Explore with sample data</b>
          <span>AI code fixes &amp; test runs · No account required</span>
          <span>Or log in with demo / demo1234</span>
          <button
            disabled={busy}
            onClick={() => {
              auth.enterDemo();
              go("/dashboard");
            }}
          >
            Explore demo workspace →
          </button>
        </div>
        <small>For authorised tutors and subject coordinators</small>
        <small>Accounts and marking data stay on this device.</small>
      </div>
    </main>
  );
}
