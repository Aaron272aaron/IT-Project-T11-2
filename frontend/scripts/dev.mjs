// Start the Python API and Vite together, and stop both with Ctrl+C.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { createServer as createHttpServer, get } from "node:http";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "5173" },
    strictPort: { type: "boolean" },
  },
});
const frontendPort = Number(values.port);
const backendPort = Number(process.env.BACKEND_PORT || "8000");
for (const port of [frontendPort, backendPort]) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Choose a port between 1 and 65535.");
  }
}
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const backendUrl = `http://127.0.0.1:${backendPort}`;
const aiPython = fileURLToPath(
  new URL(
    process.platform === "win32"
      ? "../../.venv-ai/Scripts/python.exe"
      : "../../.venv-ai/bin/python",
    import.meta.url,
  ),
);
const python =
  process.env.PYTHON ||
  (existsSync(aiPython)
    ? aiPython
    : process.platform === "win32"
      ? "python"
      : "python3");
let backend;
let server;
let frontendHttp;
let stopping = false;

function backendReady() {
  // Short-lived HTTP probes avoid retaining timed-out connections during preload.
  return new Promise((resolve) => {
    const request = get(
      `${backendUrl}/api/health`,
      { timeout: 500, agent: false },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 8192) request.destroy();
        });
        response.on("end", () => {
          try {
            const data = JSON.parse(body);
            resolve(
              response.statusCode === 200 &&
                data.service === "automarktic-python" &&
                data.status === "ok",
            );
          } catch {
            resolve(false);
          }
        });
        response.on("error", () => resolve(false));
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (backend && backend.exitCode === null && backend.signalCode === null) {
    const exited = new Promise((resolve) => backend.once("exit", resolve));
    backend.kill("SIGTERM");
    // Allow active tests/inference to finish, then release AI and stop Docker.
    const timer = setTimeout(() => backend.kill("SIGKILL"), 180_000);
    await exited;
    clearTimeout(timer);
  }
  await server?.close();
  if (frontendHttp) {
    frontendHttp.closeAllConnections();
    await new Promise((resolve) => frontendHttp.close(resolve));
  }
  process.exit(code);
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
if (process.platform !== "win32") process.once("SIGHUP", () => void stop());
process.stdin.once("end", () => void stop());
process.once("exit", () => {
  if (backend && backend.exitCode === null && backend.signalCode === null)
    backend.kill("SIGTERM");
});

// Fail clearly when another API owns the port; never stop someone else's server.
const occupied = await new Promise((resolve) => {
  const socket = createConnection({ host: "127.0.0.1", port: backendPort });
  socket.once("connect", () => {
    socket.destroy();
    resolve(true);
  });
  socket.once("error", () => resolve(false));
});
if (occupied) {
  console.error(
    `Port ${backendPort} is already in use. If Python is already running, use npm run dev:frontend; otherwise choose BACKEND_PORT=8002 npm run dev.`,
  );
  process.exit(1);
}

try {
  backend = spawn(
    python,
    ["backend/api/server.py", "--port", String(backendPort)],
    { cwd: projectRoot, stdio: "inherit" },
  );
  backend.once("error", (error) => {
    console.error(
      `Could not start Python: ${error.message}. Install Python 3 or set PYTHON to its executable.`,
    );
    // A failed spawn has no process to terminate.
    backend = undefined;
    void stop(1);
  });
  backend.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(`Python API stopped (${signal || code}).`);
      void stop(code || 1);
    }
  });
  let ready = false;
  const startupDeadline = Date.now() + 240_000;
  while (Date.now() < startupDeadline && !stopping) {
    ready = await backendReady();
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("The Python API did not become ready.");
  process.env.API_PROXY_TARGET = backendUrl;
  frontendHttp = createHttpServer();
  server = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)),
    // This launcher owns shutdown. Standalone Vite installs a SIGTERM handler
    // that exits immediately, before Python can finish AI and Docker cleanup.
    server: { middlewareMode: true, hmr: { server: frontendHttp } },
  });
  frontendHttp.on("request", server.middlewares);
  await new Promise((resolve, reject) => {
    frontendHttp.once("error", reject);
    frontendHttp.listen(frontendPort, "127.0.0.1", resolve);
  });
  console.log(`Local: http://127.0.0.1:${frontendPort}/`);
  if (process.env.OPEN_BROWSER === "1") {
    const url = `http://127.0.0.1:${frontendPort}/`;
    const opener =
      process.platform === "darwin"
        ? spawn("open", [url], { stdio: "ignore" })
        : spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { stdio: "ignore" });
    opener.on("error", () => console.log(`Open ${url} in your browser.`));
  }
  console.log(
    `Frontend connected to ${backendUrl}. Press Ctrl+C to stop both.`,
  );
} catch (error) {
  console.error(error.message);
  await stop(1);
}
