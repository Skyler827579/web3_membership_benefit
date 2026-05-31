const token = new URLSearchParams(location.search).get("token") || "";
const msg = document.getElementById("contentMsg");
const root = document.getElementById("learningContent");
document.getElementById("backLink").href = `/member.html?token=${encodeURIComponent(token)}`;

document.addEventListener("contextmenu", event => event.preventDefault());
document.addEventListener("dragstart", event => event.preventDefault());

async function drawPage(canvas, pageNumber) {
  const res = await fetch(`/api/content/page?token=${encodeURIComponent(token)}&page=${pageNumber}`);
  if (!res.ok) throw new Error("页面图片加载失败");
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || Math.min(bitmap.width, 920);
  const height = Math.round(width * bitmap.height / bitmap.width);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
}

async function main() {
  try {
    const res = await fetch(`/api/content/learning?token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "学习内容加载失败");
    msg.textContent = data.updateNotice || `资料已更新：${data.pageCount} 页学习资料，已按原版页面格式展示。`;
    root.innerHTML = data.pages.map(page => `
      <article class="rendered-page">
        <canvas data-page="${page.page}" aria-label="第 ${page.page} 页"></canvas>
        <div class="rendered-page-label">第 ${page.page} 页</div>
      </article>
    `).join("");
    for (const canvas of root.querySelectorAll("canvas[data-page]")) {
      await drawPage(canvas, canvas.dataset.page);
    }
  } catch (error) {
    msg.textContent = error.message;
    msg.classList.add("error");
  }
}

main();
