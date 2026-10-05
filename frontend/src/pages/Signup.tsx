import { useState, type FormEvent } from "react";
import { go } from "../router";
import { AuthLayout, AuthBanner, AuthField } from "../components/AuthLayout";
import { AtIcon, MailIcon, UserIcon } from "../components/Icons";
import {
  register,
  validateSignup,
  type SignupErrors,
  type SignupForm,
} from "../auth";

const EMPTY: SignupForm = {
  name: "",
  email: "",
  username: "",
  role: "",
  password: "",
  confirm: "",
};

export function Signup() {
  const [form, setForm] = useState<SignupForm>(EMPTY);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [submitted, setSubmitted] = useState(false);

  // After the first submit, re-validate as the user types so errors clear live.
  function update<K extends keyof SignupForm>(key: K, value: SignupForm[K]) {
    const next = { ...form, [key]: value };
    setForm(next);
    if (submitted) setErrors(validateSignup(next));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const found = validateSignup(form);
    setErrors(found);
    if (Object.keys(found).length) {
      const first = Object.keys(found)[0];
      document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    const account = register(form);
    go(`/login?created=${encodeURIComponent(account.username)}`);
  }

  const count = Object.keys(errors).length;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join AutoMarktic to start marking programming assessments."
      below={
        <p className="signup">
          Already have an account? <a href="#/login">Log in</a>
        </p>
      }
    >
      <form onSubmit={submit} noValidate>
        {count > 0 && (
          <AuthBanner tone="error">
            Please fix the{" "}
            {count === 1 ? "highlighted field" : `${count} highlighted fields`}{" "}
            below.
          </AuthBanner>
        )}
        <AuthField
          label="Full name"
          name="name"
          icon={<UserIcon />}
          autoComplete="name"
          autoFocus
          value={form.name}
          error={errors.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Jordan Smith"
        />
        <AuthField
          label="University email"
          name="email"
          type="email"
          icon={<MailIcon />}
          autoComplete="email"
          value={form.email}
          error={errors.email}
          onChange={(e) => update("email", e.target.value)}
          placeholder="name@university.edu"
        />
        <AuthField
          label="Username"
          name="username"
          icon={<AtIcon />}
          autoComplete="username"
          value={form.username}
          error={errors.username}
          onChange={(e) => update("username", e.target.value)}
          placeholder="jsmith"
        />
        <fieldset className="auth-roles">
          <legend>Role</legend>
          <div className={errors.role ? "invalid" : ""}>
            {(["Tutor", "Subject coordinator"] as const).map((r) => (
              <label key={r} className={form.role === r ? "selected" : ""}>
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={form.role === r}
                  onChange={() => update("role", r)}
                />
                {r}
              </label>
            ))}
          </div>
          {errors.role && <small className="auth-error">{errors.role}</small>}
        </fieldset>
        <AuthField
          label="Password"
          name="password"
          icon={null}
          password
          autoComplete="new-password"
          value={form.password}
          error={errors.password}
          onChange={(e) => update("password", e.target.value)}
          placeholder="At least 8 characters"
        />
        <AuthField
          label="Confirm password"
          name="confirm"
          icon={null}
          password
          autoComplete="new-password"
          value={form.confirm}
          error={errors.confirm}
          onChange={(e) => update("confirm", e.target.value)}
          placeholder="Re-enter your password"
        />
        <button className="button primary full">Create account</button>
      </form>
    </AuthLayout>
  );
}
