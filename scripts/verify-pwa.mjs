import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve("dist");
const requiredFiles = [
  "index.html",
  "404.html",
  "manifest.webmanifest",
  "sw.js",
  "favicon.svg",
  "icons/apple-touch-icon.png",
  "icons/pwa-192x192.png",
  "icons/pwa-512x512.png",
  "icons/maskable-512x512.png",
];

for (const file of requiredFiles) await access(resolve(dist, file));

const manifest = JSON.parse(
  await readFile(resolve(dist, "manifest.webmanifest"), "utf8"),
);
assert.equal(manifest.name, "OPIc Speaking Trainer");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, ".");
assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));

const indexHtml = await readFile(resolve(dist, "index.html"), "utf8");
const fallbackHtml = await readFile(resolve(dist, "404.html"), "utf8");
assert.match(indexHtml, /\/opic-speaking-trainer\//);
assert.equal(fallbackHtml, indexHtml);

console.log("PWA/Pages verification passed");
