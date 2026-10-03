#!/usr/bin/env node
// Browser half of control-fabs. Runs under Node because Playwright's CDP websocket hangs under Bun.
// Invoked by `control-fabs browser <action>`; not meant to be called directly.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { createRequire } from "node:module";

const job = JSON.parse(process.env.FABS_BROWSER_JOB ?? "{}");
const require = createRequire(join(job.repo, "package.json"));
const { chromium } = require("playwright-core");

const { action, flags, positional } = job;
const flag = (k) => (typeof flags[k] === "string" ? flags[k] : undefined);
const die = (msg) => {
  console.error(`control-fabs browser: ${msg}`);
  process.exit(1);
};
const redact = (s) =>
  String(s)
    .replace(/token=[\w-]+/g, "token=<redacted>")
    .replace(/\b[\w-]+\.[\w-]+\.ts\.net\b/g, "<pc>.<tailnet>.ts.net")
    .replace(/\b100\.(\d{1,3}\.){2}\d{1,3}\b/g, "<tailnet-ip>");
const artifactPath = (p) => {
  const full = isAbsolute(p) ? p : join(job.artifacts, p);
  mkdirSync(dirname(full), { recursive: true });
  return full;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${job.cdpPort}`, { timeout: 10_000 });
try {
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(Number(flag("timeout") ?? 15) * 1000);
  // Headless window size != viewport, so pin the viewport on every connection.
  const [vw, vh] = job.viewport.split("x").map(Number);
  await page.setViewportSize({ width: vw, height: vh });
  // window.confirm/prompt: dismissed unless --accept-dialog (optionally with --dialog-text for prompts).
  page.on("dialog", (d) => (flags["accept-dialog"] === true ? d.accept(flag("dialog-text")) : d.dismiss()).catch(() => {}));
  const hasTarget = () => flag("role") || flag("label") || flag("text") || flag("selector");
  const target = () => {
    const name = flag("name");
    const exact = flags.exact === true;
    if (flag("role")) return page.getByRole(flag("role"), name ? { name, exact } : undefined);
    if (flag("label")) return page.getByLabel(flag("label"), { exact });
    if (flag("text")) return page.getByText(flag("text"), { exact });
    if (flag("selector")) return page.locator(flag("selector"));
    die("pick a target with --role R [--name N] | --label L | --text T | --selector S");
  };
  const pick = () => (flag("nth") ? target().nth(Number(flag("nth"))) : target().first());

  switch (action) {
    case "open": {
      const path = positional[0] ?? "/";
      const url = (flag("via") === "tailnet" ? job.tailnetBase ?? die("--via tailnet needs a --tailnet launch") : job.url) + path;
      await page.goto(url, { waitUntil: "load" });
      console.log(`opened ${redact(url)}`);
      break;
    }
    case "pair":
      if (!job.pairUrl) die("pairing needs a --tailnet launch with Tailscale running");
      await page.goto(job.pairUrl, { waitUntil: "load" });
      console.log("paired this browser over the tailnet");
      break;
    case "click":
      await pick().click();
      console.log("clicked");
      break;
    case "fill":
      await pick().fill(flag("value") ?? die("--value required"));
      console.log("filled");
      break;
    case "press": {
      const key = flag("key") ?? die("--key required");
      if (hasTarget()) await pick().press(key);
      else await page.keyboard.press(key);
      console.log("pressed");
      break;
    }
    case "wait": {
      const state = flag("state") ?? "visible";
      await pick().waitFor({ state, timeout: Number(flag("timeout") ?? 30) * 1000 });
      console.log(`ok  ${state}`);
      break;
    }
    case "count":
      console.log(await target().count());
      break;
    case "text":
      console.log(redact(await pick().innerText()));
      break;
    case "snapshot": {
      const out = artifactPath(flag("path") ?? die("--path required (relative to the run's artifacts)"));
      const root = hasTarget() ? pick() : page.locator("body");
      writeFileSync(out, `# ${redact(page.url())}  viewport=${job.viewport}\n${redact(await root.ariaSnapshot())}\n`);
      console.log(`→ ${out}`);
      break;
    }
    case "screenshot": {
      await page.evaluate(() => document.fonts.ready);
      await sleep(Number(flag("settle") ?? 700)); // let entrance animations finish
      const out = artifactPath(flag("path") ?? die("--path required (relative to the run's artifacts)"));
      // Mask machine identity by default: host chip (PC name), pairing QR and pairing link.
      const mask = flags["no-mask"] === true ? [] : [page.getByRole("button", { name: "This PC" }), page.locator(".pair-qr, .mono-box, .host-line")];
      await page.screenshot({ path: out, fullPage: flags["full-page"] === true, mask, maskColor: "#d9d9d4" });
      console.log(`→ ${out}`);
      break;
    }
    case "eval":
      console.log(redact(JSON.stringify(await page.evaluate(positional[0] ?? die("usage: browser eval '<js expression>'")), null, 2)));
      break;
    default:
      die(`unknown browser action ${action}`);
  }
} catch (err) {
  // One readable line instead of a stack: what was attempted and why it failed.
  console.error(`control-fabs browser ${action}: ${redact(String(err?.message ?? err).split("\n")[0])}`);
  process.exitCode = 1;
} finally {
  // Disconnect only: the headless browser keeps its page, cookies and window size for the next command.
  await browser.close().catch(() => {});
}
