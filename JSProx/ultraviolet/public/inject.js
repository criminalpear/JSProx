/* Floating JS console injected into every proxied page.
   Runs in the page's own (proxied, same-origin) context, so it can touch the real DOM.
   Toggle: Ctrl+` (backtick), or the Console button in the corner. */
(function () {
  // The service worker appends this script to every proxied HTML response.
  // Keep it on the outer page only: nested game/login iframes would otherwise
  // each add a launcher and intercept their own high-volume logs.
  function isMainProxiedDocument() {
    try {
      if (window.top === window) return true;
      var client = window[Symbol.for('scramjet client global')];
      var frame = client && client.descriptors
        ? client.descriptors.get('window.frameElement', client.global)
        : window.frameElement;
      // The app shell's direct browsing frame keeps this stable identifier.
      // It is also preserved through Scramjet's virtual frame element proxy.
      return frame ? frame.id === 'uv-frame' : !client;
    } catch (_) {
      // If a virtual or cross-origin frame prevents inspection, do not inject
      // into it; the outer proxied document remains the useful console host.
      return false;
    }
  }

  if (!isMainProxiedDocument()) return;
  // This is deliberately best-effort: proxied frames can have isolated storage.
  var settings = {};
  try { settings = JSON.parse(localStorage.getItem('jsprox.settings') || '{}') || {}; } catch (_) {}
  if (settings.consoleEnabled === false) return;
  if (window.__injectedConsole) return;
  window.__injectedConsole = true;

  var host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';
  (document.body || document.documentElement).appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  var css = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:Consolas,"Courier New",monospace}',
    '.btn{position:fixed;right:16px;bottom:16px;display:inline-flex;align-items:center;gap:8px;min-width:112px;height:43px;padding:0 15px;',
    '  border:1px solid #55d4af;border-radius:999px;background:linear-gradient(135deg,#153d35,#0b2621);color:#e8fff7;',
    '  box-shadow:0 8px 24px rgba(1,20,15,.38),inset 0 1px rgba(255,255,255,.09);cursor:pointer;font-size:12px;font-weight:700;letter-spacing:.03em;z-index:2;transition:transform .15s,box-shadow .15s}',
    '.btn:hover{background:linear-gradient(135deg,#1d5749,#10382f);box-shadow:0 11px 28px rgba(1,20,15,.48),0 0 0 3px rgba(85,212,175,.15);transform:translateY(-1px)}',
    '.btn:focus-visible,.head button:focus-visible,.tools select:focus-visible,.run:focus-visible,textarea:focus-visible{outline:2px solid #7af0cb;outline-offset:2px}',
    '.btn.is-open{background:#071814;color:#90f7d6}',
    '.launcher-icon{font-size:16px;line-height:1;color:#8df4d2;font-family:inherit;letter-spacing:-.15em}',
    '.panel{position:fixed;right:14px;bottom:68px;width:min(520px,92vw);height:min(60vh,460px);min-width:300px;min-height:180px;resize:both;',
    '  background:#101a18;color:#dbece6;border:1px solid #356257;border-radius:12px;',
    '  display:none;flex-direction:column;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.48),0 0 0 1px rgba(120,238,200,.06);font-size:13px}',
    '.panel.open{display:flex}',
    '.head{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;padding:8px 10px;background:linear-gradient(90deg,#152a25,#10201c);border-bottom:1px solid #2c5147}',
    '.head b{font-weight:700;font-size:12px;letter-spacing:.04em;color:#ecfff8}',
    '.head .hint{color:#82a69a;font-size:10px;margin-left:auto}',
    '.head button,.tools select{background:#152723;color:#cce4dc;border:1px solid #31574d;border-radius:6px;',
    '  padding:3px 7px;cursor:pointer;font-size:11px;line-height:1.2}',
    '.head button:hover{background:#21443a;border-color:#4a8b78;color:#effff9}',
    '.close{font-size:15px!important;line-height:.8!important;padding:3px 6px!important;color:#9fc5b8!important}',
    '.out{flex:1;overflow-y:auto;padding:8px 10px;white-space:pre-wrap;word-break:break-word;background:#0d1715}',
    '.line{padding:3px 0;border-bottom:1px solid rgba(95,145,129,.13)}',
    '.m{color:#6f9789;user-select:none;margin-right:6px}',
    '.in .m{color:#75e1bd}.res .m{color:#8eebb8}.res{color:#b9f0cf}',
    '.log{color:#d4e1dc}.error{color:#ff9b8d}.warn{color:#f1d486}.info{color:#82c9ec}',
    '.bar{display:flex;align-items:flex-end;border-top:1px solid #2c5147;background:#12231f}',
    '.bar .m{padding:8px 4px 8px 10px;color:#75e1bd}',
    'textarea{flex:1;background:transparent;color:#e3f4ee;border:0;outline:none;resize:none;',
    '  font-family:inherit;font-size:13px;padding:8px 10px 8px 0;line-height:1.4;min-height:34px;max-height:140px}',
    '.run{margin:6px;align-self:stretch;background:#2d9f7c;color:#061812;border:0;border-radius:7px;',
    '  padding:0 16px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:800;white-space:nowrap}',
    '.run:hover{background:#63d8b3}',
    '.tools{display:flex;align-items:center;flex-wrap:wrap;justify-content:flex-end;gap:5px;margin-left:auto}',
    '.tools label{color:#aaa;font-size:11px;white-space:nowrap;cursor:pointer}',
    '.tools input{vertical-align:middle;margin:0 3px 0 0;accent-color:#62d8b3}',
    '.tools select{max-width:76px;padding:3px 4px;color:#a8c8bd}',
    '.resize-note{color:#4f7167;font-size:10px;padding:0 6px;white-space:nowrap}',
    '@media (max-width:480px){.head .hint{display:none}.head{gap:4px}.tools{gap:3px}.head button{padding:2px 5px}}'
  ].join('\n');

  var wrap = document.createElement('div');
  wrap.innerHTML =
    '<style>' + css + '</style>' +
    '<button class="btn" title="Toggle console (Ctrl+`)" aria-label="Open JSProx console" aria-expanded="false" aria-controls="jsprox-console"><span class="launcher-icon">&lt;/&gt;</span><span>Console</span></button>' +
    '<div class="panel" id="jsprox-console" role="dialog" aria-label="JSProx Console">' +
      '<div class="head"><b>JSProx Console</b>' +
        '<span class="hint">Enter run · Shift+Enter newline · ↑/↓ history</span>' +
        '<div class="tools"><label title="Allow top-level await by running in an async function"><input class="async" type="checkbox">Await</label>' +
        '<button class="load" title="Load a JavaScript file into the editor">Import</button>' +
        '<button class="save" title="Download the visible console output">Export</button>' +
        '<select class="filter" aria-label="Filter page logs" title="Filter page logs"><option value="">All logs</option><option value="error">Errors</option><option value="warn">Warnings</option></select>' +
        '<button class="clr">Clear</button><button class="close" title="Close console" aria-label="Close console">×</button></div></div>' +
      '<div class="out"></div>' +
      '<div class="bar"><span class="m">&gt;</span>' +
        '<textarea rows="1" spellcheck="false" placeholder="run JS in this page…"></textarea>' +
        '<button class="run" title="Execute (Enter)">Execute</button><span class="resize-note" title="Drag the lower-right corner to resize">↘</span></div>' +
      '<input class="file" type="file" accept=".js,.mjs,text/javascript,application/javascript" hidden>' +
    '</div>';
  root.appendChild(wrap);

  var btn = wrap.querySelector('.btn');
  btn.style.display = 'none';
  var panel = wrap.querySelector('.panel');
  var out = wrap.querySelector('.out');
  var cmd = wrap.querySelector('textarea');
  var runBtn = wrap.querySelector('.run');
  var clr = wrap.querySelector('.clr');
  var close = wrap.querySelector('.close');
  var filter = wrap.querySelector('.filter');
  var asyncMode = wrap.querySelector('.async');
  var load = wrap.querySelector('.load');
  var save = wrap.querySelector('.save');
  var file = wrap.querySelector('.file');
  var history = [], hi = -1;
  var MAX_LINES = 500, MAX_HISTORY = 100;
  var lineCount = 0, scrollPending = false;

  function isOpen() {
    return panel.classList.contains('open');
  }

  function applyFilterToLine(line) {
    var type = filter.value;
    // Commands and results remain visible so filtered logs still have context.
    line.hidden = !!type && !line.classList.contains(type) &&
      !line.classList.contains('in') && !line.classList.contains('res');
  }

  function scheduleScroll() {
    if (scrollPending) return;
    scrollPending = true;
    (window.requestAnimationFrame || function (callback) { return setTimeout(callback, 16); })(function () {
      out.scrollTop = out.scrollHeight;
      scrollPending = false;
    });
  }

  function updateLogFilter() {
    Array.prototype.forEach.call(out.querySelectorAll('.line'), function (line) {
      applyFilterToLine(line);
    });
  }

  function print(cls, marker, text) {
    var line = document.createElement('div');
    line.className = 'line ' + cls;
    if (marker) {
      var m = document.createElement('span');
      m.className = 'm'; m.textContent = marker; line.appendChild(m);
    }
    var s = document.createElement('span'); s.textContent = text; line.appendChild(s);
    out.appendChild(line); lineCount++;
    applyFilterToLine(line);
    if (lineCount > MAX_LINES) { out.removeChild(out.firstChild); lineCount--; }
    if (isOpen()) scheduleScroll();
  }

  function printPageLog(cls, marker, text) {
    // Do not stringify, create nodes, or force layout for noisy page logs
    // until someone has actually opened the console.
    if (isOpen()) print(cls, marker, text);
  }

  function stringify(v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'string') return v;
    if (typeof v === 'bigint') return String(v) + 'n';
    if (typeof v === 'symbol') return String(v);
    if (v instanceof Error) return v.stack || (v.name + ': ' + v.message);
    if (typeof v === 'function') return v.toString();
    if (v && v.nodeType) return '<' + v.nodeName.toLowerCase() + '> ' + (v.outerHTML || '').slice(0, 200);
    var hasWeakSet = typeof WeakSet === 'function';
    var seen = hasWeakSet ? new WeakSet() : [];
    try {
      return JSON.stringify(v, function (k, val) {
        if (typeof val === 'function') return '[Function: ' + (val.name || 'anon') + ']';
        if (val === undefined) return '[undefined]';
        if (typeof val === 'bigint') return String(val) + 'n';
        if (typeof val === 'symbol') return String(val);
        if (val && typeof val === 'object') {
          var alreadySeen = hasWeakSet ? seen.has(val) : seen.indexOf(val) !== -1;
          if (alreadySeen) return '[Circular]';
          if (hasWeakSet) seen.add(val); else seen.push(val);
        }
        return val;
      }, 2);
    } catch (e) {
      try { return String(v); } catch (_) { return '[Unprintable value]'; }
    }
  }

  if (settings.consoleCapture !== false) {
    ['log', 'info', 'warn', 'error'].forEach(function (fn) {
      var orig = console[fn] ? console[fn].bind(console) : function () {};
      console[fn] = function () {
        orig.apply(null, arguments);
        if (!isOpen()) return;
        var args = Array.prototype.slice.call(arguments);
        // Logging a page object must not break the page if it has throwing getters.
        try { printPageLog(fn === 'log' ? 'log' : fn, '', args.map(stringify).join(' ')); } catch (_) {}
      };
    });
    window.addEventListener('error', function (e) {
      if (isOpen()) printPageLog('error', '', 'Uncaught ' + (e.error ? (e.error.stack || e.error) : e.message));
    });
    window.addEventListener('unhandledrejection', function (e) {
      if (isOpen()) printPageLog('error', '', 'Uncaught (in promise) ' + stringify(e.reason));
    });
  }

  function isThenable(value) {
    return value && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function';
  }

  function normaliseCode(code) {
    // Pasting a bookmarklet should behave like pasting its script, not throw a syntax error.
    return code.replace(/^\s*javascript\s*:/i, '');
  }

  function run(code) {
    code = normaliseCode(code);
    print('in', '>', code);
    if (code.trim()) {
      if (history[history.length - 1] !== code) history.push(code);
      if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
      hi = history.length;
    }
    try {
      // Keep normal mode as indirect global eval. Async mode is opt-in because its
      // function scope changes declarations, but lets users use top-level await.
      // Using an evaluated async wrapper also works through Scramjet's function
      // shims, where the AsyncFunction constructor is not callable as expected.
      var result = asyncMode.checked
        ? (0, eval)('(async function () {\n' + code + '\n})()')
        : (0, eval)(code);
      if (isThenable(result)) {
        print('res', '<', 'Promise { <pending> }');
        Promise.resolve(result).then(function (v) { print('res', '<', stringify(v)); },
                                     function (e) { print('error', '<', stringify(e)); });
      } else {
        print('res', '<', stringify(result));
      }
    } catch (err) {
      print('error', '<', err instanceof Error ? (err.stack || err.name + ': ' + err.message) : stringify(err));
    }
  }

  function autosize() { cmd.style.height = 'auto'; cmd.style.height = Math.min(cmd.scrollHeight, 140) + 'px'; }
  function toggle(force) {
    var open = force === undefined ? !panel.classList.contains('open') : force;
    panel.classList.toggle('open', open);
    btn.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close JSProx console' : 'Open JSProx console');
    if (open) cmd.focus();
  }
  window.__jsproxConsoleVisibility = function (visible) {
    btn.style.display = visible ? 'inline-flex' : 'none';
    if (!visible) toggle(false);
  };

  function execute() {
    var code = cmd.value; if (!code.trim()) return;
    cmd.value = ''; autosize(); run(code); cmd.focus();
  }

  btn.addEventListener('click', function () { toggle(); });
  runBtn.addEventListener('click', execute);
  clr.addEventListener('click', function () { out.innerHTML = ''; lineCount = 0; cmd.focus(); });
  close.addEventListener('click', function () { toggle(false); btn.focus(); });
  filter.addEventListener('change', updateLogFilter);
  load.addEventListener('click', function () { file.click(); });
  file.addEventListener('change', function () {
    var selected = file.files && file.files[0];
    if (!selected) return;
    var reader = new FileReader();
    reader.onload = function () {
      cmd.value = String(reader.result || ''); autosize(); cmd.focus();
      print('info', '', 'Loaded ' + selected.name + ' into the editor.');
    };
    reader.onerror = function () { print('error', '', 'Could not read ' + selected.name + '.'); };
    reader.readAsText(selected);
    file.value = '';
  });
  save.addEventListener('click', function () {
    var lines = Array.prototype.map.call(out.querySelectorAll('.line'), function (line) { return line.textContent; });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'jsprox-console-' + Date.now() + '.txt'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  });
  cmd.addEventListener('input', autosize);
  cmd.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      execute();
    } else if (e.key === 'ArrowUp' && cmd.selectionStart === 0 && hi > 0) {
      e.preventDefault(); hi--; cmd.value = history[hi]; autosize();
    } else if (e.key === 'ArrowDown' && cmd.selectionStart === cmd.value.length) {
      if (hi < history.length - 1) { e.preventDefault(); hi++; cmd.value = history[hi]; autosize(); }
      else if (hi === history.length - 1) { e.preventDefault(); hi = history.length; cmd.value = ''; autosize(); }
    }
  });
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey && (e.key === '`' || e.key === '~')) { e.preventDefault(); toggle(); }
  });

  print('info', '', 'Console injected on ' + location.host + '. Runs in this page. Ctrl+` to toggle.');
})();
