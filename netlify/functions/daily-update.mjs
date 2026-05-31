import { getStore } from "@netlify/blobs";

function percent(value) {
  return typeof value === "number" ? `${value.toFixed(2)}%` : "暂无数据";
}

function priceLine(row) {
  if (!row) return "暂无实时价格";
  const usd = typeof row.usd === "number" ? `$${row.usd.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "美元价格暂无";
  const cny = typeof row.cny === "number" ? `约 ¥${row.cny.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "人民币价格暂无";
  return `${usd}，${cny}`;
}

function buildMarketParagraphs(strongest, weakest) {
  return [
    "今天先看一个核心问题：主流资产之间谁更强、谁更弱。这个判断比单独盯一个价格更有用，因为它能帮助你看出资金当前更愿意停留在哪些方向。",
    `${strongest.name} 当前 24 小时涨跌幅约为 ${percent(strongest.change24h)}，在本组观察资产中相对靠前。短线强势不等于马上要继续上涨，但说明市场今天对它的接受度更高。`,
    `${weakest.name} 当前 24 小时涨跌幅约为 ${percent(weakest.change24h)}，相对偏弱。偏弱资产要继续观察：这是正常回调，还是资金正在从这个方向撤出。`,
    "这篇每日文章不直接给买卖建议，而是帮助你训练一种市场阅读方式：把价格、相对强弱、叙事热度和风险放在同一张图里看。"
  ];
}

function buildFullArticle({ date, rows, strongest, weakest }) {
  const btc = rows.find(item => item.name === "Bitcoin");
  const eth = rows.find(item => item.name === "Ethereum");
  const sol = rows.find(item => item.name === "Solana");
  const bnb = rows.find(item => item.name === "BNB");
  return [
    { type: "h3", text: "今日市场主线" },
    { type: "p", text: `${date} 的市场观察，重点不在于猜一个短期点位，而在于判断主流资产之间的强弱关系。今天在观察列表里，${strongest.name} 的 24 小时表现相对靠前，${weakest.name} 相对承压。对普通用户来说，这句话的意思是：资金今天并不是平均分配到每个资产上，而是更偏向某些方向，同时回避另一些方向。` },
    { type: "p", text: `Bitcoin 当前价格为 ${priceLine(btc)}；Ethereum 当前价格为 ${priceLine(eth)}。BTC 和 ETH 仍然是市场情绪的两个锚点：BTC 更像整个加密市场的风险温度计，ETH 则更能反映链上应用、Layer2、DeFi 和开发者生态的信心。` },
    { type: "h3", text: "怎么读今天的涨跌" },
    { type: "p", text: `如果只看单个币的涨跌，很容易被短线波动带着走。更好的读法是先把资产放在一起比较：${strongest.name} 约为 ${percent(strongest.change24h)}，${weakest.name} 约为 ${percent(weakest.change24h)}。两者的差距越明显，说明市场内部的分化越强。分化本身就是信息，它告诉我们资金不是在无差别买入或卖出。` },
    { type: "p", text: sol ? `Solana 当前价格为 ${priceLine(sol)}。这类高活跃公链资产通常波动更大，涨的时候更容易吸引注意力，跌的时候也更容易放大情绪。看它时不要只看价格，还要看生态活跃度、链上交易热度和开发者叙事有没有同步跟上。` : "高活跃公链资产通常波动更大，涨跌都容易放大情绪。看这类资产时，不要只看价格，还要看生态活跃度、链上交易热度和开发者叙事有没有同步跟上。" },
    { type: "h3", text: "普通用户今天该关注什么" },
    { type: "p", text: "第一，看自己是不是被单日涨跌带着做决定。每日行情最大的价值不是让你每天交易，而是让你逐渐形成判断顺序：先看大盘情绪，再看主流资产强弱，然后看具体赛道，最后才考虑单个项目。" },
    { type: "p", text: bnb ? `第二，留意相对强势资产是否只是短线避险，还是背后有真实事件推动。比如 ${bnb.name} 当前价格为 ${priceLine(bnb)}，如果它表现强于其他资产，需要继续看交易所生态、链上活动和资金流是否支撑这种强势。` : "第二，留意相对强势资产是否只是短线避险，还是背后有真实事件推动。强势如果没有成交量、生态事件或资金流配合，持续性通常要打折扣。" },
    { type: "p", text: "第三，控制仓位和预期。市场上涨时，最容易把短期反弹误读成长期趋势；市场下跌时，也容易把正常回调误读成系统性风险。每天稳定观察，比每天急着下结论更重要。" },
    { type: "h3", text: "ChainPulse 今日结论" },
    { type: "p", text: `今天的结论可以压缩成一句话：市场仍然需要用“相对强弱”来读，而不是只盯一个价格。${strongest.name} 的相对强势值得继续观察，${weakest.name} 的偏弱也需要看后续是否修复。对学习者来说，先把这套观察框架练熟，比追逐单日预测更有价值。` }
  ];
}

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
  const strongest = leaders[0];
  const weakest = leaders.at(-1);
  return {
    id: `daily-${date}`,
    date,
    title: `Crypto Daily｜${date} 市场观察`,
    summary: `今日主流资产中，${strongest.name} 24小时表现相对更强，${weakest.name} 表现相对偏弱。`,
    rows,
    paragraphs: buildMarketParagraphs(strongest, weakest),
    fullArticle: buildFullArticle({ date, rows, strongest, weakest }),
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
    fullArticle: [
      { type: "h3", text: "今日市场主线" },
      { type: "p", text: "今天行情接口暂时不可用，所以这篇文章先给出学习型市场观察。遇到数据缺口时，普通用户最容易犯的错误是急着用不完整信息做判断。更稳妥的方式，是先回到市场结构：BTC 和 ETH 是否稳定，主流资产是否同步，资金有没有明显从高风险资产撤出。" },
      { type: "h3", text: "普通用户怎么处理这种情况" },
      { type: "p", text: "如果实时行情没有完整刷新，不要急着把上一条价格当成当前市场。先确认交易所、钱包和行情网站的数据是否一致，再看是否有宏观事件、链上安全事件或流动性变化。学习阶段，信息确认比速度更重要。" },
      { type: "h3", text: "ChainPulse 今日结论" },
      { type: "p", text: "今天的重点不是给出单个价格判断，而是提醒你建立观察顺序：先确认数据，再看主流资产，再看赛道轮动，最后才看具体项目。这个顺序越稳定，越不容易被短期波动带偏。" }
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
  const store = getStore("chainpulse-db");
  const db = await store.get("db", { type: "json" });
  if (!db) return { statusCode: 404, body: "db not initialized" };
  const article = await generateArticleSafely();
  db.articles = (db.articles || []).filter(item => item.id !== article.id);
  db.articles.unshift(article);
  await store.setJSON("db", db);
  return { statusCode: 200, body: JSON.stringify({ ok: true, article: article.title }) };
}
