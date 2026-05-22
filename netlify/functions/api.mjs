import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const ROOT = process.cwd();
const SEED_DB = path.join(ROOT, "data", "db.json");
const LEARNING = path.join(ROOT, "protected", "content", "learning.json");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    body: JSON.stringify(body)
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

export async function handler(event) {
  try {
    const db = await readDb();
    const method = event.httpMethod;
    const pathname = routePath(event);
    const query = event.queryStringParameters || {};

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

    if (method === "GET" && pathname === "/content/community") {
      if (!paidOrderByToken(db, query.token)) return json(403, { error: "尚未解锁，请先完成付款并等待后台确认" });
      return json(200, { title: "ChainPulse 社群资源", items: [{ title: "每日文章更新", text: "围绕主流资产行情、链上数据、Web3 赛道和风险提示进行持续更新。" }, { title: "基础学习资料", text: "64页学习内容已网页化，按模块拆成章节，适合随时复习。" }, { title: "上海 Web3 社群资源", text: "用于连接线下活动、行业交流、项目方资源和学习伙伴。" }], note: "正式运营时，可以把真实微信群二维码或企微入口放到后台配置。" });
    }

    if (method === "GET" && pathname === "/articles") {
      if (!paidOrderByToken(db, query.token)) return json(403, { error: "尚未解锁，请先完成付款并等待后台确认" });
      return json(200, { articles: db.articles || [] });
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
        const article = await generateMarketArticle();
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
