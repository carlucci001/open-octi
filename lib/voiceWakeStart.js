export function buildWakeStartOptions({ initialText = '' } = {}) {
  return {
    initialText: String(initialText || '').trim(),
    silent: false,
  }
}
