import fs from "node:fs";
import path from "node:path";

const sourceDir = "/Users/skylerlan/Documents/Codex/2026-05-17/chainpulse-2/content/crypto-daily";
const targetDir = path.join(process.cwd(), "netlify", "functions", "data", "crypto-daily");

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function latestSourceFile() {
  const today = path.join(sourceDir, `${todayKey()}.json`);
  if (fs.existsSync(today)) return today;
  const files = fs.readdirSync(sourceDir).filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file)).sort();
  if (!files.length) throw new Error("没有找到可同步的 Crypto Daily 文章");
  return path.join(sourceDir, files.at(-1));
}

fs.mkdirSync(targetDir, { recursive: true });
const source = latestSourceFile();
const target = path.join(targetDir, path.basename(source));
fs.copyFileSync(source, target);
console.log(`Synced ${source} -> ${target}`);
