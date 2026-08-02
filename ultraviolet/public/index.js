"use strict";

const form = document.getElementById("uv-form");
const address = document.getElementById("uv-address");
const searchEngine = document.getElementById("uv-search-engine");
const error = document.getElementById("uv-error");
const errorCode = document.getElementById("uv-error-code");
const status = document.getElementById("uv-status");
const frame = document.getElementById("uv-frame");
const goBtn = document.getElementById("go");
const homeBtn = document.getElementById("home");
const reloadBtn = document.getElementById("back");

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

let lastUrl = "";

async function ensureTransport() {
  const wispUrl =
    (location.protocol === "https:" ? "wss" : "ws") +
    "://" +
    location.host +
    "/wisp/";
  if ((await connection.getTransport()) !== "/epoxy/index.mjs") {
    await connection.setTransport("/epoxy/index.mjs", [{ wisp: wispUrl }]);
  }
}

async function go(value) {
  error.textContent = "";
  errorCode.textContent = "";
  status.textContent = "starting…";
  try {
    await registerSW();
    await ensureTransport();
  } catch (err) {
    status.textContent = "";
    error.textContent = "Failed to start the proxy.";
    errorCode.textContent = err.toString();
    throw err;
  }

  const url = search(value, searchEngine.value);
  lastUrl = url;
  status.textContent = "loading…";
  document.body.classList.add("loaded");
  frame.src = __uv$config.prefix + __uv$config.encodeUrl(url);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (address.value.trim()) go(address.value.trim());
});
goBtn.addEventListener("click", () => {
  if (address.value.trim()) go(address.value.trim());
});
reloadBtn.addEventListener("click", () => {
  if (lastUrl) frame.src = __uv$config.prefix + __uv$config.encodeUrl(lastUrl);
});
homeBtn.addEventListener("click", () => {
  document.body.classList.remove("loaded");
  frame.src = "about:blank";
  status.textContent = "";
  address.focus();
});

frame.addEventListener("load", () => {
  if (document.body.classList.contains("loaded")) status.textContent = "";
});
