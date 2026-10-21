"use strict";
const PREFIX = "goal-lit-";
const SHELL = `${PREFIX}shell-v1`;
const FEEDS = `${PREFIX}feed-v1`;
const FEED = "https://goal-lit.soulbound.co.kr/api/feed.json";
const ROOT = new URL("./", self.location.href).href;
const FILES = ["./","index.html","app.css","app.js","manifest.webmanifest","icon.svg"].map(path => new URL(path, ROOT).href);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && ![SHELL,FEEDS].includes(key)).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

async function cachedFeed() {
  const cache = await caches.open(FEEDS);
  const saved = await cache.match(FEED);
  if (!saved) throw new Error("저장된 피드 없음");
  const headers = new Headers(saved.headers);
  headers.set("X-Goal-Lit-Source", "cache");
  return new Response(await saved.blob(), {status:200,headers});
}
async function networkFeed() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(FEED, {cache:"no-store",signal:controller.signal});
    if (!response.ok) throw new Error("피드 연결 실패");
    const data = await response.clone().json();
    if (!data || !Array.isArray(data.posts) || !Array.isArray(data.works)) throw new Error("피드 형식 오류");
    // Allowlist metadata so an unexpected body field is never stored offline.
    const text = value => typeof value === "string" ? value : "";
    const cleanWork = w => w && typeof w === "object" ? {id:text(w.id),title:text(w.title),kind:text(w.kind),summary:text(w.summary)} : null;
    const clean = {
      posts:data.posts.filter(p => p && typeof p === "object").map(p => ({slug:text(p.slug),title:text(p.title),date:text(p.date),summary:text(p.summary),byline:text(p.byline),work:cleanWork(p.work),url:text(p.url)})),
      works:data.works.filter(w => w && typeof w === "object").map(cleanWork)
    };
    const result = new Response(JSON.stringify(clean), {headers:{"Content-Type":"application/json; charset=utf-8"}});
    try { await (await caches.open(FEEDS)).put(FEED, result.clone()); } catch { /* Reading still works when storage is full. */ }
    return result;
  } finally { clearTimeout(timeout); }
}
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (request.url === FEED) {
    event.respondWith(networkFeed().catch(() => cachedFeed()).catch(() => new Response("", {status:503})));
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const home = url.pathname === new URL(ROOT).pathname || url.pathname === new URL("index.html", ROOT).pathname;
  if (!FILES.includes(request.url) && !(request.mode === "navigate" && home)) return;
  // Only the reader shell is cached; linked post pages are never intercepted.
  event.respondWith(caches.open(SHELL).then(async cache => {
    const saved = await cache.match(request.mode === "navigate" ? ROOT : request);
    return saved || fetch(request);
  }));
});
