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
  // A page cannot grant itself popup permission, so explain how to allow it;
  // after that, later visits switch without any click.
  const showSteps = !read("jsprox.popupStepsDismissed", false);
  const prompt = document.createElement("div");
  prompt.id = "auto-cloak-prompt";
  prompt.setAttribute("role", "dialog");
  prompt.setAttribute("aria-label", "Open JSProx in about:blank");
  prompt.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:var(--bg,#101714);color:var(--text,#dbece6);font:16px/1.5 system-ui,sans-serif;cursor:pointer;text-align:center";
  const box = document.createElement("div");
  box.style.cssText = "max-width:520px";
  const title = document.createElement("p");
  title.style.cssText = "font-size:22px;font-weight:700;margin:0 0 12px";
  title.textContent = "Click anywhere to continue";
  box.append(title);
  if (showSteps) {
    const intro = document.createElement("p");
    intro.textContent = "To open in about:blank automatically every time, allow pop-ups for this site once:";
    const steps = document.createElement("ol");
    steps.style.cssText = "text-align:left;margin:8px auto 16px;padding-left:22px";
    for (const text of [
      "Click the blocked pop-up icon at the right end of the address bar.",
      "Choose “Always allow pop-ups and redirects from " + location.origin + "”.",
      "Click Done, then click anywhere on this page.",
    ]) {
      const item = document.createElement("li");
      item.textContent = text;
      steps.append(item);
    }
    const dismiss = document.createElement("button");
    dismiss.id = "auto-cloak-dismiss";
    dismiss.textContent = "Continue and don't show these steps again";
    dismiss.style.cssText =
      "font:inherit;font-size:14px;background:none;border:0;color:var(--accent,#6ee7b7);text-decoration:underline;cursor:pointer";
    box.append(intro, steps, dismiss);
  }
  prompt.append(box);
  document.body.append(prompt);
  const onGesture = (event) => {
    removeEventListener("pointerdown", onGesture, true);
    removeEventListener("keydown", onGesture, true);
    if (event.target instanceof Element && event.target.closest("#auto-cloak-dismiss")) {
      try {
        write("jsprox.popupStepsDismissed", true);
      } catch {}
    }
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
