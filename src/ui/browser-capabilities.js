export function supportsWebSerial(navigatorLike = globalThis.navigator) {
  return Boolean(navigatorLike?.serial);
}
