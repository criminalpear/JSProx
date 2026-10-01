"use strict";
// Home page, shortcuts, recent list, dialogs, sidebar/toolbar toggles, diagnostics and cloaking.
function makeLinkButton(item, cls) {
  const button = document.createElement("button");
  button.className = cls;
  button.textContent = item.name;
  button.onclick = () => {
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    go(item.url);
  };
  return button;
}
function renderShortcuts() {
  $("shortcuts").replaceChildren();
  shortcuts.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "shortcut";
    const button = makeLinkButton(item, "shortcut-launch");
    button.replaceChildren();
    const icon = document.createElement("span");
    icon.className = "shortcut-icon";
    icon.textContent = item.name.slice(0, 1).toUpperCase();
    const text = document.createElement("span");
    text.className = "shortcut-text";
    const name = document.createElement("b");
    name.textContent = item.name;
    const host = document.createElement("small");
    try {
      host.textContent = new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      host.textContent = item.url;
    }
    text.append(name, host);
    button.append(icon, text);
    const remove = document.createElement("button");
    remove.className = "shortcut-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remove " + item.name);
    remove.onclick = () => {
      shortcuts.splice(index, 1);
      try {
        write("jsprox.shortcuts", shortcuts);
      } catch {
        notify("Could not save shortcuts. Browser storage is full.");
      }
      renderShortcuts();
    };
    card.append(button, remove);
    $("shortcuts").append(card);
  });
}
function renderRecent() {
  $("recent-section").hidden = !settings.rememberHistory;
  $("recent-list").replaceChildren();
  if (!settings.rememberHistory || !recent.length) {
    const p = document.createElement("p");
    p.className = "recent-empty";
    p.textContent = settings.rememberHistory
      ? "Your next discovery starts above. Recently visited pages will appear here."
      : "A little space for your next discovery. Turn on recent destinations in Settings to keep them here.";
    $("recent-list").append(p);
    return;
  }
  recent.slice(0, 3).forEach((item) => {
    const b = makeLinkButton(item, "recent-row");
    const arrow = document.createElement("small");
    arrow.textContent = "↗";
    b.append(arrow);
    $("recent-list").append(b);
  });
}
$("clear-history").onclick = () => {
  recent = [];
  try {
    localStorage.removeItem("jsprox.history");
  } catch {}
  renderRecent();
  notify("Recent destinations cleared.");
};
$("add-shortcut").onclick = () => {
  $("shortcut-form").reset();
  $("shortcut-dialog").showModal();
};
$("shortcut-form").onsubmit = (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  try {
    const url = httpUrl(f.elements.url.value.trim());
    shortcuts.push({ name: f.elements.name.value.trim() || new URL(url).hostname, url });
    shortcuts = shortcuts.slice(-40);
    write("jsprox.shortcuts", shortcuts);
    renderShortcuts();
    $("shortcut-dialog").close();
  } catch (err) {
    f.elements.url.setCustomValidity(err.message);
    f.elements.url.reportValidity();
  }
};
$("shortcut-form").elements.url.oninput = (e) => e.target.setCustomValidity("");
$("bookmark").onclick = () => {
  if (!lastUrl) {
    notify("Open a website to bookmark it.");
    return;
  }
  const url = currentUrl();
  if (!bookmarks.some((x) => x.url === url)) {
    bookmarks.push({ name: new URL(url).hostname, url });
    try {
      write("jsprox.bookmarks", bookmarks);
    } catch {
      notify("Could not save bookmark. Browser storage is full.");
      return;
    }
  }
  renderBookmarkBar();
  notify("Saved to bookmarks.");
};
function renderBookmarks() {
  renderBookmarkManager();
}
$("bookmarks-nav").onclick = () => {
  renderBookmarks();
  $("bookmarks-dialog").showModal();
};
$("cloak-settings").onclick = () => {
  $("cloak-dialog").close();
  openSettings();
  $("settings-form").elements.tabTitle.scrollIntoView({ block: "center" });
  $("settings-form").elements.tabTitle.focus();
};
function openCloaking() {
  $("cloak-title").textContent = settings.tabTitle;
  $("cloak-dialog").showModal();
}
$("cloak-open").onclick = openCloaking;
$("home-cloak").onclick = openCloaking;
$("help-open").onclick = () => $("help-dialog").showModal();
function connectionReport() {
  let host = "No page open";
  try {
    if (lastUrl) host = new URL(currentUrl()).hostname;
  } catch {}
  return {
    app: "JSProx",
    engine: activeEngine,
    preferredTransport: settings.transport,
    host,
    online: navigator.onLine,
    secureContext: window.isSecureContext,
    crossOriginIsolated: window.crossOriginIsolated,
    events: connectionEvents,
  };
}
function renderConnectionDetails() {
  const report = connectionReport();
  $("connection-details").replaceChildren();
  for (const [name, value] of [
    ["Website", report.host],
    ["Engine", report.engine],
    ["Preferred transport", report.preferredTransport],
    ["Network", report.online ? "Online" : "Offline"],
    ["Cross-origin isolation", report.crossOriginIsolated ? "Available" : "Unavailable"],
  ]) {
    const term = document.createElement("dt");
    term.textContent = name;
    const description = document.createElement("dd");
    description.textContent = value;
    $("connection-details").append(term, description);
  }
  $("connection-events").replaceChildren();
  if (!connectionEvents.length)
    $("connection-events").textContent = "No transport failures recorded in this tab.";
  for (const event of connectionEvents) {
    const item = document.createElement("p");
    item.textContent = event.host + " — " + event.reason + (event.to ? " (" + event.to + ")" : "");
    $("connection-events").append(item);
  }
}
$("diagnostics-open").onclick = () => {
  renderConnectionDetails();
  $("diagnostics-dialog").showModal();
};
$("try-transport").onclick = async () => {
  settings.transport = settings.transport === "libcurl" ? "epoxy" : "libcurl";
  try {
    write("jsprox.settings", settings);
  } catch {}
  $("diagnostics-dialog").close();
  await reconnect();
};
$("connection-retry").onclick = () => {
  $("diagnostics-dialog").close();
  reconnect();
};
$("export-diagnostics").onclick = () => download(connectionReport(), "jsprox-connection-report.json");
let sidebarHidden = read("jsprox.sidebarHidden", matchMedia("(max-width:700px)").matches) === true;
function applySidebar() {
  document.body.classList.toggle("sidebar-hidden", sidebarHidden);
  $("sidebar-toggle").title = sidebarHidden ? "Show sidebar" : "Hide sidebar";
  $("sidebar-toggle").setAttribute("aria-label", $("sidebar-toggle").title);
  $("sidebar-toggle").setAttribute("aria-expanded", String(!sidebarHidden));
}
$("sidebar-toggle").onclick = () => {
  sidebarHidden = !sidebarHidden;
  applySidebar();
  try {
    write("jsprox.sidebarHidden", sidebarHidden);
  } catch {}
};
$("copy-url").onclick = async () => {
  try {
    await navigator.clipboard.writeText(currentUrl());
    notify("Original website address copied.");
  } catch {
    notify("Copy the website address from the address bar. Clipboard access is unavailable.");
  }
};
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => $(b.dataset.close).close()));
function cloak(newTab, { quiet = false } = {}) {
  // Carry the open site along, or a not-yet-loaded #open= start link.
  const src =
    location.origin +
    "/" +
    (document.body.classList.contains("loaded")
      ? "#open=" + encodeURIComponent(currentUrl())
      : /(^|&)open=/.test(location.hash.slice(1))
        ? location.hash
        : "");
  const title = settings.tabTitle,
    iconUrl = document.querySelector("link[rel=icon]").href;
  // A same-window about:blank navigation destroys this script. Let a temporary
  // helper populate the original window after that navigation completes.
  if (!newTab) {
    if (window.top !== window) {
      notify("This tab is already inside a cloaked wrapper.");
      return null;
    }
    const helper = window.open("about:blank", "_blank", "popup,width=320,height=160");
    if (!helper) {
      if (!quiet) notify("Allow popups to cloak this tab. Your current page was kept.");
      return null;
    }
    helper.document.title = "Preparing current-tab cloak";
    helper.document.body.textContent = "Preparing your current tab… This helper closes automatically.";
    helper.__jsproxCloak = { src, title, iconUrl };
    const script = helper.document.createElement("script");
    script.src = location.origin + "/cloak-helper.js";
    script.onerror = () => {
      helper.close();
      notify("Could not load the cloak helper. Your current page was kept.");
    };
    helper.document.head.append(script);
    return helper;
  }
  const target = window.open("about:blank", "_blank");
  if (!target) {
    notify("Popup blocked. Allow popups for JSProx and try again.");
    return null;
  }
  try {
    const doc = target.document;
    doc.open();
    doc.write("<!doctype html><html><head></head><body></body></html>");
    doc.close();
    doc.title = title;
    doc.body.style.cssText = "margin:0;height:100vh;overflow:hidden;background:#101714";
    const icon = doc.createElement("link");
    icon.rel = "icon";
    icon.href = iconUrl;
    doc.head.append(icon);
    const embedded = doc.createElement("iframe");
    embedded.src = src;
    embedded.title = "JSProx";
    embedded.allow =
      "cross-origin-isolated; fullscreen; autoplay; gamepad; encrypted-media; clipboard-read; clipboard-write";
    embedded.style.cssText = "width:100%;height:100%;border:0";
    doc.body.append(embedded);
    if (newTab) {
      $("cloak-dialog").close();
      notify("Opened cloaked tab.");
    }
    return target;
  } catch {
    if (newTab) target.close();
    notify("This browser could not create the wrapper.");
  }
}
$("blank").onclick = () => cloak(true);
$("cloak-current").onclick = () => cloak(false);
let panelHidden = read("jsprox.panelHidden", false) === true;
function applyPanel() {
  document.body.classList.toggle("panel-hidden", panelHidden);
  (panelHidden ? document.querySelector("main") : $("topbar")).prepend($("chrome-toggles"));
  $("panel-toggle").setAttribute("aria-expanded", String(!panelHidden));
  $("panel-toggle").setAttribute("aria-label", panelHidden ? "Show top controls" : "Hide top controls");
  $("panel-toggle").title = panelHidden ? "Show top controls" : "Hide top controls";
}
$("panel-toggle").onclick = () => {
  panelHidden = !panelHidden;
  try {
    write("jsprox.panelHidden", panelHidden);
  } catch {}
  applyPanel();
};
applyPanel();
let consoleVisible = false;
$("console-toggle").onclick = () => {
  consoleVisible = !consoleVisible;
  $("console-toggle").setAttribute("aria-pressed", String(consoleVisible));
  $("console-toggle").title = consoleVisible ? "Hide console button" : "Show console button";
  $("console-toggle").setAttribute("aria-label", $("console-toggle").title);
  try {
    frame.contentWindow.__jsproxConsoleVisibility(consoleVisible);
  } catch {
    notify("Open a page first. Ctrl+` also opens its console.");
  }
};
frame.addEventListener("load", () => {
  consoleVisible = false;
  $("console-toggle").setAttribute("aria-pressed", "false");
  $("console-toggle").title = "Show console button";
  $("console-toggle").setAttribute("aria-label", "Show console button");
});
