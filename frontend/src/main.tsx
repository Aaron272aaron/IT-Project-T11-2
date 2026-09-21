import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "./styles.css";
import { Provider, useApp, useRoute } from "./state";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { WorkspaceForm, Members, UserSettings } from "./pages/Workspace";
import { Dashboard, Exam } from "./pages/Exams";
import { ImportPage } from "./pages/Import";
import { QuestionOverview, Marking } from "./pages/Questions";
function App() {
  const route = useRoute();
  const { data, toast } = useApp();
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
    if (match)
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
        case "/import":
          content = <ImportPage />;
          break;
        case "/exam/final":
        case "/exam/midterm":
        case "/exam/practice":
          content = <Exam exam={route.split("/")[2]} />;
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
