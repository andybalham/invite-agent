import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["backend", "frontend", "infra", "packages", "scripts", "test"];
const ignoredDirectories = new Set(["dist", "node_modules"]);
const suspiciousSecret = /(?:AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      files.push(...(await collect(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

const files = (await Promise.all(roots.map((directory) => collect(path.join(root, directory))))).flat();
const failures = [];
for (const file of files) {
  const contents = await readFile(file, "utf8");
  if (suspiciousSecret.test(contents)) {
    failures.push(path.relative(root, file));
  }
}

if (failures.length > 0) {
  process.stderr.write(`Potential committed secrets:\n${failures.join("\n")}\n`);
  process.exitCode = 1;
}
