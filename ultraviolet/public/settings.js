"use strict";
// Settings dialog: theme, accent, background image, import/export/reset.
function readableAccent(hex, dark) {
  let rgb = hex
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16));
  const luminance = (values) =>
    values
      .map((x) => {
        x /= 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
  const background = luminance(dark ? [25, 35, 31] : [255, 255, 255]);
  for (let i = 0; i < 30; i++) {
    const l = luminance(rgb);
    if ((Math.max(l, background) + 0.05) / (Math.min(l, background) + 0.05) >= 4.5) break;
    rgb = rgb.map((x) => Math.round(x * 0.85 + (dark ? 255 : 0) * 0.15));
  }
  return "#" + rgb.map((x) => x.toString(16).padStart(2, "0")).join("");
}
function showWallpaperPreview() {
  const image = $("wallpaper-preview-image");
  const local = draftWallpaper.startsWith("data:image/");
  image.hidden = !local;
  $("wallpaper-preview-empty").hidden = local;
  if (local) image.src = draftWallpaper;
  else image.removeAttribute("src");
  $("wallpaper-status").textContent = local
    ? "Image ready. Save changes to apply it."
    : "Upload an image or load a direct image link. Images up to 12 MB are resized to fit.";
}
async function prepareWallpaper(blob) {
  if (blob.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");
  if (!/^image\/(png|jpeg|webp|gif)(;|$)/i.test(blob.type))
    throw new Error("Use a direct PNG, JPEG, WebP or GIF image, not a web page.");
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  try {
    image.src = objectUrl;
    await deadline(image.decode(), 15000, "The image could not be decoded. Try a different image.");
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", 0.85);
    if (data.length > 2800000) throw new Error("This image is too detailed to save. Try a smaller image.");
    return data;
  } catch (error) {
    throw new Error(
      error.name === "EncodingError"
        ? "This image is damaged or unsupported. Try another file."
        : error.message,
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
async function fetchWallpaper(url) {
  await ensureTransport();
  const client = new BareMux.BareClient("/baremux/worker.js?v=jsprox2");
  const response = await deadline(
    client.fetch(url),
    15000,
    "Image download timed out. Try uploading the file instead.",
  );
  if (!response.ok)
    throw new Error(
      "The image server returned " + response.status + ". Try another link or upload the image.",
    );
  const limit = 12 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit) {
    response.body?.cancel();
    throw new Error("Image is larger than 12 MB.");
  }
  const reader = response.body.getReader();
  let total = 0;
  const chunks = [];
  const readImage = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error("Image is larger than 12 MB.");
      chunks.push(value);
    }
    return new Blob(chunks, { type: response.headers.get("content-type") || "" });
  })();
  let blob;
  try {
    blob = await deadline(readImage, 15000, "Image download timed out.");
  } finally {
    await reader.cancel().catch(() => {});
  }
  return prepareWallpaper(blob);
}
function runWallpaperTask(work) {
  if (wallpaperTask) return wallpaperTask;
  const controls = [
    $("load-wallpaper"),
    $("wallpaper-file"),
    $("remove-wallpaper"),
    $("settings-form").querySelector("[type=submit]"),
  ];
  controls.forEach((x) => (x.disabled = true));
  $("wallpaper-status").textContent = "Loading and preparing your image...";
  wallpaperTask = (async () => {
    try {
      await work();
      showWallpaperPreview();
      $("settings-message").textContent = "Image ready. Save changes to apply.";
    } catch (e) {
      $("wallpaper-status").textContent = e.message;
      $("settings-message").textContent = "Image was not changed.";
      throw e;
    } finally {
      controls.forEach((x) => (x.disabled = false));
      wallpaperTask = null;
    }
  })();
  return wallpaperTask;
}
function loadWallpaperLink() {
  const url = $("settings-form").elements.wallpaper.value.trim();
  return runWallpaperTask(async () => {
    if (!/^https?:\/\//i.test(url))
      throw new Error("Enter a direct image link starting with https:// or http://.");
    const image = await fetchWallpaper(new URL(url).href);
    draftWallpaper = image;
    draftWallpaperSource = url;
  });
}
function applySettings() {
  const dark =
    settings.theme === "dark" ||
    (settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const accent = readableAccent(settings.accent, dark);
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-ink", dark ? "#10251b" : "#ffffff");
  document.documentElement.style.setProperty(
    "--wallpaper",
    settings.wallpaper.startsWith("data:image/") ? `url(${JSON.stringify(settings.wallpaper)})` : "none",
  );
  document.documentElement.style.setProperty("--wallpaper-opacity", settings.wallpaperOpacity);
  document.body.classList.toggle("has-wallpaper", Boolean(settings.wallpaper));
  $("theme-toggle").textContent = dark ? "☀" : "☾";
  $("theme-toggle").title = dark ? "Switch to light mode" : "Switch to dark mode";
  $("theme-toggle").setAttribute("aria-label", $("theme-toggle").title);
  document.title = settings.tabTitle;
  const favicon = document.querySelector("link[rel=icon]");
  favicon.type = settings.tabIcon === "default" ? "image/png" : "image/svg+xml";
  if (settings.tabIcon === "default") favicon.href = "/icon.png";
  else if (settings.tabIcon === "none")
    favicon.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
  else
    favicon.href =
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text y="50" font-size="50">${tabIcons[settings.tabIcon] || "📓"}</text></svg>`,
      );
  renderRecent();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (settings.theme === "system") applySettings();
});
let draftWallpaper = "",
  draftWallpaperSource = "",
  wallpaperTask = null;
function openSettings() {
  const form = $("settings-form");
  for (const [key, value] of Object.entries(settings)) {
    const input = form.elements.namedItem(key);
    if (!input) continue;
    if (input.type === "checkbox") input.checked = value;
    else
      input.value =
        key === "wallpaper" ? settings.wallpaperSource || (/^https?:/.test(value) ? value : "") : value;
  }
  draftWallpaper = settings.wallpaper;
  draftWallpaperSource = settings.wallpaperSource;
  showWallpaperPreview();
  $("settings-message").textContent = "Changes apply when saved.";
  $("settings").showModal();
  document.querySelector(".settings-scroll").scrollTop = 0;
}
$("settings-open").onclick = openSettings;
$("customize").onclick = openSettings;
$("theme-toggle").onclick = () => {
  settings.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try {
    write("jsprox.settings", settings);
  } catch {}
  applySettings();
};
$("settings-form").elements.wallpaper.oninput = () => {
  $("wallpaper-status").textContent = "Press Load image from link or Save changes to load this image.";
};
$("load-wallpaper").onclick = () => loadWallpaperLink().catch(() => {});
$("wallpaper-file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    await runWallpaperTask(async () => {
      const image = await prepareWallpaper(file);
      draftWallpaper = image;
      draftWallpaperSource = "";
      $("settings-form").elements.wallpaper.value = "";
    });
  } catch {}
  e.target.value = "";
};
$("remove-wallpaper").onclick = () => {
  draftWallpaper = "";
  draftWallpaperSource = "";
  $("settings-form").elements.wallpaper.value = "";
  showWallpaperPreview();
  $("settings-message").textContent = "Background removed when you save.";
};
$("settings-form").onsubmit = async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  try {
    if (wallpaperTask) await wallpaperTask;
    const link = form.elements.wallpaper.value.trim();
    if (link && (link !== draftWallpaperSource || !draftWallpaper.startsWith("data:")))
      await loadWallpaperLink();
  } catch {
    return;
  }
  const data = Object.fromEntries(new FormData(form));
  for (const key of ["autoReconnect", "rememberHistory"]) data[key] = form.elements[key].checked;
  data.wallpaper = draftWallpaper;
  data.wallpaperSource = draftWallpaperSource;
  const next = validSettings(data);
  try {
    write("jsprox.settings", next);
  } catch {
    $("settings-message").textContent = "Not enough browser storage. Try a smaller background image.";
    return;
  }
  const transportChanged = next.transport !== settings.transport;
  settings = next;
  if (!settings.rememberHistory) {
    recent = [];
    try {
      localStorage.removeItem("jsprox.history");
    } catch {}
  }
  applySettings();
  $("settings").close();
  notify(
    transportChanged
      ? "Settings saved. Reconnect or open a page to use the selected transport."
      : "Your space, updated.",
  );
};
$("export-settings").onclick = () =>
  download({ version: 1, settings, shortcuts, bookmarks }, "jsprox-preferences.json");
$("import-settings").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 3 * 1024 * 1024) throw new Error("Preference file is too large.");
    const data = JSON.parse(await file.text());
    if (data.version !== 1 || !data.settings) throw new Error("This is not a JSProx preference export.");
    const next = validSettings(data.settings);
    write("jsprox.settings", next);
    settings = next;
    shortcuts = validLinks(data.shortcuts);
    bookmarks = validBookmarks(data.bookmarks);
    write("jsprox.shortcuts", shortcuts);
    write("jsprox.bookmarks", bookmarks);
    applySettings();
    renderShortcuts();
    renderBookmarkBar();
    $("settings").close();
    notify("Preferences imported.");
  } catch (err) {
    $("settings-message").textContent = err.message;
  }
  e.target.value = "";
};
$("reset-settings").onclick = () => {
  try {
    write("jsprox.settings", defaults);
    settings = { ...defaults };
    recent = [];
    localStorage.removeItem("jsprox.history");
    applySettings();
    $("settings").close();
    notify("Preferences reset. Bookmarks and shortcuts were kept.");
  } catch {
    $("settings-message").textContent = "Browser storage is unavailable.";
  }
};
for (const [value, emoji] of Object.entries(tabIcons)) {
  const select = $("settings-form").elements.tabIcon;
  if (![...select.options].some((o) => o.value === value)) {
    const option = new Option(emoji + " " + value[0].toUpperCase() + value.slice(1), value);
    select.add(option);
  }
}
