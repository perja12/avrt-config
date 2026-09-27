import { checkboxField, numberField, optionsWithCurrent, schemaLabel, schemaOptionsWithCurrent, selectOptions, textField } from "./form-fields.js";

export function aprsLayoutSections(dto = {}, { blankEmpty = false, schema = null } = {}) {
  dto ??= {};
  const empty = (fallback) => blankEmpty ? "" : fallback;

  return [
    {
      title: "Identity",
      columns: 2,
      fields: [
        textField(schemaLabel(schema, "identity.callsign", "Callsign"), dto.identity?.callsign ?? null, { empty: empty("unknown"), path: "identity.callsign" }),
        textField(schemaLabel(schema, "identity.ssid", "SSID"), dto.identity?.ssid ?? null, {
          control: "select",
          width: "compact",
          empty: empty("none"),
          options: ssidOptions(blankEmpty),
          path: "identity.ssid",
        }),
      ],
    },
    {
      title: "Symbol",
      columns: 2,
      fields: [
        textField(schemaLabel(schema, "transmission.fixedSymbol.table", "Table"), dto.transmission?.fixedSymbol?.table ?? null, { empty: empty("unknown"), width: "compact", path: "transmission.fixedSymbol.table" }),
        textField(schemaLabel(schema, "transmission.fixedSymbol.code", "Code"), dto.transmission?.fixedSymbol?.code ?? null, { empty: empty("unknown"), width: "compact", path: "transmission.fixedSymbol.code" }),
        textField(schemaLabel(schema, "symbols.emergency.table", "Emergency table"), dto.symbols?.emergency?.table ?? null, { empty: empty("unknown"), width: "compact", path: "symbols.emergency.table" }),
        textField(schemaLabel(schema, "symbols.emergency.code", "Emergency symbol"), dto.symbols?.emergency?.code ?? null, { empty: empty("unknown"), width: "compact", path: "symbols.emergency.code" }),
      ],
    },
    {
      title: "Protocol output",
      columns: 1,
      fields: [
        textField(schemaLabel(schema, "decodeOutput", "Decode output"), dto.decodeOutput ?? null, {
          control: "select",
          empty: empty("unknown"),
          options: schemaOptionsWithCurrent(schema, "decodeOutput", dto.decodeOutput ?? empty("unknown"), {
            blank: blankEmpty,
            fallback: [
              { value: "KISS", label: "KISS" },
              { value: "waypoint", label: "Waypoint" },
              { value: "UI", label: "AX.25 UI (Unnumbered Information)" },
            ],
          }),
          path: "decodeOutput",
        }),
      ],
    },
    {
      title: "MIC-E",
      columns: 3,
      fields: [
        checkboxField(schemaLabel(schema, "micE.enabled", "Enabled"), dto.micE?.enabled ?? null, { path: "micE.enabled" }),
        textField(schemaLabel(schema, "micE.messageType", "MIC-E type"), dto.micE?.messageType ?? null, {
          control: "select",
          empty: empty("unknown"),
          options: optionsWithCurrent([0, 1, 2, 3, 4, 5, 6, 7], dto.micE?.messageType ?? empty("unknown"), { blank: blankEmpty }),
          path: "micE.messageType",
        }),
        textField(schemaLabel(schema, "micE.emergencyMessage", "MIC-E emergency type"), dto.micE?.emergencyMessage ?? null, {
          control: "select",
          empty: empty("unknown"),
          options: optionsWithCurrent([0, 1, 2, 3, 4, 5, 6, 7], dto.micE?.emergencyMessage ?? empty("unknown"), { blank: blankEmpty }),
          path: "micE.emergencyMessage",
        }),
      ],
    },
    {
      title: "Text",
      columns: 1,
      fields: [
        textField(schemaLabel(schema, "text.comment", "Comment"), dto.text?.comment ?? null, { empty: empty("none"), path: "text.comment" }),
        textField(schemaLabel(schema, "text.status", "Status"), dto.text?.status ?? null, { empty: empty("none"), path: "text.status" }),
        textField(schemaLabel(schema, "text.emergency", "Emergency text"), dto.text?.emergency ?? null, { empty: empty("none"), path: "text.emergency" }),
      ],
    },
    {
      title: "Paths",
      columns: 1,
      fields: [
        textField(schemaLabel(schema, "paths.digipeaterPaths", "APRS path"), formatAprsPath(dto.paths), { empty: empty("none"), path: "paths.digipeaterPaths" }),
      ],
    },
    {
      title: "Digipeater",
      columns: 2,
      fields: [
        textField(schemaLabel(schema, "digipeater.selector", "Digipeater"), dto.digipeater?.selector ?? null, {
          control: "select",
          empty: empty("none"),
          options: optionsWithCurrent(["01", "11", "12", "13", "14", "15"], dto.digipeater?.selector ?? empty("none"), {
            blank: blankEmpty,
            labels: {
              "01": "Disabled",
              11: "WIDE1",
              12: "WIDE2",
              13: "WIDE3",
              14: "WIDE1 + WIDE2",
              15: "WIDE1 + WIDE2 + WIDE3",
            },
          }),
          path: "digipeater.selector",
        }),
        numberField(schemaLabel(schema, "digipeater.forwardDelayMs", "Forward delay"), dto.digipeater?.forwardDelayMs ?? null, { empty: empty("unknown"), unit: "ms", path: "digipeater.forwardDelayMs" }),
      ],
    },
  ];
}

function ssidOptions(includeBlank) {
  return selectOptions(Array.from({ length: 16 }, (_, ssid) => ssid), {
    blank: includeBlank,
    labels: { 0: "none" },
  });
}

function formatAprsPath(paths) {
  const parts = paths?.digipeaterPaths?.filter(Boolean) ?? [];
  if (parts.length > 0) return parts.join(", ");
  return paths?.legacyPreset ?? null;
}
