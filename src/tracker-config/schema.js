import { PHG_DIRECTIVITY_DEGREES, PHG_GAIN_DB, PHG_HEIGHT_FEET, PHG_POWER_WATTS } from "./virtual-gps.js";

const option = (value, label = value) => ({ value, label });

const fields = {
  "firmware.raw": { type: "text", label: "Firmware", nullable: true, editable: false, templateEligible: false },
  "metadata.profile": { type: "text", label: "Profile", nullable: true, editable: false, templateEligible: false },
  "identity.callsign": { type: "text", label: "Callsign", help: { summary: "The APRS station callsign transmitted by the tracker.", details: "Use the callsign assigned to the station. AP510 callsigns are limited to six uppercase letters and numbers." }, nullable: true, maxLength: 6, pattern: "^[A-Z0-9]{1,6}$", templateKeepAllowed: true },
  "identity.ssid": { type: "select", label: "SSID", help: { summary: "An APRS suffix used to distinguish this station or device.", details: "SSID 0 means no suffix. Other values are conventionally used to identify different station types or multiple devices sharing a callsign." }, nullable: true, valueType: "number", templateKeepAllowed: true, options: Array.from({ length: 16 }, (_, value) => option(String(value), value === 0 ? "None" : String(value))) },
  "decodeOutput": { type: "select", label: "Decode output", help: { summary: "Selects the format used for decoded packets sent to the serial connection.", details: "KISS provides packet frames, Waypoint provides decoded waypoint data, and AX.25 UI provides unnumbered information frames." }, nullable: true, options: [option("KISS", "KISS"), option("waypoint", "Waypoint"), option("UI", "AX.25 UI (Unnumbered Information)")] },
  "micE.enabled": { type: "boolean", label: "MIC-E", nullable: true },
  "micE.messageType": { type: "select", label: "MIC-E type", nullable: true, valueType: "number", options: messageTypeOptions() },
  "micE.emergencyMessage": { type: "select", label: "MIC-E emergency type", nullable: true, valueType: "number", options: messageTypeOptions() },
  "text.comment": { type: "text", label: "Comment", nullable: true, maxLength: 48, templateKeepAllowed: true },
  "text.status": { type: "text", label: "Status", nullable: true, maxLength: 48, templateKeepAllowed: true },
  "text.emergency": { type: "text", label: "Emergency text", nullable: true, maxLength: 31 },
  "paths.digipeaterPaths": {
    type: "path-list",
    label: "APRS path",
    nullable: true,
    maxItems: 3,
    maxLength: 32,
    itemPattern: "^[A-Z0-9]{1,6}-[0-9]$",
    pattern: "^\\s*(?:[A-Z0-9]{1,6}-[0-9](?:,\\s*[A-Z0-9]{1,6}-[0-9]){0,2})?\\s*$",
    validationMessage: "Enter up to three paths in ALIAS-N format, for example WIDE1-1, WIDE2-1.",
  },
  "transmission.fixedSymbol.table": { type: "text", label: "Table", nullable: true, minLength: 1, maxLength: 1, latin1: true },
  "transmission.fixedSymbol.code": { type: "text", label: "Code", nullable: true, minLength: 1, maxLength: 1, latin1: true },
  "transmission.mode": {
    type: "select",
    label: "Mode",
    nullable: true,
    options: ["manual", "auto", "manual+auto", "smart", "smart+manual"].map((value) => option(value)),
  },
  "transmission.pttDelayMs": { type: "number", label: "PTT delay", nullable: true, integer: true, options: [60, 120, 180, 300, 480, 600, 1000].map((value) => option(String(value), `${value} ms`)) },
  "transmission.beaconIntervalSeconds": { type: "number", label: "TX interval", nullable: true, integer: true, min: 1, max: 9999 },
  "transmission.frequencyMHz": { type: "number", label: "Frequency", nullable: true, min: 136, max: 174, step: 0.0001 },
  "transmission.txPowerWatts": { type: "select", label: "TX power", nullable: false, valueType: "number", options: [0.5, 1].map((value) => option(String(value), `${value} W`)) },
  "transmission.txVolume": { type: "number", label: "TX volume", nullable: true, integer: true, min: 1, max: 6 },
  "transmission.rxVolume": { type: "number", label: "RX volume", nullable: true, integer: true, min: 1, max: 9 },
  "features.beep": { type: "boolean", label: "Beep", nullable: true },
  "features.highAltitude": { type: "boolean", label: "High altitude", nullable: true },
  "features.busyWaitFree": { type: "boolean", label: "Busy wait free", nullable: true },
  "features.txSerialUiOutput": { type: "boolean", label: "Include own packets in AX.25 UI output", nullable: true },
  "audioAndRadio.squelch": { type: "number", label: "Squelch", nullable: true, integer: true, min: 0, max: 8 },
  "audioAndRadio.dcd": {
    type: "select",
    label: "Blue LED indicates",
    nullable: true,
    valueType: "boolean",
    options: [
      option("false", "Squelch"),
      option("true", "Software DCD (Data Carrier Detect)"),
    ],
  },
  "audioAndRadio.voltageInComment": { type: "boolean", label: "Voltage in comment", nullable: true },
  "audioAndRadio.temperatureInComment": { type: "boolean", label: "Temperature in comment", nullable: true },
  "audioAndRadio.tfStateInComment": { type: "boolean", label: "TF state in comment", nullable: true },
  "audioAndRadio.blueLed": { type: "boolean", label: "Blue LED", nullable: true },
  "audioAndRadio.lowLed": {
    type: "select",
    label: "LED brightness",
    nullable: true,
    valueType: "boolean",
    options: [
      option("false", "Normal brightness"),
      option("true", "Low intensity"),
    ],
  },
  "telemetry.enabled": { type: "boolean", label: "Telemetry", nullable: true },
  "telemetry.everyPositionPackets": { type: "number", label: "Send telemetry every N position packets", nullable: true, integer: true, min: 1, max: 99 },
  "timeslot.enabled": { type: "boolean", label: "Timeslot", nullable: true },
  "timeslot.second": { type: "number", label: "Timeslot second", nullable: true, integer: true, min: 0, max: 59 },
  "tfCard.format": { type: "select", label: "TF format", nullable: true, options: [option("gpx", "GPX"), option("kml", "KML")] },
  "tfCard.writeIntervalSeconds": { type: "number", label: "Write interval", nullable: true, integer: true, min: 0, max: 9999 },
  "temperatureUnit": { type: "select", label: "Temperature unit", nullable: true, options: [option("C", "°C"), option("F", "°F")] },
  "gps.virtual.enabled": { type: "boolean", label: "Use fixed position", nullable: true },
  "gps.virtual.position.latitude": { type: "number", label: "Fixed latitude", nullable: true, min: -90, max: 90, step: 0.000001 },
  "gps.virtual.position.longitude": { type: "number", label: "Fixed longitude", nullable: true, min: -180, max: 180, step: 0.000001 },
  "gps.virtual.symbol.table": { type: "text", label: "Fixed-position symbol table / overlay", nullable: true, minLength: 1, maxLength: 1, pattern: "^[/\\\\0-9A-Za-z]$", latin1: true },
  "gps.virtual.symbol.code": { type: "text", label: "Fixed-position symbol code", nullable: true, minLength: 1, maxLength: 1, pattern: "^[!-~]$", latin1: true },
  "gps.virtual.phg.powerWatts": { type: "select", label: "PHG power", nullable: true, valueType: "number", options: PHG_POWER_WATTS.map((value) => option(String(value), `${value} W`)) },
  "gps.virtual.phg.heightFeet": { type: "select", label: "PHG height", nullable: true, valueType: "number", options: PHG_HEIGHT_FEET.map((value) => option(String(value), `${value} ft`)) },
  "gps.virtual.phg.gainDb": { type: "select", label: "PHG gain", nullable: true, valueType: "number", options: PHG_GAIN_DB.map((value) => option(String(value), `${value} dB`)) },
  "gps.virtual.phg.directivityDegrees": { type: "select", label: "PHG direction", nullable: true, valueType: "number", options: PHG_DIRECTIVITY_DEGREES.map((value) => option(String(value), value === 0 ? "Omnidirectional" : `${value}°`)) },
  "smartBeaconing.lowSpeedKmh": { type: "number", label: "Slow-speed threshold", nullable: true, integer: true, min: 1, max: 999 },
  "smartBeaconing.slowRateSeconds": { type: "number", label: "Stopped/slow interval", nullable: true, integer: true, min: 1, max: 9999 },
  "smartBeaconing.highSpeedKmh": { type: "number", label: "High-speed threshold", nullable: true, integer: true, min: 1, max: 999 },
  "smartBeaconing.fastRateSeconds": { type: "number", label: "High-speed interval", nullable: true, integer: true, min: 1, max: 999 },
  "smartBeaconing.turnSlope": { type: "number", label: "Low-speed turn filtering (turn slope)", nullable: true, integer: true, min: 1, max: 999 },
  "smartBeaconing.turnAngleDegrees": { type: "number", label: "Base turn angle", nullable: true, integer: true, min: 1, max: 999 },
  "smartBeaconing.turnTimeSeconds": { type: "number", label: "Minimum spacing for turn updates", nullable: true, integer: true, min: 1, max: 999 },
  "gps.virtual.packet": { type: "text", label: "Generated fixed-position packet", nullable: true, editable: false, templateEligible: false, latin1: true },
  "gps.virtual.advancedRawPacket": { type: "text", label: "Advanced raw packet", nullable: true, templateEligible: false, latin1: true },
  "power.automaticPowerOff": { type: "boolean", label: "90-minute power off", nullable: true },
  "power.autoOnOffEnabled": { type: "boolean", label: "Auto on/off", nullable: true },
  "power.autoOffDelaySeconds": { type: "number", label: "Auto-off delay", nullable: true, integer: true, min: 0, max: 99999 },
  "symbols.emergency.table": symbolRule("Emergency table"),
  "symbols.emergency.code": symbolRule("Emergency symbol"),
  "symbols.aboveHighSpeed.table": symbolRule("High-speed table"),
  "symbols.aboveHighSpeed.code": symbolRule("High-speed symbol"),
  "symbols.moving.table": symbolRule("Moving table"),
  "symbols.moving.code": symbolRule("Moving symbol"),
  "symbols.parked.table": symbolRule("Parked table"),
  "symbols.parked.code": symbolRule("Parked symbol"),
  "digipeater.selector": {
    type: "select",
    label: "Digipeater",
    nullable: true,
    options: [
      option("01", "Disabled"),
      option("11", "WIDE1"),
      option("12", "WIDE2"),
      option("13", "WIDE3"),
      option("14", "WIDE1 + WIDE2"),
      option("15", "WIDE1 + WIDE2 + WIDE3"),
    ],
  },
  "digipeater.enabled": { type: "boolean", label: "Digipeater enabled", nullable: true, editable: false },
  "digipeater.alias": {
    type: "select",
    label: "Digipeater alias",
    nullable: true,
    editable: false,
    options: [
      option("11", "WIDE1"),
      option("12", "WIDE2"),
      option("13", "WIDE3"),
      option("14", "WIDE1 + WIDE2"),
      option("15", "WIDE1 + WIDE2 + WIDE3"),
    ],
  },
  "digipeater.forwardDelayMs": { type: "number", label: "Forward delay", nullable: true, integer: true, min: 0, max: 9999, defaultWhenEnabled: 800 },
  "chinaMapOffset.enabled": { type: "boolean", label: "Enabled", nullable: true },
  "chinaMapOffset.longitudeOffset": { type: "number", label: "Longitude offset", nullable: true, integer: true, min: -45, max: 45 },
  "chinaMapOffset.latitudeOffset": { type: "number", label: "Latitude offset", nullable: true, integer: true, min: -45, max: 45 },
  "chinaMapOffset.raw": { type: "text", label: "Encoded position offset", nullable: true, editable: false },
};

const helpByPath = {
  "identity.callsign": {
    summary: "The callsign transmitted by the tracker.",
    details: "Use the station callsign in uppercase letters and numbers. Callsigns are limited to six characters here; enter the SSID separately.",
  },
  "identity.ssid": {
    summary: "An APRS suffix used to distinguish this station or device.",
    details: "APRS provides 16 SSID values, from 0 through 15. SSID 0 is normally displayed without a suffix; values 10–15 are written as -10 through -15. These are common APRS conventions, not strict technical restrictions.",
    table: {
      caption: "Common APRS SSID conventions",
      headers: ["AP510 value", "Typical use"],
      rows: [
        ["0", "Primary fixed station; normally shown without an SSID"],
        ["1", "Additional station, digipeater, mobile, or weather station"],
        ["2", "Additional station, digipeater, mobile, or weather station"],
        ["3", "Additional station, digipeater, mobile, or weather station"],
        ["4", "Additional station, digipeater, mobile, or weather station"],
        ["5", "Other network or special network device"],
        ["6", "Special activity, satellite, camping, or 6 metre operation"],
        ["7", "Handheld or other portable station"],
        ["8", "Boat, sailing vessel, motorhome, or secondary mobile"],
        ["9", "Primary mobile station or tracker"],
        ["10", "Internet gateway, IGate, EchoLink, Winlink, or similar service"],
        ["11", "Balloon, aircraft, or spacecraft"],
        ["12", "APRS tracker, APRStt, DTMF, RFID, or one-way device"],
        ["13", "Weather station"],
        ["14", "Truck or full-time road vehicle"],
        ["15", "Other additional station, digipeater, mobile, or weather station"],
      ],
    },
  },
  "decodeOutput": {
    summary: "The format used for decoded packets sent to the serial connection.",
    details: "KISS provides packet frames, Waypoint provides decoded waypoint data, and UI provides AX.25 Unnumbered Information output.",
  },
  "micE.enabled": { summary: "Enables compressed MIC-E position packets.", details: "Use this when the receiving APRS system expects MIC-E compressed position reports." },
  "micE.messageType": { summary: "The normal MIC-E message class.", details: "The available classes are Emergency, Priority, Special, Committed, Returning, In service, En route, and Off duty." },
  "micE.emergencyMessage": { summary: "The MIC-E message class used for emergency packets.", details: "Choose the message class that should identify the tracker when it reports an emergency. This is separate from the normal MIC-E type." },
  "text.comment": { summary: "Text appended to normal APRS position comments.", details: "Use a short message such as a name, activity, or contact detail. Plain ASCII is safest; avoid unusual characters if the comment must be readable by all APRS clients." },
  "text.status": { summary: "The APRS status message is sent by the tracker when there is aquired position.", details: "Use this for a short current-status message, operating mode, or useful station information when device is without GPS coverage. Keep it concise and use plain ASCII for the best compatibility." },
  "text.emergency": { summary: "Text sent when the tracker sends an emergency message.", details: "By holding the button for 10 seconds the device will send what is configured here." },
  "paths.digipeaterPaths": { summary: "Up to three digipeater paths used for APRS packets.", details: "Use the shortest path that gives the required coverage. WIDE1-1,WIDE2-1 is a common mobile or portable choice; longer paths create more network traffic. Enter aliases in ALIAS-N form, separated by commas." },
  "transmission.fixedSymbol.table": { summary: "The APRS symbol table or overlay for fixed-rate packets.", details: "The table is normally / for a primary symbol or \\ for an alternate table. Choose the table together with the symbol code to describe what the station represents." },
  "transmission.fixedSymbol.code": { summary: "The APRS symbol code for fixed-rate packets.", details: "This is the one-character APRS symbol paired with the fixed symbol table." },
  "transmission.mode": { summary: "Selects how the tracker schedules position transmissions.", details: "Manual: briefly press the button on the tracker to send a position report. Auto: send reports at the fixed beacon interval. Smart: adjust the interval to speed and send earlier reports when turning. Manual+Auto: combine button presses with fixed-interval reports. Smart+Manual: combine Smart Beaconing with button presses." },
  "transmission.pttDelayMs": { summary: "The delay between keying the transmitter and sending a packet.", details: "Choose a longer delay when your radio or amplifier needs more time to become ready. Available values are 60, 120, 180, 300, 480, 600, and 1000 milliseconds." },
  "transmission.beaconIntervalSeconds": { summary: "The interval between fixed or automatic position beacons.", details: "This value is in seconds and applies to fixed/automatic beaconing. Smart Beaconing uses its own rate fields." },
  "transmission.frequencyMHz": { summary: "The radio operating frequency in MHz.", details: "Enter the frequency assigned for your operation, within the AP510 range of 136–174 MHz. Use the same frequency as the stations and digipeaters you need to reach." },
  "transmission.txPowerWatts": { summary: "The selected transmitter power.", details: "Choose 0.5 W for lower power use or when coverage is already sufficient. Choose 1 W when you need the additional range and it is permitted for your operating situation." },
  "transmission.txVolume": { summary: "The transmit audio level.", details: "Increase this only as needed for clear transmitted audio. Excessive audio can cause distortion." },
  "transmission.rxVolume": { summary: "The receive audio level.", details: "Set this to a comfortable listening level. Some AP510 hardware revisions do not have a speaker, so this setting may have no audible effect." },
  "features.beep": { summary: "Enables the tracker’s audible beep feedback.", details: "Turn this on when audible confirmation is useful, or off when the tracker should operate quietly." },
  "features.highAltitude": { summary: "Enables the tracker’s high-altitude operating option.", details: "Use this only when the tracker is intended for high-altitude operation and you understand the effect it has on position reporting." },
  "features.busyWaitFree": { summary: "Enables the tracker’s busy-wait-free operating option.", details: "The tracker will wait with transmissions if it detects an ongoing transmission. Keep this enabled unless you have a specific reason to change the tracker’s handling of busy periods." },
  "features.txSerialUiOutput": { summary: "Includes the tracker’s own packets in AX.25 UI serial output.", details: "Enable this when a connected computer or application should also receive packets generated by this tracker." },
  "audioAndRadio.squelch": { summary: "Sets the receiver squelch threshold.", details: "Choose a low value when weak signals are important; choose a higher value to keep noise muted. The available range is 0–8." },
  "audioAndRadio.dcd": { summary: "Selects what the blue LED indicates while receiving.", details: "Squelch uses the receiver squelch state; Software DCD uses the AP510’s software Data Carrier Detect state." },
  "audioAndRadio.voltageInComment": { summary: "Adds battery voltage to the APRS comment.", details: "This is independent of telemetry: the tracker can append voltage to normal position comments even when telemetry is disabled." },
  "audioAndRadio.temperatureInComment": { summary: "Adds temperature to the APRS comment.", details: "This is an individual feature flag for normal position comments and is separate from telemetry packets." },
  "audioAndRadio.tfStateInComment": { summary: "Adds TF-card state information to the APRS comment.", details: "The TF/X flag controls whether card state is included in normal position comments." },
  "audioAndRadio.blueLed": { summary: "Enables the blue LED indication.", details: "The blue LED indication source is selected separately by the DCD setting." },
  "audioAndRadio.lowLed": { summary: "Selects normal or reduced LED brightness.", details: "Low intensity reduces the LED brightness; the normal setting uses full brightness." },
  "telemetry.enabled": { summary: "Enables additional telemetry packets.", details: "Turn this on when you want the tracker to send telemetry reports in addition to ordinary position beacons. It is separate from adding voltage, temperature, or TF state to comments." },
  "telemetry.everyPositionPackets": { summary: "Sends a telemetry report after this many position packets.", details: "Use a smaller value for more frequent telemetry and a larger value to reduce airtime. Values from 1 to 99 are supported." },
  "timeslot.enabled": { summary: "Enables the AP510 timeslot feature.", details: "Use this only when your local system or operating plan requires timeslot operation. Otherwise leave it disabled." },
  "timeslot.second": { summary: "Selects the second used by the timeslot feature.", details: "Choose the value specified by the timeslot plan you are following. Do not change it without knowing how the feature is used in your local system." },
  "tfCard.format": { summary: "Selects the file format written to the TF card.", details: "Choose GPX for broad GPS and mapping-software compatibility, or KML for applications that use the Google Earth format." },
  "tfCard.writeIntervalSeconds": { summary: "Sets how often data is written to the TF card.", details: "Use a shorter interval when recent track data is important, and a longer interval to reduce card activity. The value is in seconds; zero disables periodic writing where supported." },
  "temperatureUnit": { summary: "Selects Celsius or Fahrenheit for reported temperature.", details: "Choose Celsius :-)." },
  "gps.virtual.enabled": { summary: "Uses a manually configured fixed position instead of live GPS.", details: "The AP510 calls this feature Virtual GPS. When enabled, the generated APRS information field supplies the position." },
  "gps.virtual.position.latitude": { summary: "The latitude used for the fixed position.", details: "Enter decimal degrees, from −90 to 90. Use the actual position of the tracker or the position you want it to report." },
  "gps.virtual.position.longitude": { summary: "The longitude used for the fixed position.", details: "Enter decimal degrees, from −180 to 180. Use the actual position of the tracker or the position you want it to report." },
  "gps.virtual.symbol.table": { summary: "The APRS table or overlay used by the fixed position.", details: "This is the table character in the generated APRS position packet, normally / or \\." },
  "gps.virtual.symbol.code": { summary: "The APRS symbol used by the fixed position.", details: "This is the symbol code character following the table character in the generated packet." },
  "gps.virtual.phg.powerWatts": { summary: "The advertised transmitter power for the fixed position.", details: "Use the transmitter’s actual approximate power. Leave all PHG values empty if you do not want to advertise antenna information." },
  "gps.virtual.phg.heightFeet": { summary: "The advertised antenna height for the fixed position.", details: "Enter the approximate height of the antenna above ground in feet. Complete all PHG fields together or leave them all empty." },
  "gps.virtual.phg.gainDb": { summary: "The advertised antenna gain for the fixed position.", details: "Enter the approximate antenna gain in decibels. Use the value from the antenna specification when available." },
  "gps.virtual.phg.directivityDegrees": { summary: "The advertised main antenna direction for the fixed position.", details: "Use omnidirectional when the antenna radiates in all directions. Otherwise choose the direction of the main lobe." },
  "gps.virtual.packet": { summary: "A preview of the fixed-position APRS packet.", details: "This is generated from the coordinates, symbol, and optional PHG values. It is shown so you can check what the tracker will transmit." },
  "gps.virtual.advancedRawPacket": { summary: "An expert override for a fixed-position APRS packet.", details: "Use this only when you need a packet form that the structured fields cannot create. Otherwise use the coordinate, symbol, and PHG fields above." },
  "smartBeaconing.lowSpeedKmh": { summary: "The speed at or below which the slow beacon rate is used.", details: "Set this above normal GPS movement noise, but below the speed at which the tracker should begin reporting more often. The value is in km/h." },
  "smartBeaconing.slowRateSeconds": { summary: "The slow or stationary Smart Beaconing interval.", details: "Use a longer interval when stopped or moving slowly to reduce unnecessary transmissions. The value is in seconds." },
  "smartBeaconing.highSpeedKmh": { summary: "The speed at or above which the fast beacon rate is used.", details: "Set this near or above the normal top speed of the vehicle. Above this speed, the tracker uses the fast rate." },
  "smartBeaconing.fastRateSeconds": { summary: "The fastest Smart Beaconing interval.", details: "Use a shorter interval when frequent position updates are important, while considering channel activity and battery life. The value is in seconds." },
  "smartBeaconing.turnSlope": { summary: "Adjusts how sensitive turn detection is at lower speeds.", details: "Higher values require a larger heading change at lower speeds. Set to 1 to remove this adjustment. The AP510 manual suggests 100 for bicycles (more aggressive turn reporting) and 240 for cars or motorcycles." },
  "smartBeaconing.turnAngleDegrees": { summary: "The heading change required to trigger a turn beacon.", details: "A smaller value reports more turns; a larger value reduces turn-triggered transmissions. Choose a value appropriate for the route and vehicle." },
  "smartBeaconing.turnTimeSeconds": { summary: "The minimum time between turn-triggered beacons.", details: "Increase this to prevent repeated transmissions during a series of quick turns. The value is in seconds." },
  "power.automaticPowerOff": { summary: "Enables the fixed 90-minute automatic power-off feature.", details: "Some units require a hardware modification for this feature. Enabling it without the required modification may cause unexpected shutdowns." },
  "power.autoOnOffEnabled": { summary: "Enables the configurable automatic on/off feature.", details: "Do not enable this unless the required hardware modification has been completed; otherwise the tracker may power off unexpectedly." },
  "power.autoOffDelaySeconds": { summary: "Sets how long the tracker waits before automatic power-off.", details: "Use this only with the required hardware modification and a clear understanding of when the tracker should shut down. The value is in seconds." },
  "symbols.emergency.table": { summary: "The APRS table or overlay for emergency packets.", details: "Choose the table together with the emergency symbol to show how the station should appear during an emergency." },
  "symbols.emergency.code": { summary: "The APRS symbol used for emergency packets.", details: "Choose a symbol that clearly identifies an emergency station or situation." },
  "symbols.aboveHighSpeed.table": { summary: "The APRS table or overlay used above the high-speed threshold.", details: "Smart Beaconing selects this symbol pair when the tracker is above the configured high-speed threshold." },
  "symbols.aboveHighSpeed.code": { summary: "The APRS symbol used above the high-speed threshold.", details: "This symbol is paired with the above-high-speed table character." },
  "symbols.moving.table": { summary: "The APRS table or overlay used while moving.", details: "Choose the table together with the moving symbol to show how the station should appear while it is in motion." },
  "symbols.moving.code": { summary: "The APRS symbol used while moving.", details: "Choose a symbol that represents the vehicle or activity. The symbol is shown when the tracker is moving." },
  "symbols.parked.table": { summary: "The APRS table or overlay used while parked.", details: "Choose the table together with the parked symbol to show how the station should appear when stopped." },
  "symbols.parked.code": { summary: "The APRS symbol used while parked.", details: "Choose a symbol that represents the station when it is stopped or parked." },
  "digipeater.selector": { summary: "Selects whether the tracker acts as a digipeater and which alias preset it uses.", details: "Available choices are Disabled, WIDE1, WIDE2, WIDE3, WIDE1 + WIDE2, and WIDE1 + WIDE2 + WIDE3. Enable this only when the tracker is intended to relay other stations’ packets." },
  "digipeater.forwardDelayMs": { summary: "The delay before the digipeater forwards a packet.", details: "A longer delay can help avoid immediate collisions with other transmissions. Set this according to the digipeater’s local operating plan; the value is in milliseconds." },
  "chinaMapOffset.enabled": { summary: "Enables the position offset feature.", details: "Use this only when you need to compensate for a known map or coordinate offset. Leave it disabled for ordinary GPS positions." },
  "chinaMapOffset.longitudeOffset": { summary: "The east or west correction applied to longitude.", details: "Use a positive value to move the reported position east and a negative value to move it west. Only use a correction when you know the required offset." },
  "chinaMapOffset.latitudeOffset": { summary: "The north or south correction applied to latitude.", details: "Use a positive value to move the reported position north and a negative value to move it south. Only use a correction when you know the required offset." },
};

for (const [path, rule] of Object.entries(fields)) {
  if (helpByPath[path]) fields[path] = { ...rule, help: helpByPath[path] };
}

function messageTypeOptions() {
  const labels = ["Emergency", "Priority", "Special", "Committed", "Returning", "In service", "En route", "Off duty"];
  return labels.map((label, value) => option(String(value), label));
}

function symbolRule(label) {
  return { type: "text", label, nullable: true, minLength: 1, maxLength: 1, latin1: true };
}

const schema = Object.freeze({
  version: 1,
  fields: Object.freeze(Object.fromEntries(Object.entries(fields).map(([path, rule]) => [path, Object.freeze(rule)]))),
});

export class ConfigValidationError extends Error {
  constructor(errors) {
    super(`configuration contains ${errors.length} invalid field${errors.length === 1 ? "" : "s"}`);
    this.name = "ConfigValidationError";
    this.errors = errors;
  }
}

export function getTrackerConfigSchema() {
  return structuredClone(schema);
}

export function validateTrackerConfigDTO(dto) {
  const errors = [];

  for (const [path, rule] of Object.entries(schema.fields)) {
    const value = getPath(dto, path);
    if (value === undefined || value === null) {
      if (value === null && !rule.nullable) errors.push(error(path, "required", "value cannot be null"));
      continue;
    }

    if (rule.type === "text") validateText(value, path, rule, errors);
    else if (rule.type === "path-list") validatePathList(value, path, rule, errors);
    else if (rule.type === "number") validateNumber(value, path, rule, errors);
    else if (rule.type === "boolean" && typeof value !== "boolean") errors.push(error(path, "type", "value must be a boolean"));
    else if (rule.type === "select") validateOption(value, path, rule, errors);
  }

  if (/^1[1-5]$/.test(dto?.digipeater?.selector ?? "") && (dto.digipeater.forwardDelayMs === null || dto.digipeater.forwardDelayMs === undefined)) {
    errors.push(error("digipeater.forwardDelayMs", "required-when-enabled", "enter a forwarding delay when digipeater is enabled"));
  }

  validateVirtualGps(dto?.gps?.virtual, errors);

  return { valid: errors.length === 0, errors };
}

function validateVirtualGps(virtual, errors) {
  if (!virtual) return;
  const hasRawPacket = typeof virtual.advancedRawPacket === "string" && virtual.advancedRawPacket !== "";
  const isLegacyPacket = typeof virtual.packet === "string" && virtual.position === undefined && virtual.advancedRawPacket === undefined;
  if (virtual.enabled === true && !hasRawPacket && !isLegacyPacket) {
    const required = [
      ["gps.virtual.position.latitude", virtual.position?.latitude],
      ["gps.virtual.position.longitude", virtual.position?.longitude],
      ["gps.virtual.symbol.table", virtual.symbol?.table],
      ["gps.virtual.symbol.code", virtual.symbol?.code],
    ];
    for (const [path, value] of required) {
      if (value === null || value === undefined || value === "") errors.push(error(path, "required-for-fixed-position", "enter a complete fixed position or use the advanced raw packet"));
    }
  }

  const phg = [
    ["gps.virtual.phg.powerWatts", virtual.phg?.powerWatts],
    ["gps.virtual.phg.heightFeet", virtual.phg?.heightFeet],
    ["gps.virtual.phg.gainDb", virtual.phg?.gainDb],
    ["gps.virtual.phg.directivityDegrees", virtual.phg?.directivityDegrees],
  ];
  const supplied = phg.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (supplied.length > 0 && supplied.length < phg.length) {
    for (const [path, value] of phg) {
      if (value === null || value === undefined || value === "") errors.push(error(path, "required-with-phg", "complete all PHG fields or leave all of them empty"));
    }
  }
}

export function assertValidTrackerConfigDTO(dto) {
  const result = validateTrackerConfigDTO(dto);
  if (!result.valid) throw new ConfigValidationError(result.errors);
  return dto;
}

function validateText(value, path, rule, errors) {
  if (typeof value !== "string") {
    errors.push(error(path, "type", "value must be text"));
    return;
  }
  if (rule.maxLength !== undefined && value.length > rule.maxLength) errors.push(error(path, "max-length", `value must be at most ${rule.maxLength} characters`));
  if (rule.minLength !== undefined && value.length < rule.minLength) errors.push(error(path, "min-length", `value must be at least ${rule.minLength} characters`));
  if (rule.pattern && !new RegExp(rule.pattern).test(value)) errors.push(error(path, "pattern", "value has an invalid format"));
  if (rule.latin1 && [...value].some((character) => character.codePointAt(0) > 0xff)) errors.push(error(path, "encoding", "value must contain only Latin-1 characters"));
  if (rule.latin1 && /[\r\n\0]/.test(value)) errors.push(error(path, "control-character", "value may not contain CR, LF, or NUL"));
}

function validatePathList(value, path, rule, errors) {
  if (!Array.isArray(value) || !value.every((part) => part === null || typeof part === "string")) {
    errors.push(error(path, "type", "value must be a list of path components"));
    return;
  }
  const parts = value.filter((part) => part !== null);
  if (rule.maxItems !== undefined && parts.length > rule.maxItems) {
    errors.push(error(path, "max-items", `no more than ${rule.maxItems} APRS paths are supported`));
  }
  if (rule.itemPattern) {
    const itemPattern = new RegExp(rule.itemPattern);
    parts.forEach((part, index) => {
      if (!itemPattern.test(part)) errors.push(error(path, "item-pattern", `path ${index + 1} must look like WIDE1-1`));
    });
  }
  const joined = parts.filter(Boolean).join(",");
  if (rule.maxLength !== undefined && joined.length > rule.maxLength) errors.push(error(path, "max-length", `value must be at most ${rule.maxLength} characters`));
}

function validateNumber(value, path, rule, errors) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(error(path, "type", "value must be a finite number"));
    return;
  }
  if (rule.integer && !Number.isInteger(value)) errors.push(error(path, "integer", "value must be an integer"));
  if (rule.min !== undefined && value < rule.min) errors.push(error(path, "minimum", `value must be at least ${rule.min}`));
  if (rule.max !== undefined && value > rule.max) errors.push(error(path, "maximum", `value must be at most ${rule.max}`));
  validateOption(value, path, rule, errors);
}

function validateOption(value, path, rule, errors) {
  if (rule.valueType === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    errors.push(error(path, "type", "value must be a finite number"));
    return;
  }
  if (rule.valueType === "boolean" && typeof value !== "boolean") {
    errors.push(error(path, "type", "value must be a boolean"));
    return;
  }
  if (!rule.options) return;
  const candidate = String(value);
  if (!rule.options.some((item) => item.value === candidate)) errors.push(error(path, "invalid-option", "value is not one of the allowed options"));
}

function getPath(object, path) {
  return path.split(".").reduce((current, key) => current?.[key], object);
}

function error(path, code, message) {
  return { path, code, message };
}
