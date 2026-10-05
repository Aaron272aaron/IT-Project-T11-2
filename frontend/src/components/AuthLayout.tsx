import type { InputHTMLAttributes, ReactNode } from "react";
import { useId, useState } from "react";
export function Logo() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <img src="/logo-code.svg" alt="" />
      </span>
      <b>AutoMarktic</b>
    </div>
  );
}
import { AlertIcon, CheckIcon, EyeIcon, EyeOffIcon, LockIcon } from "./Icons";

/** Navy background, logo, headline and white card shared by login + sign up. */
export function AuthLayout({
  title,
  subtitle,
  ocean = false,
  children,
  below,
}: {
  title: string;
  subtitle: string;
  ocean?: boolean;
  children: ReactNode;
  below?: ReactNode;
}) {
  return (
    <main className={`login-screen ${ocean ? "ocean" : ""}`}>
      <div className="login-decoration" />
      <div className="login-content">
        <Logo />
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div className="login-card">{children}</div>
        {below}
        <small>For authorised tutors and subject coordinators</small>
        <small>Student data and AI processing remain local and secure.</small>
      </div>
    </main>
  );
}

export function AuthBanner({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  return (
    <div
      className={`auth-banner ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "error" ? <AlertIcon /> : <CheckIcon />}
      <span>{children}</span>
    </div>
  );
}

/** Labelled input with a leading icon, optional show/hide toggle and error text. */
export function AuthField({
  label,
  icon,
  error,
  invalid,
  password = false,
  ...input
}: {
  label: string;
  icon: ReactNode;
  error?: string;
  invalid?: boolean;
  password?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [show, setShow] = useState(false);
  const bad = invalid || !!error;
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className={`auth-input ${bad ? "invalid" : ""}`}>
        <span className="auth-icon">{password ? <LockIcon /> : icon}</span>
        <input
          id={id}
          aria-invalid={bad || undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          {...input}
          type={password ? (show ? "text" : "password") : input.type}
        />
        {password && (
          <button
            type="button"
            className="auth-eye"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {error && (
        <small id={`${id}-err`} className="auth-error">
          {error}
        </small>
      )}
    </div>
  );
}
