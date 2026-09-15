/* Floating JS console injected into every proxied page.
   Runs in the page's own (proxied, same-origin) context, so it can touch the real DOM.
   Toggle: Ctrl+` (backtick), or the round button in the corner. */
(function () {
  if (window.__injectedConsole) return;
  window.__injectedConsole = true;

  var host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';
  (document.body || document.documentElement).appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  var css = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:Consolas,"Courier New",monospace}',
    '.btn{position:fixed;right:14px;bottom:14px;width:44px;height:44px;border-radius:50%;',
    '  background:#0e639c;color:#fff;border:0;cursor:pointer;font-size:18px;z-index:2}',
    '.btn:hover{background:#1177bb}',
    '.panel{position:fixed;right:14px;bottom:68px;width:min(520px,92vw);height:min(60vh,460px);',
    '  background:#1e1e1e;color:#d4d4d4;border:1px solid #3c3c3c;border-radius:8px;',
    '  display:none;flex-direction:column;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.5);font-size:13px}',
    '.panel.open{display:flex}',
    '.head{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#252526;border-bottom:1px solid #3c3c3c}',
    '.head b{font-weight:600;font-size:12px}',
    '.head .hint{color:#808080;font-size:11px;margin-left:auto}',
    '.head button{background:#1e1e1e;color:#d4d4d4;border:1px solid #3c3c3c;border-radius:4px;',
    '  padding:2px 8px;cursor:pointer;font-size:11px}',
    '.out{flex:1;overflow-y:auto;padding:6px 10px;white-space:pre-wrap;word-break:break-word}',
    '.line{padding:1px 0;border-bottom:1px solid #2a2a2a}',
    '.m{color:#808080;user-select:none;margin-right:6px}',
    '.in .m{color:#569cd6}.res .m{color:#b5cea8}.res{color:#b5cea8}',
    '.log{color:#d4d4d4}.error{color:#f48771}.warn{color:#dcdcaa}.info{color:#569cd6}',
    '.bar{display:flex;align-items:flex-end;border-top:1px solid #3c3c3c;background:#252526}',
    '.bar .m{padding:8px 4px 8px 10px;color:#569cd6}',
    'textarea{flex:1;background:transparent;color:#d4d4d4;border:0;outline:none;resize:none;',
    '  font-family:inherit;font-size:13px;padding:8px 10px 8px 0;line-height:1.4;min-height:34px;max-height:140px}',
    '.run{margin:6px;align-self:stretch;background:#0e639c;color:#fff;border:0;border-radius:5px;',
    '  padding:0 16px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;white-space:nowrap}',
    '.run:hover{background:#1177bb}'
  ].join('\n');

  var wrap = document.createElement('div');
  wrap.innerHTML =
    '<style>' + css + '</style>' +
    '<button class="btn" title="Toggle console (Ctrl+`)">&gt;_</button>' +
    '<div class="panel">' +
      '<div class="head"><b>JSProx Console</b>' +
        '<span class="hint">Enter run · Shift+Enter newline · ↑/↓ history</span>' +
        '<button class="clr">Clear</button></div>' +
      '<div class="out"></div>' +
      '<div class="bar"><span class="m">&gt;</span>' +
        '<textarea rows="1" spellcheck="false" placeholder="run JS in this page…"></textarea>' +
        '<button class="run" title="Execute (Enter)">Execute</button></div>' +
    '</div>';
  root.appendChild(wrap);

  var btn = wrap.querySelector('.btn');
  var panel = wrap.querySelector('.panel');
  var out = wrap.querySelector('.out');
  var cmd = wrap.querySelector('textarea');
  var runBtn = wrap.querySelector('.run');
  var clr = wrap.querySelector('.clr');
  var history = [], hi = -1;

  function print(cls, marker, text) {
    var line = document.createElement('div');
    line.className = 'line ' + cls;
    if (marker) {
      var m = document.createElement('span');
      m.className = 'm'; m.textContent = marker; line.appendChild(m);
    }
    var s = document.createElement('span'); s.textContent = text; line.appendChild(s);
    out.appendChild(line); out.scrollTop = out.scrollHeight;
  }

  function stringify(v) {
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.stack || (v.name + ': ' + v.message);
    if (typeof v === 'function') return v.toString();
    if (v && v.nodeType) return '<' + v.nodeName.toLowerCase() + '> ' + (v.outerHTML || '').slice(0, 200);
    try {
      return JSON.stringify(v, function (k, val) {
        if (typeof val === 'function') return '[Function: ' + (val.name || 'anon') + ']';
        if (val === undefined) return '[undefined]';
        return val;
      }, 2);
    } catch (e) { return String(v); }
  }

  ['log', 'info', 'warn', 'error'].forEach(function (fn) {
    var orig = console[fn] ? console[fn].bind(console) : function () {};
    console[fn] = function () {
      var args = Array.prototype.slice.call(arguments);
      print(fn === 'log' ? 'log' : fn, '', args.map(stringify).join(' '));
      orig.apply(null, args);
    };
  });
  window.addEventListener('error', function (e) {
    print('error', '', 'Uncaught ' + (e.error ? (e.error.stack || e.error) : e.message));
  });
  window.addEventListener('unhandledrejection', function (e) {
    print('error', '', 'Uncaught (in promise) ' + stringify(e.reason));
  });

  function run(code) {
    print('in', '>', code);
    if (code.trim()) { history.push(code); hi = history.length; }
    try {
      var result = (0, eval)(code);
      if (result instanceof Promise) {
        print('res', '<', 'Promise { <pending> }');
        result.then(function (v) { print('res', '<', stringify(v)); },
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
    if (open) cmd.focus();
  }

  function execute() {
    var code = cmd.value; if (!code.trim()) return;
    cmd.value = ''; autosize(); run(code); cmd.focus();
  }

  btn.addEventListener('click', function () { toggle(); });
  runBtn.addEventListener('click', execute);
  clr.addEventListener('click', function () { out.innerHTML = ''; cmd.focus(); });
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
