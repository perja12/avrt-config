import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { parseTrackerConfig } from "../src/tracker-config/index.js";
import { TrackerWorkflow } from "../src/tracker-workflow/index.js";
import {
  applyTrackerTemplate,
  createTemplateRepository,
  createTrackerTemplate,
  prepareTrackerTemplate,
  templateDefaultValue,
  templateSourceDTO,
  validateTrackerTemplate,
} from "../src/tracker-template/index.js";
import { preflightTemplateWrite } from "../src/tracker-template/preflight.js";

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

    expect(template.defaults).toEqual({ "identity.callsign": "NOCALL", "identity.ssid": 0 });
    expect(merged.identity).toEqual(target.identity);
    expect(merged.text.comment).toBe("standard");
    expect(merged.transmission.frequencyMHz).toBe(144.8);
    expect(templateSourceDTO(template)).toEqual({ ...dto, identity: { callsign: "NOCALL", ssid: 0 } });
  });

  it("keeps saved defaults when a template is edited", () => {
    const original = createTrackerTemplate({ name: "Fleet", dto, keepPaths: ["identity.callsign", "identity.ssid", "text.comment"], schema });
    const updated = createTrackerTemplate({ name: "Fleet updated", dto: templateSourceDTO(original), keepPaths: original.keepPaths, schema });
    expect(updated.defaults).toEqual(original.defaults);
    expect(applyTrackerTemplate({ identity: { callsign: "LB2KK", ssid: 7 }, text: { comment: "tracker" } }, updated, { schema }).text.comment).toBe("tracker");
  });

  it("uses fixed defaults for every standard kept field, regardless of source values", () => {
    const source = { ...dto, text: { comment: "source comment", status: "source status" } };
    const template = createTrackerTemplate({ name: "Fleet", dto: source, keepPaths: ["identity.callsign", "identity.ssid", "text.comment", "text.status"], schema: { fields: { ...schema.fields, "text.status": {} } } });
    expect(template.defaults).toEqual({
      "identity.callsign": "NOCALL", "identity.ssid": 0, "text.comment": "", "text.status": "",
    });
    expect(templateSourceDTO(template).text).toEqual({ comment: "", status: "" });
  });

  it("fills blank kept fields from saved defaults without replacing existing tracker values", () => {
    const template = createTrackerTemplate({ name: "Fleet", dto, keepPaths: ["identity.callsign", "identity.ssid", "text.comment"], schema });
    const target = { identity: { callsign: "", ssid: null }, text: { comment: "tracker comment" }, transmission: { frequencyMHz: 145.5 } };
    const merged = applyTrackerTemplate(target, template, { schema });

    expect(merged.identity).toEqual({ callsign: "NOCALL", ssid: 0 });
    expect(merged.text.comment).toBe("tracker comment");
    expect(merged.transmission.frequencyMHz).toBe(144.8);
    expect(target.identity).toEqual({ callsign: "", ssid: null });
  });

  it("keeps legacy templates without saved defaults compatible", () => {
    const template = createTrackerTemplate({ name: "Fleet", dto, keepPaths: ["identity.callsign"], schema });
    delete template.defaults;
    expect(validateTrackerTemplate(template, { schema }).valid).toBe(true);
    expect(applyTrackerTemplate({ identity: { callsign: "" } }, template, { schema }).identity.callsign).toBe("NOCALL");
    expect(templateSourceDTO(template).identity.callsign).toBe("NOCALL");
  });

  it("uses standard defaults when an older template has none, while respecting explicit values", () => {
    const template = createTrackerTemplate({ name: "Fleet", dto, keepPaths: ["identity.ssid"], schema });
    expect(templateDefaultValue(template, "identity.ssid")).toBe(0);
    delete template.defaults["identity.ssid"];
    expect(templateDefaultValue(template, "identity.ssid")).toBe(0);
    expect(applyTrackerTemplate({ identity: { ssid: null } }, template, { schema }).identity.ssid).toBe(0);
    template.defaults["identity.ssid"] = 9;
    expect(applyTrackerTemplate({ identity: { ssid: null } }, template, { schema }).identity.ssid).toBe(9);
    template.keepPaths.push("identity.callsign");
    expect(templateDefaultValue(template, "identity.callsign")).toBe("NOCALL");
  });

  it("rebuilds a prepared candidate after a default changes and keeps device edits through preflight", async () => {
    const template = createTrackerTemplate({ name: "Fleet", dto, keepPaths: ["identity.callsign", "text.comment"], schema });
    const target = { identity: { callsign: "LB2KK", ssid: 7 }, text: { comment: "" }, transmission: { frequencyMHz: 145.5 } };
    const overrides = { "identity.callsign": "NEW123" };
    const before = prepareTrackerTemplate(target, template, overrides, { schema });
    expect(before.text.comment).toBe("");

    const updated = structuredClone(template);
    updated.defaults["text.comment"] = "new default";
    const after = prepareTrackerTemplate(target, updated, overrides, { schema });
    expect(after.identity.callsign).toBe("NEW123");
    expect(after.text.comment).toBe("new default");
    expect(target.text.comment).toBe("");

    const baseline = { sameRecordsAs: (current) => current === baseline };
    const workflow = { readTrackerConfig: async () => ({ rawConfig: baseline }) };
    expect((await preflightTemplateWrite(workflow, baseline, after)).candidateDto).toEqual(after);
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
    expect(validateTrackerTemplate({ format: "ap510-template", schemaVersion: 1, name: "x", keepPaths: [], values: {}, defaults: { "text.comment": "old" } }, { schema }).valid).toBe(false);
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
    expect(repository.list()[0].defaults).toEqual(template.defaults);
    expect(JSON.parse(repository.export())).toHaveLength(1);
  });

  it("rejects template names that match after trimming and lowercasing", () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const repository = createTemplateRepository(storage);
    const original = createTrackerTemplate({ name: "Test 3", dto, schema });
    repository.save(original);

    const duplicate = createTrackerTemplate({ name: "  TEST 3  ", dto, schema });
    expect(() => repository.save(duplicate)).toThrow(/template name already exists/i);
    expect(repository.list()).toHaveLength(1);

    const renamed = { ...original, name: " test 3 " };
    repository.save(renamed);
    expect(repository.list()).toHaveLength(1);
    expect(repository.list()[0].name).toBe(" test 3 ");

    const other = createTrackerTemplate({ name: "Other", dto, schema });
    repository.save(other);
    expect(() => repository.save({ ...other, name: "TEST 3" })).toThrow(/template name already exists/i);
    expect(repository.list().find((template) => template.id === other.id)?.name).toBe("Other");
  });

  it("rejects duplicate names during import without changing saved templates", () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const repository = createTemplateRepository(storage);
    repository.save(createTrackerTemplate({ name: "Test 3", dto, schema }));

    const existingName = createTrackerTemplate({ name: " TEST 3 ", dto, schema });
    expect(() => repository.import([existingName])).toThrow(/template name already exists/i);
    expect(repository.list()).toHaveLength(1);

    const first = createTrackerTemplate({ name: "Another", dto, schema });
    const second = createTrackerTemplate({ name: " another ", dto, schema });
    expect(() => repository.import([first, second], { replace: true })).toThrow(/template name already exists/i);
    expect(repository.list()[0].name).toBe("Test 3");
  });

  it("allows a new name when older saved templates already contain duplicates", () => {
    const oldA = createTrackerTemplate({ name: "Test 3", dto, schema });
    const oldB = createTrackerTemplate({ name: " TEST 3 ", dto, schema });
    const values = new Map([["ap510-templates-v1", JSON.stringify([oldA, oldB])]]);
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const repository = createTemplateRepository(storage);

    const fresh = createTrackerTemplate({ name: "Test 333", dto, schema });
    repository.save(fresh);
    expect(repository.list()).toHaveLength(3);
    expect(() => repository.save(createTrackerTemplate({ name: "test 3", dto, schema }))).toThrow(/template name already exists/i);
    expect(() => repository.save(createTrackerTemplate({ name: "TEST 333", dto, schema }))).toThrow(/template name already exists/i);

    repository.import([createTrackerTemplate({ name: "Imported", dto, schema })]);
    expect(repository.list()).toHaveLength(4);
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
