"use strict";
// Back/forward list for the dashboard's proxied frame. Kept free of DOM access
// so the ordering rules can be unit tested.
//
// A back/forward step only moves the index once the frame actually loads, and
// the loaded URL replaces that entry. A redirect (http -> https, trailing slash)
// therefore updates the entry instead of discarding the forward history.
function createNavHistory(limit = 100) {
  const entries = [];
  let index = -1;
  let pending = null;
  return {
    get index() {
      return index;
    },
    get entries() {
      return entries.slice();
    },
    canGoBack() {
      return index > 0;
    },
    canGoForward() {
      return index < entries.length - 1;
    },
    // The entry a back (-1) or forward (+1) step would open, or null.
    target(delta) {
      const next = index + delta;
      return next >= 0 && next < entries.length ? { index: next, url: entries[next] } : null;
    },
    // A navigation to an existing entry has started.
    expect(entryIndex) {
      pending = entryIndex;
    },
    // A navigation that is not a back/forward step has started (or was abandoned).
    cancel() {
      pending = null;
    },
    // The frame finished loading url.
    record(url) {
      if (pending !== null && pending < entries.length) {
        index = pending;
        pending = null;
        entries[index] = url;
        return;
      }
      pending = null;
      if (entries[index] === url) return;
      entries.splice(index + 1);
      entries.push(url);
      if (entries.length > limit) entries.splice(0, entries.length - limit);
      index = entries.length - 1;
    },
  };
}
