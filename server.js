const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const PROTECTED_DIR = path.join(ROOT, "protected");
const DB_PATH = path.join(ROOT, "data", "db.json");
const PORT = process.env.PORT || 4173;
const HOST = process.env.HOST || "127.0.0.1";

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function send(res, status, data, headers = {}) {
  const body = typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": Buffer.isBuffer(data) ? "application/octet-stream" : "application/json; charset=utf-8",
    ...headers
  });
  res.end(body);
}

function sendBinary(res, status, data, headers = {}) {
  res.writeHead(status, headers);
  res.end(data);
}

function jsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("请求内容过大"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON 格式不正确"));
      }
    });
  });
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

function requireAdmin(req, db) {
  const token = req.headers.authorization?.replace("Bearer ", "");
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

function learningPageFile(name) {
  const candidates = [
    path.join(ROOT, "netlify", "functions", "data", "learning-pages", name),
    path.join(PROTECTED_DIR, "learning-pages", name)
  ];
  const found = candidates.find(file => fs.existsSync(file));
  if (!found) throw new Error(`学习资料页面文件不存在：${name}`);
  return found;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function generateMarketArticle() {
  const date = todayKey();
  const ids = "bitcoin,ethereum,solana,binancecoin,ripple";
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,cny&include_24hr_change=true&include_market_cap=true`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("行情数据获取失败");
  const data = await res.json();
  const names = {
    bitcoin: "Bitcoin",
    ethereum: "Ethereum",
    solana: "Solana",
    binancecoin: "BNB",
    ripple: "XRP"
  };
  const rows = Object.entries(data).map(([id, value]) => ({
    name: names[id] || id,
    usd: value.usd,
    cny: value.cny,
    change24h: value.usd_24h_change,
    marketCap: value.usd_market_cap
  }));
  const leaders = [...rows].sort((a, b) => (b.change24h || 0) - (a.change24h || 0));
  const title = `Crypto Daily｜${date} 市场观察`;
  const summary = `今日主流资产中，${leaders[0].name} 24小时表现相对更强，${leaders.at(-1).name} 表现相对偏弱。本文用于快速把握主流资产价格、日内变化和风险提示。`;
  const paragraphs = [
    "今天的行情观察重点仍然放在主流资产的相对强弱，而不是单点价格预测。对学习者来说，价格只是结果，真正需要关注的是资金偏好、风险情绪和不同资产之间的轮动。",
    `${leaders[0].name} 当前 24 小时涨跌幅约为 ${leaders[0].change24h.toFixed(2)}%，在本组观察资产中相对靠前。短线强势不代表趋势已经确认，但它说明市场在当日更愿意给这类资产定价溢价。`,
    `${leaders.at(-1).name} 当前 24 小时涨跌幅约为 ${leaders.at(-1).change24h.toFixed(2)}%，相对偏弱。弱势资产需要观察它是短期回调，还是资金正在从该方向撤出。`,
    "对于刚进入 Web3 的用户，每日行情文章的价值不是直接告诉你买什么，而是训练你把价格、叙事、流动性和风险放在同一张图里看。长期看，这种判断力比单次交易结果更重要。"
  ];
  return { id: `daily-${date}`, date, title, summary, rows, paragraphs, createdAt: new Date().toISOString() };
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = decodeURIComponent(url.pathname);
  if (filePath === "/") filePath = "/index.html";
  const full = path.normalize(path.join(PUBLIC_DIR, filePath));
  if (!full.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden", { "Content-Type": "text/plain" });
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) return send(res, 404, "Not found", { "Content-Type": "text/plain" });
  const ext = path.extname(full).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".pdf": "application/pdf"
  };
  send(res, 200, fs.readFileSync(full), { "Content-Type": types[ext] || "application/octet-stream" });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = readDb();

  if (req.method === "GET" && url.pathname === "/api/products") {
    return send(res, 200, {
      products: db.products.map(publicProduct),
      wechatQr: wechatQr(db)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/invite/redeem") {
    const { code, productId } = await jsonBody(req);
    const invite = db.invites.find(item => item.code === String(code || "").trim().toUpperCase());
    const product = db.products.find(item => item.id === productId);
    if (!product) return send(res, 404, { error: "资料不存在" });
    if (!invite || invite.productId !== productId || invite.status !== "active") {
      return send(res, 400, { error: "邀请码无效，或不适用于当前资料" });
    }
    if (invite.usedAt) return send(res, 409, { error: redeemLockedMessage() });

    let order = db.orders.find(item => item.inviteCode === invite.code && item.productId === productId);
    if (!order) {
      order = {
        id: safeToken(8),
        productId,
        inviteCode: invite.code,
        amount: product.price,
        status: "pending",
        unlockToken: safeToken(18),
        createdAt: new Date().toISOString()
      };
      db.orders.unshift(order);
      invite.usedAt = new Date().toISOString();
      invite.status = "used";
      writeDb(db);
    }

    return send(res, 200, {
      product: publicProduct(product),
      order: {
        id: order.id,
        amount: order.amount,
        status: order.status,
        unlockToken: order.status === "paid" ? order.unlockToken : null
      },
      wechatQr: wechatQr(db)
    });
  }

  if (req.method === "GET" && url.pathname === "/api/order/status") {
    const id = url.searchParams.get("id");
    const token = url.searchParams.get("token");
    const order = db.orders.find(item => item.id === id);
    if (!order) return send(res, 404, { error: "订单不存在" });
    return send(res, 200, {
      id: order.id,
      status: order.status,
      unlockToken: order.status === "paid" ? order.unlockToken : null,
      matched: token ? token === order.unlockToken : false
    });
  }

  if (req.method === "GET" && url.pathname === "/api/content/learning") {
    const token = url.searchParams.get("token");
    if (!paidOrderByToken(db, token)) return send(res, 403, { error: "尚未解锁，请先完成付款并等待后台确认" });
    const file = learningPageFile("manifest.json");
    return send(res, 200, JSON.parse(fs.readFileSync(file, "utf8")));
  }

  if (req.method === "GET" && url.pathname === "/api/content/page") {
    const token = url.searchParams.get("token");
    if (!paidOrderByToken(db, token)) return send(res, 403, { error: "尚未解锁，请先完成付款并等待后台确认" });
    const page = String(url.searchParams.get("page") || "").padStart(2, "0");
    if (!/^\d{2,3}$/.test(page)) return send(res, 400, { error: "页码不正确" });
    const file = learningPageFile(`page-${page}.jpg`);
    if (!fs.existsSync(file)) return send(res, 404, { error: "页面不存在" });
    return sendBinary(res, 200, fs.readFileSync(file), {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store"
    });
  }

  if (req.method === "GET" && url.pathname === "/api/content/community") {
    const token = url.searchParams.get("token");
    if (!paidOrderByToken(db, token)) return send(res, 403, { error: "尚未解锁，请先完成付款并等待后台确认" });
    return send(res, 200, {
      title: "ChainPulse 社群资源",
      items: [
        { title: "每日文章更新", text: "围绕主流资产行情、链上数据、Web3 赛道和风险提示进行持续更新。" },
        { title: "基础学习资料", text: "资料已更新为93页深度完整版，已按原版页面格式网页化展示，适合随时复习。" },
        { title: "上海 Web3 社群资源", text: "用于连接线下活动、行业交流、项目方资源和学习伙伴。" }
      ],
      qr: "/assets/community-wechat.jpeg",
      qrTitle: "扫码添加 ChainPulse 微信",
      qrText: "添加微信后备注“ChainPulse 社群”，我们会协助你进入社群。"
    });
  }

  if (req.method === "GET" && url.pathname === "/api/articles") {
    const token = url.searchParams.get("token");
    if (!paidOrderByToken(db, token)) return send(res, 403, { error: "尚未解锁，请先完成付款并等待后台确认" });
    return send(res, 200, { articles: db.articles || [] });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const { password } = await jsonBody(req);
    if (password !== adminPassword(db)) return send(res, 401, { error: "后台密码不正确" });
    db.settings.adminToken = safeToken(18);
    writeDb(db);
    return send(res, 200, { token: db.settings.adminToken });
  }

  if (url.pathname.startsWith("/api/admin/")) {
    if (!requireAdmin(req, db)) return send(res, 401, { error: "请先登录后台" });

    if (req.method === "GET" && url.pathname === "/api/admin/dashboard") {
      return send(res, 200, {
        products: db.products.map(publicProduct),
        invites: db.invites,
        orders: db.orders,
        settings: { wechatQr: wechatQr(db) }
      });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/invites") {
      const { productId = "web3-64", count = 1 } = await jsonBody(req);
      const product = db.products.find(item => item.id === productId);
      if (!product) return send(res, 404, { error: "资料不存在" });
      const created = [];
      const total = Math.max(1, Math.min(Number(count) || 1, 100));
      for (let i = 0; i < total; i++) {
        let code;
        do code = inviteCode(); while (db.invites.some(item => item.code === code));
        const invite = {
          code,
          productId,
          status: "active",
          createdAt: new Date().toISOString()
        };
        db.invites.unshift(invite);
        created.push(invite);
      }
      writeDb(db);
      return send(res, 200, { created, invites: db.invites });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/orders/mark-paid") {
      const { orderId } = await jsonBody(req);
      const order = db.orders.find(item => item.id === orderId);
      if (!order) return send(res, 404, { error: "订单不存在" });
      order.status = "paid";
      order.paidAt = new Date().toISOString();
      writeDb(db);
      return send(res, 200, { order });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/settings/qr") {
      const { wechatQr } = await jsonBody(req);
      if (!wechatQr || !String(wechatQr).startsWith("/")) return send(res, 400, { error: "请输入站内二维码路径，例如 /assets/wechat-qr-placeholder.svg" });
      db.settings.wechatQr = wechatQr;
      writeDb(db);
      return send(res, 200, { wechatQr });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/articles/generate") {
      const article = await generateMarketArticle();
      db.articles = (db.articles || []).filter(item => item.id !== article.id);
      db.articles.unshift(article);
      writeDb(db);
      return send(res, 200, { article });
    }
  }

  return send(res, 404, { error: "接口不存在" });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch(error => send(res, 500, { error: error.message || "服务器错误" }));
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Web3资料库已启动：http://${HOST}:${PORT}`);
  console.log(`后台地址：http://${HOST}:${PORT}/admin.html`);
});
