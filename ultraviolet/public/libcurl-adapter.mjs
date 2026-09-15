import LibcurlTransport from "/libcurl/index.mjs";

// libcurl-transport 1.5.0 constructs HTTPSession before its embedded WASM
// necessarily finishes loading. Serialize initialization and retry only this
// pre-request readiness error; never retry a network request here.
export default class JSProxLibcurl extends LibcurlTransport {
  init() {
    if (!this.initializing) {
      this.initializing = this.initializeWhenReady().finally(() => {
        this.initializing = null;
      });
    }
    return this.initializing;
  }

  async initializeWhenReady() {
    const deadline = Date.now() + 15000;
    while (true) {
      try {
        await super.init();
        return;
      } catch (error) {
        if (!String(error.message).includes("wasm not loaded yet") || Date.now() >= deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
  }
}
