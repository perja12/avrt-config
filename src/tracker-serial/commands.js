export const ProtocolVariant = Object.freeze({
  NEW: "new",
  LEGACY: "legacy",
});

export const SETUP_COMMANDS = Object.freeze({
  [ProtocolVariant.NEW]: Uint8Array.from([0x0d, 0x0a, 0x53, 0x45, 0x54, 0x55, 0x50, 0x0d, 0x0a]),
  [ProtocolVariant.LEGACY]: Uint8Array.from([0x40, 0x53, 0x45, 0x54, 0x55, 0x50]),
});

export const DISPLAY_COMMANDS = Object.freeze({
  [ProtocolVariant.NEW]: Uint8Array.from([0x0d, 0x0a, 0x44, 0x49, 0x53, 0x50, 0x0d, 0x0a]),
  [ProtocolVariant.LEGACY]: Uint8Array.from([0x40, 0x44, 0x49, 0x53, 0x50]),
});

export const COMMAND_LABELS = Object.freeze({
  setup: Object.freeze({
    [ProtocolVariant.NEW]: "\\r\\nSETUP\\r\\n",
    [ProtocolVariant.LEGACY]: "@SETUP",
  }),
  display: Object.freeze({
    [ProtocolVariant.NEW]: "\\r\\nDISP\\r\\n",
    [ProtocolVariant.LEGACY]: "@DISP",
  }),
});
