import { checkboxField, numberField, optionsWithCurrent, schemaLabel, schemaOptionsWithCurrent, textField } from "./form-fields.js";
import { formatFixedPositionPacket } from "../tracker-config/virtual-gps.js";

export function beaconingLayoutSections(dto = {}, { blankEmpty = false, schema = null } = {}) {
  dto ??= {};
  const empty = (fallback) => blankEmpty ? "" : fallback;
  const fixedPosition = dto.gps?.virtual ?? {};

  return [
    {
      title: "Transmit cadence",
      columns: 2,
      fields: [
        numberField(schemaLabel(schema, "transmission.beaconIntervalSeconds", "TX interval"), dto.transmission?.beaconIntervalSeconds ?? null, { empty: empty("unknown"), unit: "s", path: "transmission.beaconIntervalSeconds" }),
        textField(schemaLabel(schema, "transmission.mode", "Mode"), dto.transmission?.mode ?? null, {
          control: "select",
          empty: empty("unknown"),
          options: optionsWithCurrent(["manual", "smart", "smart+manual"], dto.transmission?.mode ?? empty("unknown"), { blank: blankEmpty }),
          path: "transmission.mode",
        }),
      ],
    },
    {
      title: "Smart Beaconing",
      columns: 3,
      fields: [
        numberField(schemaLabel(schema, "smartBeaconing.lowSpeedKmh", "Low speed"), dto.smartBeaconing?.lowSpeedKmh ?? null, { empty: empty("unknown"), unit: "km/h", path: "smartBeaconing.lowSpeedKmh" }),
        numberField(schemaLabel(schema, "smartBeaconing.slowRateSeconds", "Slow rate"), dto.smartBeaconing?.slowRateSeconds ?? null, { empty: empty("unknown"), unit: "s", path: "smartBeaconing.slowRateSeconds" }),
        numberField(schemaLabel(schema, "smartBeaconing.highSpeedKmh", "High speed"), dto.smartBeaconing?.highSpeedKmh ?? null, { empty: empty("unknown"), unit: "km/h", path: "smartBeaconing.highSpeedKmh" }),
        numberField(schemaLabel(schema, "smartBeaconing.fastRateSeconds", "Fast rate"), dto.smartBeaconing?.fastRateSeconds ?? null, { empty: empty("unknown"), unit: "s", path: "smartBeaconing.fastRateSeconds" }),
        numberField(schemaLabel(schema, "smartBeaconing.turnSlope", "Turn slope"), dto.smartBeaconing?.turnSlope ?? null, { empty: empty("unknown"), unit: "degree * km/h", path: "smartBeaconing.turnSlope" }),
        numberField(schemaLabel(schema, "smartBeaconing.turnAngleDegrees", "Turn angle"), dto.smartBeaconing?.turnAngleDegrees ?? null, { empty: empty("unknown"), unit: "°", path: "smartBeaconing.turnAngleDegrees" }),
        numberField(schemaLabel(schema, "smartBeaconing.turnTimeSeconds", "Turn time"), dto.smartBeaconing?.turnTimeSeconds ?? null, { empty: empty("unknown"), unit: "s", path: "smartBeaconing.turnTimeSeconds" }),
      ],
    },
    {
      title: "Smart Beaconing symbols",
      columns: 2,
      fields: [
        textField(schemaLabel(schema, "symbols.aboveHighSpeed.table", "High-speed table"), dto.symbols?.aboveHighSpeed?.table ?? null, { empty: empty("unknown"), width: "compact", path: "symbols.aboveHighSpeed.table" }),
        textField(schemaLabel(schema, "symbols.aboveHighSpeed.code", "High-speed symbol"), dto.symbols?.aboveHighSpeed?.code ?? null, { empty: empty("unknown"), width: "compact", path: "symbols.aboveHighSpeed.code" }),
        textField(schemaLabel(schema, "symbols.moving.table", "Moving table"), dto.symbols?.moving?.table ?? null, { empty: empty("unknown"), width: "compact", path: "symbols.moving.table" }),
        textField(schemaLabel(schema, "symbols.moving.code", "Moving symbol"), dto.symbols?.moving?.code ?? null, { empty: empty("unknown"), width: "compact", path: "symbols.moving.code" }),
        textField(schemaLabel(schema, "symbols.parked.table", "Parked table"), dto.symbols?.parked?.table ?? null, { empty: empty("unknown"), width: "compact", path: "symbols.parked.table" }),
        textField(schemaLabel(schema, "symbols.parked.code", "Parked symbol"), dto.symbols?.parked?.code ?? null, { empty: empty("unknown"), width: "compact", path: "symbols.parked.code" }),
      ],
    },
    {
      title: "Position offset",
      description: "Each step is 0.01 arcmin. Positive longitude moves east and negative west; positive latitude moves north and negative south.",
      columns: 2,
      fields: [
        checkboxField(schemaLabel(schema, "chinaMapOffset.enabled", "Enabled"), dto.chinaMapOffset?.enabled ?? null, { path: "chinaMapOffset.enabled" }),
        numberField(schemaLabel(schema, "chinaMapOffset.longitudeOffset", "Longitude offset"), dto.chinaMapOffset?.longitudeOffset ?? null, { empty: empty("unknown"), unit: "0.01 arcmin/step", width: "normal", path: "chinaMapOffset.longitudeOffset" }),
        numberField(schemaLabel(schema, "chinaMapOffset.latitudeOffset", "Latitude offset"), dto.chinaMapOffset?.latitudeOffset ?? null, { empty: empty("unknown"), unit: "0.01 arcmin/step", width: "normal", path: "chinaMapOffset.latitudeOffset" }),
      ],
    },
    {
      title: "Fixed position",
      columns: 2,
      fields: [
        checkboxField(schemaLabel(schema, "gps.virtual.enabled", "Use fixed position"), fixedPosition.enabled ?? null, { path: "gps.virtual.enabled" }),
        textField(schemaLabel(schema, "gps.virtual.packet", "Generated fixed-position packet"), formatFixedPositionPacket(fixedPosition) ?? fixedPosition.packet ?? null, { empty: empty("none"), path: "gps.virtual.packet", disabled: true }),
        numberField(schemaLabel(schema, "gps.virtual.position.latitude", "Fixed latitude"), fixedPosition.position?.latitude ?? null, { empty: empty("unknown"), unit: "°", path: "gps.virtual.position.latitude" }),
        numberField(schemaLabel(schema, "gps.virtual.position.longitude", "Fixed longitude"), fixedPosition.position?.longitude ?? null, { empty: empty("unknown"), unit: "°", path: "gps.virtual.position.longitude" }),
        textField(schemaLabel(schema, "gps.virtual.symbol.table", "Fixed-position symbol table / overlay"), fixedPosition.symbol?.table ?? null, { empty: empty("unknown"), width: "compact", path: "gps.virtual.symbol.table" }),
        textField(schemaLabel(schema, "gps.virtual.symbol.code", "Fixed-position symbol code"), fixedPosition.symbol?.code ?? null, { empty: empty("unknown"), width: "compact", path: "gps.virtual.symbol.code" }),
        phgSelect(schema, "gps.virtual.phg.powerWatts", fixedPosition.phg?.powerWatts),
        phgSelect(schema, "gps.virtual.phg.heightFeet", fixedPosition.phg?.heightFeet),
        phgSelect(schema, "gps.virtual.phg.gainDb", fixedPosition.phg?.gainDb),
        phgSelect(schema, "gps.virtual.phg.directivityDegrees", fixedPosition.phg?.directivityDegrees),
        ...(fixedPosition.advancedRawPacket !== null && fixedPosition.advancedRawPacket !== undefined
          ? [textField(schemaLabel(schema, "gps.virtual.advancedRawPacket", "Advanced raw packet"), fixedPosition.advancedRawPacket, { empty: empty("none"), path: "gps.virtual.advancedRawPacket" })]
          : []),
      ],
    },
  ];
}

function phgSelect(schema, path, value) {
  const fallbackLabels = {
    "gps.virtual.phg.powerWatts": "PHG power",
    "gps.virtual.phg.heightFeet": "PHG height",
    "gps.virtual.phg.gainDb": "PHG gain",
    "gps.virtual.phg.directivityDegrees": "PHG direction",
  };
  return textField(schemaLabel(schema, path, fallbackLabels[path]), value ?? null, {
    control: "select",
    empty: "none",
    options: schemaOptionsWithCurrent(schema, path, value, { blank: true }),
    path,
  });
}
