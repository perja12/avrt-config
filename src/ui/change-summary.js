export function configChangeSummary(schema, before, after, { prefixes = [] } = {}) {
  if (!before || !after) return [];

  return Object.entries(schema?.fields ?? {}).flatMap(([path, rule]) => {
    if (rule.editable === false || (prefixes.length > 0 && !prefixes.some((prefix) => path.startsWith(prefix)))) return [];
    const previous = displayValue(getPath(before, path), rule);
    const next = displayValue(getPath(after, path), rule);
    return previous === next ? [] : [{ label: rule.label, path, before: previous, after: next }];
  });
}

function getPath(object, path) {
  return path.split(".").reduce((current, key) => current?.[key], object);
}

function displayValue(value, rule) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.every((part) => part === null || part === ""))) return "(empty)";
  if (rule.type === "path-list") return value.filter(Boolean).join(", ") || "(empty)";
  if (rule.type === "boolean") return value ? "enabled" : "disabled";
  if (rule.type === "select" && rule.options) return rule.options.find((option) => option.value === String(value))?.label ?? String(value);
  if (rule.unit) return `${value} ${rule.unit}`;
  return String(value);
}
