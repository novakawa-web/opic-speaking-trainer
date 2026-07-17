import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const distDirectory = resolve("dist");
await copyFile(
  resolve(distDirectory, "index.html"),
  resolve(distDirectory, "404.html"),
);

console.log("GitHub Pages SPA fallback: dist/404.html created");
