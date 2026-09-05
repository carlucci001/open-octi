export const CREDITS_PER_USD = 100
export const CUSTOM_TOP_UP_MIN_USD = 5
export const CUSTOM_TOP_UP_MAX_USD = 2500

// Shared by the form and server. Currency is represented as integer cents.
export function customTopUp(amountUsd) {
  if (!['string', 'number'].includes(typeof amountUsd)
    || !/^\d+(?:\.\d{1,2})?$/.test(String(amountUsd).trim())) {
    throw new Error('Enter an amount with no more than two decimal places')
  }
  const amountCents = Math.round(Number(amountUsd) * 100)
  if (!Number.isSafeInteger(amountCents)
    || amountCents < CUSTOM_TOP_UP_MIN_USD * 100
    || amountCents > CUSTOM_TOP_UP_MAX_USD * 100) {
    throw new Error('Enter an amount between $5 and $2,500')
  }
  return {
    id: `custom-${amountCents}`,
    name: 'Custom top-up',
    credits: Math.round(amountCents * CREDITS_PER_USD / 100),
    priceUsd: amountCents / 100,
    amountCents,
    currency: 'usd',
    custom: true,
  }
}
