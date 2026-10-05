import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "./styles.css";
import { useRoute } from "./router";
import { SessionProvider, useSession } from "./session";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Home } from "./pages/Home";

function App() {
  const route = useRoute();
  const { user } = useSession();
  const [path, query = ""] = route.split("?");

  if (path === "/signup") return <Signup />;
  if (path === "/home" && user) return <Home />;
  // Everything else (including /home while logged out) shows the login page.
  const created = new URLSearchParams(query).get("created") ?? "";
  return <Login key={route} createdUser={created} />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </React.StrictMode>,
);
