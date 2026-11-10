// Serve PDF fonts/decoders locally in development and production builds.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
const root = new URL("../", import.meta.url);
const target = new URL("public/pdfjs/", root);
mkdirSync(target, { recursive: true });
// Copy canonical package assets only, and avoid rewriting unchanged files.
function syncAsset(source, destination) {
  const content = readFileSync(source);
  if (!existsSync(destination) || !readFileSync(destination).equals(content)) {
    writeFileSync(destination, content);
  }
}
for (const name of ["cmaps", "standard_fonts", "wasm"]) {
  const source = new URL(`node_modules/pdfjs-dist/${name}/`, root);
  const destination = new URL(`${name}/`, target);
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source)) {
    // Finder conflict copies such as "H-V 2.bcmap" are not package assets.
    if (!/^[A-Za-z0-9_.-]+$/.test(entry)) continue;
    syncAsset(new URL(entry, source), new URL(entry, destination));
  }
}
syncAsset(
  new URL("node_modules/pdfjs-dist/LICENSE", root),
  new URL("LICENSE", target),
);
