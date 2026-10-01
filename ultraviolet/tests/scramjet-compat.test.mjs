import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { patchScramjetBundle } from "../src/scramjet-compat.js";
test("served URL rewriter preserves canonical proxy URLs and rewrites external URLs", () => {
  const source = patchScramjetBundle(readFileSync(join(scramjetPath, "scramjet.all.js"), "utf8"));
  const start = source.indexOf("function l(e,t){if(e instanceof URL)e=e.toString();");
  const fn = source.slice(start, source.indexOf("function c(e)", start));
  const context = vm.createContext({
    URL,
    location: { origin: "http://localhost:8080" },
    n: { $W: { prefix: "/service/" }, hD: encodeURIComponent },
    a: (u, b) => new URL(u, b),
  });
  vm.runInContext(fn, context);
  const meta = { base: new URL("https://github.com/login") };
  const canonical = "http://localhost:8080/service/" + encodeURIComponent("https://github.com/login");
  assert.equal(context.l(canonical, meta), canonical);
  assert.equal(context.l(context.l(canonical, meta), meta), canonical);
  assert.equal(context.l("https://github.com/login", meta), canonical);
  assert.equal(
    context.l("/session", meta),
    "http://localhost:8080/service/" + encodeURIComponent("https://github.com/session"),
  );
  assert.equal(
    context.l("https://other.example/service/x", meta),
    "http://localhost:8080/service/" + encodeURIComponent("https://other.example/service/x"),
  );
});
test("unknown bundles require explicit compatibility review", () =>
  assert.throws(() => patchScramjetBundle("changed bundle"), /needs review/));
test("BareMux SharedWorker stays on proxy origin inside virtual Microsoft pages", () => {
  const source = patchScramjetBundle(readFileSync(join(scramjetPath, "scramjet.all.js"), "utf8"));
  const start =
    source.indexOf('e.Proxy("SharedWorker",{construct(t){') + 'e.Proxy("SharedWorker",{construct(t){'.length;
  const guard = source.slice(start, source.indexOf("t.args[0]=(0,i.Oy)", start));
  const run = vm.runInNewContext("(t,e)=>{" + guard + "return false}", {});
  const actual = "https://proxy.example/baremux/worker.js?v=jsprox2";
  for (const input of [
    "/baremux/worker.js?v=jsprox2",
    "https://login.live.com/baremux/worker.js?v=jsprox2",
    actual,
  ]) {
    const target = {
      args: [input],
      call() {
        return this.args[0];
      },
      return(value) {
        return value;
      },
    };
    assert.equal(run(target, { global: { __jsproxProxyOrigin: "https://proxy.example" } }), actual);
  }
  const other = {
    args: ["https://game.example/worker.js"],
    call() {
      throw Error("Should not call native worker");
    },
  };
  assert.equal(run(other, { global: { __jsproxProxyOrigin: "https://proxy.example" } }), false);
  assert.equal(other.args[0], "https://game.example/worker.js");
});
test("document and loader base URLs preserve game paths and resolve relative base tags", () => {
  const source = patchScramjetBundle(readFileSync(join(scramjetPath, "scramjet.all.js"), "utf8"));
  const start =
    source.indexOf('e.Trap("Node.prototype.baseURI",{get') + 'e.Trap("Node.prototype.baseURI",{get'.length;
  const getter = "(function" + source.slice(start, source.indexOf(",set:", start)) + ")";
  const metaStart = source.indexOf("get base(){") + "get base".length;
  const metaGetter =
    "(function" + source.slice(metaStart, source.indexOf(",get topFrameName", metaStart)) + ")";
  const url = new URL("https://game.example/title/26/index.html");
  for (const [href, expected] of [
    [null, url.href],
    ["", url.href],
    ["assets/", "https://game.example/title/26/assets/"],
    ["/shared/", "https://game.example/shared/"],
    ["https://cdn.example/game/", "https://cdn.example/game/"],
  ]) {
    const base = href === null ? null : { getAttribute: () => href };
    class Document {
      querySelector(selector) {
        assert.equal(selector, "base[href]");
        return base;
      }
    }
    const doc = new Document();
    const context = vm.createContext({
      URL,
      Document,
      e: { url },
      d: { iswindow: true },
      t: {
        url,
        global: { document: doc },
        natives: { call: (name, target, selector) => target.querySelector(selector) },
      },
    });
    const getBase = vm.runInContext(getter, context),
      getMetaBase = vm.runInContext(metaGetter, context);
    assert.equal(getBase({ this: doc }), expected);
    assert.equal(getBase({ this: { ownerDocument: doc } }), expected);
    assert.equal(getMetaBase().href, expected);
  }
});
test("signed cookie values survive parsing and persisted cookies survive reload", () => {
  const source = patchScramjetBundle(readFileSync(join(scramjetPath, "scramjet.all.js"), "utf8"));
  // Exercise the actual bundled parser and cookie store, not a parser mock.
  const parserStart = source.indexOf("4322:function(e){") + "4322:".length;
  const parserText = source.slice(parserStart);
  const parserEnd = parserText.search(/},\d+:function/);
  const context = vm.createContext({ URL, console, module: { exports: {} } });
  vm.runInContext("(" + parserText.slice(0, parserEnd) + "})(module);const i=()=>module.exports;", context);
  const start = source.indexOf("class a{cookies={};setCookies");
  const end = source.indexOf("},1427:", start);
  vm.runInContext(source.slice(start, end) + ";globalThis.store=new a;", context);
  const url = new URL("https://github.com/login");
  context.store.setCookies(["session=abc%2Bdef%2Fghi%3D; Path=/; Secure; HttpOnly"], url);
  assert.equal(context.store.getCookies(url, false), "session=abc%2Bdef%2Fghi%3D");
  assert.equal(context.store.getCookies(url, true), "");
  const dump = context.store.dump();
  context.store.cookies = {};
  context.store.load(JSON.parse(dump));
  assert.equal(context.store.getCookies(url, false), "session=abc%2Bdef%2Fghi%3D");
  context.store.cookies = {};
  context.store.load(dump);
  assert.equal(context.store.getCookies(url, false), "session=abc%2Bdef%2Fghi%3D");
});
test("cookie store drops oversized cookies and honours Max-Age like a browser", () => {
  const source = patchScramjetBundle(readFileSync(join(scramjetPath, "scramjet.all.js"), "utf8"));
  const parserStart = source.indexOf("4322:function(e){") + "4322:".length;
  const parserText = source.slice(parserStart);
  const parserEnd = parserText.search(/},\d+:function/);
  let now = 1_000_000;
  const FakeDate = class extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  };
  const context = vm.createContext({ URL, console, Date: FakeDate, module: { exports: {} } });
  vm.runInContext("(" + parserText.slice(0, parserEnd) + "})(module);const i=()=>module.exports;", context);
  const start = source.indexOf("class a{cookies={};setCookies");
  const end = source.indexOf("},1427:", start);
  vm.runInContext(source.slice(start, end) + ";globalThis.store=new a;", context);
  const url = new URL("https://www.youtube.com/watch?v=x");

  // YouTube writes a ~110 KB ST-* navigation cookie; Chrome ignores it (name+value > 4096).
  context.store.setCookies(
    ["PREF=f6=40000000; Path=/", "ST-abc=" + "x".repeat(113000) + "; Path=/; Max-Age=5"],
    url,
  );
  assert.equal(context.store.getCookies(url, false), "PREF=f6=40000000");
  context.store.setCookies(["edge=" + "y".repeat(4091) + "; Path=/"], url);
  assert.match(context.store.getCookies(url, false), /edge=y{4091}/);

  // An oversized cookie saved by an older version is removed instead of sent.
  context.store.cookies[".www.youtube.com@/@ST-old"] = {
    name: "ST-old",
    value: "z".repeat(5000),
    domain: ".www.youtube.com",
    path: "/",
  };
  assert.doesNotMatch(context.store.getCookies(url, false), /ST-old/);
  assert.equal(Object.hasOwn(context.store.cookies, ".www.youtube.com@/@ST-old"), false);

  // Max-Age expiry (and deletion with Max-Age=0).
  context.store.setCookies(["ST-short=1; Path=/; Max-Age=5"], url);
  assert.match(context.store.getCookies(url, false), /ST-short=1/);
  now += 6000;
  assert.doesNotMatch(context.store.getCookies(url, false), /ST-short/);
  context.store.setCookies(["PREF=gone; Path=/; Max-Age=0"], url);
  assert.doesNotMatch(context.store.getCookies(url, false), /PREF/);
});
test("virtual storage enumerates account keys and clears only its origin", () => {
  const source = patchScramjetBundle(readFileSync(join(scramjetPath, "scramjet.all.js"), "utf8"));
  const start = source.indexOf("5289:function(e,t,r){function n(e,t){") + "5289:function(e,t,r){".length;
  const end = source.indexOf("r.r(t),r.d(t,{default:()=>n})", start);
  assert.ok(start > 20 && end > start);
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end) + ";globalThis.install=n;", context);
  function storage() {
    return {
      getItem(key) {
        return Object.hasOwn(this, key) ? this[key] : null;
      },
      setItem(key, value) {
        this[key] = String(value);
      },
      removeItem(key) {
        delete this[key];
      },
    };
  }
  const local = storage(),
    session = storage();
  const scope = { localStorage: local, sessionStorage: session };
  context.install({ url: new URL("https://www.xbox.com/play") }, scope);
  scope.localStorage.setItem("msal.account", "account-value");
  scope.localStorage.setItem("msal.token", "token-value");
  local.setItem("login.live.com@separate", "other-value");
  assert.equal(scope.localStorage.length, 2);
  assert.equal(scope.localStorage.key(0), "msal.account");
  assert.equal(scope.localStorage.key(1), "msal.token");
  assert.equal(scope.localStorage.key(2), null);
  assert.equal(scope.localStorage.getItem("msal.account"), "account-value");
  scope.sessionStorage.setItem("state", "pending");
  assert.equal(scope.sessionStorage.key(0), "state");
  scope.localStorage.clear();
  assert.equal(scope.localStorage.length, 0);
  assert.equal(local.getItem("login.live.com@separate"), "other-value");
});
test("referrer traversal terminates on self references and longer cycles", async () => {
  const source = patchScramjetBundle(readFileSync(join(scramjetPath, "scramjet.all.js"), "utf8"));
  const start = source.indexOf("let t=e.referrer,r=await self.clients.matchAll");
  const loop = source.slice(start, source.indexOf("}v?", start));
  for (const chain of [{ a: "a" }, { a: "b", b: "a" }, { a: "b", b: null }]) {
    let reads = 0;
    const context = vm.createContext({
      Set,
      e: { referrer: "/service/a" },
      self: {
        clients: {
          matchAll: async () =>
            Object.keys(chain).map((k) => ({ url: "/service/" + k, frameType: "nested" })),
        },
      },
      c: { $W: { prefix: "/service/" } },
      a: {
        Yq: async (url) => {
          assert.ok(++reads <= 3, "lookup must terminate");
          const next = chain[url.split("/").pop()];
          return next ? { referrer: "/service/" + next } : null;
        },
      },
      location: { origin: "http://localhost" },
      v: false,
    });
    await vm.runInContext("(async()=>{" + loop + "})()", context);
    assert.ok(reads <= 2);
  }
});
