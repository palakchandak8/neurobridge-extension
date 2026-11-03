// Turns an assessment result into reading settings.
//
// The website posts a result with scores from 0 to 100, where higher means "needs more support":
//   severity        overall support need (optional; averaged from the others if missing)
//   letterConfusion mixes up similar letters (b/d, p/q)          -> font choice
//   crowding        text looks crowded or jumbled                -> letter and word spacing
//   tracking        loses the line, skips lines                  -> line and paragraph spacing
//   visualStress    glare / high-contrast discomfort             -> background tint, weight
//   accuracy        optional, % correct (higher is better)       -> feeds severity
//   preferredFont / preferredBackground  optional explicit picks from the test
(() => {
  const NB = (globalThis.NB = globalThis.NB || {});
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v) => { v = Number(v); return Number.isFinite(v) ? clamp(v, 0, 100) : null; };
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const r1 = (v) => Math.round(v * 10) / 10;

  const FONT_NAMES = {
    default: "Page default", opendyslexic: "OpenDyslexic", atkinson: "Atkinson Hyperlegible",
    arial: "Arial", verdana: "Verdana", tahoma: "Tahoma"
  };
  const BG_NAMES = { default: "Page default", white: "White", cream: "Cream", blue: "Light blue", dark: "Dark" };

  function fromResult(r) {
    if (!r || typeof r !== "object") return null;
    let sev = num(r.severity);
    let cf = num(r.letterConfusion), cr = num(r.crowding), tr = num(r.tracking), vs = num(r.visualStress);
    const acc = num(r.accuracy);
    const parts = [cf, cr, tr, vs].filter((v) => v !== null);
    if (acc !== null) parts.push(100 - acc);
    if (sev === null) {
      if (!parts.length) return null;
      sev = avg(parts);
    }
    cf = cf ?? sev; cr = cr ?? sev; tr = tr ?? sev; vs = vs ?? sev * 0.5;

    const font = NB.RULES.font(r.preferredFont) ? r.preferredFont : cf >= 60 ? "opendyslexic" : cf >= 25 ? "atkinson" : "default";
    const background = NB.RULES.background(r.preferredBackground) ? r.preferredBackground : vs < 20 ? "default" : vs < 60 ? "cream" : "blue";
    const settings = {
      font,
      fontSize: clamp(Math.round((100 + sev * 0.3) / 5) * 5, 100, 130),
      letterSpacing: r1((cr / 100) * 2.4),
      wordSpacing: Math.round(((cr / 100) * 6) * 2) / 2,
      lineHeight: r1(1.4 + (tr / 100) * 0.6),
      paragraphSpacing: Math.round(((tr / 100) * 24) / 2) * 2,
      fontWeight: vs >= 70 ? 500 : 400,
      background
    };

    const reasons = [];
    if (font !== "default") reasons.push({ label: "Font", value: FONT_NAMES[font], short: FONT_NAMES[font], why: cf >= 60 ? "Similar letters were easy to mix up, so letter shapes matter more for you." : "A clearer letter design helps similar characters stand apart." });
    if (settings.fontSize > 100) reasons.push({ label: "Text size", value: settings.fontSize + "%", short: settings.fontSize + "% text", why: "Slightly larger text lowers the effort of reading." });
    if (settings.letterSpacing >= 0.3) reasons.push({ label: "Letter spacing", value: settings.letterSpacing + "px", short: settings.letterSpacing + "px letters", why: "Crowded text was hard to read, so letters get more room." });
    if (settings.wordSpacing >= 0.5) reasons.push({ label: "Word spacing", value: settings.wordSpacing + "px", short: settings.wordSpacing + "px words", why: "Wider gaps make it easier to see where each word ends." });
    reasons.push({ label: "Line spacing", value: String(settings.lineHeight), short: settings.lineHeight + " lines", why: tr >= 40 ? "You lost your place between lines, so lines are spread out." : "Comfortable space between lines." });
    if (settings.paragraphSpacing > 0) reasons.push({ label: "Paragraph gap", value: settings.paragraphSpacing + "px", short: settings.paragraphSpacing + "px gaps", why: "Clear breaks between paragraphs help you find your way back." });
    if (background !== "default") reasons.push({ label: "Background", value: BG_NAMES[background], short: BG_NAMES[background], why: "A softer background reduces glare from bright white pages." });

    const level = sev < 30 ? "light" : sev < 60 ? "moderate" : "strong";
    return { label: { light: "Light support", moderate: "Moderate support", strong: "Strong support" }[level], level, settings, reasons };
  }

  // Older site versions send ready-made settings instead of a result.
  function fromSettings(s) {
    const clean = {};
    for (const [k, v] of Object.entries(s || {})) if (NB.RULES[k] && NB.RULES[k](v)) clean[k] = v;
    if (!Object.keys(clean).length) return null;
    const reasons = Object.entries(clean).filter(([k]) => k !== "enabled").map(([k, v]) => ({ label: k, value: String(v), why: "Set by your NeuroBridge profile." }));
    return { label: "Your profile", level: "custom", settings: clean, reasons };
  }

  NB.fromResult = fromResult;
  NB.fromSettings = fromSettings;
})();
