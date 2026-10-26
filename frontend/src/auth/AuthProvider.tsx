import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  accountRequest,
  setApiSession,
  validSession,
  type AccountSession,
  type AccountUser,
} from "../api/auth";

const RESTORE_KEY = "automarktic-account-session";
const DEMO_KEY = "automarktic-demo-session";
const EVENT_KEY = "automarktic-auth-event";
type Mode = "anonymous" | "demo" | "account";
function remembered(key: string, local = false) {
  try {
    return (local ? localStorage : sessionStorage).getItem(key) === "1";
  } catch {
    return false;
  }
}
function useSession() {
  const [mode, setMode] = useState<Mode>(() =>
    {
      const isDemo = remembered(DEMO_KEY);
      if (isDemo) {
        setApiSession(null, true);
        // Reopening a presentation always starts at its initial dashboard.
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/dashboard`);
      }
      return isDemo ? "demo" : "anonymous";
    },
  );
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(
    () => !remembered(DEMO_KEY) && remembered(RESTORE_KEY, true),
  );
  const [message, setMessage] = useState("");
  const requestVersion = useRef(0);
  const sessionRef = useRef<AccountSession | null>(null);
  function remember(key: string, value: boolean, local = false) {
    try {
      const store = local ? localStorage : sessionStorage;
      if (value) store.setItem(key, "1");
      else store.removeItem(key);
    } catch {
      /* Cookie verification still controls access. */
    }
  }
  function clear(reason = "") {
    requestVersion.current++;
    sessionRef.current = null;
    setApiSession(null);
    remember(DEMO_KEY, false);
    remember(RESTORE_KEY, false, true);
    setMode("anonymous");
    setUser(null);
    setLoading(false);
    setMessage(reason);
  }
  function accept(session: AccountSession) {
    if (!validSession(session))
      throw new Error(
        "The server returned an invalid account session. Retry logging in.",
      );
    requestVersion.current++;
    sessionRef.current = session;
    setApiSession(session);
    remember(DEMO_KEY, false);
    remember(RESTORE_KEY, true, true);
    setUser(session.user);
    setMode("account");
    setLoading(false);
    setMessage("");
    // Reconcile any real account tabs after a login or account switch.
    try {
      localStorage.setItem(
        EVENT_KEY,
        JSON.stringify({ type: "login", at: crypto.randomUUID() }),
      );
    } catch {
      /* Polling also rechecks sessions. */
    }
  }
  useEffect(() => {
    if (mode === "demo") setApiSession(null, true);
  }, [mode]);
  useEffect(() => {
    if (!loading) return;
    let active = true;
    const version = requestVersion.current;
    void accountRequest<AccountSession>("session")
      .then((session) => {
        if (!active || requestVersion.current !== version) return;
        if (validSession(session)) accept(session);
        else clear("Log in to reopen your saved workspace.");
      })
      .catch((error) => {
        if (active && requestVersion.current === version)
          clear((error as Error).message);
      });
    return () => {
      active = false;
    };
  }, [loading]);
  useEffect(() => {
    function expired() {
      if (sessionRef.current)
        clear("Your session has expired. Please log in again.");
    }
    async function verify() {
      if (mode !== "account" || document.visibilityState !== "visible") return;
      const version = requestVersion.current;
      try {
        const session = await accountRequest<AccountSession>("session");
        if (version !== requestVersion.current) return;
        if (!validSession(session))
          clear("Your session has ended. Please log in again.");
        else if (session.user.id !== sessionRef.current?.user?.id)
          clear("The signed-in account changed in another tab. Log in again.");
        else {
          sessionRef.current = session;
          setApiSession(session);
          setUser(session.user);
        }
      } catch {
        /* A temporary network failure does not grant a new session. */
      }
    }
    function changed(event: StorageEvent) {
      if (event.key === EVENT_KEY && mode === "account") {
        if (event.newValue?.includes('"logout"'))
          clear("You logged out in another tab.");
        else void verify();
      }
    }
    let lastActivity = 0;
    function activity() {
      if (mode !== "account" || Date.now() - lastActivity < 60_000) return;
      lastActivity = Date.now();
      void accountRequest("activity", {}).catch(() => {
        /* The session check reports expiry; network failures remain recoverable. */
      });
    }
    window.addEventListener("automarktic-session-expired", expired);
    window.addEventListener("storage", changed);
    document.addEventListener("visibilitychange", verify);
    document.addEventListener("pointerdown", activity);
    document.addEventListener("keydown", activity);
    const timer = window.setInterval(verify, 30_000);
    return () => {
      window.removeEventListener("automarktic-session-expired", expired);
      window.removeEventListener("storage", changed);
      document.removeEventListener("visibilitychange", verify);
      document.removeEventListener("pointerdown", activity);
      document.removeEventListener("keydown", activity);
      window.clearInterval(timer);
    };
  }, [mode]);
  function enterDemo() {
    requestVersion.current++;
    sessionRef.current = null;
    setApiSession(null, true);
    remember(DEMO_KEY, true);
    setUser(null);
    setMode("demo");
    setLoading(false);
    setMessage("");
  }
  async function login(identifier: string, password: string) {
    if (identifier === "demo" && password === "demo1234") {
      enterDemo();
      return;
    }
    accept(
      await accountRequest<AccountSession>("login", { identifier, password }),
    );
  }
  async function register(payload: {
    name: string;
    email: string;
    username: string;
    password: string;
    inviteCode?: string;
  }) {
    accept(await accountRequest<AccountSession>("register", payload));
  }
  async function logout() {
    const accountLogout = mode === "account";
    if (mode === "account") await accountRequest("logout", {});
    clear();
    if (accountLogout)
      try {
        localStorage.setItem(
          EVENT_KEY,
          JSON.stringify({ type: "logout", at: crypto.randomUUID() }),
        );
      } catch {
        /* The backend has already revoked the session. */
      }
  }
  async function changePassword(currentPassword: string, password: string) {
    await accountRequest("change-password", { currentPassword, password });
    clear("Password changed. Log in with your new password.");
    try {
      localStorage.setItem(
        EVENT_KEY,
        JSON.stringify({ type: "logout", at: crypto.randomUUID() }),
      );
    } catch {
      /* Session verification will also detect revocation. */
    }
  }
  return {
    mode,
    user,
    loading,
    message,
    login,
    register,
    logout,
    enterDemo,
    changePassword,
  };
}
const Context = createContext<ReturnType<typeof useSession> | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useSession()}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("Auth provider missing");
  return value;
}
