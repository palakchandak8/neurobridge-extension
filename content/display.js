// NeuroBridge display engine: applies the reading settings (font, spacing, colours) to the page.
(() => {
  if (window.__nbDisplayLoaded) return;
  window.__nbDisplayLoaded = true;
  const DEFAULTS = globalThis.NB.DISPLAY_DEFAULTS;

  const FONTS = {
    opendyslexic: '"NB OpenDyslexic", sans-serif',
    atkinson: '"NB Atkinson", sans-serif',
    arial: "Arial, Helvetica, sans-serif",
    verdana: "Verdana, Geneva, sans-serif",
    tahoma: "Tahoma, Geneva, sans-serif"
  };
  const BACKGROUNDS = {
    white: { bg: "#ffffff", fg: "#111111" },
    cream: { bg: "#faf3dd", fg: "#222222" },
    blue:  { bg: "#e3f0fb", fg: "#1a1a1a" },
    dark:  { bg: "#16181d", fg: "#e8e8e8" }
  };

  const TEXT_SEL = "p,li,td,th,dd,dt,blockquote,figcaption,label,h1,h2,h3,h4,h5,h6,span,a,div";
  const ICON_EXCLUDE = ':not([class*="icon" i]):not([class*="fa-"]):not(.material-icons):not(svg):not(svg *)';
  const originals = new WeakMap();
  let styleEl = null;
  let sizedEls = [];

  const fontUrl = (f) => chrome.runtime.getURL("fonts/" + f);

  function fontFaces() {
    return `
@font-face{font-family:"NB OpenDyslexic";font-weight:400;src:url("${fontUrl("opendyslexic-latin-400-normal.woff2")}") format("woff2");}
@font-face{font-family:"NB OpenDyslexic";font-weight:700;src:url("${fontUrl("opendyslexic-latin-700-normal.woff2")}") format("woff2");}
@font-face{font-family:"NB Atkinson";font-weight:400;src:url("${fontUrl("atkinson-hyperlegible-latin-400-normal.woff2")}") format("woff2");}
@font-face{font-family:"NB Atkinson";font-weight:700;src:url("${fontUrl("atkinson-hyperlegible-latin-700-normal.woff2")}") format("woff2");}`;
  }

  function buildCss(s) {
    const sel = `body :is(${TEXT_SEL})${ICON_EXCLUDE}`;
    let css = fontFaces();
    const rules = [];
    if (s.font !== "default") rules.push(`font-family:${FONTS[s.font]} !important`);
    rules.push(`letter-spacing:${s.letterSpacing}px !important`);
    rules.push(`word-spacing:${s.wordSpacing}px !important`);
    rules.push(`line-height:${s.lineHeight} !important`);
    rules.push(`font-weight:${s.fontWeight} !important`);
    css += `\n${sel}{${rules.join(";")}}`;
    if (s.paragraphSpacing > 0) {
      css += `\nbody :is(p,li,blockquote){margin-bottom:${s.paragraphSpacing}px !important}`;
    }
    const bg = BACKGROUNDS[s.background];
    if (bg) {
      css += `\nhtml,body,body :is(main,article,section,div,header,footer,aside,nav){background-color:${bg.bg} !important}`;
      css += `\nbody :is(${TEXT_SEL}):not(a)${ICON_EXCLUDE}{color:${bg.fg} !important}`;
    } else if (s.textColor !== "auto") {
      const c = s.textColor === "black" ? "#111111" : "#333333";
      css += `\nbody :is(${TEXT_SEL}):not(a)${ICON_EXCLUDE}{color:${c} !important}`;
    }
    return css;
  }

  // Font size: scale each text element's own computed size (avoids compounding on nested elements).
  function hasOwnText(el) {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return false;
  }
  function clearSize() {
    for (const el of sizedEls) {
      if (originals.has(el)) {
        const o = originals.get(el);
        if (o.inline) el.style.setProperty("font-size", o.inline, o.priority);
        else el.style.removeProperty("font-size");
        originals.delete(el);
      }
    }
    sizedEls = [];
  }
  function applySize(pct) {
    clearSize();
    if (pct === 100) return;
    const els = [...document.body.querySelectorAll(TEXT_SEL)].filter(hasOwnText);
    // read first, write after, so nested elements don't compound
    const reads = els.map((el) => ({
      el,
      size: parseFloat(getComputedStyle(el).fontSize),
      inline: el.style.getPropertyValue("font-size"),
      priority: el.style.getPropertyPriority("font-size")
    }));
    for (const r of reads) {
      originals.set(r.el, { inline: r.inline, priority: r.priority });
      r.el.style.setProperty("font-size", (r.size * pct) / 100 + "px", "important");
      sizedEls.push(r.el);
    }
  }

  function remove() {
    if (styleEl) { styleEl.remove(); styleEl = null; }
    clearSize();
  }

  function apply(settings) {
    const s = { ...DEFAULTS, ...settings };
    remove();
    if (!s.enabled) return;
    styleEl = document.createElement("style");
    styleEl.id = "neurobridge-style";
    styleEl.textContent = buildCss(s);
    document.documentElement.appendChild(styleEl);
    applySize(s.fontSize);
  }

  const load = () => chrome.storage.sync.get(DEFAULTS, apply);
  load();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (Object.keys(changes).some((k) => k in DEFAULTS)) load();
  });
})();
