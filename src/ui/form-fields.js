export function textField(label, value, options = {}) {
  const isEmpty = value === null || value === undefined || value === "";
  const normalized = isEmpty ? options.empty ?? "unknown" : String(value);
  return {
    label,
    value: normalized,
    placeholder: options.placeholder ?? null,
    control: options.control ?? "text",
    options: options.options ?? [],
    inputType: options.inputType ?? "text",
    unit: options.unit ?? null,
    width: options.width ?? "normal",
    path: options.path ?? null,
    empty: isEmpty,
    disabled: options.disabled === true,
  };
}

export function schemaLabel(schema, path, fallback) {
  return schema?.fields?.[path]?.label ?? fallback;
}

export function numberField(label, value, options = {}) {
  const isEmpty = value === null || value === undefined || value === "";
  return {
    label,
    value: isEmpty ? "" : String(value),
    placeholder: isEmpty ? options.empty ?? "unknown" : null,
    control: "text",
    options: [],
    inputType: "number",
    unit: options.unit ?? null,
    width: options.width ?? "compact",
    path: options.path ?? null,
    empty: isEmpty,
    disabled: options.disabled === true,
  };
}

export function checkboxField(label, checked, options = {}) {
  return {
    label,
    value: checked === null || checked === undefined ? "" : String(Boolean(checked)),
    checked: checked === true,
    indeterminate: checked === null || checked === undefined,
    control: "checkbox",
    options: [],
    inputType: "checkbox",
    unit: null,
    width: "normal",
    path: options.path ?? null,
    disabled: options.disabled === true,
  };
}

export function selectOptions(values, { blank = false, labels = {} } = {}) {
  const options = values.map((value) => ({
    value: String(value),
    label: labels[value] ?? String(value),
  }));
  return blank ? [{ value: "", label: "" }, ...options] : options;
}

export function optionsWithCurrent(values, current, { blank = false, labels = {} } = {}) {
  const normalized = values.map(String);
  const currentValue = current === null || current === undefined || current === "" ? null : String(current);
  const allValues = currentValue && !normalized.includes(currentValue) ? [...normalized, currentValue] : normalized;
  return selectOptions(allValues, { blank, labels });
}

export function schemaOptionsWithCurrent(schema, path, current, { blank = false, fallback = [] } = {}) {
  const options = schema?.fields?.[path]?.options ?? fallback;
  return optionsWithCurrent(options.map((item) => item.value), current, {
    blank,
    labels: Object.fromEntries(options.map((item) => [item.value, item.label])),
  });
}
