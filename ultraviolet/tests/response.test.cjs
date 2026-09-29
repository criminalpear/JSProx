const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const origin = "http://localhost:8080";
const context = vm.createContext({
  URL,
  TextEncoder,
  Headers,
  Response,
  TransformStream,
  self: { location: { origin } },
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/console-response.js"), "utf8"), context);
test("video documents keep their native navigation handlers", async () => {
  for (const remote of [
    "https://www.youtube.com/",
    "https://www.youtube.com/results?search_query=a%22b",
    "https://m.youtube.com/watch?v=test",
    "https://www.youtube.com/embed/test",
    "https://www.youtube.com.evil.example/watch?v=test",
    "https://example.com/",
  ]) {
    const result = await context.withConsole(
      new Response("<html>fixture</html>", { headers: { "content-type": "text/html" } }),
      { destination: "iframe", url: origin + "/service/" + encodeURIComponent(remote) },
    );
    const html = await result.text();
    assert.equal(html.includes("/youtube-compat.js"), false, remote);
    assert.ok(html.includes("/inject.js"));
  }
  const response = new Response("video bytes", { headers: { "content-type": "video/mp4" } });
  assert.equal(
    await context.withConsole(response, {
      destination: "video",
      url: origin + "/service/" + encodeURIComponent("https://www.youtube.com/watch?v=test"),
    }),
    response,
  );
});

test("form target compatibility loads before site scripts", async () => {
  const response = new Response(
    "<!doctype html><html><head><script>site()</script></head><body></body></html>",
    { headers: { "content-type": "text/html" } },
  );
  const html = await (
    await context.withConsole(response, {
      destination: "iframe",
      url: origin + "/service/" + encodeURIComponent("https://login.live.com/"),
    })
  ).text();
  assert.ok(html.indexOf("/form-target-compat.js") < html.indexOf("site()"));
});
test("early injection preserves bytes and doctype across split head tags", async () => {
  const text =
    '<!doctype html>\n<html><head data-test="é"><script>site()</script></head><body>🎮</body></html>';
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream({
    start(c) {
      for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
      c.close();
    },
  });
  const result = await new Response(
    context.injectPageScripts(stream, "<script>compat()</script>", "TAIL"),
  ).text();
  assert.equal(result, text.replace("<script>site()", "<script>compat()</script><script>site()") + "TAIL");
});
test("missing or very late head keeps bounded fallback and original content", async () => {
  for (const text of ["fragment", "x".repeat(9000) + "<head></head>"]) {
    assert.equal(
      await new Response(context.injectPageScripts(new Response(text).body, "EARLY", "TAIL")).text(),
      text + "EARLYTAIL",
    );
  }
});
test("HTML documents of any status receive page scripts", () => {
  const html = { "content-type": "text/html; charset=utf-8" };
  const check = (destination, status, type, body = "x") =>
    context.injectsPageScripts(
      { destination },
      new Response(status === 204 ? null : body, { status, headers: { "content-type": type } }),
    );
  assert.equal(check("document", 200, html["content-type"]), true);
  assert.equal(check("iframe", 200, "text/html"), true);
  assert.equal(check("document", 404, "text/html"), true);
  assert.equal(check("document", 500, "text/html"), true);
  assert.equal(check("document", 200, "application/pdf"), false);
  assert.equal(check("script", 200, "text/html"), false);
});
test("top-level documents start with the dashboard transport preference", async () => {
  const page = () =>
    new Response("<!doctype html><html><head></head><body></body></html>", {
      headers: { "content-type": "text/html" },
    });
  const request = {
    destination: "document",
    url: origin + "/service/" + encodeURIComponent("https://example.com/"),
  };
  assert.match(await (await context.withConsole(page(), request)).text(), /data-transport="libcurl"/);
  const stored = new Map();
  context.caches = {
    async open() {
      return {
        async match(key) {
          return stored.get(key);
        },
      };
    },
  };
  try {
    stored.set("/__jsprox/prefs", new Response(JSON.stringify({ transport: "epoxy" })));
    assert.match(await (await context.withConsole(page(), request)).text(), /data-transport="epoxy"/);
    stored.set("/__jsprox/prefs", new Response("not json"));
    assert.match(await (await context.withConsole(page(), request)).text(), /data-transport="libcurl"/);
    const frameHtml = await (await context.withConsole(page(), { ...request, destination: "iframe" })).text();
    assert.equal(frameHtml.includes("transport-bootstrap.js"), false);
  } finally {
    delete context.caches;
  }
});
