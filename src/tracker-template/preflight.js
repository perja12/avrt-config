export function templateTargetChanged(baselineRawConfig, currentRawConfig) {
  if (!baselineRawConfig || !currentRawConfig) return true;
  if (typeof baselineRawConfig.sameRecordsAs !== "function") return true;
  return !baselineRawConfig.sameRecordsAs(currentRawConfig);
}
