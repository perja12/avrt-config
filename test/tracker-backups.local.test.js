import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseTrackerConfig } from "../src/tracker-config/index.js";

const backupsDir = path.resolve(import.meta.dirname, "../tracker-backups");

describe("local tracker backup parity", () => {
  it.skipIf(!existsSync(backupsDir))("decodes every local binary backup", async () => {
    const names = await readdir(backupsDir);
    const binNames = names.filter((name) => name.endsWith(".bin")).sort();

    expect(binNames.length).toBeGreaterThan(0);

    for (const binName of binNames) {
      const stem = binName.slice(0, -".bin".length);
      const jsonName = `${stem}.json`;
      const jsonPath = path.join(backupsDir, jsonName);

      const raw = await readFile(path.join(backupsDir, binName));
      const actual = parseTrackerConfig(raw).toDebugJSON();

      expect.soft(actual.records.length, `${binName} parses at least one record`).toBeGreaterThan(0);

      if (existsSync(jsonPath)) {
        const expected = JSON.parse(await readFile(jsonPath, "utf8"));
        expect.soft(actual, binName).toEqual(expected);
      }
    }
  });
});
