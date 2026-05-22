const token = new URLSearchParams(location.search).get("token") || "";
const msg = document.getElementById("contentMsg");
const root = document.getElementById("learningContent");
document.getElementById("backLink").href = `/member.html?token=${encodeURIComponent(token)}`;

function paragraphize(text) {
  return text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `<p>${line.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</p>`)
    .join("");
}

async function main() {
  try {
    const res = await fetch(`/api/content/learning?token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "学习内容加载失败");
    msg.textContent = `${data.modules.length} 个模块，64 页内容已网页化。`;
    root.innerHTML = data.modules.map(module => `
      <article class="content-card">
        <h2>${module.title}</h2>
        ${module.pages.map(page => `
          <details>
            <summary>第 ${page.page} 页</summary>
            <div class="page-text">${paragraphize(page.text)}</div>
          </details>
        `).join("")}
      </article>
    `).join("");
  } catch (error) {
    msg.textContent = error.message;
    msg.classList.add("error");
  }
}

main();
