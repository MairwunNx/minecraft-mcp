// Regenerates the typed WorldAPI client from its OpenAPI document.
//   npm run generate                       reads ../minecraft-worldapi/docs/openapi.json
//   npm run generate -- <path or URL>      reads another copy, such as a live server's /api/v1/openapi.json
// The document is copied to openapi/worldapi.json, so builds never need the WorldAPI repository.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const source = process.argv[2] ?? "../minecraft-worldapi/docs/openapi.json";
const text = /^https?:/.test(source) ? await (await fetch(source)).text() : await readFile(source, "utf8");
const document = JSON.parse(text);
document.servers = [{ url: "/api/v1" }];
await writeFile("openapi/worldapi.json", `${JSON.stringify(document, null, 2)}\n`);
execFileSync("npx", ["openapi-typescript", "openapi/worldapi.json", "-o", "src/generated/worldapi.ts"], {
  stdio: "inherit",
});
console.log(`WorldAPI ${document.info.version}: ${Object.keys(document.paths).length} paths`);
