// Builds minecraft-mcp-<version>.mcpb, the one-click bundle for Claude Desktop, into build/.
// Run after `npm run build`; the release workflow does both.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const stage = "build/mcpb";
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

for (const path of ["dist", "openapi", "package.json", "package-lock.json", "LICENSE", "README.md"])
  cpSync(path, `${stage}/${path}`, { recursive: true });
cpSync("media/icon.png", `${stage}/icon.png`);

// The bundle carries the same version as the package.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
writeFileSync(`${stage}/manifest.json`, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);

const run = (command, args, cwd = ".") => execFileSync(command, args, { cwd, stdio: "inherit" });
run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], stage);
run("npx", ["-y", "@anthropic-ai/mcpb@2", "validate", `${stage}/manifest.json`]);
run("npx", ["-y", "@anthropic-ai/mcpb@2", "pack", stage, `build/minecraft-mcp-${version}.mcpb`]);
