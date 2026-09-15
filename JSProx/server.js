'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const express = require('express');
const Unblocker = require('unblocker');

const PORT = process.env.PORT || 8080;
const PREFIX = '/proxy/';

// The console UI/logic that gets injected into every proxied HTML page.
const injectScript = fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8');

// Response middleware: buffer HTML responses and splice the console in before </body>.
function injectConsole(data) {
  const ct = data.contentType || '';
  if (ct.indexOf('text/html') === -1) return;

  let buffer = '';
  const tf = new Transform({
    decodeStrings: false,
    transform(chunk, enc, cb) {
      buffer += chunk.toString('utf8');
      cb();
    },
    flush(cb) {
      const tag = '\n<script data-injected-console>\n' + injectScript + '\n</script>\n';
      const idx = buffer.toLowerCase().lastIndexOf('</body>');
      if (idx !== -1) {
        buffer = buffer.slice(0, idx) + tag + buffer.slice(idx);
      } else {
        buffer += tag;
      }
      this.push(buffer);
      cb();
    }
  });

  data.stream = data.stream.pipe(tf);
}

const unblocker = new Unblocker({
  prefix: PREFIX,
  requestMiddleware: [],
  responseMiddleware: [injectConsole]
});

const app = express();

// Landing page: enter a URL to proxy.
app.get('/', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>JSProx</title>
<style>
  body { background:#1e1e1e; color:#d4d4d4; font-family:Consolas,monospace;
         display:flex; min-height:100vh; margin:0; align-items:center; justify-content:center; }
  .box { width:min(560px,90vw); }
  h1 { font-size:20px; font-weight:600; }
  p { color:#808080; font-size:13px; line-height:1.5; }
  form { display:flex; gap:8px; margin:18px 0 10px; }
  input { flex:1; background:#252526; color:#d4d4d4; border:1px solid #3c3c3c;
          border-radius:6px; padding:10px 12px; font:inherit; }
  input:focus { outline:none; border-color:#569cd6; }
  button { background:#0e639c; color:#fff; border:0; border-radius:6px;
           padding:10px 18px; font:inherit; cursor:pointer; }
  button:hover { background:#1177bb; }
  code { color:#b5cea8; }
</style></head><body>
<div class="box">
  <h1>JSProx</h1>
  <p>Enter a site to load it through this proxy. A floating console is injected into
     every page — toggle it with <code>Ctrl</code>+<code>\`</code> (backtick) and run JS in
     the real page's context.</p>
  <form onsubmit="event.preventDefault();var u=this.u.value.trim();if(!u)return;if(!/^https?:\\/\\//.test(u))u='https://'+u;location.href='${PREFIX}'+u;">
    <input name="u" placeholder="example.com" autofocus spellcheck="false">
    <button>Load</button>
  </form>
  <p>Note: sites with strong anti-proxy defenses (e.g. Google login) may refuse to work.</p>
</div>
</body></html>`);
});

app.use(unblocker);

const server = http.createServer(app);
// node-unblocker needs the upgrade event for WebSocket-based sites.
server.on('upgrade', unblocker.onUpgrade);

server.listen(PORT, () => {
  console.log(`JSProx running:  http://localhost:${PORT}`);
  console.log(`Proxy a site directly:     http://localhost:${PORT}${PREFIX}https://example.com`);
});
