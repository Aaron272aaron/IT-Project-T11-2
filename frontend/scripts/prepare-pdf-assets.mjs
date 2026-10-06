// Serve PDF fonts/decoders locally in development and production builds.
import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const target = new URL("public/pdfjs/", root);
mkdirSync(target, { recursive: true });
for (const name of ["cmaps", "standard_fonts", "wasm", "LICENSE"])
  cpSync(
    fileURLToPath(new URL(`node_modules/pdfjs-dist/${name}`, root)),
    fileURLToPath(new URL(name, target)),
    { recursive: true },
  );
