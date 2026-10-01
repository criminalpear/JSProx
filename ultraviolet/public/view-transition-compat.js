// Chrome crashes the tab ("Aw, Snap!", STATUS_BREAKPOINT) when YouTube calls
// document.startViewTransition in a Scramjet page inside the JSProx frame,
// reliably within a second of a video starting. Sites feature-detect this API
// and fall back to switching pages without the animation, so hiding it only
// removes a cosmetic effect. Loaded before site scripts (console-response.js).
(() => {
  try {
    delete Document.prototype.startViewTransition;
  } catch {}
})();
