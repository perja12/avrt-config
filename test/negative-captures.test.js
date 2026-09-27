import { describe, expect, it } from "vitest";

import { ConfigFormatError, parseAP510Config } from "../src/tracker-config/index.js";

describe("AP510 negative capture corpus", () => {
  it("rejects input with no numbered records", () => {
    expect(() => parseAP510Config("serial noise only\r\nSETUP\r\n")).toThrow(ConfigFormatError);
  });

  it("rejects duplicate record keys", () => {
    expect(() => parseAP510Config("01=FIRST\r\n01=SECOND\r\n")).toThrow("duplicate keys: 01");
  });

  it("rejects truncated serial captures during capture validation", () => {
    const config = parseAP510Config("00= AVRT5 20210404\r\n31=0010");

    expect(() => config.validateSerialCapture()).toThrow("complete numbered record");
  });

  it("rejects captures that stop before the expected terminal field", () => {
    const config = parseAP510Config("00=AVRT5 20991231\r\n17=1\r\n");

    expect(() => config.validateSerialCapture()).toThrow("expected terminal key 31");
  });

  it("rejects final-firmware captures missing required fields", () => {
    const config = parseAP510Config("00= AVRT5 20210404\r\n31=001008000\r\n");

    expect(() => config.validateSerialCapture()).toThrow("missing required keys");
  });

  it("accepts a complete final-firmware capture even when optional legacy field 05 is absent", () => {
    const body = [
      "00= AVRT5 20210404",
      "01=N0CALL9",
      "02=4",
      "03=1",
      "04=1",
      "06=>/",
      "07=5",
      "08=0030",
      "09=AP510",
      "10=Test configuration",
      "12=01",
      "13=0",
      "14=0PP",
      "15=0",
      "16=145.5000",
      "17=1",
      "18=0100300060010240028005",
      "19=0",
      "20=0",
      "21=6",
      "22=8",
      "23=1",
      "24=0",
      "25=WIDE1 1",
      "26=WIDE2 1",
      "27=0",
      "28=711111010001010",
      "29=000030!/>/>/P/0",
      "30=Emergency test",
      "31=001008000",
    ].join("\r\n");
    const config = parseAP510Config(`${body}\r\n`);

    expect(() => config.validateSerialCapture()).not.toThrow();
  });
});
