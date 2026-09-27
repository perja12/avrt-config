import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { parseTrackerConfig } from "../src/tracker-config/index.js";
import { TrackerWorkflow } from "../src/tracker-workflow/index.js";
import {
  applyTrackerTemplate,
  createTemplateRepository,
  createTrackerTemplate,
  validateTrackerTemplate,
} from "../src/tracker-template/index.js";

const schema = { fields: {
  "identity.callsign": {}, "identity.ssid": {}, "text.comment": {}, "transmission.frequencyMHz": {},
} };

const dto = {
  identity: { callsign: "N0CALL", ssid: 9 },
  text: { comment: "standard" },
  transmission: { frequencyMHz: 144.8 },
};

describe("tracker templates", () => {
  it("creates an explicit template and preserves selected target fields when applied", () => {
    const template = createTrackerTemplate({ name: "Fleet", dto, keepPaths: ["identity.callsign", "identity.ssid"], schema });
    const target = { identity: { callsign: "LB2KK", ssid: 7 }, text: { comment: "old" }, transmission: { frequencyMHz: 145.5 } };
    const merged = applyTrackerTemplate(target, template, { schema });

    expect(merged.identity).toEqual(target.identity);
    expect(merged.text.comment).toBe("standard");
    expect(merged.transmission.frequencyMHz).toBe(144.8);
  });

  it("does not store nullable source fields as template values", () => {
    const source = { ...dto, text: { comment: null } };
    const template = createTrackerTemplate({ name: "Fleet", dto: source, keepPaths: [], schema });
    const target = { ...dto, text: { comment: "target comment" } };
    expect(template.values["text.comment"]).toBeUndefined();
    expect(applyTrackerTemplate(target, template, { schema }).text.comment).toBe("target comment");
  });

  it("rejects unknown or overlapping paths", () => {
    const result = validateTrackerTemplate({ format: "ap510-template", schemaVersion: 1, name: "x", keepPaths: ["text.comment"], values: { "text.comment": "x", "unknown.path": 1 } }, { schema });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/both kept|unsupported/);
  });

  it("rejects applying a template to a different firmware profile", () => {
    const template = createTrackerTemplate({ name: "Fleet", dto: { ...dto, metadata: { profile: "avrt5-2024" } }, schema });
    expect(() => applyTrackerTemplate({ ...dto, metadata: { profile: "avrt5-2025" } }, template, { schema })).toThrow(/requires profile/);
  });

  it("round-trips templates through guarded storage", () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const repository = createTemplateRepository(storage);
    const template = createTrackerTemplate({ name: "Fleet", dto, schema });
    repository.save(template);
    expect(repository.list()[0].name).toBe("Fleet");
    expect(JSON.parse(repository.export())).toHaveLength(1);
  });

  it("applies a template to a real parsed configuration without replacing its unknown records", async () => {
    const config = parseTrackerConfig(await readFile(new URL("./fixtures/late_config.ini", import.meta.url)));
    const source = config.toDTO();
    const template = createTrackerTemplate({ name: "Fleet", dto: { ...source, text: { ...source.text, comment: "new" } }, keepPaths: ["identity.callsign", "identity.ssid"], schema: config.schema() });
    const merged = applyTrackerTemplate(source, template, { schema: config.schema() });
    const written = config.withDTO(merged);
    expect(Array.from(written.rawConfig.byKey().get("00").value)).toEqual(Array.from(config.rawConfig.byKey().get("00").value));
    expect(written.rawConfig.byKey().get("10").value).toEqual(Uint8Array.from([110, 101, 119]));
  });

  it("writes an applied template through the workflow and verifies the target capture", async () => {
    const fixture = await readFile(new URL("./fixtures/late_config.ini", import.meta.url), "utf8");
    const raw = new TextEncoder().encode(fixture.replace("<end>\n", ""));
    let current = parseTrackerConfig(raw);
    const serialSession = {
      async open() {},
      async readConfig() { return current.rawConfig.raw; },
      async writeConfig(records) {
        current = parseTrackerConfig(current.rawConfig.withUpdates(new Map(records.map((record) => [record.key, record.value]))).raw);
        return new Uint8Array([79, 75]);
      },
    };
    const workflow = new TrackerWorkflow({ serialSession });
    await workflow.connect();
    await workflow.readTrackerConfig();
    const template = createTrackerTemplate({ name: "Fleet", dto: { ...workflow.draft, text: { ...workflow.draft.text, comment: "fleet" } }, keepPaths: ["identity.callsign", "identity.ssid"], schema: workflow.getConfigSchema() });
    workflow.updateDraft(applyTrackerTemplate(workflow.draft, template, { schema: workflow.getConfigSchema() }));
    await workflow.writeTrackerConfig();
    expect(current.toDTO().identity.callsign).toBe("N0CALL");
    expect(current.toDTO().text.comment).toBe("fleet");
  });
});
