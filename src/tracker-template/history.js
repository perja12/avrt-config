const DEFAULT_HISTORY_KEY = "ap510-template-device-history-v1";

export function createTemplateHistoryRepository(storage, key = DEFAULT_HISTORY_KEY) {
  function readAll() {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new TypeError("template device history must be an array");
      return parsed;
    } catch (error) {
      throw new TypeError(`unable to load template device history: ${error.message}`);
    }
  }

  function writeAll(entries) {
    if (!storage) throw new Error("template device history storage is unavailable");
    try { storage.setItem(key, JSON.stringify(entries)); }
    catch (error) { throw new Error(`unable to save template device history: ${error.message}`); }
  }

  return {
    list(templateId) { return readAll().filter((entry) => entry.templateId === templateId); },
    add(templateId, entry) {
      if (typeof templateId !== "string" || templateId === "") throw new TypeError("template ID is required");
      if (!entry || typeof entry.display !== "string" || entry.display === "") throw new TypeError("device identity is required");
      const next = { templateId, display: entry.display, time: entry.time ?? new Date().toISOString(), result: entry.result ?? "verified" };
      writeAll([...readAll(), next]);
      return next;
    },
    clear(templateId) { writeAll(readAll().filter((entry) => entry.templateId !== templateId)); },
  };
}
