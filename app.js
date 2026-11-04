/* The Supper Club — a menu lab for two calibrated models (Levanto Sage, TypeSafe Jev).
   No build step. Data: data/menus.json. Keys live in proxies (proxy/worker.js, the Jev Sandbox Worker). */
"use strict";

const IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:";
const DEFAULTS = {
  sage: IS_LOCAL ? "http://localhost:8791" : "https://menu-lab-proxy.watkins-um.workers.dev",
  jev: "https://jev-sandbox-proxy.watkins-um.workers.dev",
  model: "jev-latest",
};
const KEY = "menulab.v1";
const MAX_SIDE = 1400; // Jev accepts 280–1568 px a side; Sage up to 8192. One size for both keeps the comparison fair.

/* ---------- questions ---------- */
const PRESETS = [
  { id: "meal", type: "choice", label: "Which meal", prompt: "What meal is this menu for?",
    options: [["breakfast", "Breakfast"], ["luncheon", "Luncheon, lunch or tiffin"], ["dinner", "Dinner"], ["supper", "Supper, usually late evening"], ["other", "Not a meal menu: a wine list, program or cover only"]] },
  { id: "occasion", type: "choice", label: "Occasion", prompt: "What kind of occasion is this menu for?",
    options: [["daily", "An everyday restaurant or hotel bill of fare"], ["banquet", "A banquet, society dinner or celebration for a group"], ["holiday", "A holiday meal such as Christmas, Thanksgiving or New Year"], ["travel", "Meals while travelling: a steamship, railroad or dining car"]] },
  { id: "formal", type: "scale", label: "How lavish", prompt: "How lavish is the meal on this menu?",
    levels: ["Plain: a few simple dishes", "Modest: an ordinary meal", "Standard: a full restaurant bill", "Elaborate: many courses and fine dishes", "Lavish: a grand multi-course feast"] },
  { id: "french", type: "yesno", label: "Written in French", prompt: "Is most of the dish list written in French?" },
  { id: "prices", type: "yesno", label: "Prices shown", prompt: "Does this menu show prices for the dishes?" },
  { id: "oysters", type: "yesno", label: "Oysters or terrapin", prompt: "Does this menu list oysters, clams or terrapin?" },
  { id: "game", type: "yesno", label: "Game on the table", prompt: "Does this menu list game such as venison, quail, reed birds, squirrel or canvasback duck?" },
  { id: "decor", type: "yesno", label: "Decorated", prompt: "Is the menu decorated with an illustration, crest, photograph or ornament beyond plain type?" },
  { id: "hand", type: "choice", label: "Printed or written", prompt: "How was the text of this menu produced?",
    options: [["printed", "Printed or typeset"], ["handwritten", "Handwritten"], ["mixed", "Printed with handwritten additions"]] },
  { id: "courses", type: "scale", label: "Number of courses", prompt: "Roughly how many courses or sections does the meal have?",
    levels: ["One to three", "Four to six", "Seven to nine", "Ten to twelve", "Thirteen or more"] },
  { id: "legible", type: "yesno", label: "Can it be read", prompt: "Can the dish names on this scan be read clearly?" },
];

/* ---------- store ---------- */
const store = (() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  s.conn ||= {}; s.mine ||= []; s.log ||= []; s.turnQs ||= ["meal", "formal", "french"]; s.h2hQs ||= ["meal", "occasion", "formal", "french", "prices"];
  return s;
})();
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} }
const conn = () => ({ sage: store.conn.sage || DEFAULTS.sage, jev: store.conn.jev || DEFAULTS.jev, model: store.conn.model || DEFAULTS.model });
const allQs = () => [...PRESETS, ...store.mine];
const qById = id => allQs().find(q => q.id === id);

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = p => p == null ? "—" : Math.round(p * 100) + "%";
const img = (id, t = "w") => `https://images.nypl.org/index.php?id=${id}&t=${t}`;
const nyplItem = id => `https://digitalcollections.nypl.org/search/index?keywords=${id}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function rnd(seed) { let x = seed >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }

/* ---------- data ---------- */
let MENUS = [];
const byImg = new Map();
async function loadMenus() {
  const r = await fetch("data/menus.json");
  const j = await r.json();
  MENUS = j.menus.map(([image, title, place, year, tags, more]) => ({ image, title, place, year, tags, pages: [image, ...more] }));
  MENUS.forEach(m => byImg.set(m.image, m));
}
const randomMenu = (dec) => {
  const pool = dec ? MENUS.filter(m => Math.floor(m.year / 10) * 10 === dec) : MENUS;
  return pool[Math.floor(Math.random() * pool.length)];
};

/* ---------- image prep (proxy → canvas → JPEG base64) ---------- */
const b64Cache = new Map();
async function scanB64(id) {
  if (b64Cache.has(id)) return b64Cache.get(id);
  const p = (async () => {
    // NYPL lacks the 1600px "q" derivative for some scans; the 760px "w" one is always there.
    const base = `${conn().sage.replace(/\/$/, "")}/img?id=${id}&t=`;
    let r = await fetch(base + "q");
    if (r.status === 404) r = await fetch(base + "w");
    if (!r.ok) throw new Error(`Scan fetch failed (${r.status}). Is the Menu Lab proxy running?`);
    const bmp = await createImageBitmap(await r.blob());
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    let w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    if (Math.min(w, h) < 280) { const u = 280 / Math.min(w, h); w = Math.round(w * u); h = Math.round(h * u); }
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(bmp, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.86).split(",")[1];
  })();
  b64Cache.set(id, p);
  p.catch(() => b64Cache.delete(id));
  return p;
}

/* ---------- request builders ---------- */
const cardText = m => `Historic menu from the NYPL Buttolph Collection. Catalogue card: "${m.title}", ${m.place || "place unknown"}, ${m.year}.`;
const BARE = "A scan of one page of a historic menu (NYPL Buttolph Collection, 1880–1920).";
function sageQ(q) {
  const o = { id: q.id, kind: q.type, instructions: q.prompt };
  if (q.type === "choice") o.options = q.options.map(([k, d]) => ({ option: k, description: d }));
  if (q.type === "scale") o.levels = q.levels.map((d, i) => ({ level: i, description: d }));
  return o;
}
function jevQ(q) {
  if (q.type === "yesno") return { type: "noul", instructions: q.prompt };
  if (q.type === "choice") return { type: "choice", instructions: q.prompt, criteria: Object.fromEntries(q.options) };
  return { type: "score", instructions: q.prompt, criteria: q.levels.slice() };
}
function buildSage(qs, b64, text) {
  return { requests: [{ content: { kind: "image", media: "data:image/jpeg;base64," + b64, text }, questions: qs.map(sageQ) }] };
}
function buildJev(qs, b64, text) {
  return { model: conn().model, state: `${text}\nMenu scan: <menu>`, questions: Object.fromEntries(qs.map(q => [q.id, jevQ(q)])),
    assets: { "<menu>": { format: "jpg", data_base64: b64 } } };
}

/* ---------- normalized answers ----------
   yesno  {p, pick:'yes'|'no'|null}            p = P(yes)
   choice {probs:{key:p}, pick:key|null, top}  top = argmax even when Sage declines
   scale  {probs:[p...], exp, top}
   every answer also has sure: the model's top probability (opacity in charts) and abstain:boolean */
function normSage(q, a) {
  if (!a || !a.ok) return { error: a?.error || "No answer" };
  const r = a.result.result;
  if (q.type === "yesno") { const p = r.probability; return { p, pick: r.answer, abstain: r.answer == null, sure: Math.max(p, 1 - p) }; }
  if (q.type === "choice") {
    const probs = Object.fromEntries(r.probabilities.map(x => [x.option, x.probability]));
    const top = Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0];
    return { probs, pick: r.chosen, top, abstain: r.chosen == null, sure: probs[top] };
  }
  const probs = r.probabilities.map(x => x.probability);
  return { probs, exp: r.expectation, top: probs.indexOf(Math.max(...probs)), abstain: false, sure: Math.max(...probs) };
}
function normJev(q, a) {
  if (!a) return { error: "No answer" };
  if (q.type === "yesno") { const p = a.noul; return { p, pick: p >= .5 ? "yes" : "no", abstain: false, sure: Math.max(p, 1 - p) }; }
  if (q.type === "choice") {
    const probs = a.probabilities || {}; const top = a.choice;
    return { probs, pick: top, top, abstain: false, sure: probs[top] ?? a.confidence };
  }
  const probs = q.levels.map((_, i) => a.probabilities?.[String(i)] ?? 0);
  return { probs, exp: a.score, top: probs.indexOf(Math.max(...probs)), abstain: false, sure: Math.max(...probs) };
}
function agreement(q, s, j) {
  if (s.error || j.error) return "error";
  if (s.abstain) return "abstain";
  if (q.type === "yesno") return (s.p >= .5) === (j.p >= .5) ? "agree" : "split";
  if (q.type === "choice") return s.top === j.top ? "agree" : "split";
  return Math.abs(s.exp - j.exp) < .75 ? "agree" : "split";
}

/* ---------- ask both ---------- */
async function postJSON(url, body) {
  const t0 = performance.now();
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = { error: txt.slice(0, 200) }; }
  if (!r.ok) throw new Error(j.detail || j.error || `HTTP ${r.status}`);
  return { j, ms: Math.round(performance.now() - t0) };
}
// Jev 1.14 can point: a `box` question returns {top,bottom,left,right} (0–1) + confidence. It always draws a box,
// even when the answer is no, so a box is only read next to its yes/no or choice answer.
const BOX_SUFFIX = "__where";
const boxQ = q => ({ type: "box", instructions: `Draw a box around the part of the menu that best shows the answer to this question: ${q.prompt}` });
async function askJev(qs, b64, text, boxes) {
  // The Jev proxy takes at most 8 questions per call, so answers and boxes are split into chunks of 8.
  const entries = [...qs.map(q => [q.id, jevQ(q)]), ...(boxes ? qs.filter(q => q.type !== "scale").map(q => [q.id + BOX_SUFFIX, boxQ(q)]) : [])];
  const chunks = []; for (let i = 0; i < entries.length; i += 8) chunks.push(entries.slice(i, i + 8));
  const reqs = chunks.map(c => ({ ...buildJev([], b64, text), questions: Object.fromEntries(c) }));
  const res = await Promise.all(reqs.map(r => postJSON(conn().jev, r)));
  const j = { model: res[0].j.model, answers: Object.assign({}, ...res.map(r => r.j.answers)),
    usage: { input_tokens: res.reduce((t, r) => t + (r.j.usage?.input_tokens || 0), 0) } };
  return { j, ms: Math.max(...res.map(r => r.ms)), reqs };
}
async function askBoth(menu, qs, withCard, boxes = false) {
  const b64 = await scanB64(menu.image);
  const text = withCard ? cardText(menu) : BARE;
  const sReq = buildSage(qs, b64, text);
  const [s, j] = await Promise.allSettled([
    postJSON(conn().sage.replace(/\/$/, "") + "/sage", sReq),
    askJev(qs, b64, text, boxes),
  ]);
  const out = { menu, qs, sReq, jReq: j.value?.reqs || [buildJev(qs, b64, text)], sRaw: s.value?.j, jRaw: j.value?.j, sMs: s.value?.ms, jMs: j.value?.ms,
    sErr: s.reason?.message, jErr: j.reason?.message, answers: {} };
  qs.forEach((q, i) => {
    const sa = s.value ? normSage(q, s.value.j.results?.[0]?.answers?.[i]) : { error: out.sErr };
    const ja = j.value ? normJev(q, j.value.j.answers?.[q.id]) : { error: out.jErr };
    const bx = j.value?.j.answers?.[q.id + BOX_SUFFIX];
    out.answers[q.id] = { sage: sa, jev: ja, verdict: agreement(q, sa, ja), box: bx?.box ? { ...bx.box, conf: bx.confidence ?? 0 } : null };
  });
  return out;
}
const tokensOf = r => ({ s: r.sRaw?.meta?.usage?.input_tokens ?? r.sRaw?.meta?.usage?.billed_input_tokens ?? 0, j: r.jRaw?.usage?.input_tokens ?? 0 });

/* ---------- place card ---------- */
const cards = {};
function placeCard(slot, onChange) {
  const el = $(`[data-card="${slot}"]`);
  const st = { menu: null, page: 0, dec: 0 };
  el.innerHTML = `
    <div class="frame"><img alt="" loading="eager"><div class="ev" aria-hidden="true"></div><span class="pg" hidden></span></div>
    <p class="evnote" hidden></p>
    <div class="thumbs" role="group" aria-label="Menu pages"></div>
    <div class="record"><h3></h3><div class="meta"></div></div>
    <div class="picker">
      <div class="row">
        <button class="btn" type="button" data-act="rand">Another menu</button>
        ${[0, 1880, 1890, 1900, 1910].map(d => `<button class="chip" type="button" data-dec="${d}" aria-pressed="${d === 0}">${d ? d + "s" : "Any year"}</button>`).join("")}
      </div>
      <input type="search" placeholder="Search 6,273 menus: Delmonico's, steamship, Christmas…" aria-label="Search menus">
      <div class="results" role="listbox"></div>
    </div>`;
  const im = $(".frame img", el), pg = $(".pg", el), th = $(".thumbs", el), res = $(".results", el), q = $("input", el);
  const ev = $(".ev", el), evnote = $(".evnote", el);
  let boxes = [], sticky = null;
  // keep the evidence layer exactly over the drawn image (object-fit: contain leaves margins)
  function layoutEv() {
    if (!im.naturalWidth) return;
    const cw = im.clientWidth, ch = im.clientHeight, k = Math.min(cw / im.naturalWidth, ch / im.naturalHeight);
    const dw = im.naturalWidth * k, dh = im.naturalHeight * k;
    Object.assign(ev.style, { left: im.offsetLeft + (cw - dw) / 2 + "px", top: im.offsetTop + (ch - dh) / 2 + "px", width: dw + "px", height: dh + "px" });
  }
  im.addEventListener("load", layoutEv);
  new ResizeObserver(layoutEv).observe(im);
  function drawBoxes() {
    ev.innerHTML = boxes.map(b => {
      const h = Math.max(b.bottom - b.top, .025), cy = (b.top + b.bottom) / 2, w = Math.max(b.right - b.left, .04), cx = (b.left + b.right) / 2;
      return `<div class="evbox${b.no ? " no" : ""}" data-id="${esc(b.id)}" style="top:${(cy - h / 2) * 100}%;left:${(cx - w / 2) * 100}%;height:${h * 100}%;width:${w * 100}%;opacity:${.45 + .55 * b.conf}"><b>${b.n}</b></div>`;
    }).join("");
    evnote.hidden = !boxes.length;
    evnote.innerHTML = `<i class="dot jev"></i>Numbered boxes show where Jev says the answer is. Dashed means Jev answered no. Jev always draws a box, so a faint one is a guess.`;
    focus(sticky);
  }
  function focus(id) {
    ev.classList.toggle("focus", !!id);
    $$(".evbox", ev).forEach(b => b.classList.toggle("on", b.dataset.id === id));
  }
  function show() {
    const m = st.menu, id = m.pages[st.page];
    im.src = img(id, "w"); im.alt = `Menu scan: ${m.title}, ${m.year}, page ${st.page + 1}`;
    pg.hidden = m.pages.length < 2; pg.textContent = `Page ${st.page + 1} of ${m.pages.length}`;
    th.hidden = m.pages.length < 2;
    th.innerHTML = m.pages.map((p, i) => `<button type="button" aria-pressed="${i === st.page}" aria-label="Page ${i + 1}"><img src="${img(p, "r")}" alt="" loading="lazy"></button>`).join("");
    $$("button", th).forEach((b, i) => b.onclick = () => { st.page = i; api.setBoxes([]); show(); onChange?.(); });
    $("h3", el).textContent = m.title || "Untitled menu";
    $(".meta", el).innerHTML = `<span>${esc(m.place || "Place unknown")}</span><span>${m.year}</span><a href="${img(id, "w")}" target="_blank" rel="noopener">Open scan</a>`;
  }
  const api = {
    get menu() { return st.menu; }, get scanId() { return st.menu.pages[st.page]; },
    set(m) { st.menu = m; st.page = 0; boxes = []; sticky = null; drawBoxes(); show(); onChange?.(); },
    setBoxes(list) { boxes = list; sticky = null; drawBoxes(); layoutEv(); },
    focus(id) { focus(id ?? sticky); },
    pin(id) { sticky = sticky === id ? null : id; focus(sticky); return sticky; },
    get frame() { return $(".frame", el); },
  };
  im.onclick = () => {
    const z = $("#zoomImg"); z.onerror = () => { z.onerror = null; z.src = img(api.scanId, "w"); };
    z.src = img(api.scanId, "q"); z.alt = im.alt; $("#zoomDlg").showModal();
  };
  $('[data-act="rand"]', el).onclick = () => api.set(randomMenu(st.dec));
  $$("[data-dec]", el).forEach(b => b.onclick = () => {
    st.dec = +b.dataset.dec; $$("[data-dec]", el).forEach(x => x.setAttribute("aria-pressed", x === b)); api.set(randomMenu(st.dec));
  });
  q.oninput = () => {
    const t = q.value.trim().toLowerCase();
    if (t.length < 2) { res.classList.remove("on"); return; }
    const hits = MENUS.filter(m => (m.title + " " + m.place + " " + m.year).toLowerCase().includes(t)).slice(0, 40);
    res.innerHTML = hits.length ? hits.map(m => `<button type="button" data-i="${m.image}">${esc(m.title)}<span>${esc(m.place)} · ${m.year}</span></button>`).join("") : `<button type="button" disabled>No menus match.</button>`;
    res.classList.add("on");
    $$("[data-i]", res).forEach(b => b.onclick = () => { api.set(byImg.get(+b.dataset.i)); res.classList.remove("on"); q.value = ""; });
  };
  cards[slot] = api;
  return api;
}
// The model reads the page currently shown, which may be page 2 of a menu.
const scanMenu = card => ({ ...card.menu, image: card.scanId });

/* ---------- answer renderers ---------- */
function verdictBadge(v) {
  return { agree: `<span class="badge agree">They agree</span>`, split: `<span class="badge split">They split</span>`,
    abstain: `<span class="badge abstain">Sage declines</span>`, error: `<span class="badge abstain">Error</span>` }[v] || "";
}
function ynChart(s, j, you) {
  // a single 0–1 axis: chance of yes. Markers for each model, an optional ring for the student.
  const W = 640, AX = 50, x = p => 24 + p * (W - 48);
  // labels sit beside their dot, on the side with more room
  const lab = (p, y, color, txt) => `<text x="${x(p) + (p < .5 ? 16 : -16)}" y="${y + 5}" text-anchor="${p < .5 ? "start" : "end"}" fill="${color}" font-size="14" font-weight="600">${txt}</text>`;
  const mk = (a, color, y, name) => a.error ? "" : `
    <g opacity="${.35 + .65 * a.sure}"><line x1="${x(a.p)}" x2="${x(a.p)}" y1="${AX}" y2="${y}" stroke="${color}" stroke-width="1.5"/>
    <circle cx="${x(a.p)}" cy="${y}" r="9" fill="${color}"/></g>${lab(a.p, y, color, `${name} ${pct(a.p)}`)}`;
  const yy = you ? `<circle cx="${x(you.p)}" cy="${AX}" r="12" fill="none" stroke="var(--you)" stroke-width="3"/>${lab(you.p, AX, "var(--you)", `You ${pct(you.p)}`)}` : "";
  return `<div class="yn"><svg viewBox="0 0 ${W} 104" role="img" aria-label="Chance of yes. Sage ${pct(s.p)}, Jev ${pct(j.p)}${you ? `, you ${pct(you.p)}` : ""}">
    <line x1="24" x2="${W - 24}" y1="${AX}" y2="${AX}" stroke="var(--rule)" stroke-width="6" stroke-linecap="round"/>
    <line x1="${x(.5)}" x2="${x(.5)}" y1="${AX - 10}" y2="${AX + 10}" stroke="var(--cream)" stroke-opacity=".5"/>
    <text x="24" y="100" fill="var(--cream)" fill-opacity=".6" font-size="12">certainly no</text>
    <text x="${x(.5)}" y="100" text-anchor="middle" fill="var(--cream)" fill-opacity=".6" font-size="12">50 / 50</text>
    <text x="${W - 24}" y="100" text-anchor="end" fill="var(--cream)" fill-opacity=".6" font-size="12">certainly yes</text>
    ${mk(s, "var(--sage)", 18, "Sage")}${mk(j, "var(--jev)", 78, "Jev")}${yy}</svg></div>`;
}
function rowsChart(labels, sP, jP, youIdx) {
  return `<div class="bars">${labels.map((lab, i) => `
    <div class="lab${(sP?.[i] === Math.max(...(sP || [0])) || jP?.[i] === Math.max(...(jP || [0]))) ? " win" : ""}">${esc(lab)}${youIdx === i ? ` <span style="color:var(--you)">← you</span>` : ""}</div>
    <div class="tr s"><i style="width:${(sP?.[i] ?? 0) * 100}%"></i></div><div class="num">${sP ? pct(sP[i]) : "—"}</div>
    <div></div><div class="tr j"><i style="width:${(jP?.[i] ?? 0) * 100}%"></i></div><div class="num">${jP ? pct(jP[i]) : "—"}</div>
    <div class="sp"></div>`).join("")}</div>`;
}
// Answers + Jev's evidence boxes, wired to the place card: hover or focus an answer to light its box, click to pin it.
function renderCourses(container, card, qs, r, you = {}) {
  let n = 0;
  const nums = {};
  qs.forEach(q => { if (r.answers[q.id].box) nums[q.id] = ++n; });
  container.innerHTML = qs.map(q => courseHTML(q, r.answers[q.id], you[q.id], nums[q.id])).join("");
  card.setBoxes(qs.filter(q => nums[q.id]).map(q => {
    const a = r.answers[q.id];
    const no = q.type === "yesno" && !a.jev.error && a.jev.p < .5;
    return { id: q.id, n: nums[q.id], ...a.box, no };
  }));
  $$("article.course", container).forEach(art => {
    const id = art.dataset.q; if (!nums[id]) return;
    art.addEventListener("mouseenter", () => card.focus(id)); art.addEventListener("mouseleave", () => card.focus(null));
    const b = $("[data-where]", art);
    b.onclick = () => {
      const on = card.pin(id);
      $$("[data-where]", container).forEach(x => x.setAttribute("aria-pressed", x === b && on === id));
      if (on && matchMedia("(max-width:980px)").matches) card.frame.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  });
}
function courseHTML(q, a, you, boxN) {
  const { sage: s, jev: j, verdict } = a;
  let body = "", note = "";
  if (q.type === "yesno") {
    body = (s.error && j.error) ? "" : ynChart(s.error ? { error: 1 } : s, j.error ? { error: 1 } : j, you);
    if (s.abstain) note = `Sage puts yes at ${pct(s.p)} and calls it too close to answer. Jev commits: ${pct(j.p)}.`;
  } else if (q.type === "choice") {
    const keys = q.options.map(o => o[0]);
    body = rowsChart(q.options.map(o => o[1].split(/[:,]/)[0]), s.error ? null : keys.map(k => s.probs[k] ?? 0), j.error ? null : keys.map(k => j.probs[k] ?? 0), you ? keys.indexOf(you.pick) : -1);
    if (s.abstain) note = `Sage's top two options are too close to call, so it gives no answer.`;
  } else {
    body = rowsChart(q.levels.map((l, i) => `${i} · ${l.split(":")[0]}`), s.error ? null : s.probs, j.error ? null : j.probs, you ? you.pick : -1);
    note = `Expected level: Sage <b>${s.error ? "—" : s.exp.toFixed(2)}</b>, Jev <b>${j.error ? "—" : j.exp.toFixed(2)}</b>.`;
  }
  const errs = [s.error && `Sage: ${esc(s.error)}`, j.error && `Jev: ${esc(j.error)}`].filter(Boolean).join(" · ");
  const where = boxN ? `<div class="where"><button class="btn ghost sm" type="button" data-where aria-pressed="false"><span class="num">${boxN}</span>Where Jev looked</button>
    <span class="note">Box confidence ${pct(a.box.conf)}${a.box.conf < .3 ? ": Jev is not sure where the answer is" : ""}</span></div>` : "";
  return `<article class="course" data-q="${esc(q.id)}"><div class="head"><h5>${esc(q.prompt)}</h5>${verdictBadge(verdict)}</div>${body}
    ${note ? `<div class="note">${note}</div>` : ""}${where}${errs ? `<div class="status err">${errs}</div>` : ""}</article>`;
}
function costLine(r) {
  const su = r.sRaw?.meta?.usage, ju = r.jRaw?.usage;
  return `<span>Sage: ${r.sMs ? r.sMs + " ms" : "failed"}${su ? ` · ${su.input_tokens ?? su.billed_input_tokens ?? "?"} input tokens` : ""}</span>
    <span>Jev: ${r.jMs ? r.jMs + " ms" : "failed"}${ju ? ` · ${ju.input_tokens} input tokens` : ""}${r.jRaw?.model ? ` · ${esc(r.jRaw.model)}` : ""}</span>`;
}
const shorten = req => JSON.stringify(req, (k, v) => typeof v === "string" && v.length > 200 ? v.slice(0, 60) + `…(${v.length} chars)` : v, 2);

/* ---------- question pickers ---------- */
function qPicker(el, selected, max, onChange) {
  el.innerHTML = allQs().map(q => `<label class="chk"><input type="checkbox" value="${esc(q.id)}" ${selected.includes(q.id) ? "checked" : ""}>
    <span>${esc(q.label)}<span class="kind">${q.type === "yesno" ? "yes/no" : q.type}</span>${store.mine.includes(q) ? `<span class="kind">· yours</span>` : ""}</span></label>`).join("");
  $$("input", el).forEach(i => i.onchange = () => {
    const on = $$("input:checked", el).map(x => x.value);
    if (on.length > max) { i.checked = false; return; }
    onChange(on);
  });
}

/* ---------- I. head to head ---------- */
function initH2H() {
  const card = placeCard("h2h", () => { $("#h2hOut").hidden = true; });
  const draw = () => qPicker($("#h2hQs"), store.h2hQs, 8, on => { store.h2hQs = on; save(); });
  draw(); initH2H.redraw = draw;
  $("#h2hRun").onclick = async () => {
    const qs = store.h2hQs.map(qById).filter(Boolean);
    if (!qs.length) { $("#h2hStatus").textContent = "Pick at least one question."; return; }
    await runH2H(card, qs);
  };
  card.set(MENUS.find(m => m.image === 466928) || randomMenu());
}
async function runH2H(card, qs) {
  const btn = $("#h2hRun"), st = $("#h2hStatus");
  btn.disabled = true; st.className = "status"; st.textContent = "Sending the scan to both models…";
  try {
    const r = await askBoth(scanMenu(card), qs, $("#h2hCtx").checked, $("#h2hBox").checked);
    renderCourses($("#h2hCourses"), card, qs, r);
    $("#h2hCost").innerHTML = costLine(r);
    $("#h2hJson").textContent = `// Sage request\n${shorten(r.sReq)}\n\n// Sage response\n${JSON.stringify(r.sRaw ?? r.sErr, null, 2)}\n\n` +
      r.jReq.map((q, i) => `// Jev request${r.jReq.length > 1 ? ` ${i + 1} of ${r.jReq.length}` : ""}\n${shorten(q)}`).join("\n\n") + `\n\n// Jev responses, merged\n${JSON.stringify(r.jRaw ?? r.jErr, null, 2)}`;
    $("#h2hOut").hidden = false;
    const v = Object.values(r.answers).map(a => a.verdict);
    st.textContent = `${v.filter(x => x === "agree").length} agree, ${v.filter(x => x === "split").length} split, ${v.filter(x => x === "abstain").length} declined by Sage.`;
    if (r.sErr || r.jErr) { st.className = "status err"; st.textContent += ` ${r.sErr ? "Sage: " + r.sErr : ""} ${r.jErr ? "Jev: " + r.jErr : ""}`; }
    $("#h2hOut").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { st.className = "status err"; st.textContent = e.message; }
  btn.disabled = false;
}

/* ---------- II. your turn ---------- */
let turnCard, turnLocked = null;
function initTurn() {
  turnCard = placeCard("turn", () => { turnLocked = null; $("#turnOut").hidden = true; drawTurnForm(); });
  const pick = () => qPicker($("#turnQs"), store.turnQs, 4, on => { store.turnQs = on; save(); drawTurnForm(); });
  pick(); initTurn.redraw = pick;
  $("#turnPickQs").onclick = () => { const p = $("#turnQsPick"); p.hidden = !p.hidden; };
  $("#turnNext").onclick = () => turnCard.set(randomMenu());
  $("#turnReveal").onclick = reveal;
  $("#turnReflect").oninput = e => { if (turnLocked) { turnLocked.reflect = e.target.value; save(); } };
  $("#expHtml").onclick = exportHtml; $("#expCsv").onclick = exportCsv; $("#expCopy").onclick = exportCopy;
  $("#expClear").onclick = () => { if (confirm("Clear every round in your log?")) { store.log = []; save(); drawLog(); } };
  turnCard.set(randomMenu(1900));
  drawLog();
}
function drawTurnForm() {
  const qs = store.turnQs.map(qById).filter(Boolean);
  $("#turnForm").innerHTML = qs.length ? qs.map(q => {
    const opts = q.type === "yesno" ? [["yes", "Yes"], ["no", "No"]] : q.type === "choice" ? q.options.map(([k, d]) => [k, d.split(/[:,]/)[0]]) : q.levels.map((l, i) => [String(i), `${i} · ${l.split(":")[0]}`]);
    return `<div class="answer" data-q="${esc(q.id)}"><h5>${esc(q.prompt)}</h5>
      <div class="opts-in" role="radiogroup" aria-label="${esc(q.label)}">${opts.map(([k, l]) => `<label><input type="radio" name="t_${esc(q.id)}" value="${esc(k)}">${esc(l)}</label>`).join("")}</div>
      <div class="conf"><span>How sure?</span><input type="range" min="50" max="100" value="70" aria-label="How sure, ${esc(q.label)}"><output>70%</output></div></div>`;
  }).join("") : `<p class="note">Choose up to four questions with "Change questions".</p>`;
  $$("#turnForm .conf input").forEach(r => r.oninput = () => r.nextElementSibling.textContent = r.value + "%");
}
function readYou(q) {
  const box = $(`#turnForm [data-q="${CSS.escape(q.id)}"]`);
  const v = $("input[type=radio]:checked", box)?.value;
  const c = +$(".conf input", box).value / 100;
  if (v == null) return null;
  if (q.type === "yesno") return { pick: v, sure: c, p: v === "yes" ? c : 1 - c };
  if (q.type === "choice") return { pick: v, sure: c };
  return { pick: +v, sure: c };
}
async function reveal() {
  const qs = store.turnQs.map(qById).filter(Boolean), st = $("#turnStatus");
  const you = Object.fromEntries(qs.map(q => [q.id, readYou(q)]));
  const missing = qs.filter(q => !you[q.id]);
  if (missing.length) { st.className = "status err"; st.textContent = `Answer every question first (${missing.map(q => q.label).join(", ")}).`; return; }
  $("#turnReveal").disabled = true; st.className = "status"; st.textContent = "Locked in. Asking Sage and Jev…";
  try {
    const r = await askBoth(scanMenu(turnCard), qs, false, true);
    renderCourses($("#turnCourses"), turnCard, qs, r, you);
    $("#turnOut").hidden = false; $("#turnReflect").value = "";
    const m = turnCard.menu;
    turnLocked = { t: Date.now(), image: turnCard.scanId, title: m.title, place: m.place, year: m.year, reflect: "",
      items: qs.map(q => ({ id: q.id, label: q.label, prompt: q.prompt, type: q.type, you: you[q.id], sage: slim(q, r.answers[q.id].sage), jev: slim(q, r.answers[q.id].jev), verdict: r.answers[q.id].verdict })) };
    store.log.unshift(turnLocked); save(); drawLog();
    st.textContent = (r.sErr || r.jErr) ? `Partial reveal. ${r.sErr || ""} ${r.jErr || ""}` : "Revealed and logged.";
    $("#turnOut").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { st.className = "status err"; st.textContent = e.message; }
  $("#turnReveal").disabled = false;
}
function slim(q, a) {
  if (a.error) return { error: a.error };
  if (q.type === "yesno") return { p: +a.p.toFixed(3), pick: a.pick, abstain: a.abstain };
  if (q.type === "choice") return { pick: a.top, p: +a.sure.toFixed(3), abstain: a.abstain };
  return { pick: a.top, exp: +a.exp.toFixed(2), p: +a.sure.toFixed(3) };
}
const youMatches = (it, m) => !m || m.error ? null : it.type === "yesno" ? (it.you.pick === (m.p >= .5 ? "yes" : "no")) : it.type === "scale" ? Math.abs(it.you.pick - m.exp) < .75 : it.you.pick === m.pick;
function drawLog() {
  const items = store.log.flatMap(r => r.items);
  const rate = f => { const v = items.map(f).filter(x => x != null); return v.length ? Math.round(100 * v.filter(Boolean).length / v.length) + "%" : "—"; };
  $("#turnScore").innerHTML = `
    <div><b>${store.log.length}</b><span>Rounds</span></div>
    <div><b>${rate(it => youMatches(it, it.sage))}</b><span>You agree w/ Sage</span></div>
    <div><b>${rate(it => youMatches(it, it.jev))}</b><span>You agree w/ Jev</span></div>
    <div><b>${rate(it => it.verdict === "abstain" || it.verdict === "error" ? null : it.verdict === "agree")}</b><span>Models agree</span></div>`;
  $("#turnLog").innerHTML = store.log.length ? store.log.map(r => `<div class="logrow"><img src="${img(r.image, "r")}" alt="">
    <div><b>${esc(r.title)}</b> <span class="note">${esc(r.place)} · ${r.year}</span><br><span class="note">${r.items.map(i => esc(i.label)).join(" · ")}</span></div>
    <div class="marks">${r.items.map(i => `<span class="${i.verdict === "agree" ? "y" : ""}" title="${esc(i.label)}: ${i.verdict}">${i.verdict === "agree" ? "=" : i.verdict === "abstain" ? "?" : "≠"}</span>`).join("")}</div></div>`).join("")
    : `<p class="note">No rounds yet. Answer, lock in, and your rounds land here.</p>`;
}
const fmtA = (it, a) => a?.error ? "error" : it.type === "yesno" ? `${a.pick ?? (a.p >= .5 ? "yes" : "no")} (P yes ${pct(a.p)})${a.abstain ? ", declined" : ""}` : it.type === "scale" ? `level ${a.exp} (top ${a.pick}, ${pct(a.p)})` : `${a.pick} (${pct(a.p)})${a.abstain ? ", declined" : ""}`;
const fmtYou = it => it.type === "yesno" ? `${it.you.pick} (${pct(it.you.sure)} sure)` : `${it.you.pick} (${pct(it.you.sure)} sure)`;
function download(name, text, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCsv() {
  const head = ["round_time", "menu_image", "title", "place", "year", "question", "type", "you", "you_sure", "sage", "sage_p", "sage_declined", "jev", "jev_p", "verdict", "reflection"];
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = store.log.flatMap(r => r.items.map(it => [new Date(r.t).toISOString(), r.image, r.title, r.place, r.year, it.prompt, it.type, it.you.pick, it.you.sure,
    it.sage.error ? "error" : it.type === "scale" ? it.sage.exp : it.sage.pick, it.sage.p, it.sage.abstain ? "yes" : "", it.jev.error ? "error" : it.type === "scale" ? it.jev.exp : it.jev.pick, it.jev.p, it.verdict, r.reflect]));
  download("supper-club-log.csv", [head, ...rows].map(r => r.map(q).join(",")).join("\n"), "text/csv");
}
function exportCopy() {
  const t = store.log.map(r => `${r.title} (${r.place}, ${r.year})\n` + r.items.map(it => `  ${it.prompt}\n    You: ${fmtYou(it)} · Sage: ${fmtA(it, it.sage)} · Jev: ${fmtA(it, it.jev)}`).join("\n") + (r.reflect ? `\n  Reflection: ${r.reflect}` : "")).join("\n\n");
  navigator.clipboard.writeText(t).then(() => { $("#turnStatus").textContent = "Copied your log."; });
}
function exportHtml() {
  const rows = store.log.map(r => `<section><img src="${img(r.image, "w")}" alt=""><div><h2>${esc(r.title)}</h2><p class="m">${esc(r.place)} · ${r.year} · NYPL image ${r.image}</p>
    <table><tr><th>Question</th><th>You</th><th>Sage</th><th>Jev</th></tr>${r.items.map(it => `<tr><td>${esc(it.prompt)}</td><td>${esc(fmtYou(it))}</td><td>${esc(fmtA(it, it.sage))}</td><td>${esc(fmtA(it, it.jev))}</td></tr>`).join("")}</table>
    ${r.reflect ? `<p class="r"><b>Reflection.</b> ${esc(r.reflect)}</p>` : ""}</div></section>`).join("");
  download("supper-club-report.html", `<!doctype html><meta charset="utf-8"><title>Supper Club report</title>
<style>body{font:15px/1.5 Georgia,serif;background:#6d4145;color:#ffefae;max-width:900px;margin:0 auto;padding:30px 16px}h1{font-size:40px;margin:0}section{display:grid;grid-template-columns:160px 1fr;gap:20px;border-top:1px solid rgba(255,239,174,.3);padding:20px 0}img{width:160px;background:#ffefae;padding:5px}h2{margin:0;font-size:20px}.m{opacity:.75;margin:2px 0 10px}table{border-collapse:collapse;width:100%;font:13px system-ui,sans-serif}td,th{border-bottom:1px solid rgba(255,239,174,.2);padding:6px;text-align:left;vertical-align:top}th{color:#96d1aa}.r{font-size:14px}@media print{body{background:#fff;color:#000}img{border:1px solid #999}th{color:#555832}}</style>
<h1>The Supper Club</h1><p>Report exported ${new Date().toLocaleString()} · ${store.log.length} rounds. Menus: NYPL Buttolph Collection. Models: Levanto Sage, TypeSafe Jev. Model answers are machine output.</p>${rows}`, "text/html");
}

/* ---------- III. by the decade ---------- */
// One run asks every chosen question (up to 6) of every sampled menu, once per model.
// Three views read the same results: by year, Sage vs Jev scatter, and a fingerprint grid.
const lens = { sample: [], results: new Map(), running: false, used: { s: 0, j: 0 } };
store.lensQs ||= ["french", "prices", "game", "decor", "formal", "meal"];
store.lensView ||= "strips";
const lensQs = () => store.lensQs.map(qById).filter(Boolean);
const ans = (m, q) => lens.results.get(m.image)?.[q.id];
const short = s => s.split(/[:,]/)[0];
function initLens() {
  const fill = () => {
    qPicker($("#lensQs"), store.lensQs, 6, on => { store.lensQs = on; save(); fillPlot(); drawSample(lens.seed); });
    fillPlot();
  };
  const fillPlot = () => {
    const cur = $("#lensQ").value, qs = lensQs();
    $("#lensQ").innerHTML = qs.length ? qs.map(q => `<option value="${esc(q.id)}">${esc(q.label)} (${q.type === "yesno" ? "yes/no" : q.type})</option>`).join("") : `<option value="">Pick questions below</option>`;
    if (cur && qs.some(q => q.id === cur)) $("#lensQ").value = cur;
    plotOpts();
  };
  const plotOpts = () => {
    const q = qById($("#lensQ").value);
    $("#lensPlotWrap").hidden = q?.type !== "choice";
    $("#lensPlot").innerHTML = q?.type === "choice" ? q.options.map(([k, d]) => `<option value="${esc(k)}">${esc(short(d))}</option>`).join("") : "";
    drawLens();
  };
  fill(); initLens.redraw = fill;
  $("#lensQ").onchange = plotOpts; $("#lensPlot").onchange = drawLens;
  $$("[data-view]").forEach(b => b.onclick = () => { store.lensView = b.dataset.view; save(); drawLens(); });
  $("#lensN").onchange = () => drawSample(lens.seed); $("#lensDraw").onclick = () => drawSample(Date.now());
  $("#lensRun").onclick = runLens; $("#lensCsv").onclick = lensCsv;
  drawSample(1907);
}
function drawSample(seed) {
  // stratified: n evenly spaced year slots 1880–1920, one random menu per slot
  const n = +$("#lensN").value, r = rnd(lens.seed = seed);
  const pick = [];
  for (let i = 0; i < n; i++) {
    const lo = 1880 + (40 * i) / n, hi = 1880 + (40 * (i + 1)) / n;
    const pool = MENUS.filter(m => m.year >= lo && m.year < hi + (i === n - 1 ? 1 : 0));
    if (pool.length) pick.push(pool[Math.floor(r() * pool.length)]);
  }
  lens.sample = pick; lens.results.clear(); lens.used = { s: 0, j: 0 }; $("#lensProg").style.width = "0";
  drawLens();
  $("#lensStatus").textContent = `${pick.length} menus drawn, spread across 1880–1920, ${lensQs().length} questions each. Each menu sends one scan to each model; the token count shows here as it runs.`;
}
async function runLens() {
  if (lens.running) { lens.running = false; return; }
  const qs = lensQs();
  if (!qs.length) { $("#lensStatus").textContent = "Pick at least one question for this run."; return; }
  lens.running = true; lens.results.clear(); lens.used = { s: 0, j: 0 };
  $("#lensRun").textContent = "Stop"; let done = 0, errs = 0;
  const queue = [...lens.sample];
  const worker = async () => {
    while (queue.length && lens.running) {
      const m = queue.shift();
      try {
        const r = await askBoth(m, qs, false); lens.results.set(m.image, r.answers);
        const t = tokensOf(r); lens.used.s += t.s; lens.used.j += t.j;
        if (r.sErr || r.jErr) errs++;
      } catch (e) { errs++; lens.results.set(m.image, Object.fromEntries(qs.map(q => [q.id, { sage: { error: e.message }, jev: { error: e.message }, verdict: "error" }]))); }
      done++; $("#lensProg").style.width = (100 * done / lens.sample.length) + "%";
      $("#lensStatus").textContent = `${done} of ${lens.sample.length} menus read${errs ? `, ${errs} with errors` : ""} · tokens so far: Sage ${lens.used.s.toLocaleString()}, Jev ${lens.used.j.toLocaleString()}.`;
      drawLens();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  lens.running = false; $("#lensRun").textContent = "Run both";
  const v = [...lens.results.values()].flatMap(a => Object.values(a)).map(a => a.verdict);
  $("#lensStatus").textContent = `Done. Across ${v.length} answers: ${v.filter(x => x === "agree").length} agree, ${v.filter(x => x === "split").length} split, ${v.filter(x => x === "abstain").length} declined by Sage${errs ? `, ${errs} menus with errors` : ""}. Tokens: Sage ${lens.used.s.toLocaleString()}, Jev ${lens.used.j.toLocaleString()}.`;
}
function lensValue(q, a, key) {
  if (!a || a.error) return null;
  if (q.type === "yesno") return { y: a.p, o: a.sure };
  if (q.type === "scale") return { y: a.exp / (q.levels.length - 1), o: a.sure, raw: a.exp };
  return { y: a.probs[key] ?? 0, o: a.sure };
}
const fmtV = (q, v) => !v ? "error" : q.type === "scale" ? v.raw.toFixed(2) : pct(v.y);
// Signed gap between the models: Jev minus Sage, scaled to −1…1. Choice has no direction, so it is the
// total-variation distance between their odds (0 = identical, 1 = no overlap).
function diffOf(q, a) {
  if (!a || a.sage?.error || a.jev?.error) return null;
  if (q.type === "yesno") return a.jev.p - a.sage.p;
  if (q.type === "scale") return (a.jev.exp - a.sage.exp) / (q.levels.length - 1);
  return q.options.reduce((t, [k]) => t + Math.abs((a.jev.probs[k] ?? 0) - (a.sage.probs[k] ?? 0)), 0) / 2;
}
// Below this, a model's top answer is drawn as a ring, not a solid mark. A five-level scale spreads its odds
// by nature, so its top level only needs half the probability.
const UNSURE = .8;
const sureBar = q => q.type === "scale" ? .5 : UNSURE;
const unsure = (a, q) => Math.min(a.sage?.sure ?? 1, a.jev?.sure ?? 1) < sureBar(q);
const totalGap = m => lensQs().reduce((t, q) => t + Math.abs(diffOf(q, ans(m, q)) ?? 0), 0);
const VIEWS = ["strips", "decade", "print"];
function drawLens() {
  if (!VIEWS.includes(store.lensView)) store.lensView = "strips";
  const view = store.lensView, q = qById($("#lensQ").value), key = $("#lensPlot").value;
  $$("[data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === view));
  $("#lensPlotRow").hidden = view !== "decade";
  const box = $("#lensChart");
  box.classList.add("scroll");
  if (!lensQs().length) box.innerHTML = `<p class="note">Pick at least one question for this run.</p>`;
  else if (view === "strips") drawStrips(box);
  else if (view === "print") drawPrint(box);
  else if (q) drawDecade(box, q, key);
  const ring = `<svg width="14" height="14" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><circle cx="7" cy="7" r="5" fill="none" stroke="#ffefae" stroke-width="2"/></svg>`;
  const dashed = `<svg width="14" height="14" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><circle cx="7" cy="7" r="5" fill="none" stroke="#ffefae" stroke-width="2" stroke-dasharray="2 2"/></svg>`;
  $("#lensLegend").innerHTML = {
    strips: `<span><svg width="14" height="14" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><circle cx="7" cy="7" r="6" fill="#ffefae"/></svg>a split</span><span><svg width="14" height="14" aria-hidden="true" style="vertical-align:-2px;margin-right:6px"><circle cx="7" cy="7" r="4" fill="#ffefae" fill-opacity=".35"/></svg>same answer</span><span>${ring}a model under ${UNSURE * 100}% sure (50% for scales)</span><span>${dashed}Sage declined</span><span>Rows with the most splits come first</span>`,
    decade: `<span><i class="dot sage"></i>Sage</span><span><i class="dot jev diamond"></i>Jev</span><span>Bar = the range this share could plausibly take with so few menus (90%)</span><span>Fewer than 5 menus in a decade: read with care</span>`,
    print: `<span><span class="cellkey yes">yes</span>both yes</span><span><span class="cellkey">no</span>both no</span><span><span class="cellkey split">S yes · J no</span>a split</span><span><span class="cellkey">?</span>a model under ${UNSURE * 100}% sure</span><span>Scale cells: top row Sage, bottom row Jev, one pip per level</span>`,
  }[view];
  const order = view === "strips" ? [...lens.sample].sort((a, b) => totalGap(b) - totalGap(a)) : lens.sample;
  $("#lensStrip").innerHTML = order.map(m => {
    const r = lens.results.get(m.image); const splits = r ? Object.values(r).filter(a => a.verdict === "split").length : 0;
    return `<button type="button" data-i="${m.image}" title="${esc(m.title)}"><img src="${img(m.image, "r")}" alt="" loading="lazy"><span>${m.year}${splits ? ` · ${splits} split${splits > 1 ? "s" : ""}` : ""}</span></button>`;
  }).join("");
  $$("#lensStrip button").forEach(b => b.onclick = () => openInH2H(+b.dataset.i));
}
function hookPts(root) {
  $$("[data-tip]", root).forEach(g => {
    g.onmouseenter = e => showTip(e, g.dataset.tip); g.onmousemove = e => moveTip(e); g.onmouseleave = hideTip;
    g.onfocus = () => { const r = g.getBoundingClientRect(); showTip({ clientX: r.left + r.width / 2, clientY: r.top }, g.dataset.tip); }; g.onblur = hideTip;
    const go = () => openInH2H(+g.dataset.i, g.dataset.q); g.onclick = go;
    g.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
}
const ptAttrs = (m, tip, qid) => `data-i="${m.image}" ${qid ? `data-q="${esc(qid)}"` : ""} data-tip="${esc(tip)}" tabindex="0" role="button" aria-label="${esc(m.title)}, ${m.year}. ${esc(tip.split("|")[1] || "")}"`;
const answerTip = (q, a) => q.type === "choice"
  ? `Sage ${a.sage.error ? "error" : a.sage.abstain ? "declined" : a.sage.top} (${pct(a.sage.sure)}) · Jev ${a.jev.error ? "error" : a.jev.top} (${pct(a.jev.sure)})`
  : `Sage ${fmtV(q, lensValue(q, a.sage))}${a.sage.abstain ? " (declined)" : ""} · Jev ${fmtV(q, lensValue(q, a.jev))}`;

/* Where they split: one strip per question, each menu a dot placed by the gap between the models */
function drawStrips(box) {
  // On a phone the question label sits above its strip so the strip gets the full width.
  const narrow = box.clientWidth < 700, W = narrow ? 560 : 1000, LW = narrow ? 14 : 250, R = narrow ? 14 : 30, D = 15, x0 = LW, x1 = W - R, top = narrow ? 40 : 0;
  const X = d => x0 + (d + 1) / 2 * (x1 - x0);
  const rows = lensQs().map(q => {
    const items = lens.sample.map(m => ({ m, a: ans(m, q) })).filter(o => o.a).map(o => ({ ...o, d: diffOf(q, o.a) })).filter(o => o.d != null);
    return { q, items, splits: items.filter(o => o.a.verdict === "split").length, declined: items.filter(o => o.a.verdict === "abstain").length };
  }).sort((a, b) => (b.splits + b.declined / 2) - (a.splits + a.declined / 2));
  let y = 46, svg = "";
  for (const row of rows) {
    // Confident agreements collapse into one count at the centre; every other menu gets a dot.
    const bulk = row.items.filter(o => o.a.verdict === "agree" && !unsure(o.a, row.q) && Math.abs(o.d) < .12);
    const pillW = 92;
    // stack dots that land in the same column, alternating above and below the axis (clear of the pill)
    const cols = new Map(), placed = [];
    for (const o of row.items.filter(o => !bulk.includes(o)).sort((a, b) => Math.abs(a.d) - Math.abs(b.d))) {
      const c = Math.round(X(o.d) / D), near = bulk.length && Math.abs(c * D - X(0)) < pillW / 2 + 8;
      const k = cols.get(c) ?? (near ? 1 : 0); cols.set(c, k + 1);
      placed.push({ ...o, cx: c * D, k });
    }
    const maxK = Math.max(1, ...cols.values());
    const half = Math.max(26, Math.ceil(maxK / 2) * D + 8), cy = y + top + half;
    const choice = row.q.type === "choice";
    svg += `<line x1="0" x2="${W}" y1="${y + top + 2 * half}" y2="${y + top + 2 * half}" stroke="var(--rule)" stroke-opacity=".5"/>
      <text x="${narrow ? LW : 0}" y="${narrow ? y + 20 : cy - 4}" fill="var(--cream)" font-size="16" font-weight="700" font-family="Libre Caslon Text,Georgia,serif">${esc(row.q.label)}</text>
      <text x="${narrow ? LW : 0}" y="${narrow ? y + 36 : cy + 16}" fill="var(--cream)" fill-opacity=".8" font-size="12">${row.items.length ? `${row.splits} split${row.splits === 1 ? "" : "s"}${row.declined ? ` · ${row.declined} declined` : ""} of ${row.items.length}` : "not run yet"}${choice ? " · distance only" : ""}</text>
      <line x1="${X(0)}" x2="${X(0)}" y1="${y + top + 4}" y2="${y + top + 2 * half - 4}" stroke="var(--cream)" stroke-opacity=".45"/>
      <line x1="${choice ? X(0) : x0}" x2="${x1}" y1="${cy}" y2="${cy}" stroke="var(--rule)"/>
      ${bulk.length ? `<g data-tip="${esc(`${row.q.label}|${bulk.length} menus where both models gave the same answer and were at least ${UNSURE * 100}% sure`)}" tabindex="0" aria-label="${bulk.length} menus agree">
        <rect x="${X(0) - pillW / 2}" y="${cy - 12}" width="${pillW}" height="24" rx="12" fill="var(--olive)" stroke="var(--cream)" stroke-opacity=".5"/>
        <text x="${X(0)}" y="${cy + 5}" text-anchor="middle" fill="var(--cream)" font-size="13" font-weight="600">${bulk.length} agree</text></g>` : ""}`;
    for (const o of placed) {
      const py = cy + (o.k === 0 ? 0 : Math.ceil(o.k / 2) * D * (o.k % 2 ? -1 : 1));
      const split = o.a.verdict === "split", dec = o.a.verdict === "abstain", r = split || dec ? 6.5 : 4.5;
      const mark = dec ? `<circle cx="${o.cx}" cy="${py}" r="${r}" fill="none" stroke="var(--cream)" stroke-width="2" stroke-dasharray="2.5 2"/>`
        : unsure(o.a, row.q) ? `<circle cx="${o.cx}" cy="${py}" r="${r}" fill="none" stroke="var(--cream)" stroke-width="2" stroke-opacity="${split ? 1 : .6}"/>`
        : `<circle cx="${o.cx}" cy="${py}" r="${r}" fill="var(--cream)" fill-opacity="${split ? 1 : .35}"/>`;
      svg += `<g class="pt" ${ptAttrs(o.m, `${o.m.title} · ${o.m.year}|${row.q.label}: ${answerTip(row.q, o.a)}`, row.q.id)}>${mark}<circle cx="${o.cx}" cy="${py}" r="9" fill="transparent"/></g>`;
    }
    y += top + 2 * half;
  }
  const head = `<text x="${x0}" y="20" fill="var(--cream)" fill-opacity=".85" font-size="13">${narrow ? "← Sage higher" : "← Sage says more likely, or higher"}</text>
    <text x="${X(0)}" y="20" text-anchor="middle" fill="var(--cream)" font-size="13" font-weight="600">same answer</text>
    <text x="${x1}" y="20" text-anchor="end" fill="var(--cream)" fill-opacity=".85" font-size="13">${narrow ? "Jev higher →" : "Jev says more likely, or higher →"}</text>
    <line x1="${x0}" x2="${x1}" y1="32" y2="32" stroke="var(--rule)"/>`;
  const empty = !lens.results.size ? `<text x="${(x0 + x1) / 2}" y="${y / 2 + 30}" text-anchor="middle" fill="var(--cream)" fill-opacity=".75" font-size="17" font-family="Libre Caslon Text,Georgia,serif">Run both to see where the models split.</text>` : "";
  // the menus the models fought over most
  const far = [...lens.sample].filter(m => lens.results.get(m.image) && Object.values(lens.results.get(m.image)).some(a => a.verdict === "split" || a.verdict === "abstain"))
    .sort((a, b) => totalGap(b) - totalGap(a)).slice(0, 4);
  box.innerHTML = `<svg viewBox="0 0 ${W} ${y + 6}" ${narrow ? "" : `style="min-width:760px"`} role="img" aria-label="Where Sage and Jev split, one row per question">${head}${svg}${empty}</svg>
    ${far.length ? `<p class="kicker-sm" style="margin:18px 0 10px">Read these first</p><div class="far far-row">${far.map(m => {
      const r = lens.results.get(m.image), sp = lensQs().filter(q => r[q.id]?.verdict === "split" || r[q.id]?.verdict === "abstain").map(q => q.label);
      return `<button type="button" data-open="${m.image}"><img src="${img(m.image, "r")}" alt=""><span><b>${esc(m.title)}</b>${m.year} · split on ${esc(sp.join(", "))}</span></button>`; }).join("")}</div>` : ""}`;
  hookPts(box);
  $$("[data-open]", box).forEach(b => b.onclick = () => openInH2H(+b.dataset.open));
}

/* By decade: how many menus each model said yes to, with a range that is honest about small samples */
function wilson(k, n, z = 1.645) {
  if (!n) return [0, 0, 0];
  const p = k / n, z2 = z * z, c = (p + z2 / (2 * n)) / (1 + z2 / n), h = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / (1 + z2 / n);
  return [p, Math.max(0, c - h), Math.min(1, c + h)];
}
function decadeStat(q, key, menus, model) {
  const as = menus.map(m => ans(m, q)?.[model]).filter(a => a && !a.error);
  const n = as.length;
  if (!n) return null;
  if (q.type === "scale") {
    const top = q.levels.length - 1, v = as.map(a => a.exp / top), mu = v.reduce((t, x) => t + x, 0) / n;
    const sd = Math.sqrt(v.reduce((t, x) => t + (x - mu) ** 2, 0) / Math.max(1, n - 1)), h = 1.645 * sd / Math.sqrt(n);
    return { n, v: mu, lo: Math.max(0, mu - h), hi: Math.min(1, mu + h), label: `avg ${(mu * top).toFixed(1)}` };
  }
  const k = as.filter(a => q.type === "yesno" ? a.p >= .5 : a.top === key).length;
  const [p, lo, hi] = wilson(k, n);
  return { n, v: p, lo, hi, label: `${k} of ${n}` };
}
function drawDecade(box, q, key) {
  const W = 1000, H = 400, L = 64, R = 20, T = 30, B = 76;
  const decs = [[1880, "1880s"], [1890, "1890s"], [1900, "1900s"], [1910, "1910s–1920"]];
  const cw = (W - L - R) / decs.length, y = v => T + (1 - v) * (H - T - B);
  const ticks = q.type === "scale" ? q.levels.map((_, i) => [i / (q.levels.length - 1), String(i)]) : [[0, "0%"], [.25, "25%"], [.5, "50%"], [.75, "75%"], [1, "100%"]];
  const opt = q.type === "choice" ? short(q.options.find(o => o[0] === key)?.[1] || key) : "";
  const what = q.type === "yesno" ? "Share of menus each model said yes to" : q.type === "choice" ? `Share of menus each model called "${opt}"` : "Average level each model gave";
  let svg = ticks.map(([v, l]) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)" stroke-opacity=".5" stroke-dasharray="2 4"/><text x="${L - 10}" y="${y(v) + 4}" text-anchor="end" fill="var(--cream)" fill-opacity=".8" font-size="12">${l}</text>`).join("");
  decs.forEach(([d, name], i) => {
    const menus = lens.sample.filter(m => m.year >= d && m.year < (d === 1910 ? 1921 : d + 10));
    const cx = L + cw * i + cw / 2;
    svg += `<text x="${cx}" y="${H - B + 26}" text-anchor="middle" fill="var(--cream)" font-size="16" font-weight="700" font-family="Libre Caslon Text,Georgia,serif">${name}</text>
      <text x="${cx}" y="${H - B + 46}" text-anchor="middle" fill="var(--cream)" fill-opacity=".8" font-size="12">${menus.length} menu${menus.length === 1 ? "" : "s"} sampled${menus.length && menus.length < 5 ? " · too few to say much" : ""}</text>`;
    if (i) svg += `<line x1="${L + cw * i}" x2="${L + cw * i}" y1="${T}" y2="${H - B}" stroke="var(--rule)" stroke-opacity=".6"/>`;
    for (const [model, dx, color] of [["sage", -26, "var(--sage)"], ["jev", 26, "var(--jev)"]]) {
      const s = decadeStat(q, key, menus, model); if (!s) continue;
      const X = cx + dx, Y = y(s.v), faint = s.n < 5 ? .55 : 1;
      svg += `<g opacity="${faint}"><line x1="${X}" x2="${X}" y1="${y(s.hi)}" y2="${y(s.lo)}" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-opacity=".28"/>
        ${model === "sage" ? `<circle cx="${X}" cy="${Y}" r="8" fill="${color}"/>` : `<rect x="${X - 7}" y="${Y - 7}" width="14" height="14" transform="rotate(45 ${X} ${Y})" fill="${color}"/>`}
        <text x="${X + (model === "sage" ? -14 : 14)}" y="${Y + 4}" text-anchor="${model === "sage" ? "end" : "start"}" fill="var(--cream)" font-size="12" font-weight="600">${s.label}</text></g>`;
    }
  });
  const empty = !lens.results.size ? `<text x="${W / 2}" y="${(H - B) / 2 + 10}" text-anchor="middle" fill="var(--cream)" fill-opacity=".75" font-size="17" font-family="Libre Caslon Text,Georgia,serif">Run both to compare the decades.</text>` : "";
  box.innerHTML = `<p class="kicker-sm" style="margin:0 0 6px">${esc(what)}</p><svg viewBox="0 0 ${W} ${H}" style="min-width:680px" role="img" aria-label="${esc(what)}, by decade">${svg}${empty}</svg>
    <p class="note" style="margin:4px 0 0">A pale bar is the range the true share could plausibly sit in, given how few menus were sampled. If Sage's and Jev's bars overlap, this sample cannot tell them apart. A larger sample shrinks the bars.</p>`;
}

/* Fingerprint: menus × questions, each cell says in words or pips what happened */
function drawPrint(box) {
  const qs = lensQs(), rows = lens.sample;
  const RH = 250, CW = 104, CH = 38, G = 5, HH = 62;
  const W = RH + qs.length * (CW + G), H = HH + rows.length * (CH + G);
  const wrap = s => { const out = [""]; for (const w of s.split(" ")) { if (out.at(-1) && (out.at(-1) + " " + w).length > 13) out.push(w); else out[out.length - 1] = (out.at(-1) + " " + w).trim(); } return out.slice(0, 3); };
  let svg = qs.map((q, c) => { const cx = RH + c * (CW + G) + CW / 2;
    return wrap(q.label).map((ln, i, arr) => `<text x="${cx}" y="${HH - 10 - (arr.length - 1 - i) * 15}" text-anchor="middle" fill="var(--cream)" font-size="13" font-weight="600">${esc(ln)}</text>`).join(""); }).join("");
  const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" text-anchor="${o.a || "middle"}" fill="${o.f || "var(--cream)"}" font-size="${o.s || 13}" font-weight="${o.w || 600}"${o.o ? ` fill-opacity="${o.o}"` : ""}>${s}</text>`;
  rows.forEach((m, r) => {
    const y0 = HH + r * (CH + G);
    svg += `<g class="pt rowh" data-i="${m.image}" tabindex="0" role="button" aria-label="Open ${esc(m.title)}, ${m.year}"><rect x="0" y="${y0}" width="${RH - 10}" height="${CH}" fill="transparent"/>
      <text x="0" y="${y0 + 24}" fill="var(--cream)" font-size="15" font-family="Libre Caslon Text,Georgia,serif" font-weight="700">${m.year}</text>
      <text x="46" y="${y0 + 24}" fill="var(--cream)" fill-opacity=".85" font-size="12">${esc(m.title.length > 30 ? m.title.slice(0, 29) + "…" : m.title)}</text></g>`;
    qs.forEach((q, c) => {
      const x0 = RH + c * (CW + G), a = ans(m, q), cx = x0 + CW / 2, cy = y0 + CH / 2;
      if (!a) { svg += `<rect x="${x0 + .5}" y="${y0 + .5}" width="${CW - 1}" height="${CH - 1}" fill="none" stroke="var(--rule)" stroke-dasharray="2 3"/>`; return; }
      const err = a.sage.error || a.jev.error, split = a.verdict === "split", dec = a.verdict === "abstain", q8 = unsure(a, q) ? "?" : "";
      let cell = "";
      const frame = (fill, stroke, dash) => `<rect x="${x0 + 1}" y="${y0 + 1}" width="${CW - 2}" height="${CH - 2}" rx="2" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="2"` : ""} ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
      if (err) cell = frame("var(--wine-ink)") + T(cx, cy + 4, "error", { o: .7, w: 400, s: 12 });
      else if (q.type === "yesno") {
        const sy = a.sage.p >= .5, jy = a.jev.p >= .5;
        if (dec) cell = frame("none", "var(--cream)", "4 3") + T(cx, cy + 4, `S ? · J ${jy ? "yes" : "no"}`, { s: 12 });
        else if (split) cell = frame("none", "var(--cream)", "5 3") + T(cx, cy - 3, `Sage ${sy ? "yes" : "no"}`, { s: 11 }) + T(cx, cy + 12, `Jev ${jy ? "yes" : "no"}`, { s: 11, w: 400 });
        else if (sy) cell = frame("var(--cream)") + T(cx, cy + 5, "yes" + q8, { f: "var(--wine-ink)", s: 15, w: 700 });
        else cell = frame("var(--wine-ink)") + T(cx, cy + 5, "no" + q8, { o: .75, s: 14, w: 400 });
      } else if (q.type === "scale") {
        // one pip per level; Sage's level on the top row, Jev's on the bottom row
        const n = q.levels.length, step = (CW - 24) / (n - 1), px = i => x0 + 12 + i * step;
        const sL = Math.round(a.sage.exp), jL = Math.round(a.jev.exp);
        cell = frame("var(--wine-ink)", split ? "var(--cream)" : "", split ? "5 3" : "");
        for (let i = 0; i < n; i++) {
          cell += `<circle cx="${px(i)}" cy="${y0 + 12}" r="${i === sL ? 5.5 : 2}" fill="${i === sL ? (a.sage.sure < sureBar(q) ? "none" : "var(--sage)") : "var(--rule)"}" ${i === sL && a.sage.sure < sureBar(q) ? `stroke="var(--sage)" stroke-width="2"` : ""}/>`;
          cell += `<circle cx="${px(i)}" cy="${y0 + CH - 12}" r="${i === jL ? 5.5 : 2}" fill="${i === jL ? (a.jev.sure < sureBar(q) ? "none" : "var(--jev)") : "var(--rule)"}" ${i === jL && a.jev.sure < sureBar(q) ? `stroke="var(--jev)" stroke-width="2"` : ""}/>`;
        }
      } else {
        const name = k => esc(short(q.options.find(o => o[0] === k)?.[1] || k).split(" ")[0].slice(0, 11));
        if (dec) cell = frame("none", "var(--cream)", "4 3") + T(cx, cy - 3, "Sage ?", { s: 11 }) + T(cx, cy + 12, `Jev ${name(a.jev.top)}`, { s: 11, w: 400 });
        else if (split) cell = frame("none", "var(--cream)", "5 3") + T(cx, cy - 3, `Sage ${name(a.sage.top)}`, { s: 11 }) + T(cx, cy + 12, `Jev ${name(a.jev.top)}`, { s: 11, w: 400 });
        else cell = frame("var(--wine-ink)") + T(cx, cy + 5, name(a.sage.top) + q8, { s: 13 });
      }
      svg += `<g class="pt" ${ptAttrs(m, `${m.title} · ${m.year}|${q.label}: ${answerTip(q, a)}`, q.id)}>${cell}</g>`;
    });
  });
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="width:${W}px;max-width:none" role="img" aria-label="Fingerprint: ${rows.length} menus by ${qs.length} questions">${svg}</svg>`;
  hookPts(box);
  $$(".rowh", box).forEach(g => { const go = () => openInH2H(+g.dataset.i); g.onclick = go; g.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }; });
}
function openInH2H(id, qid) {
  const m = byImg.get(id); if (!m) return;
  goto("h2h"); cards.h2h.set(m);
  const want = qid ? [qid] : store.lensQs;
  const add = want.filter(x => !store.h2hQs.includes(x));
  if (add.length) { store.h2hQs = [...add, ...store.h2hQs].slice(0, 8); save(); initH2H.redraw(); }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function lensCsv() {
  const head = ["menu_image", "title", "place", "year", "question", "type", "sage", "sage_sure", "sage_declined", "jev", "jev_sure", "verdict"];
  const val = (q, a) => !a || a.error ? "" : q.type === "yesno" ? a.p : q.type === "scale" ? a.exp : a.top;
  const rows = lens.sample.flatMap(m => lensQs().map(q => { const a = ans(m, q) || {}; return [m.image, m.title, m.place, m.year, q.prompt, q.type, val(q, a.sage), a.sage?.sure, a.sage?.abstain ? "yes" : "", val(q, a.jev), a.jev?.sure, a.verdict]; }));
  download("supper-club-sample.csv", [head, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
}
const tip = () => $("#tip");
function showTip(e, t) { const [a, b] = t.split("|"); tip().innerHTML = `<b>${a}</b>${b}`; tip().style.display = "block"; moveTip(e); }
function moveTip(e) { const el = tip(); el.style.left = Math.min(innerWidth - 270, e.clientX + 14) + "px"; el.style.top = (e.clientY + 14) + "px"; }
function hideTip() { tip().style.display = "none"; }

/* ---------- IV. the kitchen ---------- */
const draft = { kind: "yesno", editing: null, opts: [["", ""], ["", ""]], lvs: ["", "", ""] };
let jsonView = "sage";
function initKitchen() {
  $$("#kKind .chip").forEach(b => b.onclick = () => { draft.kind = b.dataset.k; drawDraft(); });
  $("#kAddOpt").onclick = () => { if (draft.opts.length < 12) { syncDraft(); draft.opts.push(["", ""]); drawDraft(); } };
  $("#kAddLv").onclick = () => { if (draft.lvs.length < 7) { syncDraft(); draft.lvs.push(""); drawDraft(); } };
  $("#kSave").onclick = saveDraft; $("#kReset").onclick = resetDraft;
  $("#kTest").onclick = async () => { const q = draftQ(); if (typeof q === "string") { $("#kStatus").textContent = q; return; } goto("h2h"); await runH2H(cards.h2h, [q]); };
  $$("[data-j]").forEach(b => b.onclick = () => { jsonView = b.dataset.j; $$("[data-j]").forEach(x => x.setAttribute("aria-pressed", x === b)); drawJson(); });
  ["kLabel", "kPrompt"].forEach(id => $("#" + id).oninput = drawJson);
  $("#kExport").onclick = () => download("supper-club-questions.json", JSON.stringify({ app: "supper-club", questions: store.mine }, null, 2), "application/json");
  $("#kImport").onchange = async e => {
    try {
      const j = JSON.parse(await e.target.files[0].text()); const qs = (j.questions || []).filter(q => q.id && q.prompt && ["yesno", "choice", "scale"].includes(q.type));
      qs.forEach(q => { q.id = q.id.startsWith("my-") ? q.id : "my-" + q.id; store.mine = store.mine.filter(m => m.id !== q.id).concat(q); });
      save(); afterQsChange(); $("#kStatus").textContent = `Imported ${qs.length} questions.`;
    } catch { $("#kStatus").textContent = "That file is not a question set."; }
    e.target.value = "";
  };
  drawDraft(); drawMine();
}
function syncDraft() {
  draft.opts = $$("#kOpts .optrow").map(r => [$("input", r).value.trim(), $$("input", r)[1].value.trim()]);
  draft.lvs = $$("#kLvs .lvrow input").map(i => i.value.trim());
}
function drawDraft() {
  $$("#kKind .chip").forEach(b => b.setAttribute("aria-pressed", b.dataset.k === draft.kind));
  $("#kOptsWrap").hidden = draft.kind !== "choice"; $("#kLvWrap").hidden = draft.kind !== "scale";
  $("#kOpts").innerHTML = draft.opts.map(([k, d], i) => `<div class="optrow"><input type="text" value="${esc(k)}" placeholder="key, e.g. banquet" aria-label="Option ${i + 1} key" maxlength="30"><input type="text" value="${esc(d)}" placeholder="when it applies" aria-label="Option ${i + 1} description" maxlength="160"><button class="x" type="button" aria-label="Remove option ${i + 1}">×</button></div>`).join("");
  $("#kLvs").innerHTML = draft.lvs.map((d, i) => `<div class="lvrow"><b>${i}</b><input type="text" value="${esc(d)}" placeholder="${i === 0 ? "lowest, e.g. None at all" : "next level up"}" aria-label="Level ${i}" maxlength="160"><button class="x" type="button" aria-label="Remove level ${i}">×</button></div>`).join("");
  $$("#kOpts .x").forEach((b, i) => b.onclick = () => { syncDraft(); if (draft.opts.length > 2) draft.opts.splice(i, 1); drawDraft(); });
  $$("#kLvs .x").forEach((b, i) => b.onclick = () => { syncDraft(); if (draft.lvs.length > 2) draft.lvs.splice(i, 1); drawDraft(); });
  $$("#kOpts input, #kLvs input").forEach(i => i.oninput = drawJson);
  $("#kTitle").textContent = draft.editing ? "Edit question" : "New question";
  drawJson();
}
function draftQ() {
  syncDraft();
  const label = $("#kLabel").value.trim(), prompt = $("#kPrompt").value.trim();
  if (!label || !prompt) return "Give the question a label and a prompt.";
  const q = { id: draft.editing || "my-" + Date.now().toString(36), type: draft.kind, label, prompt };
  if (draft.kind === "choice") {
    q.options = draft.opts.filter(([k, d]) => k && d).map(([k, d]) => [k.toLowerCase().replace(/[^a-z0-9_-]+/g, "_"), d]);
    if (q.options.length < 2) return "A choice question needs at least two options, each with a key and a description.";
    if (new Set(q.options.map(o => o[0])).size !== q.options.length) return "Option keys must be different.";
  }
  if (draft.kind === "scale") { q.levels = draft.lvs.filter(Boolean); if (q.levels.length < 2) return "A scale needs at least two levels."; }
  return q;
}
function saveDraft() {
  const q = draftQ(); if (typeof q === "string") { $("#kStatus").textContent = q; return; }
  store.mine = store.mine.filter(m => m.id !== q.id).concat(q); save();
  $("#kStatus").textContent = `Saved "${q.label}". It now appears in every room.`; resetDraft(true); afterQsChange();
}
function resetDraft(keepStatus) {
  Object.assign(draft, { kind: "yesno", editing: null, opts: [["", ""], ["", ""]], lvs: ["", "", ""] });
  $("#kLabel").value = ""; $("#kPrompt").value = ""; if (keepStatus !== true) $("#kStatus").textContent = ""; drawDraft();
}
function drawMine() {
  $("#kMine").innerHTML = store.mine.length ? store.mine.map(q => `<div class="it"><span><b>${esc(q.label)}</b> <span class="note">${q.type === "yesno" ? "yes/no" : q.type}</span></span>
    <span class="row"><button class="btn ghost" type="button" data-e="${esc(q.id)}">Edit</button><button class="btn ghost" type="button" data-d="${esc(q.id)}">Delete</button></span></div>`).join("")
    : `<p class="note">Nothing saved yet. Eleven house questions are always on the menu.</p>`;
  $$("[data-e]", $("#kMine")).forEach(b => b.onclick = () => {
    const q = qById(b.dataset.e); Object.assign(draft, { kind: q.type, editing: q.id, opts: q.options ? q.options.map(o => [...o]) : [["", ""], ["", ""]], lvs: q.levels ? [...q.levels] : ["", "", ""] });
    $("#kLabel").value = q.label; $("#kPrompt").value = q.prompt; drawDraft(); $("#kLabel").focus();
  });
  $$("[data-d]", $("#kMine")).forEach(b => b.onclick = () => { store.mine = store.mine.filter(m => m.id !== b.dataset.d); ["h2hQs", "turnQs"].forEach(k => store[k] = store[k].filter(x => x !== b.dataset.d)); save(); afterQsChange(); });
}
function drawJson() {
  const q = draftQ(); const qq = typeof q === "string" ? { id: "draft", type: draft.kind, prompt: $("#kPrompt").value || "…", options: draft.opts, levels: draft.lvs } : q;
  const fake = "/9j/4AAQSkZJRgABAQ…";
  let body;
  if (jsonView === "sage") body = { requests: [{ content: { kind: "image", media: "data:image/jpeg;base64," + fake, text: BARE }, questions: [sageQ(qq)] }] };
  else body = { model: conn().model, state: BARE + "\nMenu scan: <menu>", questions: { [qq.id]: jevQ(qq) }, assets: { "<menu>": { format: "jpg", data_base64: fake } } };
  $("#kJson").textContent = (jsonView === "sage" ? "POST https://sage.levanto.ai/decide/batch  (through the Menu Lab proxy)\n" : "POST https://api.typesafe.ai/v1/systemone  (through the Jev proxy)\n") + JSON.stringify(body, null, 2);
}
function afterQsChange() { drawMine(); initH2H.redraw?.(); initTurn.redraw?.(); drawTurnForm(); initLens.redraw?.(); }

/* ---------- connections ---------- */
async function checkConn() {
  const c = conn();
  const ps = $("#pillSage"), pj = $("#pillJev");
  try { const r = await fetch(c.sage, { cache: "no-store" }); const j = await r.json(); ps.className = "pill " + (j.sage_key ? "ok" : "bad"); ps.title = j.sage_key ? "Menu Lab proxy connected" : "Proxy is up but has no Sage key"; }
  catch { ps.className = "pill bad"; ps.title = "Menu Lab proxy not reachable: " + c.sage; }
  try { const r = await fetch(c.jev, { cache: "no-store" }); const j = await r.json(); pj.className = "pill " + (j.ok ? "ok" : "bad"); pj.title = "Jev proxy connected"; }
  catch { pj.className = "pill bad"; pj.title = "Jev proxy not reachable: " + c.jev; }
}
function initConn() {
  const dlg = $("#connDlg");
  const open = () => { const c = conn(); $("#cSage").value = c.sage; $("#cJev").value = c.jev; $("#cModel").value = c.model; $("#cStatus").textContent = ""; dlg.showModal(); };
  $("#pillSage").onclick = open; $("#pillJev").onclick = open;
  $("#cReset").onclick = () => { $("#cSage").value = DEFAULTS.sage; $("#cJev").value = DEFAULTS.jev; $("#cModel").value = DEFAULTS.model; };
  $("#cSave").onclick = () => {
    store.conn = { sage: $("#cSage").value.trim() || undefined, jev: $("#cJev").value.trim() || undefined, model: /^jev-[a-z0-9.-]+$/.test($("#cModel").value.trim()) ? $("#cModel").value.trim() : undefined };
    save(); dlg.close(); b64Cache.clear(); checkConn();
  };
  $("#cTest").onclick = async () => {
    $("#cStatus").textContent = "Testing…";
    const out = [];
    try { const j = await (await fetch($("#cSage").value, { cache: "no-store" })).json(); out.push(`Menu Lab proxy: ${j.sage_key ? "ok, Sage key present" : "up, but no Sage key"}`); } catch { out.push("Menu Lab proxy: not reachable"); }
    try { const j = await (await fetch($("#cJev").value, { cache: "no-store" })).json(); out.push(`Jev proxy: ${j.ok ? "ok" : "unexpected reply"}`); } catch { out.push("Jev proxy: not reachable"); }
    $("#cStatus").textContent = out.join(" · ");
  };
  checkConn();
}

/* ---------- rooms ---------- */
function goto(stage) {
  $$("nav.courses button").forEach(b => b.setAttribute("aria-selected", b.dataset.stage === stage));
  $$("section.stage").forEach(s => s.classList.toggle("on", s.id === "stage-" + stage));
  history.replaceState(null, "", "#" + stage);
}
$$("nav.courses button").forEach(b => b.onclick = () => goto(b.dataset.stage));
$("nav.courses").addEventListener("keydown", e => {
  const tabs = $$("nav.courses button"), i = tabs.indexOf(document.activeElement);
  if (i < 0 || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); goto(n.dataset.stage);
});

(async function boot() {
  initConn();
  await loadMenus();
  initH2H(); initTurn(); initLens(); initKitchen();
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if ($("#stage-lens").classList.contains("on")) drawLens(); }, 200); });
  const h = location.hash.slice(1);
  if (["h2h", "turn", "lens", "kitchen", "about"].includes(h)) goto(h);
})();
