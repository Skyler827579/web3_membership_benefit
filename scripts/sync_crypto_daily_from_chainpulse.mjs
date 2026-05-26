import fs from "node:fs";
import path from "node:path";

const sourceDir = "/Users/skylerlan/Documents/Codex/2026-05-17/chainpulse-2/content/crypto-daily";
const targetDir = path.join(process.cwd(), "netlify", "functions", "data", "crypto-daily");

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

function todaySourceFile() {
  const today = path.join(sourceDir, `${todayKey()}.json`);
  if (fs.existsSync(today)) return today;
  throw new Error(`没有找到今日 Crypto Daily 文章：${today}`);
}

fs.mkdirSync(targetDir, { recursive: true });
const source = todaySourceFile();
const target = path.join(targetDir, path.basename(source));
fs.copyFileSync(source, target);
console.log(`Synced ${source} -> ${target}`);
