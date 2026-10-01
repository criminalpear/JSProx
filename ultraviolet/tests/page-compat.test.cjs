const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const source = (name) => fs.readFileSync(path.join(__dirname, "../public", name), "utf8");

test("view transitions are hidden from proxied pages", () => {
  class Document {}
  Document.prototype.startViewTransition = () => "animated";
  const context = vm.createContext({ Document });
  vm.runInContext(source("view-transition-compat.js"), context);
  assert.equal("startViewTransition" in Document.prototype, false);
});

function keyboardWorld({ framed, crossOrigin = false }) {
  const calls = [];
  const topKeyboard = {
    lock: (...args) => (calls.push(["lock", ...args]), Promise.resolve("top")),
    unlock: () => calls.push(["unlock"]),
  };
  const topWindow = { frameElement: null, navigator: { keyboard: topKeyboard } };
  const dashboard = { frameElement: { ownerDocument: { defaultView: topWindow } } };
  class Keyboard {
    lock() {
      return Promise.reject(new Error("must be called from a primary top-level browsing context"));
    }
    unlock() {
      calls.push(["native unlock"]);
    }
  }
  const self = {};
  if (framed) {
    const frameElement = { ownerDocument: { defaultView: dashboard } };
    Object.defineProperty(self, "frameElement", {
      get() {
        if (crossOrigin) throw new Error("SecurityError");
        return frameElement;
      },
    });
  } else self.frameElement = null;
  const context = vm.createContext(self);
  context.window = context;
  context.Keyboard = Keyboard;
  vm.runInContext(source("keyboard-lock-compat.js"), context);
  return { Keyboard, calls };
}

test("framed pages take keyboard lock through the real top-level page", async () => {
  const { Keyboard, calls } = keyboardWorld({ framed: true });
  assert.equal(await new Keyboard().lock(["Escape", "KeyW"]), "top");
  new Keyboard().unlock();
  assert.deepEqual(calls, [["lock", ["Escape", "KeyW"]], ["unlock"]]);
});

test("top-level and cross-origin-framed pages keep the native keyboard lock", async () => {
  for (const options of [{ framed: false }, { framed: true, crossOrigin: true }]) {
    const { Keyboard, calls } = keyboardWorld(options);
    await assert.rejects(() => new Keyboard().lock(["Escape"]), /top-level/);
    assert.deepEqual(calls, []);
  }
});
