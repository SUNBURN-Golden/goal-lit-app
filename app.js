const FEED = "https://goal-lit.soulbound.co.kr/api/feed.json";
fetch(FEED).then(r => r.json()).then(f => {
  const el = document.getElementById("list"); el.textContent = "";
  for (const p of f.posts) { const a = document.createElement("a"); a.href = p.url; a.textContent = p.title; const d = document.createElement("p"); d.appendChild(a); el.appendChild(d); }
}).catch(() => { document.getElementById("list").textContent = "피드를 불러오지 못했어요."; });
