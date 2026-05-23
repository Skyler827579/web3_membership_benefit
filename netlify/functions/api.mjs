import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

function bundledFile(name) {
  const candidates = [
    path.join(process.env.LAMBDA_TASK_ROOT || "", "netlify", "functions", "data", name),
    path.join(process.env.LAMBDA_TASK_ROOT || "", "data", name),
    path.join(process.env.LAMBDA_TASK_ROOT || "", "protected", "content", name),
    path.join(process.cwd(), "netlify", "functions", "data", name),
    path.join(process.cwd(), "protected", "content", name),
    path.join(process.cwd(), "data", name)
  ];
  const found = candidates.find(file => file && fs.existsSync(file));
  if (!found) throw new Error(`Bundled data file not found: ${name}`);
  return found;
}

function bundledDir(name) {
  const candidates = [
    path.join(process.env.LAMBDA_TASK_ROOT || "", "netlify", "functions", "data", name),
    path.join(process.env.LAMBDA_TASK_ROOT || "", "data", name),
    path.join(process.cwd(), "netlify", "functions", "data", name),
    path.join(process.cwd(), "data", name)
  ];
  return candidates.find(dir => dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) || null;
}

const SEED_DB = bundledFile("db.json");
const LEARNING = bundledFile(path.join("learning-pages", "manifest.json"));

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    body: JSON.stringify(body)
  };
}

function binary(statusCode, body, contentType) {
  return {
    statusCode,
    isBase64Encoded: true,
    headers: { "content-type": contentType, "cache-control": "private, no-store" },
    body: body.toString("base64")
  };
}

function dbStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_TOKEN;
  if (siteID && token) return getStore({ name: "chainpulse-db", siteID, token });
  return getStore("chainpulse-db");
}

async function readDb() {
  const store = dbStore();
  const saved = await store.get("db", { type: "json" });
  if (saved) return saved;
  const seed = JSON.parse(fs.readFileSync(SEED_DB, "utf8"));
  await store.setJSON("db", seed);
  return seed;
}

async function writeDb(db) {
  const store = dbStore();
  await store.setJSON("db", db);
}

function body(event) {
  if (!event.body) return {};
  return JSON.parse(event.body);
}

function safeToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function inviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "WEB3-";
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function publicProduct(product) {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    price: product.price,
    currency: product.currency
  };
}

function paidOrderByToken(db, token) {
  return db.orders.find(item => item.unlockToken === token && item.status === "paid");
}

function admin(event, db) {
  const token = event.headers.authorization?.replace("Bearer ", "");
  return token && token === db.settings.adminToken;
}

function adminPassword(db) {
  return process.env.ADMIN_PASSWORD || db.settings.adminPassword;
}

function wechatQr(db) {
  return process.env.WECHAT_QR_PATH || db.settings.wechatQr;
}

function redeemLockedMessage() {
  return "这个邀请码已经被使用。请使用付款后保存的会员入口，或联系管理员重新发送访问链接。";
}

function routePath(event) {
  return event.path
    .replace(/^\/\.netlify\/functions\/api/, "")
    .replace(/^\/api/, "") || "/";
}

function cleanArticleText(value) {
  return String(value || "")
    .replaceAll("口播稿", "文章")
    .replaceAll("口播", "讲解");
}

function textList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(cleanArticleText).filter(Boolean);
  return cleanArticleText(value).split(/\n{2,}/).map(item => item.trim()).filter(Boolean);
}

function blocks(title, value) {
  const items = textList(value);
  if (!items.length) return [];
  return [{ type: "h3", text: title }, ...items.map(text => ({ type: "p", text }))];
}

function sourceLabel(source) {
  if (!source) return "";
  const title = cleanArticleText(source.title || source.publisher || source.url);
  const publisher = source.publisher ? `｜${cleanArticleText(source.publisher)}` : "";
  const note = source.note ? `：${cleanArticleText(source.note)}` : "";
  return `${title}${publisher}${note}`;
}

function transformCryptoDaily(raw) {
  const fullArticle = [
    ...blocks("核心结论", raw.hook),
    ...blocks("一针见血角度", raw.sharp_angle),
    ...blocks("辅助观点", raw.supporting_viewpoints),
    ...blocks("核心数据", raw.core_data),
    ...blocks("主要变化", raw.main_moves),
    ...blocks("宏观与跨市场背景", raw.macro_background),
    ...blocks("技术与情绪观察", [...textList(raw.technical_view), ...textList(raw.sentiment_view)]),
    ...blocks("完整正文", raw.script),
    ...blocks("风险提示", raw.risk_notes),
    ...blocks("总结框架", raw.summary_framework)
  ];
  return {
    id: `crypto-daily-${raw.date || raw.slug || safeToken(4)}`,
    date: raw.date,
    title: cleanArticleText(raw.title || "ChainPulse Daily 市场观察"),
    summary: cleanArticleText(raw.market_one_liner || raw.hook || ""),
    rows: [],
    paragraphs: [raw.market_one_liner, raw.sharp_angle].map(cleanArticleText).filter(Boolean),
    fullArticle,
    categories: Array.isArray(raw.categories) ? raw.categories.map(cleanArticleText) : [],
    tags: Array.isArray(raw.tags) ? raw.tags.map(cleanArticleText) : [],
    sources: Array.isArray(raw.sources) ? raw.sources.map(source => ({ ...source, label: sourceLabel(source) })) : [],
    createdAt: raw.date ? `${raw.date}T00:00:00.000Z` : new Date().toISOString()
  };
}

function loadSyncedDailyArticles() {
  const dir = bundledDir("crypto-daily");
  if (!dir) return [];
  return fs.readdirSync(dir)
    .filter(file => file.endsWith(".json"))
    .sort()
    .reverse()
    .map(file => transformCryptoDaily(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))));
}

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
    {
      type: "p",
      text: `${date} 的市场观察，重点不在于猜一个短期点位，而在于判断主流资产之间的强弱关系。今天在观察列表里，${strongest.name} 的 24 小时表现相对靠前，${weakest.name} 相对承压。对普通用户来说，这句话的意思是：资金今天并不是平均分配到每个资产上，而是更偏向某些方向，同时回避另一些方向。`
    },
    {
      type: "p",
      text: `Bitcoin 当前价格为 ${priceLine(btc)}；Ethereum 当前价格为 ${priceLine(eth)}。BTC 和 ETH 仍然是市场情绪的两个锚点：BTC 更像整个加密市场的风险温度计，ETH 则更能反映链上应用、Layer2、DeFi 和开发者生态的信心。`
    },
    { type: "h3", text: "怎么读今天的涨跌" },
    {
      type: "p",
      text: `如果只看单个币的涨跌，很容易被短线波动带着走。更好的读法是先把资产放在一起比较：${strongest.name} 约为 ${percent(strongest.change24h)}，${weakest.name} 约为 ${percent(weakest.change24h)}。两者的差距越明显，说明市场内部的分化越强。分化本身就是信息，它告诉我们资金不是在无差别买入或卖出。`
    },
    {
      type: "p",
      text: sol ? `Solana 当前价格为 ${priceLine(sol)}。这类高活跃公链资产通常波动更大，涨的时候更容易吸引注意力，跌的时候也更容易放大情绪。看它时不要只看价格，还要看生态活跃度、链上交易热度和开发者叙事有没有同步跟上。` : "高活跃公链资产通常波动更大，涨跌都容易放大情绪。看这类资产时，不要只看价格，还要看生态活跃度、链上交易热度和开发者叙事有没有同步跟上。"
    },
    { type: "h3", text: "普通用户今天该关注什么" },
    {
      type: "p",
      text: "第一，看自己是不是被单日涨跌带着做决定。每日行情最大的价值不是让你每天交易，而是让你逐渐形成判断顺序：先看大盘情绪，再看主流资产强弱，然后看具体赛道，最后才考虑单个项目。"
    },
    {
      type: "p",
      text: bnb ? `第二，留意相对强势资产是否只是短线避险，还是背后有真实事件推动。比如 ${bnb.name} 当前价格为 ${priceLine(bnb)}，如果它表现强于其他资产，需要继续看交易所生态、链上活动和资金流是否支撑这种强势。` : "第二，留意相对强势资产是否只是短线避险，还是背后有真实事件推动。强势如果没有成交量、生态事件或资金流配合，持续性通常要打折扣。"
    },
    {
      type: "p",
      text: "第三，控制仓位和预期。市场上涨时，最容易把短期反弹误读成长期趋势；市场下跌时，也容易把正常回调误读成系统性风险。每天稳定观察，比每天急着下结论更重要。"
    },
    { type: "h3", text: "ChainPulse 今日结论" },
    {
      type: "p",
      text: `今天的结论可以压缩成一句话：市场仍然需要用“相对强弱”来读，而不是只盯一个价格。${strongest.name} 的相对强势值得继续观察，${weakest.name} 的偏弱也需要看后续是否修复。对学习者来说，先把这套观察框架练熟，比追逐单日预测更有价值。`
    }
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
      "今天的观察重点是保持对市场结构的敏感，而不是把单日涨跌当成结论。Web3 市场波动大，短期价格通常同时受到宏观流动性、主流资产强弱、叙事热度和链上资金流影响。",
      "对于新进入 Web3 的学习者，每日文章更重要的作用是训练观察框架：先看 BTC 和 ETH 的方向，再看高 beta 资产是否跟随，最后再判断具体赛道是否出现资金轮动。",
      "如果市场短期快速上涨，要警惕追高和杠杆；如果市场快速下跌，要优先确认自己的仓位、钱包安全和流动性需求。学习阶段最重要的是活下来，而不是猜中每一次波动。",
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

export async function handler(event) {
  try {
    const method = event.httpMethod;
    const pathname = routePath(event);
    const query = event.queryStringParameters || {};

    if (method === "GET" && pathname === "/health") {
      return json(200, {
        ok: true,
        hasAdminPassword: Boolean(process.env.ADMIN_PASSWORD),
        hasWechatQrPath: Boolean(process.env.WECHAT_QR_PATH),
        hasNetlifySiteId: Boolean(process.env.NETLIFY_SITE_ID || process.env.SITE_ID),
        hasNetlifyAuthToken: Boolean(process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_TOKEN)
      });
    }

    const db = await readDb();

    if (method === "GET" && pathname === "/products") {
      return json(200, { products: db.products.map(publicProduct), wechatQr: wechatQr(db) });
    }

    if (method === "POST" && pathname === "/invite/redeem") {
      const { code, productId } = body(event);
      const invite = db.invites.find(item => item.code === String(code || "").trim().toUpperCase());
      const product = db.products.find(item => item.id === productId);
      if (!product) return json(404, { error: "资料不存在" });
      if (!invite || invite.productId !== productId || invite.status !== "active") return json(400, { error: "邀请码无效，或不适用于当前资料" });
      if (invite.usedAt) return json(409, { error: redeemLockedMessage() });
      let order = db.orders.find(item => item.inviteCode === invite.code && item.productId === productId);
      if (!order) {
        order = { id: safeToken(8), productId, inviteCode: invite.code, amount: product.price, status: "pending", unlockToken: safeToken(18), createdAt: new Date().toISOString() };
        db.orders.unshift(order);
        invite.usedAt = new Date().toISOString();
        invite.status = "used";
        await writeDb(db);
      }
      return json(200, { product: publicProduct(product), order: { id: order.id, amount: order.amount, status: order.status, unlockToken: order.status === "paid" ? order.unlockToken : null }, wechatQr: wechatQr(db) });
    }

    if (method === "GET" && pathname === "/order/status") {
      const order = db.orders.find(item => item.id === query.id);
      if (!order) return json(404, { error: "订单不存在" });
      return json(200, { id: order.id, status: order.status, unlockToken: order.status === "paid" ? order.unlockToken : null });
    }

    if (method === "GET" && pathname === "/content/learning") {
      if (!paidOrderByToken(db, query.token)) return json(403, { error: "尚未解锁，请先完成付款并等待后台确认" });
      return json(200, JSON.parse(fs.readFileSync(LEARNING, "utf8")));
    }

    if (method === "GET" && pathname === "/content/page") {
      if (!paidOrderByToken(db, query.token)) return json(403, { error: "尚未解锁，请先完成付款并等待后台确认" });
      const page = String(query.page || "").padStart(2, "0");
      if (!/^\d{2}$/.test(page)) return json(400, { error: "页码不正确" });
      const file = bundledFile(path.join("learning-pages", `page-${page}.jpg`));
      return binary(200, fs.readFileSync(file), "image/jpeg");
    }

    if (method === "GET" && pathname === "/content/community") {
      if (!paidOrderByToken(db, query.token)) return json(403, { error: "尚未解锁，请先完成付款并等待后台确认" });
      return json(200, { title: "ChainPulse 社群资源", items: [{ title: "每日文章更新", text: "围绕主流资产行情、链上数据、Web3 赛道和风险提示进行持续更新。" }, { title: "基础学习资料", text: "64页学习内容已网页化，按模块拆成章节，适合随时复习。" }, { title: "上海 Web3 社群资源", text: "用于连接线下活动、行业交流、项目方资源和学习伙伴。" }], note: "正式运营时，可以把真实微信群二维码或企微入口放到后台配置。" });
    }

    if (method === "GET" && pathname === "/articles") {
      if (!paidOrderByToken(db, query.token)) return json(403, { error: "尚未解锁，请先完成付款并等待后台确认" });
      const syncedArticles = loadSyncedDailyArticles();
      if (!db.articles?.length && !syncedArticles.length) {
        const article = await generateArticleSafely();
        db.articles = [article];
        await writeDb(db);
      }
      return json(200, { articles: [...syncedArticles, ...(db.articles || [])] });
    }

    if (method === "POST" && pathname === "/admin/login") {
      const { password } = body(event);
      if (password !== adminPassword(db)) return json(401, { error: "后台密码不正确" });
      db.settings.adminToken = safeToken(18);
      await writeDb(db);
      return json(200, { token: db.settings.adminToken });
    }

    if (pathname.startsWith("/admin/")) {
      if (!admin(event, db)) return json(401, { error: "请先登录后台" });
      if (method === "GET" && pathname === "/admin/dashboard") return json(200, { products: db.products.map(publicProduct), invites: db.invites, orders: db.orders, settings: { wechatQr: wechatQr(db) } });
      if (method === "POST" && pathname === "/admin/invites") {
        const { productId = "web3-64", count = 1 } = body(event);
        const created = [];
        for (let i = 0; i < Math.max(1, Math.min(Number(count) || 1, 100)); i++) {
          let code;
          do code = inviteCode(); while (db.invites.some(item => item.code === code));
          const invite = { code, productId, status: "active", createdAt: new Date().toISOString() };
          db.invites.unshift(invite);
          created.push(invite);
        }
        await writeDb(db);
        return json(200, { created, invites: db.invites });
      }
      if (method === "POST" && pathname === "/admin/orders/mark-paid") {
        const { orderId } = body(event);
        const order = db.orders.find(item => item.id === orderId);
        if (!order) return json(404, { error: "订单不存在" });
        order.status = "paid";
        order.paidAt = new Date().toISOString();
        await writeDb(db);
        return json(200, { order });
      }
      if (method === "POST" && pathname === "/admin/articles/generate") {
        const article = await generateArticleSafely();
        db.articles = (db.articles || []).filter(item => item.id !== article.id);
        db.articles.unshift(article);
        await writeDb(db);
        return json(200, { article });
      }
    }

    return json(404, { error: "接口不存在" });
  } catch (error) {
    return json(500, { error: error.message || "服务器错误" });
  }
}
