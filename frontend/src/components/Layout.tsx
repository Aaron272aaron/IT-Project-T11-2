import { useState, type ReactNode } from "react";
import { useApp, go } from "../state";
const links = [
  ["/dashboard", "Subject dashboard"],
  ["/exams", "Exams"],
  ["/members", "Workspace members"],
  ["/workspace-settings", "Workspace settings"],
];
export function Logo({ text = "Workspace" }: { text?: string }) {
  return (
    <div className="brand">
      <span className="brand-icon">
        <img src="/logo-code.svg" alt="" />
      </span>
      <b>{text}</b>
    </div>
  );
}
export function Layout({
  children,
  route,
}: {
  children: ReactNode;
  route: string;
}) {
  const { data, setData, workspace, storageError } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div className="app-layout">
      <div className="mobile-bar">
        <Logo />
        <button
          className="icon-button"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
          aria-expanded={open}
        >
          ☰
        </button>
      </div>
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Logo />
        <div className="workspace-switch">
          <strong>{workspace.name.split(" · ")[0]}</strong>
          <p>{workspace.subject}</p>
          {data.workspaces.length > 1 && (
            <select
              aria-label="Switch workspace"
              value={workspace.id}
              onChange={(e) => {
                setData((d) => ({ ...d, active: e.target.value }));
                go("/dashboard");
              }}
            >
              {data.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          {links.map(([path, label]) => (
            <a
              key={path}
              href={`#${path}`}
              onClick={() => setOpen(false)}
              aria-current={
                route === path ||
                (path === "/exams" &&
                  /^\/exam|^\/question|^\/import/.test(route))
                  ? "page"
                  : undefined
              }
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a
            className={`account-link ${route === "/user-settings" ? "selected" : ""}`}
            href="#/user-settings"
            onClick={() => setOpen(false)}
          >
            <b>{data.profile.name}</b>
            <span>Subject coordinator</span>
            <small>
              {workspace.period} · {workspace.year}
            </small>
          </a>
          <div className="sidebar-footer">
            <span>Local workspace</span>
            <button
              onClick={() => {
                setData((d) => ({ ...d, logged: false }));
                go("/login");
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1}>
        {storageError && (
          <div role="alert" className="notice warning">
            Browser storage is full. Changes remain in memory only; export your
            marks before closing this page.
          </div>
        )}
        {children}
        <footer className="page-footer">
          <span>Prototype · Demo workspace</span>
          <span>
            Session data stays in this browser · Backend not connected
          </span>
        </footer>
      </main>
    </div>
  );
}
