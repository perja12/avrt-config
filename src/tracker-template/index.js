const TEMPLATE_FORMAT = "ap510-template";
const TEMPLATE_SCHEMA_VERSION = 1;
const DEFAULT_KEEP_PATHS = ["identity.callsign", "identity.ssid"];
const KEEP_FIELD_DEFAULTS = Object.freeze({
  "identity.callsign": "NOCALL",
  "identity.ssid": 0,
  "text.comment": "",
  "text.status": "",
});

export { DEFAULT_KEEP_PATHS, TEMPLATE_FORMAT, TEMPLATE_SCHEMA_VERSION };

export function createTrackerTemplate({ name, description = "", dto, keepPaths = DEFAULT_KEEP_PATHS, schema = null } = {}) {
  if (typeof name !== "string" || name.trim() === "") throw new TypeError("template name is required");
  if (!dto || typeof dto !== "object") throw new TypeError("template configuration is required");
  const keep = normalizePaths(keepPaths);
  if (schema?.fields) {
    const unsupported = keep.find((path) => schema.fields[path]?.templateKeepAllowed === false || !schema.fields[path]);
    if (unsupported) throw new TypeError(`field cannot be kept from tracker: ${unsupported}`);
  }
  const apply = {};
  const defaults = {};
  for (const path of eligiblePaths(dto, schema)) {
    if (keep.includes(path)) {
      if (!Object.hasOwn(KEEP_FIELD_DEFAULTS, path)) defaults[path] = structuredClone(getPath(dto, path));
    }
    else apply[path] = structuredClone(getPath(dto, path));
  }
  for (const path of keep) {
    if (Object.hasOwn(KEEP_FIELD_DEFAULTS, path)) defaults[path] = KEEP_FIELD_DEFAULTS[path];
  }
  return {
    format: TEMPLATE_FORMAT,
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    id: cryptoRandomId(),
    name: name.trim(),
    description: typeof description === "string" ? description.trim() : "",
    compatibility: { profile: dto.metadata?.profile ?? null },
    keepPaths: keep,
    values: apply,
    defaults,
  };
}

export function validateTrackerTemplate(template, { schema = null } = {}) {
  const errors = [];
  if (!template || typeof template !== "object") return { valid: false, errors: ["template must be an object"] };
  if (template.format !== TEMPLATE_FORMAT) errors.push(`template format must be ${TEMPLATE_FORMAT}`);
  if (template.schemaVersion !== TEMPLATE_SCHEMA_VERSION) errors.push(`unsupported template schema version: ${template.schemaVersion}`);
  if (typeof template.name !== "string" || template.name.trim() === "") errors.push("template name is required");
  if (template.compatibility !== undefined && (template.compatibility === null || typeof template.compatibility !== "object")) errors.push("compatibility must be an object");
  if (template.compatibility?.profile !== null && template.compatibility?.profile !== undefined && typeof template.compatibility.profile !== "string") errors.push("compatibility profile must be text or null");
  if (!Array.isArray(template.keepPaths)) errors.push("keepPaths must be an array");
  if (!template.values || typeof template.values !== "object" || Array.isArray(template.values)) errors.push("values must be an object");
  if (template.defaults !== undefined && (!template.defaults || typeof template.defaults !== "object" || Array.isArray(template.defaults))) errors.push("defaults must be an object");
  const keep = Array.isArray(template.keepPaths) ? normalizePaths(template.keepPaths, errors) : [];
  const paths = template.values && typeof template.values === "object" ? Object.keys(template.values) : [];
  for (const path of paths) {
    if (keep.includes(path)) errors.push(`path cannot be both kept and applied: ${path}`);
    if (schema && !schema.fields?.[path]) errors.push(`unsupported template field: ${path}`);
  }
  for (const path of Object.keys(template.defaults && typeof template.defaults === "object" && !Array.isArray(template.defaults) ? template.defaults : {})) {
    if (!keep.includes(path)) errors.push(`default requires a kept field: ${path}`);
    if (schema && !schema.fields?.[path]) errors.push(`unsupported template field: ${path}`);
  }
  return { valid: errors.length === 0, errors };
}

export function assertValidTrackerTemplate(template, options) {
  const result = validateTrackerTemplate(template, options);
  if (!result.valid) throw new TypeError(result.errors[0]);
  return template;
}

export function applyTrackerTemplate(dto, template, { schema = null } = {}) {
  assertValidTrackerTemplate(template, { schema });
  const expectedProfile = template.compatibility?.profile;
  const actualProfile = dto?.metadata?.profile;
  if (expectedProfile && actualProfile && expectedProfile !== actualProfile) {
    throw new TypeError(`template requires profile ${expectedProfile}; target is ${actualProfile}`);
  }
  const result = structuredClone(dto);
  for (const [path, value] of Object.entries(template.values)) setPath(result, path, structuredClone(value));
  for (const path of template.keepPaths) {
    const value = templateDefaultValue(template, path);
    if (value === undefined) continue;
    const current = getPath(result, path);
    if (current === null || current === undefined || current === "") setPath(result, path, structuredClone(value));
  }
  return result;
}

export function prepareTrackerTemplate(dto, template, overrides = {}, { schema = null } = {}) {
  const result = applyTrackerTemplate(dto, template, { schema });
  for (const [path, value] of Object.entries(overrides)) {
    if (template.keepPaths.includes(path)) setPath(result, path, structuredClone(value));
  }
  return result;
}

export function templateDefaultValue(template, path) {
  if (!template.keepPaths?.includes(path)) return undefined;
  if (Object.hasOwn(template.defaults ?? {}, path)) return template.defaults[path];
  return KEEP_FIELD_DEFAULTS[path];
}

export function templateSourceDTO(template) {
  return applyTrackerTemplate({}, template);
}

export function templateChanges(before, after, paths = null) {
  const selected = paths ?? Object.keys(flatten(after));
  return selected.filter((path) => JSON.stringify(getPath(before, path)) !== JSON.stringify(getPath(after, path)));
}

export function createTemplateRepository(storage, key = "ap510-templates-v1", { schema = null } = {}) {
  const read = () => {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new TypeError("stored templates must be an array");
      parsed.forEach((template) => assertValidTrackerTemplate(template, { schema }));
      return parsed;
    } catch (error) {
      if (error instanceof TypeError && error.message.startsWith("stored templates")) throw error;
      throw new TypeError(`unable to load templates: ${error.message}`);
    }
  };
  const write = (templates) => {
    if (!storage) throw new Error("template storage is unavailable");
    try { storage.setItem(key, JSON.stringify(templates)); } catch (error) { throw new Error(`unable to save templates: ${error.message}`); }
  };
  return {
    list: read,
    save(template) {
      assertValidTrackerTemplate(template, { schema });
      const templates = read().filter((item) => item.id !== template.id);
      assertNewTemplateNames(templates, [template]);
      templates.push(structuredClone(template));
      write(templates);
      return template;
    },
    remove(id) { const templates = read().filter((item) => item.id !== id); write(templates); },
    export() { return JSON.stringify(read(), null, 2); },
    import(json, { replace = false } = {}) {
      const incoming = typeof json === "string" ? JSON.parse(json) : json;
      if (!Array.isArray(incoming)) throw new TypeError("import must contain an array of templates");
      incoming.forEach((template) => assertValidTrackerTemplate(template, { schema }));
      const existing = replace ? [] : read();
      assertNewTemplateNames(existing, incoming);
      const merged = replace ? incoming : [...existing, ...incoming.map((template) => ({ ...template, id: cryptoRandomId() }))];
      write(merged);
      return merged;
    },
  };
}

function assertNewTemplateNames(existing, incoming) {
  const names = new Set(existing.map((template) => template.name.trim().toLowerCase()));
  for (const template of incoming) {
    const normalizedName = template.name.trim().toLowerCase();
    if (names.has(normalizedName)) throw new TypeError(`template name already exists: ${template.name.trim()}`);
    names.add(normalizedName);
  }
}

function eligiblePaths(dto, schema) {
  if (schema?.fields) return Object.keys(schema.fields).filter((path) => schema.fields[path].templateEligible !== false && getPath(dto, path) !== undefined && getPath(dto, path) !== null);
  return Object.keys(flatten(dto)).filter((path) => getPath(dto, path) !== null && getPath(dto, path) !== undefined);
}

function normalizePaths(paths, errors = []) {
  if (!Array.isArray(paths)) return [];
  const result = [];
  for (const path of paths) {
    if (typeof path !== "string" || path === "" || result.includes(path)) errors.push(`invalid template path: ${path}`);
    else result.push(path);
  }
  return result;
}

function flatten(value, prefix = "", output = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) { if (prefix) output[prefix] = value; return output; }
  for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, output);
  return output;
}

function getPath(object, path) { return path.split(".").reduce((value, part) => value?.[part], object); }

function setPath(object, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  let target = object;
  for (const part of parts) { target[part] ??= {}; target = target[part]; }
  target[last] = value;
}

function cryptoRandomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `template-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
