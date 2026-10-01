const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
// The dashboard cloaks itself on open by default; these checks start from a
// normal tab unless they opt in, so default the setting off when unset.
const noAutoCloak = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("jsprox.settings") || "null");
    if (location.pathname === "/" && (!saved || saved.autoCloak === undefined))
      localStorage.setItem(
        "jsprox.settings",
        JSON.stringify({ ...(saved || { uiVersion: 3 }), autoCloak: false }),
      );
  } catch {}
};
(async () => {
  const server = spawn(process.execPath, ["src/index.js"], {
    env: { ...process.env, PORT: "8098" },
    windowsHide: true,
    stdio: "ignore",
  });
  const browser = await chromium.launch();
  try {
    await new Promise((r) => setTimeout(r, 1000));
    const context = await browser.newContext();
    await context.addInitScript(noAutoCloak);
    const page = await context.newPage();
    await page.goto("http://localhost:8098");
    await page.evaluate(() => {
      settings.tabTitle = "My tab";
      write("jsprox.settings", settings);
    });
    await page.click("#cloak-open");
    await page.click("#cloak-current", { noWaitAfter: true });
    await page.waitForURL("about:blank");
    await page.frameLocator("iframe").locator("#home-address").waitFor();
    await page.waitForTimeout(200);
    assert.equal(context.pages().length, 1);
    assert.equal(await page.title(), "My tab");
    assert.equal(
      await page
        .frameLocator("iframe")
        .locator("html")
        .evaluate(() => crossOriginIsolated),
      true,
    );
    console.log(
      "PASS manually opened current tab is replaced; helper closes; title and cross-origin isolation retained",
    );
    await page.goto("http://localhost:8098");
    await page.evaluate(() => (window.open = () => null));
    await page.click("#cloak-open");
    await page.click("#cloak-current");
    assert.equal(page.url(), "http://localhost:8098/");
    assert.match(await page.locator("#uv-status").textContent(), /Allow popups/);
    console.log("PASS blocked popup preserves original");

    // Default setting: opening JSProx turns the tab into about:blank right away,
    // carrying a #open= link along.
    const fresh = await browser.newContext();
    const opened = await fresh.newPage();
    await opened.goto("http://localhost:8098/#open=" + encodeURIComponent("https://example.com/"));
    await opened.waitForURL("about:blank");
    const wrapped = opened.frameLocator("iframe");
    await wrapped.locator("#home-address").waitFor();
    assert.match(await opened.locator("iframe").getAttribute("src"), /#open=https%3A%2F%2Fexample\.com/);
    await opened.waitForTimeout(300);
    assert.equal(fresh.pages().length, 1);
    console.log("PASS auto about:blank on open keeps the start link and closes its helper");

    // Popup blocked on load: cloak on the first click instead.
    const gesture = await browser.newContext();
    await gesture.addInitScript(() => {
      if (location.pathname !== "/" || window.top !== window) return;
      const open = window.open;
      window.open = function () {
        window.open = open; // only the on-load attempt is blocked
        return null;
      };
    });
    const later = await gesture.newPage();
    await later.goto("http://localhost:8098");
    assert.match(await later.locator("#auto-cloak-prompt").textContent(), /Click anywhere/);
    assert.equal(later.url(), "http://localhost:8098/");
    await later.mouse.click(600, 400, { noWaitAfter: true });
    await later.waitForURL("about:blank");
    await later.frameLocator("iframe").locator("#home-address").waitFor();
    console.log("PASS blocked on-load popup falls back to cloaking on the first click");
    // The prompt explains how to allow pop-ups; dismissing hides the steps next time.
    const steps = await gesture.newPage();
    await steps.goto("http://localhost:8098");
    assert.match(await steps.locator("#auto-cloak-prompt").textContent(), /Always allow pop-ups/);
    await steps.locator("#auto-cloak-dismiss").click({ noWaitAfter: true });
    await steps.waitForURL("about:blank");
    const again = await gesture.newPage();
    await again.goto("http://localhost:8098");
    assert.match(await again.locator("#auto-cloak-prompt").textContent(), /Click anywhere/);
    assert.equal(await again.locator("#auto-cloak-dismiss").count(), 0);
    console.log("PASS prompt shows pop-up steps until dismissed");
    await fresh.close();
    await gesture.close();
  } finally {
    server.kill();
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
