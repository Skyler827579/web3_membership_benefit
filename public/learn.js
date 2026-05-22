const token = new URLSearchParams(location.search).get("token") || "";
const msg = document.getElementById("contentMsg");
const root = document.getElementById("learningContent");
document.getElementById("backLink").href = `/member.html?token=${encodeURIComponent(token)}`;

async function main() {
  try {
    const res = await fetch(`/api/content/learning?token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "学习内容加载失败");
    msg.textContent = `${data.pageCount} 页学习资料，已按原版页面格式展示。`;
    root.innerHTML = data.pages.map(page => `
      <article class="rendered-page">
        <img src="/api/content/page?token=${encodeURIComponent(token)}&page=${page.page}" alt="第 ${page.page} 页" loading="lazy" draggable="false" />
        <div class="rendered-page-label">第 ${page.page} 页</div>
      </article>
    `).join("");
  } catch (error) {
    msg.textContent = error.message;
    msg.classList.add("error");
  }
}

main();
