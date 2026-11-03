// NeuroBridge Reader: reads the page (or the selected text) aloud with Sarvam voices,
// highlights the sentence being spoken, and shows a small floating player.
(() => {
  "use strict";
  if (window.__nbReaderLoaded) return;
  window.__nbReaderLoaded = true;

  const VD = globalThis.NB.VOICE_DEFAULTS;
  const S = { ...VD };

  // ---------------------------------------------------------------- language detection
  const SCRIPTS = [
    [/[ऀ-ॿ]/g, "hi-IN"], [/[ঀ-৿]/g, "bn-IN"], [/[਀-੿]/g, "pa-IN"],
    [/[઀-૿]/g, "gu-IN"], [/[଀-୿]/g, "od-IN"], [/[஀-௿]/g, "ta-IN"],
    [/[ఀ-౿]/g, "te-IN"], [/[ಀ-೿]/g, "kn-IN"], [/[ഀ-ൿ]/g, "ml-IN"]
  ];
  function detectLang(text) {
    if (S.ttsLang !== "auto") return S.ttsLang;
    const letters = (text.match(/\p{L}/gu) || []).length || 1;
    let best = "en-IN", top = 0;
    for (const [re, code] of SCRIPTS) {
      const n = (text.match(re) || []).length;
      if (n > top) { top = n; best = code; }
    }
    return top / letters > 0.3 ? best : "en-IN";
  }

  // ---------------------------------------------------------------- reading the page
  const SKIP_SEL = 'script,style,noscript,template,svg,canvas,video,audio,iframe,object,select,option,textarea,input,button,nav,aside,footer,[role="navigation"],[role="complementary"],[role="contentinfo"],[role="button"],[role="menu"],[aria-hidden="true"],[hidden],.sr-only,.visually-hidden,#nb-reader-host';
  const INLINE_DISPLAY = new Set(["inline", "contents", "inline-block", "inline-flex", "inline-grid", "ruby", "ruby-text", "ruby-base"]);

  function pickRoot() {
    const main = document.querySelector('main,[role="main"]');
    if (main && main.innerText.length > 300) return main;
    const arts = document.querySelectorAll("article");
    if (arts.length === 1 && arts[0].innerText.length > 300) return arts[0];
    return document.body;
  }

  // Group the page's text nodes by their nearest block-level container: one group is one paragraph/heading/item.
  function collectGroups() {
    const root = pickRoot();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const dispCache = new Map(), skipCache = new Map(), visCache = new Map();
    const containerOf = (node) => {
      let el = node.parentElement;
      while (el && el !== document.documentElement) {
        let d = dispCache.get(el);
        if (d === undefined) { d = getComputedStyle(el).display; dispCache.set(el, d); }
        if (!INLINE_DISPLAY.has(d)) return el;
        el = el.parentElement;
      }
      return document.body;
    };
    const visible = (el) => {
      let v = visCache.get(el);
      if (v === undefined) {
        v = (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true })) && el.getClientRects().length > 0;
        if (v) { const r = el.getBoundingClientRect(); v = r.width >= 1 && r.height >= 1 && r.right > 0; }
        visCache.set(el, v);
      }
      return v;
    };

    const groups = [];
    let cur = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p) continue;
      let sk = skipCache.get(p);
      if (sk === undefined) { sk = !!p.closest(SKIP_SEL); skipCache.set(p, sk); }
      if (sk) continue;
      const c = containerOf(n);
      if (!visible(c)) continue;
      const v = n.nodeValue;
      if (!v.trim()) {
        if (cur && cur.el === c) { cur.nodes.push({ node: n, start: cur.text.length }); cur.text += v; }
        continue;
      }
      if (!cur || cur.el !== c) { cur = { el: c, nodes: [], text: "", link: 0 }; groups.push(cur); }
      cur.nodes.push({ node: n, start: cur.text.length });
      cur.text += v;
      if (p.closest("a")) cur.link += v.trim().length;
    }
    return groups.filter((g) => {
      const t = g.text.replace(/\s+/g, " ").trim();
      if (!/[\p{L}\p{N}]/u.test(t)) return false;
      return !(g.link / t.length > 0.9 && t.length < 25); // short link-only bits are menus
    });
  }

  // Split text into sentence-sized pieces, merging tiny ones and splitting huge ones.
  const MAXC = 380, MINC = 70;
  function splitIntoChunks(raw) {
    const re = /[\s\S]*?[.!?।॥…]+["'”’)\]]*(?=\s|$)|[\s\S]+$/g;
    const pieces = [];
    const pushLong = (s, e) => {
      while (e - s > MAXC) {
        const seg = raw.slice(s, s + MAXC);
        let k = Math.max(seg.lastIndexOf(", "), seg.lastIndexOf("; "), seg.lastIndexOf(": "));
        if (k < MAXC * 0.4) k = seg.lastIndexOf(" ");
        if (k <= 0) k = MAXC - 1;
        pieces.push({ s, e: s + k + 1 });
        s += k + 1;
        while (s < e && /\s/.test(raw[s])) s++;
      }
      pieces.push({ s, e });
    };
    let m;
    while ((m = re.exec(raw))) {
      if (!m[0]) { re.lastIndex++; continue; }
      const lead = m[0].length - m[0].trimStart().length;
      const body = m[0].trim();
      if (body) pushLong(m.index + lead, m.index + lead + body.length);
    }
    const merged = [];
    let acc = null;
    for (const p of pieces) {
      if (acc && acc.e - acc.s < MINC && p.e - acc.s <= MAXC) acc.e = p.e;
      else { if (acc) merged.push(acc); acc = { ...p }; }
    }
    if (acc) merged.push(acc);
    return merged
      .map((c) => ({ s: c.s, e: c.e, text: raw.slice(c.s, c.e).replace(/\s+/g, " ").trim() }))
      .filter((c) => /[\p{L}\p{N}]/u.test(c.text));
  }

  function chunksFromGroups(groups) {
    const out = [];
    groups.forEach((g, gi) => splitIntoChunks(g.text).forEach((c) => out.push({ ...c, group: g, gi })));
    return out;
  }

  function rangeFor(g, s, e) {
    const r = document.createRange();
    let started = false;
    for (const nd of g.nodes) {
      const a = nd.start, b = a + nd.node.nodeValue.length;
      if (!started && s < b) { r.setStart(nd.node, Math.max(0, s - a)); started = true; }
      if (started && e <= b) { r.setEnd(nd.node, Math.max(0, e - a)); return r; }
    }
    const last = g.nodes[g.nodes.length - 1];
    if (!started) r.setStart(last.node, 0);
    r.setEnd(last.node, last.node.nodeValue.length);
    return r;
  }

  // First sentence near the top of the visible part of the page (or the very first if the page is at the top).
  function startNearViewport(chunks) {
    if (window.scrollY < 40) return 0;
    const i = chunks.findIndex((c) => c.group.el.getBoundingClientRect().bottom > 80);
    return i < 0 ? 0 : i;
  }

  // Sentence containing the selection start, for "read from here".
  function startAtSelection(chunks) {
    const sel = getSelection();
    if (!sel || !sel.anchorNode) return -1;
    const anchor = sel.anchorNode;
    for (let i = 0; i < chunks.length; i++) {
      const g = chunks[i].group;
      const nd = g.nodes.find((x) => x.node === anchor);
      if (nd) {
        const off = nd.start + (sel.anchorOffset || 0);
        const j = chunks.findIndex((c) => c.group === g && c.e > off);
        return j < 0 ? i : j;
      }
    }
    const el = anchor.nodeType === 1 ? anchor : anchor.parentElement;
    const j = chunks.findIndex((c) => c.group.el.contains(el) || (el.compareDocumentPosition(c.group.el) & Node.DOCUMENT_POSITION_FOLLOWING));
    return j;
  }

  // ---------------------------------------------------------------- highlight
  const hasHL = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined";
  function highlight(chunk) {
    if (!chunk.group) return;
    try {
      const range = rangeFor(chunk.group, chunk.s, chunk.e);
      if (hasHL) CSS.highlights.set("nb-reading", new Highlight(range));
      const r = range.getBoundingClientRect();
      if (r.top < 90 || r.bottom > innerHeight - 140) {
        const el = chunk.group.el;
        el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    } catch (_) { /* page changed under us: keep reading anyway */ }
  }
  function clearHighlight() { if (hasHL) CSS.highlights.delete("nb-reading"); }

  // ---------------------------------------------------------------- playback engine
  const R = { phase: "idle", paused: false, chunks: [], i: 0, token: 0, ctx: null, src: null, resolveCur: null, native: false, cache: new Map(), mode: "page", note: "" };

  function request(text, lang) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: "NB_TTS", text, lang, speaker: S.ttsSpeaker, pace: S.ttsPace }, (r) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message));
          if (!r || !r.ok) return reject(new Error((r && r.error) || "No response from the extension"));
          resolve(r.audio);
        });
      } catch (e) { reject(e); }
    });
  }
  async function decode(b64) {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
    return R.ctx.decodeAudioData(u.buffer);
  }
  function getBuffer(chunk) {
    const lang = detectLang(chunk.text);
    const key = [chunk.text, lang, S.ttsSpeaker, S.ttsPace].join("|");
    let p = R.cache.get(key);
    if (!p) {
      p = request(chunk.text, lang).then(decode);
      R.cache.set(key, p);
      p.catch(() => R.cache.delete(key));
      if (R.cache.size > 10) R.cache.delete(R.cache.keys().next().value);
    }
    return p;
  }
  function prefetch(from) {
    for (let k = from; k < Math.min(from + 2, R.chunks.length); k++) getBuffer(R.chunks[k]).catch(() => {});
  }

  function pickVoice(lang) {
    const vs = speechSynthesis.getVoices();
    return vs.find((v) => v.lang === lang) || vs.find((v) => v.lang.startsWith(lang.slice(0, 2))) || null;
  }
  function speakNative(text, lang) {
    return new Promise((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = S.ttsPace;
      const v = pickVoice(lang);
      if (v) u.voice = v;
      u.onend = resolve;
      u.onerror = (e) => (e.error === "canceled" || e.error === "interrupted" ? resolve() : reject(new Error(e.error)));
      R.resolveCur = resolve;
      speechSynthesis.speak(u);
    });
  }

  function stopSource() {
    try { if (R.src) { R.src.onended = null; R.src.stop(); } } catch (_) {}
    R.src = null;
    try { speechSynthesis.cancel(); } catch (_) {}
    if (R.resolveCur) { const f = R.resolveCur; R.resolveCur = null; f(); }
  }

  async function speakChunk(chunk, tok) {
    const lang = detectLang(chunk.text);
    if (R.native) { R.phase = "playing"; ui(); return speakNative(chunk.text, lang); }
    R.phase = "loading"; ui();
    const buf = await getBuffer(chunk);
    if (tok !== R.token) return;
    prefetch(R.i + 1);
    R.phase = "playing"; ui();
    await new Promise((resolve) => {
      const s = R.ctx.createBufferSource();
      s.buffer = buf;
      s.connect(R.ctx.destination);
      s.onended = resolve;
      R.src = s;
      R.resolveCur = resolve;
      s.start();
    });
  }

  async function loop(tok) {
    while (tok === R.token && R.i < R.chunks.length) {
      const chunk = R.chunks[R.i];
      highlight(chunk);
      ui();
      try {
        await speakChunk(chunk, tok);
      } catch (e) {
        if (tok !== R.token) return;
        if (!R.native) {
          R.native = true;
          say(e.message === "NO_KEY" ? "No Sarvam key yet, using your device voice. Add a key in the NeuroBridge popup for natural voices." : "Sarvam voice failed (" + e.message + "). Using your device voice.");
          continue; // retry the same sentence with the device voice
        }
        say("Your device voice could not read this (" + e.message + "). Add a Sarvam key in the NeuroBridge popup for natural voices.");
        break;
      }
      if (tok !== R.token) return;
      R.i++;
    }
    if (tok === R.token) finish();
  }

  async function begin(chunks, from, mode) {
    if (!chunks.length) { say("There is nothing to read here. Try selecting some text."); return; }
    hardStop();
    R.chunks = chunks; R.i = Math.max(0, from); R.mode = mode; R.paused = false; R.note = "";
    const tok = ++R.token;
    R.phase = "loading";
    openPanel(true); ui();
    const st = await new Promise((res) => { try { chrome.runtime.sendMessage({ type: "NB_TTS_STATUS" }, (r) => res(chrome.runtime.lastError ? null : r)); } catch (_) { res(null); } });
    if (tok !== R.token) return;
    R.native = !(st && st.hasKey);
    if (R.native) say("No Sarvam key yet, using your device voice. Add a key in the NeuroBridge popup for natural voices.");
    if (!R.native) {
      R.ctx = R.ctx || new (window.AudioContext || window.webkitAudioContext)();
      try { await R.ctx.resume(); } catch (_) {}
      if (R.ctx.state === "suspended") { R.paused = true; say("Press play to start the audio."); }
    }
    loop(tok);
  }

  function hardStop() {
    R.token++;
    stopSource();
    try { if (R.ctx && R.ctx.state === "suspended") R.ctx.resume(); } catch (_) {}
    try { speechSynthesis.resume(); } catch (_) {}
  }
  function stop() { hardStop(); R.phase = "idle"; R.paused = false; R.chunks = []; R.i = 0; clearHighlight(); ui(); }
  function finish() { R.phase = "idle"; R.paused = false; clearHighlight(); R.note = "Finished reading."; ui(); }

  function jump(delta) {
    if (!R.chunks.length) return;
    const idx = Math.min(R.chunks.length - 1, Math.max(0, R.i + delta));
    const wasPaused = R.paused;
    const tok = ++R.token;
    stopSource();
    R.i = idx;
    if (R.ctx && R.ctx.state === "suspended" && !wasPaused) R.ctx.resume();
    loop(tok);
  }

  function togglePause() {
    if (R.phase === "idle") return;
    if (R.paused) {
      R.paused = false;
      if (R.native) speechSynthesis.resume(); else if (R.ctx) R.ctx.resume();
    } else {
      R.paused = true;
      if (R.native) speechSynthesis.pause(); else if (R.ctx) R.ctx.suspend();
    }
    ui();
  }

  // ---------------------------------------------------------------- entry points
  function readPage(fromSelection) {
    const chunks = chunksFromGroups(collectGroups());
    let from = startNearViewport(chunks);
    if (fromSelection) { const j = startAtSelection(chunks); if (j >= 0) from = j; }
    begin(chunks, from, "page");
  }
  function readSelection() {
    const text = (getSelection() ? getSelection().toString() : "").trim();
    if (text.length < 2) { say("Select some text first, then press Listen."); openPanel(true); return; }
    begin(splitIntoChunks(text).map((c) => ({ s: c.s, e: c.e, text: c.text })), 0, "selection");
  }
  const hasSelection = () => (getSelection() ? getSelection().toString().trim().length >= 2 : false);

  chrome.runtime.onMessage.addListener((msg, _s, send) => {
    if (!msg || typeof msg.type !== "string") return;
    switch (msg.type) {
      case "NB_READ_PAGE": readPage(false); send({ ok: true }); break;
      case "NB_READ_SELECTION": readSelection(); send({ ok: true }); break;
      case "NB_TOGGLE":
        if (R.phase !== "idle") togglePause(); else if (hasSelection()) readSelection(); else readPage(false);
        send({ ok: true }); break;
      case "NB_STOP": stop(); send({ ok: true }); break;
      case "NB_STATUS": send({ phase: R.phase, paused: R.paused, hasSelection: hasSelection() }); break;
    }
  });

  // ---------------------------------------------------------------- UI (shadow DOM so page CSS can't touch it)
  const ICON = {
    logo: '<circle cx="6" cy="12" r="3.2"/><circle cx="18" cy="12" r="3.2"/><rect x="8" y="10.8" width="8" height="2.4" rx="1.2"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
    next: '<path d="M6 6l8 6-8 6zM16 6h2v12h-2z"/>',
    prev: '<path d="M18 6l-8 6 8 6zM6 6h2v12H6z"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
    listen: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.2 8.6a5 5 0 010 6.8M17.6 6.2a8.6 8.6 0 010 11.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    close: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    here: '<path d="M5 5.5v13l8-6.5zM15 6h4M15 12h4M15 18h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  const svg = (n, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${ICON[n]}</svg>`;

  const CSS_TEXT = `
:host{all:initial}
*{box-sizing:border-box}
.ui{font:15px/1.45 "NB UI","Atkinson Hyperlegible","Segoe UI",system-ui,sans-serif;color:#1c2150}
button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0}
button:focus-visible{outline:3px solid #8089ee;outline-offset:2px}
svg{display:block;width:100%;height:100%}

.fab{position:fixed;right:22px;bottom:22px;width:56px;height:56px;border-radius:50%;color:#fff;
  background:linear-gradient(140deg,#2f3fa6,#6670f0);box-shadow:0 10px 28px rgba(47,63,166,.38),0 2px 6px rgba(28,33,80,.2);
  display:grid;place-items:center;transition:transform .16s ease}
.fab:hover{transform:translateY(-2px)}
.fab .ic{width:26px;height:26px}
.fab[hidden]{display:none}
.eq{display:none;gap:3px;align-items:flex-end;height:22px}
.eq i{display:block;width:4px;border-radius:2px;background:#fff;height:8px;animation:eq 0.9s ease-in-out infinite}
.eq i:nth-child(2){animation-delay:.15s}.eq i:nth-child(3){animation-delay:.3s}.eq i:nth-child(4){animation-delay:.45s}
@keyframes eq{0%,100%{height:6px}50%{height:22px}}
.fab.live .ic{display:none}.fab.live .eq{display:flex}
.fab.live.hold .eq i{animation-play-state:paused}

.panel{position:fixed;right:22px;bottom:90px;width:330px;max-width:calc(100vw - 32px);background:#fff;border:1px solid #e1e3f5;border-radius:22px;
  box-shadow:0 24px 60px rgba(28,33,80,.28),0 4px 12px rgba(28,33,80,.1);overflow:hidden;transform-origin:bottom right;
  transition:transform .18s ease,opacity .18s ease}
.panel[hidden]{display:block;opacity:0;transform:scale(.92) translateY(8px);pointer-events:none;visibility:hidden}
.head{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;border-bottom:1px solid #eceefb}
.mark{width:28px;height:28px;border-radius:9px;background:linear-gradient(140deg,#2f3fa6,#6670f0);color:#fff;display:grid;place-items:center;padding:3px}
.head b{flex:1;font-size:15px}
.x{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;padding:7px;color:#5d6390}
.x:hover{background:#f1f2fd}

.body{padding:14px 16px 16px;display:grid;gap:12px}
.now{margin:0;padding:12px 14px;border-radius:14px;background:#f4f5fd;font-size:16px;line-height:1.6;max-height:9.6em;overflow:auto}
.meta{display:flex;justify-content:space-between;font-size:13px;color:#5d6390}
.bar{height:5px;border-radius:3px;background:#e7e9fa;overflow:hidden}
.bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#3a49c9,#8089ee);border-radius:3px;transition:width .25s ease}
.ctrls{display:flex;align-items:center;justify-content:center;gap:10px}
.ib{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;padding:10px;color:#2f3fa6;background:#f1f2fd}
.ib:hover{background:#e6e8fb}
.go{width:60px;height:60px;border-radius:50%;padding:16px;color:#fff;background:linear-gradient(140deg,#2f3fa6,#5560e8);box-shadow:0 8px 20px rgba(47,63,166,.32)}
.go:hover{background:linear-gradient(140deg,#27368f,#4953d6)}
.spin .go svg{opacity:.35}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 16px;border-radius:14px;font-weight:700;background:#2f3fa6;color:#fff}
.btn:hover{background:#27368f}
.btn.alt{background:#f1f2fd;color:#2f3fa6}
.btn.alt:hover{background:#e6e8fb}
.btn[disabled]{opacity:.5;cursor:default}
.btn .ic{width:20px;height:20px}
.speeds{display:flex;gap:6px;align-items:center}
.speeds span{font-size:13px;color:#5d6390;margin-right:2px}
.chip{flex:1;padding:7px 0;border-radius:10px;font-size:14px;font-weight:700;color:#5d6390;background:#f4f5fd}
.chip[aria-pressed="true"]{background:#2f3fa6;color:#fff}
.status{margin:0;font-size:13px;color:#5d6390}
.status:empty{display:none}
.status.warn{color:#8a4b00}
.idle-only,.live-only{display:none}
.panel.idle .idle-only{display:grid;gap:10px}
.panel.live .live-only{display:grid;gap:12px}

.pop{position:fixed;display:flex;gap:2px;padding:4px;border-radius:999px;background:#1c2150;color:#fff;box-shadow:0 10px 26px rgba(28,33,80,.4);z-index:1}
.pop[hidden]{display:none}
.pop button{display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;font-weight:700;font-size:14px;white-space:nowrap}
.pop button:hover{background:rgba(255,255,255,.14)}
.pop .ic{width:18px;height:18px}
@media (prefers-reduced-motion:reduce){*{transition:none !important;animation:none !important}}
`;

  const host = document.createElement("div");
  host.id = "nb-reader-host";
  host.style.cssText = "all:initial;position:fixed;right:0;bottom:0;width:0;height:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
<style>${CSS_TEXT}</style>
<div class="ui">
  <div class="pop" id="pop" hidden>
    <button type="button" id="pop-sel" aria-label="Listen to the selected text">${svg("listen", "ic")}Listen</button>
    <button type="button" id="pop-here" aria-label="Read the page from here">${svg("here", "ic")}From here</button>
  </div>
  <section class="panel idle" id="panel" role="region" aria-label="NeuroBridge reader" hidden>
    <div class="head">
      <span class="mark"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICON.logo}</svg></span>
      <b>NeuroBridge Reader</b>
      <button type="button" class="x" id="close" aria-label="Close reader">${svg("close")}</button>
    </div>
    <div class="body">
      <div class="idle-only">
        <button type="button" class="btn" id="read-page">${svg("listen", "ic")}Read this page</button>
        <button type="button" class="btn alt" id="read-sel">${svg("listen", "ic")}Read selected text</button>
      </div>
      <div class="live-only">
        <p class="now" id="now" aria-live="off"></p>
        <div><div class="bar"><i id="bar"></i></div></div>
        <div class="meta"><span id="count"></span><span id="engine"></span></div>
        <div class="ctrls" id="ctrls">
          <button type="button" class="ib" id="prev" aria-label="Previous sentence">${svg("prev")}</button>
          <button type="button" class="ib go" id="pp" aria-label="Pause">${svg("pause")}</button>
          <button type="button" class="ib" id="next" aria-label="Next sentence">${svg("next")}</button>
          <button type="button" class="ib" id="stop" aria-label="Stop reading">${svg("stop")}</button>
        </div>
      </div>
      <div class="speeds" id="speeds" role="group" aria-label="Reading speed"><span>Speed</span>
        <button type="button" class="chip" data-v="0.75">0.75×</button>
        <button type="button" class="chip" data-v="1">1×</button>
        <button type="button" class="chip" data-v="1.25">1.25×</button>
        <button type="button" class="chip" data-v="1.5">1.5×</button>
      </div>
      <p class="status" id="status" role="status"></p>
    </div>
  </section>
  <button type="button" class="fab" id="fab" aria-label="Open NeuroBridge reader">
    ${svg("listen", "ic")}<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
  </button>
</div>`;
  const $ = (id) => root.getElementById(id);

  // Page-level styles: the sentence highlight and the UI font (both must live outside the shadow root).
  const pageStyle = document.createElement("style");
  pageStyle.id = "nb-reader-style";
  pageStyle.textContent = `
::highlight(nb-reading){background-color:rgba(128,137,238,.38)}
@font-face{font-family:"NB UI";font-weight:400;src:url("${chrome.runtime.getURL("fonts/atkinson-hyperlegible-latin-400-normal.woff2")}") format("woff2")}
@font-face{font-family:"NB UI";font-weight:700;src:url("${chrome.runtime.getURL("fonts/atkinson-hyperlegible-latin-700-normal.woff2")}") format("woff2")}`;
  document.documentElement.appendChild(pageStyle);
  document.documentElement.appendChild(host);

  let panelOpen = false;
  function openPanel(open) { panelOpen = open; $("panel").hidden = !open; ui(); }
  let note = "";
  function say(msg, warn = false) { note = msg; $("status").textContent = msg; $("status").classList.toggle("warn", warn); if (msg) openPanel(true); }

  function ui() {
    const live = R.phase !== "idle";
    const panel = $("panel");
    panel.classList.toggle("live", live);
    panel.classList.toggle("idle", !live);
    $("fab").hidden = !(S.dock || live || panelOpen);
    $("fab").classList.toggle("live", live);
    $("fab").classList.toggle("hold", R.paused);
    if (live) {
      const c = R.chunks[R.i];
      $("now").textContent = c ? c.text : "";
      const total = R.chunks.length;
      $("count").textContent = (R.mode === "selection" ? "Selection" : "Sentence") + " " + (R.i + 1) + " of " + total;
      $("bar").style.width = Math.round(((R.i + (R.phase === "playing" ? 0.5 : 0)) / Math.max(1, total)) * 100) + "%";
      $("engine").textContent = R.native ? "Device voice" : "Sarvam " + S.ttsSpeaker.charAt(0).toUpperCase() + S.ttsSpeaker.slice(1);
      $("pp").innerHTML = R.paused ? svg("play") : svg("pause");
      $("pp").setAttribute("aria-label", R.paused ? "Play" : "Pause");
      $("ctrls").classList.toggle("spin", R.phase === "loading" && !R.paused);
      if (!note) $("status").textContent = "";
    } else {
      $("read-sel").disabled = !hasSelection();
      if (R.note && !note) $("status").textContent = R.note;
    }
    root.querySelectorAll("#speeds .chip").forEach((b) => b.setAttribute("aria-pressed", String(Math.abs(Number(b.dataset.v) - S.ttsPace) < 0.01)));
  }

  $("fab").addEventListener("click", () => { note = ""; R.note = ""; $("status").textContent = ""; openPanel(!panelOpen); });
  $("close").addEventListener("click", () => openPanel(false));
  $("read-page").addEventListener("click", () => { note = ""; readPage(false); });
  $("read-sel").addEventListener("click", () => { note = ""; readSelection(); });
  $("pp").addEventListener("click", togglePause);
  $("next").addEventListener("click", () => jump(1));
  $("prev").addEventListener("click", () => jump(-1));
  $("stop").addEventListener("click", stop);
  $("speeds").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (b) chrome.storage.sync.set({ ttsPace: Number(b.dataset.v) });
  });

  // Selection bubble
  const pop = $("pop");
  function showPop() {
    const sel = getSelection();
    if (!sel || sel.rangeCount === 0 || !hasSelection()) return (pop.hidden = true);
    const rects = sel.getRangeAt(0).getClientRects();
    const r = rects.length ? rects[rects.length - 1] : sel.getRangeAt(0).getBoundingClientRect();
    if (!r || (!r.width && !r.height)) return (pop.hidden = true);
    pop.hidden = false;
    const w = pop.offsetWidth || 190;
    let left = Math.min(innerWidth - w - 10, Math.max(10, r.right - w / 2));
    let top = r.bottom + 10;
    if (top > innerHeight - 56) top = Math.max(10, r.top - 54);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }
  document.addEventListener("mouseup", (e) => { if (e.composedPath().includes(host)) return; setTimeout(showPop, 10); }, true);
  document.addEventListener("keyup", (e) => { if (e.shiftKey || e.key === "Shift") setTimeout(showPop, 10); }, true);
  document.addEventListener("selectionchange", () => {
    if (!hasSelection()) pop.hidden = true;
    if (panelOpen && R.phase === "idle") ui(); // keep "Read selected text" in step with the selection
  });
  document.addEventListener("scroll", () => { pop.hidden = true; }, { passive: true, capture: true });
  pop.addEventListener("mousedown", (e) => e.preventDefault()); // keep the text selected
  $("pop-sel").addEventListener("click", () => { pop.hidden = true; note = ""; readSelection(); });
  $("pop-here").addEventListener("click", () => { pop.hidden = true; note = ""; readPage(true); });

  // Settings
  chrome.storage.sync.get(VD, (v) => { Object.assign(S, v); ui(); });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "sync") return;
    for (const k of Object.keys(VD)) if (ch[k]) S[k] = ch[k].newValue;
    ui();
  });

  window.addEventListener("pagehide", () => { hardStop(); clearHighlight(); });
  ui();
})();
