import fs from "node:fs";
import path from "node:path";

const sourceDir = "/Users/skylerlan/Documents/Codex/2026-05-17/chainpulse-2/content/crypto-daily";
const targetDir = path.join(process.cwd(), "netlify", "functions", "data", "crypto-daily");

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

function sourceFilesThroughToday() {
  const key = todayKey();
  const availableDates = fs.readdirSync(sourceDir)
    .map(file => file.match(/^(\d{4}-\d{2}-\d{2})(?:-.+)?\.json$/)?.[1])
    .filter(Boolean)
    .filter(date => date <= key)
    .sort();
  const latestDate = availableDates.at(-1);
  if (!latestDate) throw new Error(`没有找到截至今日的 Crypto Daily 文章：${sourceDir}`);

  return fs.readdirSync(sourceDir)
    .filter(file => /^\d{4}-\d{2}-\d{2}(?:-.+)?\.json$/.test(file) && file.slice(0, 10) <= latestDate)
    .sort();
}

fs.mkdirSync(targetDir, { recursive: true });
for (const file of sourceFilesThroughToday()) {
  const source = path.join(sourceDir, file);
  const target = path.join(targetDir, file);
  fs.copyFileSync(source, target);
  console.log(`Synced ${source} -> ${target}`);
}
