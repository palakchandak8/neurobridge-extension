// TODO: swap for the deployed URL once the site is live
const NEUROBRIDGE_URL = "http://localhost:5147";

const ASSESSMENT_PATH = "/assessment"; // change to your real route
const DEFAULTS = {
  enabled: false, font: "default", fontSize: 100, letterSpacing: 0, wordSpacing: 0,
  lineHeight: 1.5, paragraphSpacing: 0, fontWeight: 400, background: "default", textColor: "auto"
};
const SLIDERS = {
  fontSize: (v) => v + "%",
  letterSpacing: (v) => v + "px",
  wordSpacing: (v) => v + "px",
  lineHeight: (v) => v,
  paragraphSpacing: (v) => v + "px",
  fontWeight: (v) => v
};
const PREVIEW_FONTS = {
  default: "inherit",
  opendyslexic: "'NB OpenDyslexic', sans-serif",
  atkinson: "'Atkinson Hyperlegible', sans-serif",
  arial: "Arial, sans-serif", verdana: "Verdana, sans-serif", tahoma: "Tahoma, sans-serif"
};

const $ = (id) => document.getElementById(id);
let state = { ...DEFAULTS };

function save(patch) {
  state = { ...state, ...patch };
  chrome.storage.sync.set(patch);
  render();
}

function render() {
  $("enabled").checked = state.enabled;
  $("controls").classList.toggle("off", !state.enabled);
  $("font").value = state.font;
  for (const [k, fmt] of Object.entries(SLIDERS)) {
    $(k).value = state[k];
    $(k + "-out").textContent = fmt(Number(state[k]));
  }
  document.querySelectorAll("#background .sw").forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.v === state.background)));
  const p = $("preview");
  p.style.fontFamily = PREVIEW_FONTS[state.font];
  p.style.letterSpacing = state.letterSpacing + "px";
  p.style.wordSpacing = state.wordSpacing + "px";
  p.style.lineHeight = state.lineHeight;
  p.style.fontWeight = state.fontWeight;
}

// preview needs the bundled fonts too
const face = document.createElement("style");
face.textContent = `
@font-face{font-family:"NB OpenDyslexic";font-weight:400;src:url("../fonts/opendyslexic-latin-400-normal.woff2")}
@font-face{font-family:"NB OpenDyslexic";font-weight:700;src:url("../fonts/opendyslexic-latin-700-normal.woff2")}
@font-face{font-family:"Atkinson Hyperlegible";font-weight:400;src:url("../fonts/atkinson-hyperlegible-latin-400-normal.woff2")}
@font-face{font-family:"Atkinson Hyperlegible";font-weight:700;src:url("../fonts/atkinson-hyperlegible-latin-700-normal.woff2")}`;
document.head.appendChild(face);

chrome.storage.sync.get(DEFAULTS, (s) => { state = s; render(); });

$("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
$("font").addEventListener("change", (e) => save({ font: e.target.value }));
for (const k of Object.keys(SLIDERS)) {
  $(k).addEventListener("input", (e) => save({ [k]: Number(e.target.value) }));
}
$("background").addEventListener("click", (e) => {
  const b = e.target.closest(".sw");
  if (b) save({ background: b.dataset.v });
});
$("reset").addEventListener("click", () => save({ ...DEFAULTS, enabled: state.enabled }));
$("open-site").href = NEUROBRIDGE_URL;

$("take-test").href = NEUROBRIDGE_URL + ASSESSMENT_PATH;

// Assessment prompt: show until the site reports a completed assessment or the user dismisses it
chrome.storage.local.get({ assessmentDone: false, ctaDismissed: false }, (p) => {
  $("cta").hidden = p.assessmentDone || p.ctaDismissed;
  $("profile-ok").hidden = !p.assessmentDone;
});
$("dismiss-cta").addEventListener("click", () => {
  chrome.storage.local.set({ ctaDismissed: true });
  $("cta").hidden = true;
});
