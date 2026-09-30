// Open the NeuroBridge site once, right after install, to invite the user to take the assessment.
const NEUROBRIDGE_URL = "http://localhost:5147"; // swap for the deployed URL once the site is live
chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === "install") chrome.tabs.create({ url: NEUROBRIDGE_URL + "/assessment" });
});
