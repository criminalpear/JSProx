"use strict";
// Shared helpers and the preferences stored in localStorage. The dashboard
// scripts are classic scripts loaded in order (see index.html) and share these globals.
const $ = (id) => document.getElementById(id);
const tabIcons = {
  leaf: "🌿",
  notebook: "📓",
  book: "📚",
  pencil: "✏️",
  school: "🎓",
  calculator: "🧮",
  calendar: "📅",
  folder: "📁",
  document: "📄",
  mail: "✉️",
  cloud: "☁️",
  globe: "🌐",
  star: "⭐",
  moon: "🌙",
  sun: "☀️",
  music: "🎵",
  game: "🎮",
  code: "💻",
  rocket: "🚀",
  coffee: "☕",
  cat: "🐱",
  flower: "🌸",
};
const defaults = {
  uiVersion: 3,
  theme: "dark",
  accent: "#6ee7b7",
  wallpaper: "",
  wallpaperSource: "",
  wallpaperOpacity: 0.7,
  engine: "scramjet",
  transport: "libcurl",
  search: "duckduckgo",
  homepage: "",
  autoReconnect: true,
  tabTitle: "JSProx",
  tabIcon: "default",
  rememberHistory: false,
};
const engines = {
  duckduckgo: "https://duckduckgo.com/?q=%s",
  google: "https://www.google.com/search?q=%s",
  bing: "https://www.bing.com/search?q=%s",
  brave: "https://search.brave.com/search?q=%s",
};
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function httpUrl(value) {
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : "https://" + value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use an HTTP or HTTPS website.");
  return url.href;
}
function validSettings(value) {
  const s = { ...defaults };
  if (!value || typeof value !== "object") return s;
  for (const [key, choices] of Object.entries({
    theme: ["light", "dark", "system"],
    engine: ["scramjet", "uv"],
    transport: ["libcurl", "epoxy"],
    search: Object.keys(engines),
    tabIcon: ["default", "none", ...Object.keys(tabIcons)],
  }))
    if (choices.includes(value[key])) s[key] = value[key];
  if (/^#[0-9a-f]{6}$/i.test(value.accent)) s.accent = value.accent;
  if (typeof value.tabTitle === "string") s.tabTitle = value.tabTitle.slice(0, 80) || "JSProx";
  if (
    typeof value.wallpaper === "string" &&
    (/^https?:\/\//i.test(value.wallpaper) ||
      /^data:image\/(png|jpeg|webp|gif);base64,/i.test(value.wallpaper))
  )
    s.wallpaper = value.wallpaper;
  if (typeof value.wallpaperSource === "string" && /^https?:\/\//i.test(value.wallpaperSource))
    s.wallpaperSource = value.wallpaperSource;
  if (typeof value.homepage === "string" && value.homepage.trim()) {
    try {
      s.homepage = httpUrl(value.homepage.trim());
    } catch {}
  }
  if (Number.isFinite(Number(value.wallpaperOpacity)))
    s.wallpaperOpacity = Math.min(1, Math.max(0.1, Number(value.wallpaperOpacity)));
  for (const key of ["autoReconnect", "rememberHistory"])
    if (typeof value[key] === "boolean") s[key] = value[key];
  return s;
}
const savedSettings = read("jsprox.settings", defaults);
let settings = validSettings(savedSettings);
if (savedSettings?.uiVersion !== 3) {
  settings.theme = "dark";
  settings.accent = defaults.accent;
  settings.wallpaperOpacity = 0.7;
  try {
    write("jsprox.settings", settings);
  } catch {}
}
let shortcuts = read("jsprox.shortcuts", [
  { name: "YouTube", url: "https://www.youtube.com/" },
  { name: "CrazyGames", url: "https://www.crazygames.com/" },
  { name: "GitHub", url: "https://github.com/" },
  { name: "Wikipedia", url: "https://en.wikipedia.org/" },
]);
let bookmarks = read("jsprox.bookmarks", []);
let recent = settings.rememberHistory ? read("jsprox.history", []) : [];
function validBookmarks(list) {
  return Array.isArray(list)
    ? list
        .filter(
          (x) =>
            x &&
            typeof x.name === "string" &&
            typeof x.url === "string" &&
            (/^javascript:/i.test(x.url) || /^https?:\/\//i.test(x.url)),
        )
        .map((x) => ({ name: x.name.slice(0, 80), url: x.url.slice(0, 64000) }))
        .slice(0, 100)
    : [];
}
function validLinks(list) {
  return Array.isArray(list)
    ? list
        .filter((x) => {
          try {
            return (
              x &&
              typeof x.name === "string" &&
              typeof x.url === "string" &&
              ["http:", "https:"].includes(new URL(x.url).protocol)
            );
          } catch {
            return false;
          }
        })
        .map((x) => ({ name: x.name.slice(0, 80), url: x.url }))
        .slice(0, 40)
    : [];
}
shortcuts = validLinks(shortcuts);
bookmarks = validBookmarks(bookmarks);
recent = validLinks(recent);
function notify(message) {
  $("uv-status").textContent = message;
  $("notice").hidden = !message;
}
function onlineLabel(text, offline = false) {
  $("connection-label").textContent = text;
  $("connection-dot").classList.toggle("offline", offline);
}
function deadline(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}
function download(data, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
