import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bot } from "../../shared/types";
import { cursor, opencode } from "./others";

const scratch = mkdtempSync(join(tmpdir(), "fabs-others-test-"));
const bin = join(scratch, "fake-cli");
const out = join(scratch, "prompt.txt");
writeFileSync(bin, `#!/bin/sh\nfor last; do :; done\nprintf '%s' "$last" > "$OUT"\n`);
chmodSync(bin, 0o755);

for (const provider of [cursor, opencode]) {
  test(`a resumed ${provider.label} turn still sends the current rules`, async () => {
    await provider.run(
      {
        bot: { model: "", autonomy: "ask" } as Bot,
        launch: { bin, args: [], env: { OUT: out } },
        prompt: "next message",
        systemPrompt: "current rules",
        sessionId: "existing-session",
        cwd: scratch,
        mcpUrl: "",
        connectors: [],
        addDirs: [],
        signal: new AbortController().signal,
      },
      () => {},
    );
    expect(readFileSync(out, "utf8")).toBe("<instructions>\ncurrent rules\n</instructions>\n\nnext message");
  });
}
