import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
import { APP_METADATA } from "./src/app-metadata.js";

function buildId() {
  if (process.env.VITE_BUILD_ID) return process.env.VITE_BUILD_ID;
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { encoding: "utf8" }).trim();
  } catch (error) {
    // Some restricted build runners return the command output while reporting
    // a process-spawn permission error. Preserve that usable commit value.
    const output = error.stdout?.toString().trim();
    return output || "dev";
  }
}

function appMetadataPlugin() {
  return {
    name: "ap510-app-metadata",
    transformIndexHtml(html) {
      return html
        .replaceAll("__AP510_APP_NAME__", APP_METADATA.name)
        .replaceAll("__AP510_APP_DESCRIPTION__", APP_METADATA.description);
    },
  };
}

export default defineConfig({
  root: ".",
  // The custom domain serves this app at its root.
  base: "/",
  plugins: [appMetadataPlugin()],
  define: {
    __AP510_BUILD_ID__: JSON.stringify(buildId()),
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
