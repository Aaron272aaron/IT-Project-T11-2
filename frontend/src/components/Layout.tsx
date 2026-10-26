import { Avatar } from "./profile/Avatar";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { useApp, go } from "../state";
import { useAuth } from "../auth/AuthProvider";
import { ModelSetup } from "./setup/ModelSetup";
import { AiPreparation } from "./setup/AiPreparation";
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
  const { data, setData, workspace, storageError, isCoordinator } = useApp();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);
  useLayoutEffect(() => {
    // Reset after the new page is rendered, including exams opened via history.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [route, data.active]);
  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await auth.logout();
      go("/login");
    } catch (error) {
      setLogoutError((error as Error).message);
      setLoggingOut(false);
    }
  }
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
        {auth.mode === "demo" && (
          <label className="demo-role">
            <span>Demo perspective</span>
            <select
              aria-label="Demo perspective"
              value={data.demoRole ?? "Coordinator"}
              onChange={(e) => {
                setData((d) => ({
                  ...d,
                  demoRole: e.target.value as "Coordinator" | "Tutor",
                }));
              }}
            >
              <option>Coordinator</option>
              <option>Tutor</option>
            </select>
            <small>Preview only</small>
          </label>
        )}
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          {links
            .filter(
              ([path]) =>
                isCoordinator ||
                !["/members", "/workspace-settings"].includes(path),
            )
            .map(([path, label]) => (
              <a
                key={path}
                href={`#${path}`}
                onClick={() => setOpen(false)}
                aria-current={
                  route === path ||
                  (path === "/exams" &&
                    /^\/exam|^\/question|^\/import|^\/create-exam$/.test(route))
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
            <Avatar name={data.profile.name} src={data.profile.avatar} />
            <b>{data.profile.name}</b>
            <span>
              {isCoordinator
                ? "Subject coordinator"
                : auth.mode === "demo"
                  ? "Tutor (demo)"
                  : "Tutor"}
            </span>
            <small>
              {workspace.period} · {workspace.year}
            </small>
          </a>
          <div className="sidebar-footer">
            <span>Local workspace</span>
            <button disabled={loggingOut} onClick={() => void logout()}>
              {loggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
          {logoutError && (
            <p className="error" role="alert">
              {logoutError}
            </p>
          )}
        </div>
      </aside>
      <main id="main-content" tabIndex={-1}>
        {storageError && (
          <div role="alert" className="notice warning">
            Browser storage is full. Personal preferences and local workspace
            settings could not be saved. Exam saves are handled separately.
          </div>
        )}
        {route !== "/user-settings" && <ModelSetup compact />}
        <AiPreparation />
        {children}
        <footer className="page-footer">
          {auth.mode === "demo" ? (
            <div className="demo-workspace-label">
              <strong>Demo workspace</strong>
              <small>data is not saved.</small>
            </div>
          ) : (
            <>
              <span>Local marking workspace</span>
              <span>Exams and confirmed marks are saved to this workspace</span>
            </>
          )}
        </footer>
      </main>
    </div>
  );
}
