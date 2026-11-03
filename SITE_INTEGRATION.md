# Connecting the NeuroBridge website to the extension

The extension only trusts messages from the page it is injected on (`http://localhost:5147/*` in
`manifest.json`; add your production origin under the `bridge.js` content-script `matches` once deployed).

## 1. When the assessment finishes, post the result

```js
window.postMessage(
  {
    type: "NEUROBRIDGE_RESULT",
    result: {
      // every score is 0 to 100, higher = needs more support. All fields are optional.
      severity: 62,        // overall (if omitted, the average of the others is used)
      letterConfusion: 70, // b/d, p/q mix-ups            -> font choice
      crowding: 55,        // dense text is hard           -> letter + word spacing
      tracking: 48,        // loses place between lines    -> line + paragraph spacing
      visualStress: 35,    // glare / bright-white pages   -> background tint
      accuracy: 78,        // optional, % correct (higher is better)
      // preferredFont: "atkinson", preferredBackground: "cream"   // optional explicit picks
    }
  },
  window.location.origin
);
```

The extension turns those scores into font, text size, letter/word/line/paragraph spacing and background
(see `shared/profile.js`, the mapping is a handful of lines you can tweak), switches reading mode on, and
shows a "Tuned to you" card in the popup. Retaking the test and posting again overwrites the old profile.

## 2. Optional

```js
// Is the extension installed? (reply arrives as NEUROBRIDGE_EXTENSION_READY, or check
// document.documentElement.dataset.neurobridgeExtension)
window.postMessage({ type: "NEUROBRIDGE_PING" }, window.location.origin);

// Listen for confirmation that the settings were applied
window.addEventListener("message", (e) => {
  if (e.source === window && e.data?.type === "NEUROBRIDGE_APPLIED") console.log("Applied:", e.data.label);
});

// Person logs out or resets the test
window.postMessage({ type: "NEUROBRIDGE_RESET" }, window.location.origin);
```

The old `NEUROBRIDGE_PROFILE` message (ready-made settings) still works.
