import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  initialProfile,
  initialWorkspace,
  seedAnswers,
  type Workspace,
  type Profile,
  type Answer,
} from "./domain";
const KEY = "automarktic-demo-v1";
function restore() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (
        s.version === 1 &&
        Array.isArray(s.workspaces) &&
        s.workspaces.length &&
        s.profile &&
        s.answers &&
        s.workspaces.some((w: Workspace) => w.id === s.active)
      )
        return s;
    }
  } catch {}
  return {
    version: 1,
    workspaces: [initialWorkspace],
    active: initialWorkspace.id,
    profile: initialProfile,
    answers: { comp10001: seedAnswers() },
    logged: false,
  };
}
type Data = {
  version: number;
  workspaces: Workspace[];
  active: string;
  profile: Profile;
  answers: Record<string, Answer[]>;
  logged: boolean;
};
function useStore() {
  const [data, setData] = useState<Data>(restore);
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(data));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [data]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  const workspace = data.workspaces.find((w) => w.id === data.active)!;
  return {
    data,
    setData,
    workspace,
    answers: data.answers[data.active] ?? [],
    toast,
    notify: setToast,
    storageError,
  };
}
const Context = createContext<ReturnType<typeof useStore> | null>(null);
export function Provider({ children }: { children: ReactNode }) {
  const value = useStore();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("App provider missing");
  return value;
}
export function go(path: string) {
  window.location.hash = path;
}
export function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/dashboard");
  useEffect(() => {
    const update = () => setRoute(location.hash.slice(1) || "/dashboard");
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return route;
}
