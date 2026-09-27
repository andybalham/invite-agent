import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["scripts", "test"];
const bannedPattern = new RegExp("\\bdebug" + "ger\\b|\\bconsole" + "\\.log\\s*\\(");

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(entryPath)));
    } else if ([".js", ".mjs"].includes(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

const files = (await Promise.all(roots.map((directory) => collect(path.join(root, directory))))).flat();
const failures = [];
for (const file of files) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) {
    failures.push(`${path.relative(root, file)}: ${check.stderr.trim()}`);
  }
  const contents = await readFile(file, "utf8");
  if (bannedPattern.test(contents)) {
    failures.push(`${path.relative(root, file)}: banned debugging statement found`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
}
