// =============================================================================
// @neo/server — Dashboard HTML renderer
// =============================================================================
// Returns a self-contained HTML page with inline CSS and JS. No build step,
// no framework. Auth is handled client-side: prompts for API key on first
// load, stores in sessionStorage, sends as Bearer token on every fetch.
// =============================================================================

export function renderDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Neo Research Dashboard</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0f1117;
    color: #e1e4e8;
    line-height: 1.5;
  }
  a { color: #58a6ff; }

  /* Auth overlay */
  #auth-overlay {
    position: fixed; inset: 0; z-index: 100;
    background: #0f1117;
    display: flex; align-items: center; justify-content: center;
  }
  #auth-overlay.hidden { display: none; }
  .auth-box {
    background: #161b22; border: 1px solid #30363d; border-radius: 8px;
    padding: 2rem; width: 360px; text-align: center;
  }
  .auth-box h1 { font-size: 1.25rem; margin-bottom: 1rem; }
  .auth-box input {
    width: 100%; padding: 0.5rem 0.75rem; margin-bottom: 1rem;
    background: #0d1117; border: 1px solid #30363d; border-radius: 6px;
    color: #e1e4e8; font-size: 0.875rem;
  }
  .auth-box .error { color: #f85149; font-size: 0.8rem; margin-bottom: 0.5rem; }

  /* Layout */
  .container { max-width: 1100px; margin: 0 auto; padding: 1rem; }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.75rem 0; border-bottom: 1px solid #21262d; margin-bottom: 1rem;
  }
  header h1 { font-size: 1.1rem; font-weight: 600; }
  .logout-btn {
    background: none; border: 1px solid #30363d; color: #8b949e;
    padding: 0.25rem 0.75rem; border-radius: 6px; cursor: pointer; font-size: 0.8rem;
  }
  .logout-btn:hover { color: #e1e4e8; border-color: #8b949e; }

  /* Stats bar */
  .stats {
    display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;
  }
  .stat {
    background: #161b22; border: 1px solid #21262d; border-radius: 6px;
    padding: 0.5rem 0.75rem; font-size: 0.8rem; white-space: nowrap;
  }
  .stat .count { font-weight: 700; font-size: 1rem; margin-right: 0.25rem; }

  /* Actions bar */
  .actions {
    display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;
  }
  .btn {
    padding: 0.4rem 0.85rem; border-radius: 6px; border: 1px solid #30363d;
    background: #21262d; color: #e1e4e8; cursor: pointer; font-size: 0.8rem;
    white-space: nowrap;
  }
  .btn:hover { background: #30363d; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.primary { background: #238636; border-color: #2ea043; }
  .btn.primary:hover { background: #2ea043; }
  .btn.danger { background: #da3633; border-color: #f85149; }

  /* Tabs */
  .tabs {
    display: flex; gap: 0; border-bottom: 1px solid #21262d; margin-bottom: 1rem;
  }
  .tab {
    padding: 0.5rem 1rem; cursor: pointer; font-size: 0.85rem;
    border-bottom: 2px solid transparent; color: #8b949e;
  }
  .tab:hover { color: #e1e4e8; }
  .tab.active { color: #e1e4e8; border-bottom-color: #58a6ff; }
  .tab .badge {
    background: #30363d; border-radius: 10px; padding: 0.1rem 0.45rem;
    font-size: 0.7rem; margin-left: 0.35rem; font-weight: 600;
  }

  /* Prompt list */
  .prompt-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .prompt-card {
    background: #161b22; border: 1px solid #21262d; border-radius: 8px;
    padding: 0.75rem 1rem;
  }
  .prompt-header {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem;
  }
  .prompt-title { font-weight: 600; font-size: 0.9rem; }
  .prompt-meta {
    display: flex; gap: 0.5rem; margin-top: 0.25rem; font-size: 0.75rem; color: #8b949e;
  }
  .prompt-meta span { background: #0d1117; padding: 0.1rem 0.4rem; border-radius: 4px; }
  .prompt-body { margin-top: 0.5rem; }
  .prompt-text {
    background: #0d1117; border: 1px solid #21262d; border-radius: 6px;
    padding: 0.5rem 0.75rem; font-size: 0.8rem; line-height: 1.6;
    max-height: 200px; overflow-y: auto; white-space: pre-wrap;
    font-family: "SFMono-Regular", Consolas, monospace;
  }
  .prompt-actions {
    display: flex; gap: 0.5rem; margin-top: 0.5rem; align-items: flex-start;
    flex-wrap: wrap;
  }
  .research-input {
    width: 100%; min-height: 120px; margin-top: 0.5rem;
    background: #0d1117; border: 1px solid #30363d; border-radius: 6px;
    padding: 0.5rem 0.75rem; color: #e1e4e8; font-size: 0.8rem;
    font-family: "SFMono-Regular", Consolas, monospace; resize: vertical;
  }
  .expand-toggle {
    background: none; border: none; color: #58a6ff; cursor: pointer;
    font-size: 0.8rem; padding: 0;
  }

  /* Status colors */
  .status-needs_review { color: #d29922; }
  .status-queued { color: #8b949e; }
  .status-ready_for_research { color: #58a6ff; }
  .status-researched { color: #3fb950; }
  .status-synthesizing { color: #bc8cff; }
  .status-completed { color: #238636; }
  .status-failed { color: #f85149; }
  .status-rejected { color: #8b949e; }

  /* Toast */
  .toast {
    position: fixed; bottom: 1rem; right: 1rem; z-index: 50;
    background: #161b22; border: 1px solid #30363d; border-radius: 8px;
    padding: 0.75rem 1rem; font-size: 0.85rem; opacity: 0;
    transition: opacity 0.3s; pointer-events: none;
  }
  .toast.show { opacity: 1; }
  .toast.error { border-color: #f85149; }

  /* Empty state */
  .empty {
    text-align: center; padding: 2rem; color: #8b949e; font-size: 0.9rem;
  }

  /* Loading */
  .loading { text-align: center; padding: 2rem; color: #8b949e; }
</style>
</head>
<body>

<div id="auth-overlay">
  <div class="auth-box">
    <h1>Neo Research Dashboard</h1>
    <p style="color:#8b949e;font-size:0.85rem;margin-bottom:1rem;">Enter your API key to continue</p>
    <div id="auth-error" class="error" style="display:none;"></div>
    <input type="password" id="api-key-input" placeholder="API key" autocomplete="off">
    <button class="btn primary" style="width:100%;" onclick="tryAuth()">Connect</button>
  </div>
</div>

<div class="container" id="app" style="display:none;">
  <header>
    <h1>Neo Research Dashboard</h1>
    <button class="logout-btn" onclick="logout()">Logout</button>
  </header>

  <div class="stats" id="stats-bar"></div>

  <div class="actions">
    <button class="btn primary" onclick="approveAll()">Approve All Needs Review</button>
    <button class="btn" onclick="retryAllFailed()">Retry All Failed</button>
    <button class="btn" onclick="prepareQueue()">Prepare Queue</button>
    <button class="btn" onclick="runSynthesis()">Run Synthesis</button>
    <button class="btn" onclick="refresh()">Refresh</button>
  </div>

  <div class="tabs" id="tabs"></div>
  <div id="prompt-list" class="prompt-list"></div>
</div>

<div class="toast" id="toast"></div>

<script>
const STATUSES = [
  "needs_review", "queued", "ready_for_research",
  "researched", "synthesizing", "completed", "failed", "rejected"
];
const STATUS_LABELS = {
  needs_review: "Needs Review",
  queued: "Queued",
  ready_for_research: "Ready",
  researched: "Researched",
  synthesizing: "Synthesizing",
  completed: "Completed",
  failed: "Failed",
  rejected: "Rejected",
};

let apiKey = sessionStorage.getItem("neo_api_key") || "";
let currentStatus = "needs_review";
let statsCache = {};
let expandedCards = new Set();

// -- Auth --
if (apiKey) {
  testAuth();
} else {
  document.getElementById("api-key-input").focus();
}

document.getElementById("api-key-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryAuth();
});

async function tryAuth() {
  const input = document.getElementById("api-key-input");
  const key = input.value.trim();
  if (!key) return;
  apiKey = key;
  sessionStorage.setItem("neo_api_key", key);
  await testAuth();
}

async function testAuth() {
  try {
    const res = await apiFetch("/api/stats");
    if (!res.ok) throw new Error("Invalid key");
    document.getElementById("auth-overlay").classList.add("hidden");
    document.getElementById("app").style.display = "";
    await refresh();
  } catch {
    sessionStorage.removeItem("neo_api_key");
    apiKey = "";
    document.getElementById("auth-overlay").classList.remove("hidden");
    document.getElementById("app").style.display = "none";
    const errEl = document.getElementById("auth-error");
    errEl.textContent = "Invalid API key. Try again.";
    errEl.style.display = "";
    document.getElementById("api-key-input").value = "";
    document.getElementById("api-key-input").focus();
  }
}

function logout() {
  sessionStorage.removeItem("neo_api_key");
  apiKey = "";
  location.reload();
}

// -- API helpers --
function apiFetch(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
      ...(opts.headers || {}),
    },
  });
}

function toast(msg, isError) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show" + (isError ? " error" : "");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = "toast"; }, 3000);
}

// -- Data --
async function refresh() {
  await Promise.all([loadStats(), loadPrompts()]);
}

async function loadStats() {
  try {
    const res = await apiFetch("/api/stats");
    if (!res.ok) throw new Error("Failed");
    statsCache = await res.json();
    renderStats();
    renderTabs();
  } catch (err) {
    toast("Failed to load stats: " + err.message, true);
  }
}

async function loadPrompts() {
  const list = document.getElementById("prompt-list");
  list.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const res = await apiFetch("/api/prompts?status=" + encodeURIComponent(currentStatus));
    if (!res.ok) throw new Error("Failed");
    const prompts = await res.json();
    renderPrompts(prompts);
  } catch (err) {
    list.innerHTML = '<div class="empty">Failed to load prompts</div>';
    toast("Error: " + err.message, true);
  }
}

// -- Render --
function renderStats() {
  const bar = document.getElementById("stats-bar");
  const total = Object.values(statsCache).reduce((a, b) => a + b, 0);
  let html = '<div class="stat"><span class="count">' + total + '</span> total</div>';
  for (const s of STATUSES) {
    const c = statsCache[s] || 0;
    if (c > 0) {
      html += '<div class="stat"><span class="count status-' + s + '">' + c + '</span> ' + STATUS_LABELS[s] + '</div>';
    }
  }
  bar.innerHTML = html;
}

function renderTabs() {
  const tabs = document.getElementById("tabs");
  let html = "";
  for (const s of STATUSES) {
    const c = statsCache[s] || 0;
    const active = s === currentStatus ? " active" : "";
    html += '<div class="tab' + active + '" onclick="switchTab(\\''+s+'\\')\">'
      + STATUS_LABELS[s]
      + (c > 0 ? ' <span class="badge">' + c + '</span>' : '')
      + '</div>';
  }
  tabs.innerHTML = html;
}

function switchTab(status) {
  currentStatus = status;
  expandedCards.clear();
  renderTabs();
  loadPrompts();
}

function esc(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function renderPrompts(prompts) {
  const list = document.getElementById("prompt-list");
  if (prompts.length === 0) {
    list.innerHTML = '<div class="empty">No prompts with status "' + STATUS_LABELS[currentStatus] + '"</div>';
    return;
  }
  list.innerHTML = prompts.map((p) => {
    const expanded = expandedCards.has(p.id);
    const showBody = expanded || currentStatus === "ready_for_research" || currentStatus === "researched";
    const promptText = p.full_prompt || p.prompt_text || "";
    return '<div class="prompt-card" id="card-' + esc(p.id) + '">'
      + '<div class="prompt-header">'
      +   '<div>'
      +     '<div class="prompt-title">' + esc(p.title) + '</div>'
      +     '<div class="prompt-meta">'
      +       '<span>' + esc(p.domain_slug) + '</span>'
      +       '<span>P' + p.priority + '</span>'
      +       '<span>' + esc(p.source) + '</span>'
      +       '<span class="status-' + esc(p.status) + '">' + (STATUS_LABELS[p.status] || p.status) + '</span>'
      +     '</div>'
      +   '</div>'
      +   '<button class="expand-toggle" onclick="toggleCard(\\'' + esc(p.id) + '\\')">' + (showBody ? 'Collapse' : 'Expand') + '</button>'
      + '</div>'
      + (showBody ? renderPromptBody(p, promptText) : '')
      + '</div>';
  }).join("");
}

function renderPromptBody(p, promptText) {
  let html = '<div class="prompt-body">';
  html += '<div class="prompt-text">' + esc(promptText) + '</div>';
  html += '<div class="prompt-actions">';

  if (currentStatus === "ready_for_research") {
    html += '<button class="btn" onclick="copyPrompt(\\'' + esc(p.id) + '\\')">Copy Prompt</button>';
    html += '</div>';
    html += '<textarea class="research-input" id="research-' + esc(p.id) + '" placeholder="Paste research output here..."></textarea>';
    html += '<div class="prompt-actions">';
    html += '<button class="btn primary" onclick="saveResearch(\\'' + esc(p.id) + '\\')">Save Research</button>';
  } else if (currentStatus === "needs_review") {
    html += '<button class="btn primary" onclick="approveOne(\\'' + esc(p.id) + '\\')">Approve</button>';
    html += '<button class="btn danger" onclick="rejectOne(\\'' + esc(p.id) + '\\')">Reject</button>';
  } else if (currentStatus === "researched") {
    html += '<div style="font-size:0.8rem;color:#8b949e;">'
      + (p.research_word_count ? p.research_word_count + ' words' : '')
      + '</div>';
  } else if (currentStatus === "failed") {
    html += '<div style="font-size:0.8rem;color:#f85149;margin-bottom:0.25rem;">'
      + (p.error_message ? esc(p.error_message) : 'Unknown error')
      + '</div>';
    html += '<button class="btn primary" onclick="retryOne(\\'' + esc(p.id) + '\\')">Retry</button>';
  }

  html += '</div></div>';
  return html;
}

function toggleCard(id) {
  if (expandedCards.has(id)) expandedCards.delete(id);
  else expandedCards.add(id);
  loadPrompts();
}

// -- Actions --
async function copyPrompt(id) {
  const card = document.getElementById("card-" + id);
  const text = card.querySelector(".prompt-text").textContent;
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard");
  } catch {
    toast("Copy failed — select manually", true);
  }
}

async function saveResearch(id) {
  const textarea = document.getElementById("research-" + id);
  const text = textarea.value.trim();
  if (!text) { toast("Paste research first", true); return; }
  try {
    const res = await apiFetch("/api/prompts/" + id + "/research", {
      method: "POST",
      body: JSON.stringify({ research_output: text }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const data = await res.json();
    toast("Saved — " + data.research_word_count + " words");
    await refresh();
  } catch (err) {
    toast("Save failed: " + err.message, true);
  }
}

async function approveOne(id) {
  try {
    const res = await apiFetch("/api/prompts/" + id + "/approve", { method: "POST" });
    if (!res.ok) throw new Error("Failed");
    toast("Approved");
    await refresh();
  } catch (err) {
    toast("Approve failed: " + err.message, true);
  }
}

async function rejectOne(id) {
  try {
    const res = await apiFetch("/api/prompts/" + id + "/reject", { method: "POST" });
    if (!res.ok) throw new Error("Failed");
    toast("Rejected");
    await refresh();
  } catch (err) {
    toast("Reject failed: " + err.message, true);
  }
}

async function approveAll() {
  try {
    const res = await apiFetch("/api/prompts/approve-all", { method: "POST" });
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    toast("Approved " + data.approved + " prompts");
    await refresh();
  } catch (err) {
    toast("Approve all failed: " + err.message, true);
  }
}

async function retryOne(id) {
  try {
    const res = await apiFetch("/api/prompts/" + id + "/retry", { method: "POST" });
    if (!res.ok) throw new Error("Failed");
    toast("Retrying prompt");
    await refresh();
  } catch (err) {
    toast("Retry failed: " + err.message, true);
  }
}

async function retryAllFailed() {
  try {
    const res = await apiFetch("/api/prompts/retry-all-failed", { method: "POST" });
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    toast("Retried " + data.retried + " prompts");
    await refresh();
  } catch (err) {
    toast("Retry all failed: " + err.message, true);
  }
}

async function prepareQueue() {
  toast("Preparing queue...");
  try {
    const res = await apiFetch("/api/pipeline/prepare", { method: "POST" });
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    toast(data.message);
    await refresh();
  } catch (err) {
    toast("Prepare failed: " + err.message, true);
  }
}

async function runSynthesis() {
  toast("Running synthesis...");
  try {
    const res = await apiFetch("/api/pipeline/synthesize", { method: "POST" });
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    toast("Synthesis: " + data.succeeded + "/" + data.processed + " succeeded, " + data.totalNodesCreated + " nodes created");
    await refresh();
  } catch (err) {
    toast("Synthesis failed: " + err.message, true);
  }
}
</script>
</body>
</html>`;
}
