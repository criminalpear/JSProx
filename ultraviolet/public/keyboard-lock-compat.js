// Keyboard lock (navigator.keyboard.lock) only works in a top-level page. A
// proxied game runs inside the JSProx frame, and in cloaked mode inside the
// about:blank wrapper as well, so Chrome rejects the lock: Esc leaves
// fullscreen instead of reaching the game, and Xbox Cloud Gaming turns off its
// keyboard controls. The wrapper and dashboard share this page's origin, so ask
// the real top-level page to take the lock. Key events still go to the focused
// game frame, and the lock applies while that frame is fullscreen.
(() => {
  if (typeof Keyboard !== "function") return;
  let topWindow = window;
  try {
    // Scramjet virtualizes window.top, so walk the real frame chain instead.
    while (topWindow.frameElement) topWindow = topWindow.frameElement.ownerDocument.defaultView;
    if (topWindow === window || !topWindow.navigator.keyboard) return;
  } catch {
    return; // a cross-origin ancestor: leave the browser's behaviour alone
  }
  const keyboard = topWindow.navigator.keyboard;
  Keyboard.prototype.lock = function (...args) {
    return keyboard.lock(...args);
  };
  Keyboard.prototype.unlock = function () {
    return keyboard.unlock();
  };
})();
