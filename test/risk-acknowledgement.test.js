import { describe, expect, it } from "vitest";

import { hasRiskAcknowledgement, RISK_ACKNOWLEDGEMENT_KEY, storeRiskAcknowledgement } from "../src/ui/risk-acknowledgement.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

describe("first-run risk acknowledgement", () => {
  it("is not acknowledged until the user confirms", () => {
    const localStorage = storage();

    expect(hasRiskAcknowledgement(localStorage)).toBe(false);
    expect(storeRiskAcknowledgement(localStorage)).toBe(true);
    expect(localStorage.getItem(RISK_ACKNOWLEDGEMENT_KEY)).toBe("true");
    expect(hasRiskAcknowledgement(localStorage)).toBe(true);
  });

  it("fails closed when storage is unavailable", () => {
    const unavailable = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };

    expect(hasRiskAcknowledgement(unavailable)).toBe(false);
    expect(storeRiskAcknowledgement(unavailable)).toBe(false);
    expect(storeRiskAcknowledgement(null)).toBe(false);
  });
});
