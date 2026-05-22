import { getStore } from "@netlify/blobs";

async function generateMarketArticle() {
  const date = new Date().toISOString().slice(0, 10);
  const ids = "bitcoin,ethereum,solana,binancecoin,ripple";
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,cny&include_24hr_change=true&include_market_cap=true`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("行情数据获取失败");
  const data = await res.json();
  const names = { bitcoin: "Bitcoin", ethereum: "Ethereum", solana: "Solana", binancecoin: "BNB", ripple: "XRP" };
  const rows = Object.entries(data).map(([id, value]) => ({
    name: names[id] || id,
    usd: value.usd,
    cny: value.cny,
    change24h: value.usd_24h_change,
    marketCap: value.usd_market_cap
  }));
  const leaders = [...rows].sort((a, b) => (b.change24h || 0) - (a.change24h || 0));
  return {
    id: `daily-${date}`,
    date,
    title: `Crypto Daily｜${date} 市场观察`,
    summary: `今日主流资产中，${leaders[0].name} 24小时表现相对更强，${leaders.at(-1).name} 表现相对偏弱。`,
    rows,
    paragraphs: [
      "今天的行情观察重点仍然放在主流资产的相对强弱，而不是单点价格预测。",
      `${leaders[0].name} 当前 24 小时涨跌幅约为 ${leaders[0].change24h.toFixed(2)}%，在本组观察资产中相对靠前。`,
      `${leaders.at(-1).name} 当前 24 小时涨跌幅约为 ${leaders.at(-1).change24h.toFixed(2)}%，相对偏弱，需要继续观察资金是否撤出该方向。`,
      "每日行情文章的价值不是直接告诉你买什么，而是训练你把价格、叙事、流动性和风险放在同一张图里看。"
    ],
    createdAt: new Date().toISOString()
  };
}

function fallbackArticle() {
  const date = new Date().toISOString().slice(0, 10);
  return {
    id: `daily-${date}`,
    date,
    title: `Crypto Daily｜${date} 市场观察`,
    summary: "今日行情文章已生成。行情接口暂时不可用时，本页会先给出学习型市场观察，后续自动更新会继续补充实时数据。",
    rows: [],
    paragraphs: [
      "今天的观察重点是保持对市场结构的敏感，而不是把单日涨跌当成结论。",
      "对于新进入 Web3 的学习者，每日文章更重要的作用是训练观察框架：先看 BTC 和 ETH 的方向，再看高 beta 资产是否跟随，最后再判断具体赛道是否出现资金轮动。",
      "如果市场短期快速上涨，要警惕追高和杠杆；如果市场快速下跌，要优先确认自己的仓位、钱包安全和流动性需求。",
      "ChainPulse 会把每日行情内容沉淀成文章，帮助成员形成长期可复用的市场观察习惯。"
    ],
    createdAt: new Date().toISOString()
  };
}

async function generateArticleSafely() {
  try {
    return await generateMarketArticle();
  } catch {
    return fallbackArticle();
  }
}

export async function handler() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_TOKEN;
  const store = siteID && token ? getStore({ name: "chainpulse-db", siteID, token }) : getStore("chainpulse-db");
  const db = await store.get("db", { type: "json" });
  if (!db) return { statusCode: 404, body: "db not initialized" };
  const article = await generateArticleSafely();
  db.articles = (db.articles || []).filter(item => item.id !== article.id);
  db.articles.unshift(article);
  await store.setJSON("db", db);
  return { statusCode: 200, body: JSON.stringify({ ok: true, article: article.title }) };
}
