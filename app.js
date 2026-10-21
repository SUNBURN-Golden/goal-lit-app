"use strict";
const FEED = "https://goal-lit.soulbound.co.kr/api/feed.json";
const STORAGE_KEY = "goal-lit:last-feed";
const $ = id => document.getElementById(id);
const kinds = {book:"도서",novel:"소설",film:"영화",movie:"영화",drama:"드라마",animation:"애니메이션",anime:"애니메이션",comic:"만화",webtoon:"웹툰",game:"게임",poetry:"시",essay:"에세이"};
const kindLabel = kind => Object.hasOwn(kinds, kind) ? kinds[kind] : kind || "기타";
const text = value => typeof value === "string" ? value : "";
let feed = null, loading = false, source = "", failed = false;

// Keep only public list metadata. Bodies and ratings are never used or saved.
function normalize(data) {
  if (!data || !Array.isArray(data.posts) || !Array.isArray(data.works)) throw new Error("피드 형식 오류");
  const work = w => ({id:text(w.id),title:text(w.title),kind:text(w.kind),summary:text(w.summary)});
  return {
    posts:data.posts.filter(p => p && typeof p === "object").map(p => ({
      slug:text(p.slug),title:text(p.title),date:text(p.date),summary:text(p.summary),byline:text(p.byline),
      work:p.work && typeof p.work === "object" ? work(p.work) : null,url:text(p.url)
    })),
    works:data.works.filter(w => w && typeof w === "object").map(work)
  };
}
function node(tag, value, className) {
  const el = document.createElement(tag);
  if (value) el.textContent = value;
  if (className) el.className = className;
  return el;
}
function postURL(value) {
  if (!value.trim()) return null;
  try {
    const url = new URL(value, FEED);
    return ["https:","http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
function dateNode(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return node("span", "날짜 미정");
  const el = node("time", new Intl.DateTimeFormat("ko-KR", {year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Asia/Seoul"}).format(date));
  el.dateTime = date.toISOString();
  return el;
}
function renderPosts() {
  const list = $("posts-list");
  list.replaceChildren();
  feed.posts.forEach((post, index) => {
    const href = postURL(post.url);
    const card = node(href ? "a" : "article", "", "post-card");
    if (href) card.href = href;
    const title = node("h3", post.title || "제목 없는 글");
    title.id = `post-${index}`;
    if (href) card.setAttribute("aria-labelledby", title.id);
    const meta = node("div", "", "card-meta");
    meta.append(node("span", post.work?.title || "독립 글", "work-tag"), dateNode(post.date));
    const bottom = node("div", "", "card-bottom");
    bottom.append(node("span", post.byline || "필명 미표기"), node("span", href ? "원문 읽기 ↗" : "원문 링크 없음", "read-link"));
    card.append(meta, title, node("p", post.summary, "summary"), bottom);
    const item = node("li");
    item.append(card);
    list.append(item);
  });
  $("posts-empty").hidden = feed.posts.length > 0;
  $("posts-empty").textContent = "아직 등록된 글이 없어요.";
  $("posts-count").textContent = feed.posts.length;
}
function renderWorks() {
  const selected = $("kind").value;
  const works = feed.works.filter(w => !selected || (w.kind || "기타") === selected);
  const list = $("works-list");
  list.replaceChildren();
  works.forEach(work => {
    const card = node("article", "", "work-card");
    card.append(node("span", kindLabel(work.kind), "kind-tag"), node("h3", work.title || "제목 없는 작품"), node("p", work.summary, "summary"));
    const item = node("li");
    item.append(card);
    list.append(item);
  });
  $("works-empty").hidden = works.length > 0;
  $("works-empty").textContent = selected ? "이 종류에 등록된 작품이 없어요." : "아직 등록된 작품이 없어요.";
  $("works-count").textContent = feed.works.length;
}
function render() {
  const select = $("kind"), previous = select.value;
  select.replaceChildren(new Option("전체", ""));
  [...new Set(feed.works.map(w => w.kind || "기타"))].sort((a,b) => kindLabel(a).localeCompare(kindLabel(b), "ko")).forEach(kind => select.add(new Option(kindLabel(kind), kind)));
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
  renderPosts();
  renderWorks();
}
function updateStatus() {
  let message;
  if (loading) message = feed ? "저장된 목록을 표시하며 새 목록을 확인하고 있어요." : "목록을 불러오는 중이에요.";
  else if (!navigator.onLine) message = feed ? "오프라인 · 저장된 목록이에요. 원문은 연결 후 읽을 수 있어요." : "오프라인이에요. 처음에는 인터넷에 연결해 목록을 불러와 주세요.";
  else if (failed) message = feed ? "새 목록에 연결하지 못했어요. 마지막으로 저장된 목록이에요." : "목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.";
  else if (source === "cache") message = "저장된 목록이에요. 새로고침하면 최신 목록을 확인해요.";
  else message = "최신 목록을 불러왔어요.";
  $("status").textContent = message;
}
async function loadFeed() {
  if (loading) return;
  loading = true;
  $("refresh").disabled = true;
  for (const id of ["posts-panel","works-panel"]) $(id).setAttribute("aria-busy", "true");
  updateStatus();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(FEED, {cache:"no-store",signal:controller.signal});
    if (!response.ok) throw new Error("피드 연결 실패");
    feed = normalize(await response.json());
    source = response.headers.get("X-Goal-Lit-Source") === "cache" ? "cache" : "network";
    failed = false;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(feed)); } catch { /* Storage may be unavailable. */ }
    render();
  } catch {
    failed = true;
    if (!feed) {
      for (const id of ["posts-empty","works-empty"]) $(id).textContent = "목록을 가져오지 못했어요. 새로고침으로 다시 시도해 주세요.";
    }
  } finally {
    clearTimeout(timeout);
    loading = false;
    $("refresh").disabled = false;
    for (const id of ["posts-panel","works-panel"]) $(id).setAttribute("aria-busy", "false");
    updateStatus();
  }
}

const tabs = [...document.querySelectorAll('[role="tab"]')];
function activateTab(tab) {
  tabs.forEach(item => {
    const active = item === tab;
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
    $(item.getAttribute("aria-controls")).hidden = !active;
  });
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", event => {
    const keys = {ArrowRight:(index+1)%tabs.length,ArrowLeft:(index+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1};
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = tabs[keys[event.key]];
    activateTab(next);
    next.focus();
  });
});
$("kind").addEventListener("change", () => { if (feed) renderWorks(); });
$("refresh").addEventListener("click", loadFeed);
window.addEventListener("online", loadFeed);
window.addEventListener("offline", updateStatus);
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) { feed = normalize(JSON.parse(saved)); source = "cache"; render(); }
} catch { /* An invalid or inaccessible saved feed must not prevent loading. */ }
async function start() {
  if ("serviceWorker" in navigator) {
    // Let the worker control the first feed request, without blocking startup if it fails.
    const controlled = new Promise(resolve => {
      navigator.serviceWorker.addEventListener("controllerchange", resolve, {once:true});
      navigator.serviceWorker.register("./sw.js").then(() => {
        if (navigator.serviceWorker.controller) resolve();
      }).catch(resolve);
    });
    await Promise.race([controlled, new Promise(resolve => setTimeout(resolve, 1500))]);
  }
  loadFeed();
}
start();
