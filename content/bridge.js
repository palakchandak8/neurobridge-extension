// Runs only on the NeuroBridge website. Lets the site push the user's profile into the extension.
// Site side:
//   window.postMessage({ type: "NEUROBRIDGE_PROFILE", assessmentDone: true,
//     settings: { font: "atkinson", fontSize: 120, letterSpacing: 1.5, wordSpacing: 4, lineHeight: 1.8 } }, window.location.origin);
(() => {
  const RULES = {
    enabled: (v) => typeof v === "boolean",
    font: (v) => ["default", "opendyslexic", "atkinson", "arial", "verdana", "tahoma"].includes(v),
    fontSize: (v) => Number.isFinite(v) && v >= 80 && v <= 200,
    letterSpacing: (v) => Number.isFinite(v) && v >= 0 && v <= 5,
    wordSpacing: (v) => Number.isFinite(v) && v >= 0 && v <= 10,
    lineHeight: (v) => Number.isFinite(v) && v >= 1 && v <= 2.5,
    paragraphSpacing: (v) => Number.isFinite(v) && v >= 0 && v <= 40,
    fontWeight: (v) => Number.isFinite(v) && v >= 400 && v <= 800,
    background: (v) => ["default", "white", "cream", "blue", "dark"].includes(v)
  };
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const d = e.data;
    if (!d || d.type !== "NEUROBRIDGE_PROFILE") return;
    const clean = {};
    for (const [k, v] of Object.entries(d.settings || {})) if (RULES[k] && RULES[k](v)) clean[k] = v;
    if (Object.keys(clean).length) chrome.storage.sync.set({ ...clean, enabled: true });
    if (typeof d.assessmentDone === "boolean") chrome.storage.local.set({ assessmentDone: d.assessmentDone });
  });
})();
