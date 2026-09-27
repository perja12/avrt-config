export const RISK_ACKNOWLEDGEMENT_KEY = "ap510-tool-risk-acknowledged-v1";

export function hasRiskAcknowledgement(storage) {
  try {
    return storage?.getItem(RISK_ACKNOWLEDGEMENT_KEY) === "true";
  } catch {
    return false;
  }
}

export function storeRiskAcknowledgement(storage) {
  if (!storage) return false;
  try {
    storage.setItem(RISK_ACKNOWLEDGEMENT_KEY, "true");
    return true;
  } catch {
    return false;
  }
}
