// Single source of truth for settings. Loaded by content scripts, the popup and the site bridge.
(() => {
  const NB = (globalThis.NB = globalThis.NB || {});

  NB.DISPLAY_DEFAULTS = {
    enabled: false,
    font: "default",        // default | opendyslexic | atkinson | arial | verdana | tahoma
    fontSize: 100,          // %
    letterSpacing: 0,       // px
    wordSpacing: 0,         // px
    lineHeight: 1.5,
    paragraphSpacing: 0,    // px
    fontWeight: 400,
    background: "default",  // default | white | cream | blue | dark
    textColor: "auto"
  };

  NB.VOICE_DEFAULTS = {
    ttsSpeaker: "shubh",
    ttsLang: "auto",        // auto | en-IN | hi-IN | bn-IN | ta-IN | te-IN | kn-IN | ml-IN | mr-IN | gu-IN | pa-IN | od-IN
    ttsPace: 1,
    dock: true              // show the floating reader button on pages
  };

  NB.DEFAULTS = { ...NB.DISPLAY_DEFAULTS, ...NB.VOICE_DEFAULTS };

  // Validation for anything pushed in from the website.
  NB.RULES = {
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
})();
