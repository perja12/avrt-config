import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const iconsDir = resolve(fileURLToPath(new URL("../public/icons/", import.meta.url)));
const source = resolve(iconsDir, "icon.svg");
const sizes = [192, 384, 512, 1024];
const converter = (() => {
  try {
    execFileSync("magick", ["-version"], { stdio: "ignore" });
    return "magick";
  } catch {
    return "convert";
  }
})();

if (!existsSync(source)) throw new Error(`Icon source not found: ${source}`);

for (const size of sizes) {
  for (const suffix of ["", "-maskable"]) {
    const output = resolve(iconsDir, `icon-${size}${suffix}.png`);
    execFileSync(converter, ["-background", "none", source, "-resize", `${size}x${size}`, output], { stdio: "inherit" });
  }
}

console.log(`Generated ${sizes.length * 2} PNG icons from ${source}`);
