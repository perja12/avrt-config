import { checkboxField, numberField, optionsWithCurrent, schemaLabel, schemaOptionsWithCurrent, textField } from "./form-fields.js";

export function deviceLayoutSections(dto = {}, { blankEmpty = false, schema = null } = {}) {
  dto ??= {};
  const empty = (fallback) => blankEmpty ? "" : fallback;

  return [
    {
      title: "Device info",
      columns: 2,
      fields: [
        textField(schemaLabel(schema, "firmware.raw", "Firmware"), dto.firmware?.raw ?? null, { empty: empty("unknown") }),
        textField(schemaLabel(schema, "metadata.profile", "Profile"), formatProfile(dto.metadata), { empty: empty("unknown") }),
        textField(schemaLabel(schema, "temperatureUnit", "Temperature unit"), dto.temperatureUnit ?? null, {
          control: "select",
          empty: empty("unknown"),
          width: "compact",
          options: optionsWithCurrent(["C", "F"], dto.temperatureUnit ?? empty("unknown"), { blank: blankEmpty }),
          path: "temperatureUnit",
        }),
      ],
    },
    {
      title: "Indicators",
      columns: 3,
      fields: [
        checkboxField(schemaLabel(schema, "features.beep", "Beep"), dto.features?.beep ?? null, { path: "features.beep" }),
        checkboxField(schemaLabel(schema, "audioAndRadio.blueLed", "Blue LED"), dto.audioAndRadio?.blueLed ?? null, { path: "audioAndRadio.blueLed" }),
        textField(schemaLabel(schema, "audioAndRadio.lowLed", "LED brightness"), dto.audioAndRadio?.lowLed ?? null, {
          control: "select",
          empty: empty("unknown"),
          options: schemaOptionsWithCurrent(schema, "audioAndRadio.lowLed", dto.audioAndRadio?.lowLed ?? empty("unknown"), {
            blank: blankEmpty,
            fallback: [
              { value: "false", label: "Normal brightness" },
              { value: "true", label: "Low intensity" },
            ],
          }),
          path: "audioAndRadio.lowLed",
        }),
      ],
    },
    {
      title: "Power management",
      columns: 1,
      fields: [
        checkboxField(schemaLabel(schema, "power.automaticPowerOff", "90-minute power off"), dto.power?.automaticPowerOff ?? null, { path: "power.automaticPowerOff" }),
      ],
    },
    {
      title: "Telemetry",
      columns: 3,
      fields: [
        checkboxField(schemaLabel(schema, "telemetry.enabled", "Enabled"), dto.telemetry?.enabled ?? null, { path: "telemetry.enabled" }),
        numberField(schemaLabel(schema, "telemetry.everyPositionPackets", "Send telemetry every N position packets"), dto.telemetry?.everyPositionPackets ?? null, { empty: empty("unknown"), path: "telemetry.everyPositionPackets" }),
        checkboxField(schemaLabel(schema, "audioAndRadio.voltageInComment", "Voltage in comment"), dto.audioAndRadio?.voltageInComment ?? null, { path: "audioAndRadio.voltageInComment" }),
        checkboxField(schemaLabel(schema, "audioAndRadio.temperatureInComment", "Temperature in comment"), dto.audioAndRadio?.temperatureInComment ?? null, { path: "audioAndRadio.temperatureInComment" }),
        checkboxField(schemaLabel(schema, "audioAndRadio.tfStateInComment", "TF state in comment"), dto.audioAndRadio?.tfStateInComment ?? null, { path: "audioAndRadio.tfStateInComment" }),
      ],
    },
    {
      title: "Storage and advanced",
      columns: 3,
      fields: [
        textField(schemaLabel(schema, "tfCard.format", "TF format"), dto.tfCard?.format ?? null, {
          control: "select",
          empty: empty("unknown"),
          width: "compact",
          options: optionsWithCurrent(["gpx", "kml"], dto.tfCard?.format ?? empty("unknown"), { blank: blankEmpty }),
          path: "tfCard.format",
        }),
        numberField(schemaLabel(schema, "tfCard.writeIntervalSeconds", "Write interval"), dto.tfCard?.writeIntervalSeconds ?? null, { empty: empty("unknown"), unit: "s", path: "tfCard.writeIntervalSeconds" }),
        checkboxField(schemaLabel(schema, "features.busyWaitFree", "Busy wait free"), dto.features?.busyWaitFree ?? null, { path: "features.busyWaitFree" }),
        checkboxField(schemaLabel(schema, "features.txSerialUiOutput", "Include own packets in AX.25 UI output"), dto.features?.txSerialUiOutput ?? null, { path: "features.txSerialUiOutput" }),
      ],
    },
    {
      title: "Experimental features",
      description: "Do not enable unless hardware modification has been completed. See user manual.",
      descriptionTone: "warning",
      columns: 3,
      fields: [
        checkboxField(schemaLabel(schema, "features.highAltitude", "High altitude"), dto.features?.highAltitude ?? null, { path: "features.highAltitude" }),
        checkboxField(schemaLabel(schema, "power.autoOnOffEnabled", "Auto on/off"), dto.power?.autoOnOffEnabled ?? null, { path: "power.autoOnOffEnabled" }),
        numberField(schemaLabel(schema, "power.autoOffDelaySeconds", "Auto-off delay"), dto.power?.autoOffDelaySeconds ?? null, { empty: empty("unknown"), unit: "s", path: "power.autoOffDelaySeconds" }),
      ],
    },
  ];
}

function formatProfile(metadata) {
  if (!metadata?.profile) return null;
  return `${metadata.profile}${metadata.hardwareTested ? " (hardware tested)" : ""}`;
}
