#!/usr/bin/env node
/* Produces the Artifact build from the deployable one.

   fighter.html is a complete HTML document, which is what makes it a drop-in
   for any website. The Artifact host supplies its own <!doctype>/<head>/<body>
   wrapper and rejects a page that brings its own, so the Artifact build is the
   same page with that wrapper stripped. Deriving it here keeps the two from
   drifting apart, which they do immediately when the strip is done by hand. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "fighter.html");
const OUT_DIR = resolve(ROOT, "dist");
const OUT = resolve(OUT_DIR, "fighter-artifact.html");

const src = readFileSync(SRC, "utf8");
const need = (marker) => {
  const i = src.indexOf(marker);
  if (i < 0){ console.error("build: could not find " + marker + " in fighter.html"); process.exit(1); }
  return i;
};
const titleAt = need("<title>");
const styleEnd = need("</style>") + "</style>".length;
const bodyStart = need("<body>") + "<body>".length;
const bodyEnd = need("</body>");

const out = src.slice(titleAt, styleEnd) + "\n" + src.slice(bodyStart, bodyEnd).trim() + "\n";

/* The host rejects a page that carries its own document wrapper. */
const stray = ["<!doctype", "<html", "<head>", "<body>", "</html>"].filter(t => out.toLowerCase().includes(t));
if (stray.length){ console.error("build: wrapper tags survived the strip: " + stray.join(", ")); process.exit(1); }
if (!/<title>[^<]+<\/title>/.test(out)){ console.error("build: output has no <title>"); process.exit(1); }

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, out);

const version = (src.match(/GAME_VERSION\s*=\s*"([^"]+)"/) || [])[1] || "unknown";
console.log("build: dist/fighter-artifact.html  " + (out.length / 1024).toFixed(1) + " KB  (v" + version + ")");
console.log("       source fighter.html         " + (src.length / 1024).toFixed(1) + " KB");
