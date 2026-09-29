"use strict";
// Startup. Runs last, after every dashboard script has defined its functions.
applySettings();
renderShortcuts();
syncNav();
applySidebar();
const initialUrl = new URLSearchParams(location.hash.slice(1)).get("open");
if (initialUrl && /^https?:\/\//i.test(initialUrl)) go(initialUrl);
else if (settings.homepage) go(settings.homepage);
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
