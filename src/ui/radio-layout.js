import { numberField, schemaLabel, schemaOptionsWithCurrent, textField } from "./form-fields.js";

export function radioLayoutSections(dto = {}, { blankEmpty = false, schema = null } = {}) {
  dto ??= {};
  const empty = (fallback) => blankEmpty ? "" : fallback;

  return [
    {
      title: "RF",
      columns: 3,
      fields: [
        numberField(schemaLabel(schema, "transmission.frequencyMHz", "Frequency"), dto.transmission?.frequencyMHz ?? null, { empty: empty("unknown"), unit: "MHz", path: "transmission.frequencyMHz" }),
        textField(schemaLabel(schema, "transmission.txPowerWatts", "TX power"), dto.transmission?.txPowerWatts ?? null, {
          control: "select",
          empty: empty("unknown"),
          options: schema?.fields?.["transmission.txPowerWatts"]?.options ?? [
            { value: "0.5", label: "0.5 W" },
            { value: "1", label: "1 W" },
          ],
          path: "transmission.txPowerWatts",
        }),
        numberField(schemaLabel(schema, "transmission.pttDelayMs", "PTT delay"), dto.transmission?.pttDelayMs ?? null, { empty: empty("unknown"), unit: "ms", path: "transmission.pttDelayMs" }),
      ],
    },
    {
      title: "Audio",
      columns: 3,
      fields: [
        numberField(schemaLabel(schema, "transmission.txVolume", "TX volume"), dto.transmission?.txVolume ?? null, { empty: empty("unknown"), path: "transmission.txVolume" }),
        numberField(schemaLabel(schema, "transmission.rxVolume", "RX volume"), dto.transmission?.rxVolume ?? null, { empty: empty("unknown"), path: "transmission.rxVolume" }),
      ],
    },
    {
      title: "Receiver",
      columns: 3,
      fields: [
        numberField(schemaLabel(schema, "audioAndRadio.squelch", "Squelch"), dto.audioAndRadio?.squelch ?? null, { empty: empty("unknown"), path: "audioAndRadio.squelch" }),
        textField(schemaLabel(schema, "audioAndRadio.dcd", "Blue LED indicates"), dto.audioAndRadio?.dcd ?? null, {
          control: "select",
          empty: empty("unknown"),
          options: schemaOptionsWithCurrent(schema, "audioAndRadio.dcd", dto.audioAndRadio?.dcd ?? empty("unknown"), {
            blank: blankEmpty,
            fallback: [
              { value: "false", label: "Squelch" },
              { value: "true", label: "Software DCD (Data Carrier Detect)" },
            ],
          }),
          path: "audioAndRadio.dcd",
        }),
      ],
    },
  ];
}
