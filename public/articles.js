const token = new URLSearchParams(location.search).get("token") || "";
const msg = document.getElementById("contentMsg");
const root = document.getElementById("articles");
document.getElementById("backLink").href = `/member.html?token=${encodeURIComponent(token)}`;

function number(value, digits = 2) {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: digits });
}

function renderBlock(block) {
  if (typeof block === "string") return `<p>${block}</p>`;
  if (block.type === "h3") return `<h3>${block.text}</h3>`;
  return `<p>${block.text || ""}</p>`;
}

function renderSources(sources = []) {
  if (!sources.length) return "";
  return `
    <section class="article-sources">
      <h3>参考来源</h3>
      <ol>
        ${sources.map(source => `
          <li>
            <a href="${source.url}" target="_blank" rel="noreferrer">${source.label || source.title || source.url}</a>
          </li>
        `).join("")}
      </ol>
    </section>
  `;
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
    msg.textContent = `共 ${data.articles.length} 篇文章，点击标题展开阅读。`;
    root.innerHTML = data.articles.map(article => `
      <details class="article-item">
        <summary>
          <span>${article.date}</span>
          <strong>${article.title}</strong>
        </summary>
        <article class="content-card article-expanded">
          <p class="lead">${article.summary}</p>
          ${(article.rows || []).length ? `<div class="market-table">
            ${(article.rows || []).map(row => `
              <div>
                <strong>${row.name}</strong>
                <span>$${number(row.usd)} / ¥${number(row.cny)}</span>
                <em class="${row.change24h >= 0 ? "up" : "down"}">${number(row.change24h)}%</em>
              </div>
            `).join("")}
          </div>` : ""}
          <section class="daily-brief">
            <h3>行情速览</h3>
            ${(article.paragraphs || []).map(p => `<p>${p}</p>`).join("")}
          </section>
          <section class="daily-article">
            <div class="article-kicker">完整文章</div>
            ${(article.fullArticle || []).map(renderBlock).join("")}
          </section>
          ${renderSources(article.sources)}
        </article>
      </details>
    `).join("");
  } catch (error) {
    msg.textContent = error.message;
    msg.classList.add("error");
  }
}

main();
