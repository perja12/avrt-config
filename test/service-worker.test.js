import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const serviceWorkerSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

describe("service worker cache cleanup", () => {
  it.each(["/", "/ap510/", "/ap510/demo/"])("only deletes obsolete caches for deployment %s", async (path) => {
    const scope = `https://example.test${path}`;
    const prefix = `avrt-config:${encodeURIComponent(scope)}:`;
    const preserved = [
      `${prefix}current`,
      "another-app-cache",
      "avrt-config-legacy-build",
      `avrt-config:${encodeURIComponent(`${scope}other/`)}:old`,
      `avrt-config:${encodeURIComponent("https://example.test/ap510-sibling/")}:old`,
    ];
    const stored = new Set([...preserved, `${prefix}old`, `${prefix}older`]);
    const handlers = {};
    runInNewContext(serviceWorkerSource, {
      URL,
      self: {
        location: new URL("sw.js?v=current", scope),
        registration: { scope },
        addEventListener: (name, handler) => { handlers[name] = handler; },
      },
      caches: {
        keys: async () => [...stored],
        delete: async (key) => stored.delete(key),
      },
    });

    let activation;
    handlers.activate({ waitUntil: (promise) => { activation = promise; } });
    await activation;

    expect([...stored]).toEqual(preserved);
  });
});
