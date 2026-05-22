const token = new URLSearchParams(location.search).get("token") || "";
const msg = document.getElementById("contentMsg");
const root = document.getElementById("articles");
document.getElementById("backLink").href = `/member.html?token=${encodeURIComponent(token)}`;

function number(value, digits = 2) {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: digits });
}

async function main() {
  try {
    const res = await fetch(`/api/articles?token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "文章加载失败");
    if (!data.articles.length) {
      msg.textContent = "还没有生成每日文章。请在后台生成第一篇，之后可由定时脚本每天更新。";
      return;
    }
    msg.textContent = `共 ${data.articles.length} 篇文章。`;
    root.innerHTML = data.articles.map(article => `
      <article class="content-card">
        <div class="eyebrow">${article.date}</div>
        <h2>${article.title}</h2>
        <p class="lead">${article.summary}</p>
        <div class="market-table">
          ${(article.rows || []).map(row => `
            <div>
              <strong>${row.name}</strong>
              <span>$${number(row.usd)} / ¥${number(row.cny)}</span>
              <em class="${row.change24h >= 0 ? "up" : "down"}">${number(row.change24h)}%</em>
            </div>
          `).join("")}
        </div>
        ${(article.paragraphs || []).map(p => `<p>${p}</p>`).join("")}
      </article>
    `).join("");
  } catch (error) {
    msg.textContent = error.message;
    msg.classList.add("error");
  }
}

main();
