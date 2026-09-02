// Group repeats of the same fault so one broken screen cannot spam the phone.
export function signatureOf(report) {
  const firstFrame = (report?.stack || '').split('\n')[1] || ''
  return `${report?.message || ''}::${firstFrame}`.slice(0, 300)
}
