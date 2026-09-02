/**
 * Generate a Google Voice call URL from a phone number.
 * Strips non-digits and prepends +1 for US numbers.
 */
export function gvCallUrl(phone) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = "1" + digits; // assume US if 10 digits
  if (!digits) return null;
  return `https://voice.google.com/u/0/calls?a=nc,%2B${digits}`;
}

export function formatPhone(input) {
  const d = String(input || "").replace(/\D/g, "").slice(-10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
}
