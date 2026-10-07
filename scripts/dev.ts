/**
 * Runs the Bun server (watch mode) and the Vite dev server together.
 * Vite only serves the UI and proxies /api, /files and /ws to the server,
 * so running it alone fails every request with ECONNREFUSED.
 */
const procs = [
  Bun.spawn(["bun", "run", "dev:server"], { stdio: ["inherit", "inherit", "inherit"] }),
  Bun.spawn(["bun", "run", "dev:web"], { stdio: ["inherit", "inherit", "inherit"] }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill();
  Promise.all(procs.map((p) => p.exited)).then(() => process.exit(code));
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const p of procs) p.exited.then((code) => stop(code ?? 1));
