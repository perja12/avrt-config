export function formatTrackerIdentity(identity) {
  const callsign = typeof identity?.callsign === "string" ? identity.callsign.trim() : "";
  if (!callsign) return null;

  const ssid = identity?.ssid;
  return Number.isInteger(ssid) && ssid > 0 ? `${callsign}-${ssid}` : callsign;
}
