import { useState, type FormEvent } from "react";
import { go } from "../router";
import { useSession } from "../session";
import { AuthLayout, AuthBanner, AuthField } from "../components/AuthLayout";
import { MailIcon } from "../components/Icons";
import { login, type Account } from "../auth";

const ERROR = "Incorrect username or password. Please try again.";

export function Login({ createdUser = "" }: { createdUser?: string }) {
  const { signIn } = useSession();
  const [identifier, setIdentifier] = useState(createdUser);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [forgot, setForgot] = useState(false);

  function enter(account: Account) {
    signIn(account);
    go("/home");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const account = login(identifier, password);
    if (!account) {
      setError(ERROR);
      return;
    }
    enter(account);
  }

  return (
    <AuthLayout
      title="AI-Assisted Exam Marking"
      subtitle="Secure marking for programming assessments."
      below={
        <>
          <p className="signup">
            Don’t have an account? <a href="#/signup">Sign up</a>
          </p>
          <div className="demo-login">
            <b>Placeholder accounts (no backend yet)</b>
            <span>demo / demo1234 · jsmith / password1</span>
          </div>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        {error && <AuthBanner tone="error">{error}</AuthBanner>}
        {!error && createdUser && (
          <AuthBanner tone="success">
            Account created. Log in to continue.
          </AuthBanner>
        )}
        <AuthField
          label="Email or Username"
          icon={<MailIcon />}
          autoComplete="username"
          autoFocus={!createdUser}
          invalid={!!error}
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            setError("");
          }}
          placeholder="jsmith"
        />
        <AuthField
          label="Password"
          icon={null}
          password
          autoComplete="current-password"
          autoFocus={!!createdUser}
          invalid={!!error}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          placeholder="Enter your password"
        />
        <button
          className="button primary full"
          disabled={!identifier || !password}
        >
          Log in
        </button>
        <button
          type="button"
          className="forgot"
          onClick={() => setForgot(!forgot)}
        >
          Forgot password?
        </button>
        {forgot && (
          <p className="forgot-note">
            Password reset needs the backend, which isn’t connected yet. Use a
            placeholder account or sign up for a new one.
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
