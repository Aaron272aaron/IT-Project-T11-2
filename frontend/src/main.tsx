import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "./styles.css";
import "./rubric-preview.css";
import { Provider, useApp, useRoute } from "./state";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { WorkspaceForm, Members, UserSettings } from "./pages/Workspace";
import { Dashboard, Exam } from "./pages/Exams";
import { ImportPage } from "./pages/Import";
import { CreateExam, CreatedExam } from "./pages/ExamSetup";
import { CanvasUpload } from "./pages/CanvasUpload";
import { QuestionOverview, Marking } from "./pages/Questions";
import { SampleExam, SampleQuestion } from "./pages/SampleExam";
import { Review } from "./pages/Review";
function Redirect({ to }: { to: string }) {
  React.useEffect(() => {
    location.hash = to;
  }, [to]);
  return null;
}
function App() {
  const route = useRoute();
  const {
    data,
    toast,
    exams,
    isCoordinator,
    sampleLoading,
    sampleError,
    sampleExpected,
    retrySample,
  } = useApp();
  const examRoute = route.match(
    /^\/exam\/([^/]+)(?:\/(answers(?:\/upload)?))?$/,
  );
  const currentExam = exams.find((item) => item.id === examRoute?.[1]);
  const sampleRoute = route.match(
    /^\/exam\/final\/question\/([^/]+)(?:\/mark\/([^/]+))?$/,
  );
  const sample = exams.find((e) => e.id === "final" && e.sampleVersion);
  const match = route.match(/^\/question\/([1-6])(?:\/mark\/(.+))?$/);
  let page;
  if (!data.logged || route.startsWith("/login"))
    page = (
      <Login
        key={
          route === "/login/error"
            ? "error"
            : route === "/login/ocean"
              ? "ocean"
              : "default"
        }
        errorState={route === "/login/error"}
        ocean={route === "/login/ocean"}
      />
    );
  else {
    let content;
    // Demo route guard complements hidden controls; this is not server auth.
    const coordinatorRoute =
      [
        "/create-exam",
        "/create-workspace",
        "/workspace-settings",
        "/members",
        "/import",
        "/exam/final/import",
        "/exam/final/review",
      ].includes(route) || route.endsWith("/answers/upload");
    if (
      sampleExpected &&
      !sample &&
      (["/dashboard", "/exams"].includes(route) ||
        route.startsWith("/exam/final") ||
        !!match)
    ) {
      content = (
        <div className="card">
          <h1>{sampleLoading ? "Preparing Sample exam…" : "Sample exam"}</h1>
          <p>
            {sampleError || "Loading the supplied rubric and Canvas answers."}
          </p>
          {sampleError && (
            <button className="button" onClick={retrySample}>
              Retry sample load
            </button>
          )}
        </div>
      );
    } else if (!isCoordinator && coordinatorRoute) {
      content = (
        <div className="card">
          <h1>Coordinator view required</h1>
          <p>
            Switch Demo perspective to Coordinator to manage exams. Tutors can
            open questions and mark answers.
          </p>
          <a href="#/exam/final">Open exam</a>
        </div>
      );
    } else if (sampleRoute && sample) {
      content = (
        <SampleQuestion
          key={`${sampleRoute[1]}-${sampleRoute[2] ?? "list"}`}
          exam={sample}
          questionId={sampleRoute[1]}
          studentId={
            sampleRoute[2] ? decodeURIComponent(sampleRoute[2]) : undefined
          }
        />
      );
    } else if (
      sample &&
      (match ||
        route === "/exam/final/import" ||
        route === "/exam/final/review")
    ) {
      content = <Redirect to="/exam/final" />;
    } else if (examRoute) {
      if (!currentExam)
        content = (
          <div className="card">
            <h1>Exam not found</h1>
            <p>This exam is not in the current workspace.</p>
            <a href="#/exams">Back to exams</a>
          </div>
        );
      else if (examRoute[2])
        content = (
          <CanvasUpload exam={currentExam} view={examRoute[2] === "answers"} />
        );
      else if (currentExam.sampleVersion)
        content = <SampleExam exam={currentExam} />;
      else
        content = ["final", "midterm", "practice"].includes(currentExam.id) ? (
          <Exam exam={currentExam.id} />
        ) : (
          <CreatedExam exam={currentExam} />
        );
    } else if (match)
      content = match[2] ? (
        <Marking
          key={`${data.active}-${route}`}
          id={Number(match[1])}
          student={decodeURIComponent(match[2])}
        />
      ) : (
        <QuestionOverview
          key={`${data.active}-${route}`}
          id={Number(match[1])}
        />
      );
    else
      switch (route) {
        case "/dashboard":
          content = <Dashboard />;
          break;
        case "/exams":
          content = <Dashboard list />;
          break;
        case "/create-exam":
          content = <CreateExam />;
          break;
        case "/create-workspace":
          content = <WorkspaceForm create />;
          break;
        case "/workspace-settings":
          content = <WorkspaceForm />;
          break;
        case "/members":
          content = <Members />;
          break;
        case "/user-settings":
          content = <UserSettings />;
          break;
        // Old bookmarks lead back into an exam instead of a global upload page.
        case "/import/canvas":
          content = <Redirect to="/exams" />;
          break;
        case "/import":
          content = <Redirect to="/exam/final/import" />;
          break;
        case "/exam/final/import":
          content = <ImportPage />;
          break;
        case "/exam/final/review":
          content = <Review />;
          break;
        default:
          content = (
            <div className="card">
              <h1>Page not found</h1>
              <a href="#/dashboard">Back to dashboard</a>
            </div>
          );
      }
    page = (
      <Layout route={route}>
        <div key={`${data.active}-${route}`}>{content}</div>
      </Layout>
    );
  }
  return (
    <>
      <button
        className="skip-link"
        onClick={() => document.getElementById("main-content")?.focus()}
      >
        Skip to content
      </button>
      {page}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider>
      <App />
    </Provider>
  </React.StrictMode>,
);
