import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
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
import {
  EXAM_STORAGE_KEY,
  examsFor,
  restoreExams,
  updateExam,
  type ExamRecord,
} from "./exams";
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
  demoRole?: "Coordinator" | "Tutor";
};
function useStore() {
  const [data, setData] = useState<Data>(restore);
  // Save exam files separately so older demo sessions remain compatible.
  const [examRegistry, setExamRegistry] = useState(restoreExams);
  const examRef = useRef(examRegistry);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState("");
  const [sampleRetry, setSampleRetry] = useState(0);
  const sampleExpected =
    import.meta.env.VITE_LOAD_SAMPLE_EXAM !== "false" &&
    data.active === "comp10001";
  useEffect(() => {
    if (
      !data.logged ||
      !sampleExpected ||
      examsFor(examRef.current, "comp10001").find((e) => e.id === "final")
        ?.sampleVersion
    )
      return;
    let active = true;
    const controller = new AbortController();
    setSampleLoading(true);
    setSampleError("");
    // Load the bundled fixture from Vite/static hosting; the demo needs no Python API.
    // Upgrade only the old Final exam, once. Later user edits and marks are retained.
    fetch(`${import.meta.env.BASE_URL}demo/sample-exam.json`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "The bundled sample could not be loaded. Refresh and retry.",
          );
        const exam = await response.json().catch(() => {
          throw new Error(
            "The bundled sample file is invalid. Restore frontend/public/demo/sample-exam.json and retry.",
          );
        });
        if (
          exam.id !== "final" ||
          exam.sampleVersion !== 1 ||
          !exam.answers?.preview ||
          !exam.rubric?.pageCount
        )
          throw new Error("The prepared sample is invalid.");
        if (!active) return;
        const next = updateExam(examRef.current, "comp10001", exam);
        try {
          sessionStorage.setItem(EXAM_STORAGE_KEY, JSON.stringify(next));
        } catch {
          throw new Error(
            "There is not enough browser storage for the sample. Existing exams are unchanged.",
          );
        }
        examRef.current = next;
        setExamRegistry(next);
      })
      .catch((error) => {
        if (active)
          setSampleError(
            error instanceof Error
              ? error.message
              : "Could not load the bundled sample. Refresh and retry.",
          );
      })
      .finally(() => {
        if (active) setSampleLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [data.logged, sampleExpected, sampleRetry]);
  function saveExam(exam: ExamRecord) {
    const next = updateExam(examRef.current, data.active, exam);
    // Commit storage first. If quota is exceeded, retain the previous exam and
    // let the caller show a recoverable error instead of claiming success.
    try {
      sessionStorage.setItem(EXAM_STORAGE_KEY, JSON.stringify(next));
    } catch {
      throw new Error(
        "This browser tab cannot save more exam data. Try a smaller file; the previous exam is unchanged.",
      );
    }
    examRef.current = next;
    setExamRegistry(next);
  }
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
    isCoordinator: data.demoRole !== "Tutor",
    sampleLoading,
    sampleError,
    sampleExpected,
    retrySample: () => setSampleRetry((n) => n + 1),
    exams: examsFor(examRegistry, data.active),
    saveExam,
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
