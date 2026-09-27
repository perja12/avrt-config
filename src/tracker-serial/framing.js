import { asciiBytes, containsBytes, findBytes } from "./bytes.js";
import { ProtocolVariant } from "./commands.js";

const SETUP_TEXT = asciiBytes("SETUP");
const NEW_SETUP_TEXT = asciiBytes("\r\nSETUP");
const RECORD_PATTERN = /(?:^|\r?\n)\d{2}=/;

export function detectSetupVariant(bytes) {
  if (containsBytes(bytes, NEW_SETUP_TEXT)) return ProtocolVariant.NEW;
  if (containsBytes(bytes, SETUP_TEXT)) return ProtocolVariant.LEGACY;
  return null;
}

export function hasNumberedRecord(bytes) {
  return RECORD_PATTERN.test(latin1(bytes));
}

export function isEchoOnly(response, command) {
  return bytesToComparableText(response) === bytesToComparableText(command);
}

export function extractConfigurationCapture(response, { terminalKeys = ["31", "29"] } = {}) {
  const start = firstRecordStart(response);
  if (start < 0) return null;
  const captureStart = start >= 2 && response[start - 2] === 0x0d && response[start - 1] === 0x0a ? start - 2 : start;

  const terminal = firstTerminalEnd(response, terminalKeys, start);
  return terminal === null ? response.slice(captureStart) : response.slice(captureStart, terminal);
}

function firstRecordStart(bytes) {
  for (let index = 0; index <= bytes.length - 3; index += 1) {
    const atLineStart = index === 0 || bytes[index - 1] === 0x0a;
    if (atLineStart && isDigit(bytes[index]) && isDigit(bytes[index + 1]) && bytes[index + 2] === 0x3d) {
      return index;
    }
  }
  return -1;
}

function firstTerminalEnd(bytes, terminalKeys, from) {
  for (const key of terminalKeys) {
    const marker = asciiBytes(`\n${key}=`);
    const terminalStart = findBytes(bytes, marker, from);
    if (terminalStart < 0) continue;
    const lineStart = terminalStart + 1;
    const lineFeed = findBytes(bytes, Uint8Array.from([0x0a]), lineStart + 3);
    if (lineFeed >= 0) return lineFeed + 1;
  }
  return null;
}

function isDigit(byte) {
  return byte >= 0x30 && byte <= 0x39;
}

function bytesToComparableText(bytes) {
  return latin1(bytes).trim();
}

function latin1(bytes) {
  return String.fromCharCode(...bytes);
}
