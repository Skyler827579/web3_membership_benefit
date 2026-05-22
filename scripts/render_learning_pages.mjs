import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const runtimeNodeModules = "/Users/skylerlan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { createCanvas } = require(path.join(runtimeNodeModules, "@napi-rs/canvas"));
const pdfjsLib = await import(pathToFileURL(path.join(runtimeNodeModules, "pdfjs-dist/legacy/build/pdf.mjs")).href);

const source = process.argv[2] || "../Web3破局之路-完整版.pdf";
const outDir = path.resolve("public/learning-pages");

fs.mkdirSync(outDir, { recursive: true });

const data = new Uint8Array(fs.readFileSync(source));
const pdf = await pdfjsLib.getDocument({
  data,
  disableFontFace: true,
  useSystemFonts: true
}).promise;

const manifest = {
  title: "Web3破局之路｜基础学习内容",
  type: "rendered-pages",
  pageCount: pdf.numPages,
  pages: []
};

for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.65 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;

  const filename = `page-${String(pageNumber).padStart(2, "0")}.jpg`;
  const output = path.join(outDir, filename);
  fs.writeFileSync(output, await canvas.encode("jpeg", 88));
  manifest.pages.push({ page: pageNumber, image: `/learning-pages/${filename}` });
  console.log(`Rendered ${pageNumber}/${pdf.numPages}: ${filename}`);
}

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(`Done: ${pdf.numPages} pages -> ${outDir}`);
