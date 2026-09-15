"use strict";
function search(input, template) {
  input = input.trim();
  if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^[^/\s]+:\d+(?:[/?#]|$)/.test(input)) {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS addresses are supported.");
    return url.href;
  }
  if (!/\s/.test(input)) {
    try {
      const url = new URL("https://" + input);
      if (url.hostname.includes(".") || url.hostname === "localhost") return url.href;
    } catch {}
  }
  return template.replace("%s", encodeURIComponent(input));
}
