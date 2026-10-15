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
} from "./models/domain";
import {
  examsFor,
  restoreExams,
  updateExam,
  EXAM_STORAGE_KEY,
  type ExamRecord,
} from "./models/exams";
import { loadAiReviews } from "./api/ai";
import { loadExamRegistry, saveExamRegistry } from "./api/exams";
import { useAuth } from "./auth/AuthProvider";
import { AiReviewQueue } from "./services/aiReviewQueue";
import { collectAiReviewTasks } from "./models/aiReviewTasks";
const KEY = "automarktic-demo-v1";
function restore(key = KEY): Data {
  try {
    const raw = sessionStorage.getItem(key);
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
        // Upgrade existing demo sessions once; null means the user chose initials.
        return {
          ...s,
          profile: {
            ...s.profile,
            avatar:
              s.profile.avatar === undefined
                ? initialProfile.avatar
                : s.profile.avatar,
          },
        };
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
  const auth = useAuth();
  const [aiReviewQueue] = useState(() => new AiReviewQueue());
  const dataKey = auth.mode === "account" ? `${KEY}:${auth.user!.id}` : KEY;
  const examKey =
    auth.mode === "account"
      ? `${EXAM_STORAGE_KEY}:workspace:${auth.user!.workspaceId}`
      : EXAM_STORAGE_KEY;
  const [data, setData] = useState<Data>(() => {
    const restored = restore(dataKey);
    if (auth.mode !== "account") return restored;
    return {
      ...restored,
      logged: true,
      profile: {
        ...restored.profile,
        name:
          restored.profile.email === auth.user!.email
            ? restored.profile.name
            : auth.user!.name,
        email: auth.user!.email,
        username: auth.user!.username,
        avatar:
          restored.profile.email === auth.user!.email
            ? restored.profile.avatar
            : null,
      },
      answers: {},
      workspaces: restored.workspaces.map((workspace) => ({
        ...workspace,
        members: [
          {
            id: "me",
            name: auth.user!.name,
            email: auth.user!.email,
            role:
              auth.user!.role === "Coordinator"
                ? "Subject coordinator"
                : "Tutor",
          },
        ],
      })),
    };
  });
  // Save exam files separately so older demo sessions remain compatible.
  const [examRegistry, setExamRegistry] = useState(() => {
    const restored = restoreExams(examKey);
    return auth.mode === "account" && !Object.keys(restored).length
      ? { comp10001: [] }
      : restored;
  });
  const examRef = useRef(examRegistry);
  const revision = useRef(0);
  const saving = useRef(false);
  const [examsReady, setExamsReady] = useState(false);
  const [examLoadError, setExamLoadError] = useState("");
  useEffect(() => {
    if (auth.mode === "anonymous") return;
    let active = true;
    Promise.all([loadExamRegistry(), loadAiReviews()]).then(async ([saved, reviews]) => {
      if (!active) return;
      let registry = saved.registry;
      let version = saved.revision;
      const legacy = restoreExams(examKey);
      if (version === 0 && Object.keys(legacy).length &&
          (auth.mode === "demo" || auth.user?.role === "Coordinator")) {
        version = await saveExamRegistry(legacy, 0);
        registry = legacy;
      }
      if (!active) return;
      if (auth.mode === "account" && !Object.keys(registry).length) registry = { comp10001: [] };
      revision.current = version;
      examRef.current = registry;
      setExamRegistry(registry);
      aiReviewQueue.restore(reviews);
      setExamsReady(true);
    }).catch((error) => {
      if (active) setExamLoadError(error instanceof Error ? error.message : "Could not open exam storage.");
    });
    return () => { active = false; };
  }, []);
  async function commitExams(next: typeof examRegistry) {
    if (!examsReady) throw new Error("Wait for saved exams to load.");
    if (saving.current) throw new Error("A save is in progress. Please retry when it finishes.");
    saving.current = true;
    try {
      revision.current = await saveExamRegistry(next, revision.current);
      examRef.current = next;
      setExamRegistry(next);
    } finally { saving.current = false; }
  }

  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState("");
  const [sampleRetry, setSampleRetry] = useState(0);
  const sampleExpected =
    import.meta.env.VITE_LOAD_SAMPLE_EXAM !== "false" &&
    auth.mode === "demo" &&
    data.active === "comp10001";
  useEffect(() => {
    if (
      !examsReady ||
      auth.mode !== "demo" ||
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
        await commitExams(next);
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
  }, [data.logged, sampleExpected, sampleRetry, examsReady]);
  async function saveExam(exam: ExamRecord) {
    await commitExams(updateExam(examRef.current, data.active, exam));
  }
  const [legacyRegistry] = useState(() =>
    auth.mode === "account" ? restoreExams() : {},
  );
  const legacyExams =
    auth.mode === "account"
      ? examsFor(legacyRegistry, data.active).filter((exam) => !!exam.answers)
      : [];
  async function copySavedExams() {
    if (auth.user?.role !== "Coordinator")
      throw new Error("Coordinator access is required.");
    let next = examRef.current;
    let copied = 0;
    for (const exam of legacyExams) {
      if (
        examsFor(next, data.active).some((existing) => existing.id === exam.id)
      )
        continue;
      next = updateExam(next, data.active, exam);
      copied++;
    }
    await commitExams(next);
    return copied;
  }
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(dataKey, JSON.stringify(data));
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
  useEffect(() => {
    if (auth.mode === "anonymous" || !examsReady) return;
    aiReviewQueue.start();
    return () => aiReviewQueue.stop();
  }, [aiReviewQueue, auth.mode, examsReady]);
  useEffect(() => {
    if (auth.mode === "anonymous" || !examsReady) return;
    aiReviewQueue.configure(
      collectAiReviewTasks(
        examRegistry,
        data.answers,
        data.workspaces.map((workspace) => workspace.id),
        sampleExpected ? "comp10001" : undefined,
      ),
    );
  }, [
    aiReviewQueue,
    examsReady,
    auth.mode,
    examRegistry,
    data.answers,
    data.workspaces,
    sampleExpected,
  ]);
  const workspace = data.workspaces.find((w) => w.id === data.active)!;
  return {
    examsReady: examsReady || auth.mode === "anonymous",
    examLoadError,
    aiReviewQueue,
    data: { ...data, logged: auth.mode !== "anonymous" },
    setData,
    isCoordinator:
      auth.mode === "account"
        ? auth.user!.role === "Coordinator"
        : data.demoRole !== "Tutor",
    sampleLoading,
    sampleError,
    sampleExpected,
    retrySample: () => setSampleRetry((n) => n + 1),
    exams: examsFor(examRegistry, data.active),
    saveExam,
    legacyExamCount: legacyExams.filter(
      (exam) =>
        !examsFor(examRegistry, data.active).some(
          (current) => current.id === exam.id,
        ),
    ).length,
    copySavedExams,
    workspace,
    answers: data.answers[data.active] ?? [],
    toast,
    notify: setToast,
    storageError,
  };
}
const Context = createContext<ReturnType<typeof useStore> | null>(null);
function DataProvider({ children }: { children: ReactNode }) {
  const value = useStore();
  if (!value.examsReady) return <main style={{ padding: "2rem" }}>
    {value.examLoadError ? <><p role="alert">{value.examLoadError}</p><button onClick={() => location.reload()}>Retry loading exams</button></> : <p>Opening saved exams…</p>}
  </main>;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function Provider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  return (
    <DataProvider key={`${auth.mode}/${auth.user?.id ?? ""}`}>
      {children}
    </DataProvider>
  );
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
