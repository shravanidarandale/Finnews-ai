/* FinNews AI frontend — vanilla JS. All text is inserted via textContent (no XSS). */
"use strict";

// Change this (or set window.FINNEWS_API_BASE before this script) when deploying.
const API_BASE = (window.FINNEWS_API_BASE || "http://localhost:8000").replace(/\/$/, "");
const BULK_COUNT = 6;        // articles per "Fetch & Simplify" (keeps API usage reasonable)
const BULK_CONCURRENCY = 2;  // parallel AI requests, to stay within Groq rate limits
const REQUEST_TIMEOUT_MS = 60000;

const CATEGORIES = [
  ["all", "All"], ["business", "Business"], ["markets", "Markets"], ["stocks", "Stocks"],
  ["economy", "Economy"], ["technology", "Technology"], ["banking", "Banking"], ["cryptocurrency", "Cryptocurrency"],
];

const state = { category: "all", query: "", articles: [], cards: new Map(), inflight: new Set(), busy: false };
const $ = (sel) => document.querySelector(sel);

/* ---------- helpers ---------- */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "#";
  } catch { return "#"; }
}

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return days < 30 ? `${days} day${days === 1 ? "" : "s"} ago` : new Date(iso).toLocaleDateString();
}

function toast(message, type = "success") {
  const box = el("div", `toast ${type}`);
  box.append(el("span", "", type === "error" ? "⚠️" : type === "info" ? "ℹ️" : "✅"), el("span", "", message));
  $("#toasts").append(box);
  setTimeout(() => { box.classList.add("out"); setTimeout(() => box.remove(), 350); }, 4500);
}

async function api(path, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, signal: ctrl.signal });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON error body */ }
    if (!res.ok) {
      const err = new Error((data && data.message) || "Something went wrong. Please try again.");
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("The request timed out. Please try again.");
    if (err instanceof TypeError) throw new Error("Network problem — is the backend running?");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- UI states ---------- */
function setState(icon, title, text) {
  const s = $("#state");
  s.replaceChildren();
  if (!title) return;
  s.append(el("div", "icon", icon), el("h3", "", title), el("p", "", text));
}

function showSkeletons(n = 6) {
  const grid = $("#grid");
  grid.replaceChildren();
  grid.setAttribute("aria-busy", "true");
  for (let i = 0; i < n; i++) {
    const sk = el("div", "skeleton");
    sk.append(el("div", "sk sk-img"), el("div", "sk sk-line"), el("div", "sk sk-line"), el("div", "sk sk-line"));
    grid.append(sk);
  }
}

function setBusy(busy) {
  state.busy = busy;
  const btn = $("#fetchSimplifyBtn");
  btn.disabled = busy;
  btn.textContent = busy ? "Working…" : "Fetch & Simplify";
}

/* ---------- rendering ---------- */
function renderSummary(panel, data) {
  const s = data.summary;
  panel.replaceChildren();
  if (data.demo) panel.append(el("span", "demo-tag", "Demo Data"));
  const section = (title, content) => {
    if (!content) return;
    panel.append(el("h4", "", title), content);
  };
  section("Simple Summary", el("p", "", s.simple_summary));
  section("What Happened?", el("p", "", s.what_happened));
  section("Why It Matters", el("p", "", s.why_it_matters));
  if (s.financial_terms?.length) {
    const dl = el("dl");
    s.financial_terms.forEach((t) => dl.append(el("dt", "", t.term), el("dd", "", t.meaning)));
    section("Key Financial Terms", dl);
  }
  if (s.key_takeaways?.length) {
    const ul = el("ul");
    s.key_takeaways.forEach((k) => ul.append(el("li", "", k)));
    section("Key Takeaways", ul);
  }
  section("Market Context", s.market_context ? el("p", "", s.market_context) : null);
  panel.append(el("p", "disc", s.disclaimer || "AI-generated summary for informational purposes only. This is not financial advice."));
}

function createCard(a, index) {
  const card = el("article", "card");
  card.style.animationDelay = `${Math.min(index, 8) * 50}ms`;

  const media = el("div", "card-media");
  if (a.image_url) {
    const img = el("img");
    img.src = a.image_url;
    img.alt = `Image for: ${a.title}`;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => media.replaceChildren(el("span", "ph", "📈")));
    media.append(img);
  } else {
    media.append(el("span", "ph", "📈"));
  }

  const body = el("div", "card-body");
  const meta = el("div", "meta");
  meta.append(el("span", "src", a.source));
  const ago = timeAgo(a.published_at);
  if (ago) meta.append(el("span", "", "•"), el("time", "", ago));
  const title = el("h3", "", a.title);
  const desc = el("p", "desc", a.description || "No description available for this article.");

  const actions = el("div", "actions");
  const simplifyBtn = el("button", "btn btn-primary btn-sm", "Simplify with AI");
  simplifyBtn.type = "button";
  const original = el("a", "btn btn-ghost btn-sm", "Read Original");
  original.href = safeUrl(a.url);
  original.target = "_blank";
  original.rel = "noopener noreferrer";
  actions.append(simplifyBtn, original);
  body.append(meta, title, desc, actions);

  const toggle = el("button", "btn btn-ghost btn-sm ai-toggle", "Hide AI summary");
  toggle.type = "button";
  toggle.hidden = true;
  toggle.setAttribute("aria-expanded", "true");
  const panel = el("div", "ai-panel");
  panel.id = `ai-${a.id}`;
  panel.hidden = true;
  toggle.setAttribute("aria-controls", panel.id);

  toggle.addEventListener("click", () => setExpanded(ref, panel.hidden));
  simplifyBtn.addEventListener("click", () => simplifyArticle(a));

  card.append(media, body, toggle, panel);
  const ref = { card, panel, toggle, simplifyBtn, done: false };
  return ref;
}

function setExpanded(ref, expanded) {
  ref.panel.hidden = !expanded;
  ref.toggle.setAttribute("aria-expanded", String(expanded));
  ref.toggle.textContent = expanded ? "Hide AI summary" : "Show AI summary";
}

function renderArticles(articles) {
  const grid = $("#grid");
  grid.replaceChildren();
  grid.removeAttribute("aria-busy");
  state.cards.clear();
  articles.forEach((a, i) => {
    const ref = createCard(a, i);
    state.cards.set(a.id, ref);
    grid.append(ref.card);
  });
}

/* ---------- actions ---------- */
async function loadNews() {
  setState();
  showSkeletons();
  $("#demoBanner").hidden = true;
  const params = new URLSearchParams({ category: state.category, page_size: String(BULK_COUNT) });
  if (state.query) params.set("q", state.query);
  try {
    const data = await api(`/api/news?${params}`);
    state.articles = data.articles;
    $("#demoBanner").hidden = !data.demo;
    if (!data.articles.length) {
      $("#grid").replaceChildren();
      setState("🔍", "No financial news found for your search.", "Try a different keyword or category.");
      return [];
    }
    renderArticles(data.articles);
    return data.articles;
  } catch (err) {
    $("#grid").replaceChildren();
    setState("📡", "Unable to fetch financial news right now.", "Please try again.");
    toast(err.message || "Unable to fetch financial news right now. Please try again.", "error");
    return [];
  }
}

async function simplifyArticle(a, { silent = false } = {}) {
  const ref = state.cards.get(a.id);
  if (!ref || state.inflight.has(a.id)) return;          // prevents duplicate requests
  if (ref.done) { setExpanded(ref, true); return; }

  state.inflight.add(a.id);
  ref.simplifyBtn.disabled = true;
  ref.panel.hidden = false;
  ref.panel.replaceChildren();
  const loading = el("div", "loading-ai");
  loading.append(el("span", "spinner"), el("span", "", "Analyzing with FinNews AI…"));
  ref.panel.append(loading);
  ref.panel.setAttribute("aria-busy", "true");

  try {
    const data = await api("/api/simplify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: a.title, description: a.description, content: a.content }),
    });
    renderSummary(ref.panel, data);
    ref.done = true;
    ref.toggle.hidden = false;
    ref.simplifyBtn.textContent = "Summarized ✓";
    setExpanded(ref, !silent);                            // bulk results start collapsed
    if (!silent) toast("Summary ready.");
  } catch (err) {
    ref.panel.replaceChildren(el("p", "err", err.message || "AI summary failed. Please try again."));
    ref.simplifyBtn.disabled = false;
    toast(err.message || "AI summary failed.", "error");
    throw err;
  } finally {
    ref.panel.removeAttribute("aria-busy");
    state.inflight.delete(a.id);
  }
}

async function fetchAndSimplify() {
  if (state.busy) return;
  setBusy(true);
  document.getElementById("news").scrollIntoView({ behavior: "smooth" });
  try {
    const articles = await loadNews();
    if (!articles.length) return;
    toast(`Fetched ${articles.length} articles. Simplifying…`, "info");
    setState("🤖", "Analyzing with FinNews AI…", "Summaries appear on each card as they finish.");

    const queue = [...articles];
    let failed = 0, aborted = false;
    const worker = async () => {
      while (queue.length && !aborted) {
        const a = queue.shift();
        try { await simplifyArticle(a, { silent: true }); }
        catch (err) {
          failed++;
          if (err.status === 429) aborted = true;         // stop hammering on rate limit
        }
      }
    };
    await Promise.all(Array.from({ length: BULK_CONCURRENCY }, worker));
    setState();
    if (failed) toast(`${failed} summar${failed === 1 ? "y" : "ies"} could not be generated. Use “Simplify with AI” to retry.`, "error");
    else toast("All summaries are ready. Expand any card to read them.");
  } finally {
    setBusy(false);
  }
}

/* ---------- init ---------- */
function init() {
  // Category chips
  const chips = $("#chips");
  CATEGORIES.forEach(([value, label]) => {
    const b = el("button", "chip", label);
    b.type = "button";
    b.dataset.value = value;
    b.setAttribute("aria-pressed", String(value === state.category));
    b.addEventListener("click", () => {
      state.category = value;
      chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.value === value)));
      loadNews();
    });
    chips.append(b);
  });

  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    state.query = $("#searchInput").value.trim();
    loadNews();
  });

  $("#fetchSimplifyBtn").addEventListener("click", fetchAndSimplify);

  // Mobile nav
  const nav = $("#siteNav"), toggle = $("#navToggle");
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  nav.addEventListener("click", (e) => { if (e.target.tagName === "A") { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); } });

  // API docs links point at the backend
  $("#apiDocsLink").href = `${API_BASE}/docs`;
  $("#footerApiLink").href = `${API_BASE}/docs`;

  setState("👋", "Welcome to FinNews AI", "Press “Fetch & Simplify”, pick a category, or search a topic to get started.");
}

document.addEventListener("DOMContentLoaded", init);
