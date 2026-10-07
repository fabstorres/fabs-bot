/** Tailnet privacy rules shared by control-fabs (Bun) and the browser driver (Node). */
const RULES = [
  [/token=[\w-]+/g, "token=<redacted>"],
  [/\b[\w-]+\.[\w-]+\.ts\.net\b/g, "<pc>.<tailnet>.ts.net"],
  [/\b100\.(\d{1,3}\.){2}\d{1,3}\b/g, "<tailnet-ip>"],
  [/fd7a:115c:a1e0:[0-9a-f:]+/gi, "<tailnet-ip6>"],
];
const PLACEHOLDERS = RULES.map(([, placeholder]) => placeholder);
const IDENTIFYING = /\.ts\.net\b|\b100\.(\d{1,3}\.){2}\d{1,3}\b|fd7a:115c:a1e0:|token=[\w-]{8,}|\bfabs_token=/i;

/** Replace tailnet hostnames, tailnet IPs and pairing tokens with placeholders. */
export function redact(text) {
  return RULES.reduce((out, [pattern, placeholder]) => out.replace(pattern, placeholder), String(text));
}

/** Whether text still holds tailnet identity once our own placeholders are set aside. */
export function risky(text) {
  return IDENTIFYING.test(PLACEHOLDERS.reduce((out, placeholder) => out.replaceAll(placeholder, ""), String(text)));
}
