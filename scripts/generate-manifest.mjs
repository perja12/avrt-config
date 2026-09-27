import { readFile, writeFile } from "node:fs/promises";
import { APP_METADATA } from "../src/app-metadata.js";

const manifestUrl = new URL("../public/manifest.webmanifest", import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

manifest.name = APP_METADATA.name;
manifest.short_name = APP_METADATA.shortName;
manifest.description = APP_METADATA.description;

await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
