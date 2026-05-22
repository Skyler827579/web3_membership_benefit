let token = localStorage.getItem("web3-admin-token") || "";

const $ = id => document.getElementById(id);

function setMessage(node, text, type = "") {
  node.textContent = text;
  node.className = `message ${type}`.trim();
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function login() {
  const password = $("passwordInput").value;
  setMessage($("loginMsg"), "正在登录...");
  try {
    const data = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password })
    });
    token = data.token;
    localStorage.setItem("web3-admin-token", token);
    $("loginBox").classList.add("hidden");
    $("dashboard").classList.remove("hidden");
    await loadDashboard();
  } catch (error) {
    setMessage($("loginMsg"), error.message, "error");
  }
}

async function loadDashboard() {
  const data = await api("/api/admin/dashboard");
  renderOrders(data.orders);
  renderInvites(data.invites);
}

function renderOrders(orders) {
  const body = $("ordersBody");
  body.innerHTML = "";
  if (!orders.length) {
    body.innerHTML = `<tr><td colspan="5">暂无订单。客户输入邀请码后会出现在这里。</td></tr>`;
    return;
  }
  for (const order of orders) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${order.id}</td>
      <td>${order.inviteCode}</td>
      <td>¥${order.amount}</td>
      <td><span class="status ${order.status === "paid" ? "paid" : "waiting"}">${order.status === "paid" ? "已付款" : "待确认"}</span></td>
      <td>${order.status === "paid" ? "已解锁" : `<button data-order="${order.id}">确认已付款</button>`}</td>
    `;
    body.appendChild(tr);
  }
  body.querySelectorAll("button[data-order]").forEach(button => {
    button.addEventListener("click", () => markPaid(button.dataset.order));
  });
}

function renderInvites(invites) {
  const list = $("inviteList");
  list.innerHTML = "";
  if (!invites.length) {
    list.innerHTML = `<p>还没有邀请码。</p>`;
    return;
  }
  for (const invite of invites) {
    const card = document.createElement("div");
    card.className = "invite-card";
    card.innerHTML = `
      <strong>${invite.code}</strong>
      <span>${invite.status === "active" ? "可使用" : invite.status} · ${invite.productId}</span>
    `;
    card.addEventListener("click", async () => {
      await navigator.clipboard.writeText(invite.code);
      card.querySelector("span").textContent = "已复制";
      setTimeout(loadDashboard, 700);
    });
    list.appendChild(card);
  }
}

async function createInvites() {
  const count = Number($("inviteCount").value) || 1;
  setMessage($("createMsg"), "正在生成...");
  try {
    const data = await api("/api/admin/invites", {
      method: "POST",
      body: JSON.stringify({ productId: "web3-64", count })
    });
    setMessage($("createMsg"), `已生成 ${data.created.length} 个邀请码。点击邀请码可复制。`, "success");
    await loadDashboard();
  } catch (error) {
    setMessage($("createMsg"), error.message, "error");
  }
}

async function markPaid(orderId) {
  await api("/api/admin/orders/mark-paid", {
    method: "POST",
    body: JSON.stringify({ orderId })
  });
  await loadDashboard();
}

async function generateArticle() {
  setMessage($("articleMsg"), "正在生成今日文章...");
  try {
    const data = await api("/api/admin/articles/generate", { method: "POST", body: "{}" });
    setMessage($("articleMsg"), `已生成：${data.article.title}`, "success");
  } catch (error) {
    setMessage($("articleMsg"), error.message, "error");
  }
}

$("loginBtn").addEventListener("click", login);
$("passwordInput").addEventListener("keydown", event => {
  if (event.key === "Enter") login();
});
$("createInviteBtn").addEventListener("click", createInvites);
$("generateArticleBtn").addEventListener("click", generateArticle);

if (token) {
  $("loginBox").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  loadDashboard().catch(() => {
    localStorage.removeItem("web3-admin-token");
    token = "";
    $("loginBox").classList.remove("hidden");
    $("dashboard").classList.add("hidden");
  });
}
