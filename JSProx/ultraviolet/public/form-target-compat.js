// Some sign-in forms submit to _top. In JSProx that is the dashboard, so the
// submission loses the proxy frame and its connection. Keep those forms in the
// registered main frame instead.
(() => {
  let frame;
  try { frame = window.frameElement; } catch { return; }
  if (!frame || frame.id !== 'uv-frame') return;

  function keepInFrame(form, submitter) {
    if (form?.tagName === 'FORM' && /^_top$/i.test(form.getAttribute('target') || '')) {
      form.target = '_self';
    }
    if (submitter && /^_top$/i.test(submitter.getAttribute('formtarget') || '')) {
      submitter.formTarget = '_self';
    }
  }

  document.addEventListener('submit', event => keepInFrame(event.target, event.submitter), true);
  const submit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function (...args) {
    keepInFrame(this);
    return submit.apply(this, args);
  };
})();
