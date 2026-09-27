import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const productionRoots = ["backend/src", "frontend/src", "infra/src"];
const sourceExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx", ".jsx"]);
const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

function isLocalAdapterPath(value) {
  return /(?:^|[\\/.-])local(?:-only)?(?:[\\/.-]|$)/i.test(value) ||
    /adapters[\\/]local/i.test(value);
}

async function sourceFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!isLocalAdapterPath(path.relative(directory, entryPath))) {
        files.push(...(await sourceFiles(entryPath)));
      }
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

export async function findProductionBoundaryViolations({ root }) {
  const files = (
    await Promise.all(productionRoots.map((relativeRoot) => sourceFiles(path.join(root, relativeRoot))))
  ).flat();
  const violations = [];

  for (const file of files) {
    const contents = await readFile(file, "utf8");
    for (const match of contents.matchAll(importPattern)) {
      const specifier = match[1];
      if (specifier && isLocalAdapterPath(specifier)) {
        violations.push({ file, specifier });
      }
    }
  }

  return violations.sort((left, right) =>
    `${left.file}:${left.specifier}`.localeCompare(`${right.file}:${right.specifier}`)
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const violations = await findProductionBoundaryViolations({ root });
  if (violations.length > 0) {
    for (const violation of violations) {
      process.stderr.write(`${path.relative(root, violation.file)} imports ${violation.specifier}\n`);
    }
    process.exitCode = 1;
  }
}
