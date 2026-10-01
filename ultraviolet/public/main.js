"use strict";
// Startup. Runs last, after every dashboard script has defined its functions.
applySettings();
renderShortcuts();
syncNav();
applySidebar();
// Open in an about:blank tab right away. The cloak helper is a popup, so when
// Chrome blocks it on load, cloak on the first click or key press instead
// (a user gesture), or immediately once popups are allowed for this site.
function autoCloak() {
  if (!settings.autoCloak || window.top !== window) return false;
  if (cloak(false, { quiet: true })) return true;
  // A full-page prompt so the first click is clearly for this, not a shortcut.
  const prompt = document.createElement("button");
  prompt.id = "auto-cloak-prompt";
  prompt.textContent = "Click anywhere to continue";
  prompt.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;border:0;background:var(--bg,#101714);color:var(--text,#dbece6);font:600 20px system-ui,sans-serif;cursor:pointer";
  document.body.append(prompt);
  prompt.focus();
  const onGesture = (event) => {
    removeEventListener("pointerdown", onGesture, true);
    removeEventListener("keydown", onGesture, true);
    prompt.remove();
    if (!settings.autoCloak) return;
    event.preventDefault();
    event.stopPropagation();
    if (!cloak(false)) notify("Could not switch to about:blank. Use Cloaking in the sidebar.");
  };
  addEventListener("pointerdown", onGesture, true);
  addEventListener("keydown", onGesture, true);
  return false;
}
const initialUrl = new URLSearchParams(location.hash.slice(1)).get("open");
// The original tab turns into about:blank immediately, so skip loading here.
if (!autoCloak()) {
  if (initialUrl && /^https?:\/\//i.test(initialUrl)) go(initialUrl);
  else if (settings.homepage) go(settings.homepage);
}
if (/^https?:\/\//i.test(settings.wallpaper)) {
  const previous = settings.wallpaper;
  fetchWallpaper(previous)
    .then((image) => {
      if (settings.wallpaper !== previous) return;
      const updated = { ...settings, wallpaper: image, wallpaperSource: previous };
      write("jsprox.settings", updated);
      settings = updated;
      applySettings();
    })
    .catch(() =>
      notify(
        "Your saved background could not load. Open Settings to upload it or try another direct image link.",
      ),
    );
}
