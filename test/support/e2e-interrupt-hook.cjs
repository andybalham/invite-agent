// Test-only IPC bridge delivers a catchable interrupt on Windows, where
// ChildProcess.kill('SIGINT') forcefully terminates rather than flushing evidence.
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/@playwright/test/cli.js")) {
  process.on("message", (message) => {
    if (message === "interrupt-e2e") process.emit("SIGINT");
  });
  process.channel?.unref();
}
