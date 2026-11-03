// NeuroBridge extension config. Loaded by the background worker and the popup.
//
// SARVAM_API_KEY: paste your Sarvam key here to ship it with the extension, or leave it empty and
// let each person paste their own in the popup (Listen tab > Voice engine). A key stored in an
// extension can be read by anyone who installs it, so for a public release put the key behind your
// own backend and point SARVAM_URL at that endpoint instead (same request/response shape).
globalThis.NB_CONFIG = {
  SARVAM_API_KEY: "sk_ng82ian9_CsJgrabH5mqwHT9NlLsUXSGy",
  SARVAM_URL: "https://api.sarvam.ai/text-to-speech",
  SARVAM_MODEL: "bulbul:v3",
  SITE_URL: "http://localhost:5147", // swap for the deployed URL once the site is live
  ASSESSMENT_PATH: "/assessment"
};
