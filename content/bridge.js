// Runs only on the NeuroBridge website. Lets the site hand the assessment result to the extension.
// See SITE_INTEGRATION.md for the exact messages the site should post.
(() => {
  const NB = globalThis.NB;
  const root = document.documentElement;
  root.dataset.neurobridgeExtension = chrome.runtime.getManifest().version;

  const announce = () => window.postMessage({ type: "NEUROBRIDGE_EXTENSION_READY", version: chrome.runtime.getManifest().version }, window.location.origin);
  announce();

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const d = e.data;
    if (!d || typeof d.type !== "string") return;

    if (d.type === "NEUROBRIDGE_PING") return announce();

    if (d.type === "NEUROBRIDGE_RESULT") {
      const profile = NB.fromResult(d.result);
      if (!profile) return;
      chrome.storage.sync.set({ ...profile.settings, enabled: true });
      chrome.storage.local.set({ assessmentDone: true, result: d.result, profile, edited: false, assessmentAt: Date.now() });
      window.postMessage({ type: "NEUROBRIDGE_APPLIED", label: profile.label }, window.location.origin);
      return;
    }

    // Legacy: the site sends finished settings.
    if (d.type === "NEUROBRIDGE_PROFILE") {
      const profile = NB.fromSettings(d.settings);
      if (profile) chrome.storage.sync.set({ ...profile.settings, enabled: true });
      if (typeof d.assessmentDone === "boolean") chrome.storage.local.set({ assessmentDone: d.assessmentDone, ...(profile ? { profile, edited: false } : {}) });
      return;
    }

    // Site tells us the person started over (new account, reset test).
    if (d.type === "NEUROBRIDGE_RESET") {
      chrome.storage.local.set({ assessmentDone: false, result: null, profile: null, edited: false });
    }
  });
})();
