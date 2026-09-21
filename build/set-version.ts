import { readFile, writeFile } from "fs/promises";
import path from "path";

const rootDir = path.resolve(import.meta.dir, "..");

const VERSION_FILES = [
  "package.json",
  "src/manifest.chrome.json",
  "src/manifest.firefox.json",
];

const VERSION_PATTERN = /"version"\s*:\s*"([^"]+)"/;

function isValidVersion(version: string): boolean {
  const parts = version.split(".");
  if (parts.length < 1 || parts.length > 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^(0|[1-9]\d*)$/.test(part)) {
      return false;
    }

    const value = Number(part);
    return value >= 0 && value <= 65535;
  });
}

async function setFileVersion(relativePath: string, version: string): Promise<string> {
  const filePath = path.join(rootDir, relativePath);
  const content = await readFile(filePath, "utf8");
  const match = content.match(VERSION_PATTERN);

  if (!match) {
    throw new Error(`No "version" field found in ${relativePath}`);
  }

  const updated = content.replace(VERSION_PATTERN, `"version": "${version}"`);
  await writeFile(filePath, updated);
  return match[1];
}

const version = Bun.argv[2];

if (!version) {
  console.error("Usage: bun run version:set <version>");
  console.error("Example: bun run version:set 1.0.0");
  process.exit(1);
}

if (!isValidVersion(version)) {
  console.error(`Invalid version "${version}". Use 1-4 numeric parts, each 0-65535 (e.g. 1.0.0).`);
  process.exit(1);
}

console.log(`Setting version to ${version}...\n`);

for (const relativePath of VERSION_FILES) {
  const previous = await setFileVersion(relativePath, version);
  console.log(`  ${relativePath}: ${previous} → ${version}`);
}

console.log("\n✅ Version updated in all files.");
