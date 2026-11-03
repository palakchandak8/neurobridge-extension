const C = globalThis.NB_CONFIG;
const NB = globalThis.NB;
const $ = (id) => document.getElementById(id);
const CONTENT_FILES = ["shared/defaults.js", "content/display.js", "content/reader.js"];

let S = { ...NB.DEFAULTS };                       // synced settings
let L = { assessmentDone: false, ctaDismissed: false, profile: null, edited: false, tab: "display", sarvamKey: "" };
let tuneOpen = false;                            // fine-tune panel open (only matters after the test)

const FONTS = [
  { v: "default", name: "Page", css: "inherit" },
  { v: "opendyslexic", name: "OpenDyslexic", css: "'NB OpenDyslexic', sans-serif" },
  { v: "atkinson", name: "Atkinson", css: "'Atkinson', sans-serif" },
  { v: "arial", name: "Arial", css: "Arial, sans-serif" },
  { v: "verdana", name: "Verdana", css: "Verdana, sans-serif" },
  { v: "tahoma", name: "Tahoma", css: "Tahoma, sans-serif" }
];
const SLIDERS = [
  { k: "fontSize", label: "Text size", min: 80, max: 200, step: 5, fmt: (v) => v + "%" },
  { k: "fontWeight", label: "Text weight", min: 400, max: 800, step: 100, fmt: (v) => v },
  { k: "letterSpacing", label: "Letter spacing", min: 0, max: 5, step: 0.1, fmt: (v) => v.toFixed(1) + "px" },
  { k: "wordSpacing", label: "Word spacing", min: 0, max: 10, step: 0.5, fmt: (v) => v.toFixed(1) + "px" },
  { k: "lineHeight", label: "Line spacing", min: 1, max: 2.5, step: 0.1, fmt: (v) => v.toFixed(1) },
  { k: "paragraphSpacing", label: "Paragraph gap", min: 0, max: 40, step: 2, fmt: (v) => v + "px" }
];
const SPEAKERS = ["shubh", "ritu", "priya", "kavya", "aditya", "rahul", "simran", "ishita", "amit", "roopa"];
const LANGS = [["auto", "Auto-detect"], ["en-IN", "English (India)"], ["hi-IN", "Hindi"], ["bn-IN", "Bengali"], ["ta-IN", "Tamil"], ["te-IN", "Telugu"], ["kn-IN", "Kannada"], ["ml-IN", "Malayalam"], ["mr-IN", "Marathi"], ["gu-IN", "Gujarati"], ["pa-IN", "Punjabi"], ["od-IN", "Odia"]];
const DISPLAY_KEYS = Object.keys(NB.DISPLAY_DEFAULTS).filter((k) => k !== "enabled" && k !== "textColor");

/* ------------------------------------------------------------------ build static controls */
$("font").innerHTML = FONTS.map((f) => `<button type="button" role="radio" data-v="${f.v}" style="font-family:${f.css}">${f.name}</button>`).join("");
$("sliders").innerHTML = SLIDERS.map((s) => `
  <div class="slider">
    <label class="label" for="${s.k}">${s.label} <output id="${s.k}-out"></output></label>
    <input type="range" id="${s.k}" min="${s.min}" max="${s.max}" step="${s.step}">
  </div>`).join("");
$("speaker").innerHTML = SPEAKERS.map((v) => `<option value="${v}">${v[0].toUpperCase() + v.slice(1)}</option>`).join("");
$("lang").innerHTML = LANGS.map(([v, n]) => `<option value="${v}">${n}</option>`).join("");

/* ------------------------------------------------------------------ state helpers */
function saveSync(patch) {
  S = { ...S, ...patch };
  chrome.storage.sync.set(patch);
}
function editDisplay(patch) {
  saveSync(patch);
  if (L.assessmentDone && !L.edited) { L.edited = true; chrome.storage.local.set({ edited: true }); renderHero(); }
  renderDisplay();
}
const hasKey = () => !!((L.sarvamKey || C.SARVAM_API_KEY || "").trim());

/* ------------------------------------------------------------------ hero */
function renderHero() {
  const el = $("hero");
  if (L.assessmentDone && L.profile) {
    const p = L.profile;
    const chips = p.reasons.slice(0, 5).map((r) => `<li>${esc(r.short || r.value)}</li>`).join("");
    const more = p.reasons.length > 5 ? `<li>+${p.reasons.length - 5}</li>` : "";
    el.innerHTML = `
      <div class="hero hero-profile">
        <div class="hp-head"><h2>Tuned to you <small>${esc(p.label)}</small></h2><a class="link" id="retake" href="#" target="_blank" rel="noopener">Retake</a></div>
        <ul class="chips">${chips}${more}</ul>
        ${L.edited ? `<div class="hp-actions"><span class="edited">Edited by you</span><button type="button" class="ghost" id="restore">Restore my profile</button></div>` : ""}
        <details class="why"><summary>Why these settings</summary>
          <ul>${p.reasons.map((r) => `<li><b>${esc(r.label)}.</b> ${esc(r.why)}</li>`).join("")}</ul>
        </details>
      </div>`;
    $("retake").href = C.SITE_URL + C.ASSESSMENT_PATH;
    const rs = $("restore");
    if (rs) rs.addEventListener("click", () => {
      saveSync({ ...p.settings, enabled: true });
      L.edited = false; chrome.storage.local.set({ edited: false });
      renderHero(); renderDisplay();
    });
  } else if (L.ctaDismissed) {
    el.innerHTML = `<div class="hero-slim"><span>Want settings picked for you?</span><a id="take-test" href="#" target="_blank" rel="noopener">Take the assessment</a></div>`;
    $("take-test").href = C.SITE_URL + C.ASSESSMENT_PATH;
  } else {
    el.innerHTML = `
      <div class="hero hero-invite">
        <h2>Let NeuroBridge set this up for you</h2>
        <p>A short assessment picks the font, spacing and colours that suit you.</p>
        <div class="row"><a class="btn" id="take-test" href="#" target="_blank" rel="noopener">Take the assessment</a><button type="button" class="link" id="dismiss">Not now</button></div>
      </div>`;
    $("take-test").href = C.SITE_URL + C.ASSESSMENT_PATH;
    $("dismiss").addEventListener("click", () => { L.ctaDismissed = true; chrome.storage.local.set({ ctaDismissed: true }); renderHero(); });
  }
}

/* ------------------------------------------------------------------ display tab */
const PREVIEW_BG = ["cream", "blue", "dark"];
function renderDisplay() {
  $("enabled").checked = S.enabled;
  $("controls").classList.toggle("dim", !S.enabled);

  // After the test the controls tuck away; before it they are always open.
  const locked = L.assessmentDone && !tuneOpen;
  $("fine-toggle-wrap").hidden = !L.assessmentDone;
  $("fine-toggle").textContent = tuneOpen ? "Hide manual controls" : "Fine-tune manually";
  $("fine-toggle").setAttribute("aria-expanded", String(tuneOpen));
  $("controls").hidden = locked;

  document.querySelectorAll("#font button").forEach((b) => {
    const f = FONTS.find((x) => x.v === b.dataset.v);
    b.setAttribute("aria-checked", String(b.dataset.v === S.font));
  });
  for (const s of SLIDERS) {
    const input = $(s.k), v = Number(S[s.k]);
    input.value = v;
    input.style.setProperty("--p", ((v - s.min) / (s.max - s.min)) * 100 + "%");
    $(s.k + "-out").textContent = s.fmt(v);
  }
  document.querySelectorAll("#background .sw").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === S.background)));

  // live preview sheet
  const p = $("preview");
  const f = FONTS.find((x) => x.v === S.font) || FONTS[0];
  p.dataset.bg = PREVIEW_BG.includes(S.background) ? S.background : "";
  p.style.fontFamily = f.css;
  p.style.fontSize = Math.min(Number(S.fontSize), 170) * 0.14 + "px";
  p.style.letterSpacing = S.letterSpacing + "px";
  p.style.wordSpacing = S.wordSpacing + "px";
  p.style.lineHeight = S.lineHeight;
  p.style.fontWeight = S.fontWeight;
  p.querySelector("p").style.marginTop = Math.min(S.paragraphSpacing, 16) + "px";
}

/* ------------------------------------------------------------------ listen tab */
function renderListen() {
  $("speaker").value = S.ttsSpeaker;
  $("lang").value = S.ttsLang;
  const pace = $("ttsPace");
  pace.value = S.ttsPace;
  pace.style.setProperty("--p", ((S.ttsPace - 0.5) / 1.5) * 100 + "%");
  $("ttsPace-out").textContent = Number(S.ttsPace).toFixed(2).replace(/0$/, "") + "×";
  $("dock").checked = S.dock;
  const st = $("engine-state");
  st.textContent = hasKey() ? "Sarvam voices" : "Device voice";
  st.classList.toggle("on", hasKey());
  if (document.activeElement !== $("key")) $("key").value = L.sarvamKey || "";
  $("speaker").disabled = !hasKey();
  $("speaker").title = hasKey() ? "" : "Add a Sarvam key to choose a voice";
}

/* ------------------------------------------------------------------ tabs */
function setTab(name, persist = true) {
  for (const t of ["display", "listen"]) {
    $("tab-" + t).setAttribute("aria-selected", String(t === name));
    $("panel-" + t).hidden = t !== name;
  }
  document.querySelector("main").scrollTop = 0;
  if (name === "listen") refreshTabStatus();
  if (persist) chrome.storage.local.set({ tab: name });
}
$("tab-display").addEventListener("click", () => setTab("display"));
$("tab-listen").addEventListener("click", () => setTab("listen"));

/* ------------------------------------------------------------------ talk to the page */
async function callTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null || !/^(https?|file):/.test(tab.url || "")) return { blocked: true };
  try { return await chrome.tabs.sendMessage(tab.id, msg); }
  catch (_) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_FILES });
      await new Promise((r) => setTimeout(r, 150));
      return await chrome.tabs.sendMessage(tab.id, msg);
    } catch (_) { return { blocked: true }; }
  }
}
async function refreshTabStatus() {
  const r = await callTab({ type: "NB_STATUS" });
  const msg = $("listen-msg");
  if (!r || r.blocked) {
    $("read-page").disabled = true; $("read-sel").disabled = true;
    msg.textContent = "Chrome doesn't let extensions read this kind of page. Open a normal website to listen.";
    return;
  }
  $("read-page").disabled = false;
  $("read-sel").disabled = !r.hasSelection;
  msg.textContent = r.hasSelection ? "" : "Tip: select text on the page first to enable Read selection.";
}
async function readNow(type) {
  const r = await callTab({ type });
  if (r && r.ok) window.close();
  else $("listen-msg").textContent = "Couldn't reach this page. Reload it and try again.";
}
$("read-page").addEventListener("click", () => readNow("NB_READ_PAGE"));
$("read-sel").addEventListener("click", () => readNow("NB_READ_SELECTION"));

/* ------------------------------------------------------------------ events */
$("enabled").addEventListener("change", (e) => { saveSync({ enabled: e.target.checked }); renderDisplay(); });
$("font").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) editDisplay({ font: b.dataset.v }); });
for (const s of SLIDERS) $(s.k).addEventListener("input", (e) => editDisplay({ [s.k]: Number(e.target.value) }));
$("background").addEventListener("click", (e) => { const b = e.target.closest(".sw"); if (b) editDisplay({ background: b.dataset.v }); });
$("fine-toggle").addEventListener("click", () => { tuneOpen = !tuneOpen; renderDisplay(); });
$("reset").addEventListener("click", () => {
  const patch = { ...NB.DISPLAY_DEFAULTS, enabled: S.enabled };
  if (L.assessmentDone && L.profile) { saveSync({ ...L.profile.settings, enabled: true }); L.edited = false; chrome.storage.local.set({ edited: false }); renderHero(); }
  else saveSync(patch);
  renderDisplay();
});
$("reset").title = "Back to your assessment profile (or the defaults if you haven't taken it)";

$("speaker").addEventListener("change", (e) => { saveSync({ ttsSpeaker: e.target.value }); renderListen(); });
$("lang").addEventListener("change", (e) => { saveSync({ ttsLang: e.target.value }); renderListen(); });
$("ttsPace").addEventListener("input", (e) => { saveSync({ ttsPace: Number(e.target.value) }); renderListen(); });
$("dock").addEventListener("change", (e) => saveSync({ dock: e.target.checked }));

$("key-save").addEventListener("click", () => {
  L.sarvamKey = $("key").value.trim();
  chrome.storage.local.set({ sarvamKey: L.sarvamKey }, () => { setKeyMsg(L.sarvamKey ? "Saved." : "Key removed. Using the device voice.", "ok"); renderListen(); });
});
$("key-test").addEventListener("click", async () => {
  if (!hasKey()) return setKeyMsg("Paste a key and save it first.", "err");
  setKeyMsg("Testing…", "");
  const r = await new Promise((res) => chrome.runtime.sendMessage({ type: "NB_TTS", text: "Hello from NeuroBridge.", lang: "en-IN", speaker: S.ttsSpeaker, pace: 1 }, (x) => res(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : x)));
  if (r && r.ok) {
    setKeyMsg("Works. Playing a sample.", "ok");
    try { const a = new Audio("data:audio/wav;base64," + r.audio); a.play(); } catch (_) {}
  } else setKeyMsg(r && r.error ? r.error : "Failed.", "err");
});
function setKeyMsg(t, cls) { const m = $("key-msg"); m.textContent = t; m.className = "hint " + cls; }

$("open-site").href = C.SITE_URL;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ------------------------------------------------------------------ boot */
chrome.storage.sync.get(NB.DEFAULTS, (s) => {
  S = s;
  chrome.storage.local.get(L, (l) => {
    L = { ...L, ...l };
    renderHero(); renderDisplay(); renderListen();
    setTab(L.tab === "listen" ? "listen" : "display", false);
  });
});
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "sync") { for (const [k, v] of Object.entries(ch)) S[k] = v.newValue; renderDisplay(); renderListen(); }
  if (area === "local") { for (const [k, v] of Object.entries(ch)) L[k] = v.newValue; renderHero(); renderDisplay(); renderListen(); }
});
