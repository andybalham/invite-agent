import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["backend", "frontend", "infra", "packages", "scripts", "test"];
const checkedExtensions = new Set([".json", ".js", ".mjs", ".ts", ".tsx"]);
const ignoredDirectories = new Set(["dist", "node_modules"]);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      files.push(...(await collect(entryPath)));
    } else if (entry.isFile() && checkedExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

const files = [
  path.join(root, "package.json"),
  path.join(root, "package-lock.json"),
  path.join(root, "tsconfig.base.json"),
  path.join(root, "tsconfig.json"),
  ...(await Promise.all(roots.map((directory) => collect(path.join(root, directory))))).flat()
];
const failures = [];

for (const file of files) {
  const contents = await readFile(file, "utf8");
  if (!contents.endsWith("\n") || /[\t ]+$/m.test(contents) || contents.includes("\r")) {
    failures.push(path.relative(root, file));
  }
  if (path.extname(file) === ".json") {
    const formatted = `${JSON.stringify(JSON.parse(contents), null, 2)}\n`;
    if (contents !== formatted) {
      failures.push(path.relative(root, file));
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`Formatting violations:\n${[...new Set(failures)].join("\n")}\n`);
  process.exitCode = 1;
}
