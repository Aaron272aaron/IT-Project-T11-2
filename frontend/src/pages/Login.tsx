import { useState, type FormEvent } from "react";
import { useApp, go } from "../state";
import { Logo } from "../components/Layout";
import { Field, Button, Modal, Notice } from "../components/UI";
export function Login({
  errorState = false,
  ocean = false,
}: {
  errorState?: boolean;
  ocean?: boolean;
}) {
  const { setData } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(
    errorState ? "Invalid email or password. Please try again." : "",
  );
  const [help, setHelp] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (
      (email !== "demo" && email !== "alex.morgan@example.edu") ||
      password !== "demo1234"
    ) {
      setError("Invalid email or password. Use the demo credentials below.");
      return;
    }
    setData((d) => ({ ...d, logged: true }));
    go("/dashboard");
  }
  return (
    <main className={`login-screen ${ocean ? "ocean" : ""}`}>
      <div className="login-decoration" />
      <div className="login-content">
        <Logo text="AutoMarktic" />
        <h1>AI-Assisted Exam Marking</h1>
        <p>Secure marking for programming assessments.</p>
        <div className="login-card">
          <form onSubmit={submit}>
            <Field label="Email or Username">
              <input
                autoComplete="username"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="demo"
              />
            </Field>
            <Field label="Password">
              <span className="password-field">
                <input
                  aria-label="Password"
                  autoComplete="current-password"
                  type={show ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
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
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <Button variant="primary full">Log in</Button>
            <button
              type="button"
              className="forgot"
              onClick={() => setHelp("Reset password")}
            >
              Forgot password?
            </button>
          </form>
        </div>
        <p className="signup">
          Don’t have an account?{" "}
          <button onClick={() => setHelp("Create an account")}>Sign up</button>
        </p>
        <div className="demo-login">
          <b>Interactive frontend demo</b>
          <span>Username: demo · Password: demo1234</span>
          <button
            onClick={() => {
              setData((d) => ({ ...d, logged: true }));
              go("/dashboard");
            }}
          >
            Explore demo workspace →
          </button>
        </div>
        <small>For authorised tutors and subject coordinators</small>
        <small>
          Student data and AI processing are not sent to any service.
        </small>
      </div>
      {help && (
        <Modal title={help} onClose={() => setHelp("")}>
          <Notice>
            Account registration and password recovery require an authentication
            backend. They are not connected in this frontend prototype.
          </Notice>
          <p>
            You can explore every screen with username <b>demo</b> and password{" "}
            <b>demo1234</b>.
          </p>
          <div className="form-actions">
            <Button variant="primary" onClick={() => setHelp("")}>
              Got it
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}
