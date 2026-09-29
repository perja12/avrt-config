export function templateTargetChanged(baselineRawConfig, currentRawConfig) {
  if (!baselineRawConfig || !currentRawConfig) return true;
  if (typeof baselineRawConfig.sameRecordsAs !== "function") return true;
  return !baselineRawConfig.sameRecordsAs(currentRawConfig);
}

export async function preflightTemplateWrite(workflow, baselineRawConfig, candidateDto) {
  const config = await workflow.readTrackerConfig({ updateDraft: false });
  const changed = templateTargetChanged(baselineRawConfig, config.rawConfig);
  return { config, changed, candidateDto: changed ? null : candidateDto };
}
