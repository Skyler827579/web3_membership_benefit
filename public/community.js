const token = new URLSearchParams(location.search).get("token") || "";
const root = document.getElementById("community");
document.getElementById("backLink").href = `/member.html?token=${encodeURIComponent(token)}`;

async function main() {
  try {
    const res = await fetch(`/api/content/community?token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "社群内容加载失败");
    root.innerHTML = `
      <article class="content-card">
        <h2>${data.title}</h2>
        <div class="community-grid">
          ${data.items.map(item => `
            <section>
              <strong>${item.title}</strong>
              <p>${item.text}</p>
            </section>
          `).join("")}
        </div>
        <p class="lead">${data.note}</p>
      </article>
    `;
  } catch (error) {
    root.innerHTML = `<div class="message error">${error.message}</div>`;
  }
}

main();
