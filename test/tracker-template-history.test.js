import { describe, expect, it } from "vitest";
import { createTemplateHistoryRepository } from "../src/tracker-template/history.js";

describe("template device history", () => {
  it("stores and filters verified devices by template", () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const history = createTemplateHistoryRepository(storage);
    history.add("one", { display: "N0CALL", time: "12:00" });
    history.add("two", { display: "N0TEST", time: "12:01" });
    expect(history.list("one")).toEqual([{ templateId: "one", display: "N0CALL", time: "12:00", result: "verified" }]);
    history.clear("one");
    expect(history.list("one")).toEqual([]);
    expect(history.list("two")).toHaveLength(1);
  });

  it("reports unavailable storage when adding history", () => {
    expect(() => createTemplateHistoryRepository(null).add("one", { display: "N0CALL" })).toThrow(/unavailable/);
  });
});
