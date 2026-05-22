let productId = "web3-64";
let currentOrderId = null;

const $ = id => document.getElementById(id);

function showStep(id) {
  ["stepInvite", "stepPay", "stepUnlocked"].forEach(step => $(step).classList.toggle("active", step === id));
}

function setMessage(node, text, type = "") {
  node.textContent = text;
  node.className = `message ${type}`.trim();
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function loadProducts() {
  const data = await api("/api/products");
  const product = data.products[0];
  productId = product.id;
  $("productTitle").textContent = product.title;
  $("productDesc").textContent = product.description;
  $("priceText").textContent = `¥${product.price}`;
  $("payAmount").textContent = `¥${product.price}`;
  $("wechatQr").src = data.wechatQr;
}

async function redeemInvite() {
  const code = $("inviteInput").value.trim().toUpperCase();
  if (!code) return setMessage($("inviteMsg"), "请输入邀请码。", "error");
  $("redeemBtn").disabled = true;
  setMessage($("inviteMsg"), "正在验证邀请码...");
  try {
    const data = await api("/api/invite/redeem", {
      method: "POST",
      body: JSON.stringify({ code, productId })
    });
    currentOrderId = data.order.id;
    $("wechatQr").src = data.wechatQr;
    $("payAmount").textContent = `¥${data.order.amount}`;
    $("orderCode").textContent = `请备注邀请码：${code}；订单号：${data.order.id}`;
    setMessage($("inviteMsg"), "");
    if (data.order.status === "paid") {
      unlock(data.order.unlockToken);
    } else {
      $("orderStatus").textContent = "待付款确认";
      $("orderStatus").className = "status waiting";
      showStep("stepPay");
    }
  } catch (error) {
    setMessage($("inviteMsg"), error.message, "error");
  } finally {
    $("redeemBtn").disabled = false;
  }
}

async function refreshStatus() {
  if (!currentOrderId) return;
  setMessage($("payMsg"), "正在查询解锁状态...");
  try {
    const data = await api(`/api/order/status?id=${encodeURIComponent(currentOrderId)}`);
    if (data.status === "paid") {
      unlock(data.unlockToken);
    } else {
      setMessage($("payMsg"), "后台还没有确认付款。确认后刷新即可解锁。");
    }
  } catch (error) {
    setMessage($("payMsg"), error.message, "error");
  }
}

function unlock(token) {
  $("orderStatus").textContent = "已解锁";
  $("orderStatus").className = "status paid";
  $("readerLink").href = `/member.html?token=${encodeURIComponent(token)}`;
  showStep("stepUnlocked");
}

$("redeemBtn").addEventListener("click", redeemInvite);
$("inviteInput").addEventListener("keydown", event => {
  if (event.key === "Enter") redeemInvite();
});
$("refreshBtn").addEventListener("click", refreshStatus);

loadProducts().catch(error => setMessage($("inviteMsg"), error.message, "error"));
