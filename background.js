importScripts("config.js");
const C = globalThis.NB_CONFIG;
const CONTENT_FILES = ["shared/defaults.js", "content/display.js", "content/reader.js"];

// --- install: invite to the assessment, set up the right-click menu -------------------------------
chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === "install") chrome.tabs.create({ url: C.SITE_URL + C.ASSESSMENT_PATH });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "nb-read-selection", title: "Listen with NeuroBridge", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "nb-read-page", title: "Read this page aloud", contexts: ["page"] });
  });
});

// Send a message to a tab's content script, injecting it first if the tab was open before install.
async function sendToTab(tabId, msg) {
  try { return await chrome.tabs.sendMessage(tabId, msg); }
  catch (_) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
      await new Promise((r) => setTimeout(r, 150));
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (_) { return null; }
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null) return;
  sendToTab(tab.id, { type: info.menuItemId === "nb-read-selection" ? "NB_READ_SELECTION" : "NB_READ_PAGE" });
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-read") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) sendToTab(tab.id, { type: "NB_TOGGLE" });
});

// --- Sarvam text to speech -------------------------------------------------------------------------
async function getKey() {
  const { sarvamKey } = await chrome.storage.local.get({ sarvamKey: "" });
  return (sarvamKey || C.SARVAM_API_KEY || "").trim();
}

async function synth({ text, lang, speaker, pace }) {
  const key = await getKey();
  if (!key) throw new Error("NO_KEY");
  const body = JSON.stringify({
    text: String(text).slice(0, 2400),
    language_code: lang || "en-IN",
    model: C.SARVAM_MODEL,
    speaker: speaker || "shubh",
    pace: Math.min(2, Math.max(0.5, Number(pace) || 1)),
    speech_sample_rate: 24000,
    output_audio_codec: "wav"
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(C.SARVAM_URL, { method: "POST", headers: { "api-subscription-key": key, "Content-Type": "application/json" }, body });
    if (res.status === 429 && attempt === 0) { await new Promise((r) => setTimeout(r, 900)); continue; }
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try { const j = await res.json(); msg = (j.error && j.error.message) || j.message || msg; } catch (_) {}
      throw new Error(res.status === 403 ? "Sarvam rejected the key (" + msg + ")" : msg);
    }
    const data = await res.json();
    if (!data.audios || !data.audios[0]) throw new Error("Sarvam returned no audio");
    return data.audios[0];
  }
  throw new Error("Sarvam is busy, try again in a moment");
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "NB_TTS") {
    synth(msg).then((audio) => sendResponse({ ok: true, audio })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === "NB_TTS_STATUS") {
    getKey().then((k) => sendResponse({ hasKey: !!k }));
    return true;
  }
});
