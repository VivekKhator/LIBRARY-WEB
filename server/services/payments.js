import { badRequest } from '../lib/errors.js';
import { uuid } from '../lib/auth-crypto.js';

/**
 * Mock payment gateway with the same failure surface a real PSP exposes, so the
 * checkout flow (and its tests) exercise declines, expiry and validation properly.
 * Swap `authorize` for a Stripe/Adyen call and the rest of the app is unchanged.
 */
const BRANDS = [
  { brand: 'Visa', test: (n) => /^4/.test(n), lengths: [13, 16, 19] },
  { brand: 'Mastercard', test: (n) => /^5[1-5]|^2[2-7]/.test(n), lengths: [16] },
  { brand: 'American Express', test: (n) => /^3[47]/.test(n), lengths: [15] },
  { brand: 'Discover', test: (n) => /^6(?:011|5)/.test(n), lengths: [16, 19] },
];

export const luhn = (digits) => {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
};

export const detectBrand = (number) => BRANDS.find((b) => b.test(number)) || null;

export function authorize({ cardNumber, cardName, expMonth, expYear, cvc, amountCents }) {
  const number = String(cardNumber || '').replace(/[\s-]/g, '');
  const fields = {};

  if (!/^\d{12,19}$/.test(number)) fields.cardNumber = 'Enter a valid card number';
  else if (!luhn(number)) fields.cardNumber = 'That card number failed the checksum';

  const brandInfo = detectBrand(number);
  if (!fields.cardNumber && !brandInfo) fields.cardNumber = 'Unsupported card network';
  if (!fields.cardNumber && brandInfo && !brandInfo.lengths.includes(number.length)) {
    fields.cardNumber = `${brandInfo.brand} numbers are ${brandInfo.lengths.join('/')} digits`;
  }

  if (!String(cardName || '').trim()) fields.cardName = 'Name on card is required';

  const month = Number(expMonth);
  const year = Number(expYear);
  if (!(month >= 1 && month <= 12)) fields.expMonth = 'Month must be 1-12';
  if (!(year >= 2000 && year <= 2100)) fields.expYear = 'Enter a 4-digit year';
  if (!fields.expMonth && !fields.expYear) {
    const expiry = new Date(year, month, 1);
    if (expiry <= new Date()) fields.expMonth = 'This card has expired';
  }

  const expectedCvc = brandInfo?.brand === 'American Express' ? 4 : 3;
  if (!new RegExp(`^\\d{${expectedCvc}}$`).test(String(cvc || ''))) fields.cvc = `CVC must be ${expectedCvc} digits`;

  if (Object.keys(fields).length) throw badRequest('Please check your card details', fields);
  if (!amountCents || amountCents <= 0) throw badRequest('Nothing to charge');

  // Deterministic test cards: predictable failures for QA and automated tests.
  if (number.endsWith('0002')) throw badRequest('Your card was declined by the issuer', { cardNumber: 'Card declined (code: do_not_honor)' });
  if (number.endsWith('0003')) throw badRequest('Insufficient funds on that card', { cardNumber: 'Insufficient funds' });

  return {
    ref: `pay_${uuid().slice(0, 18)}`,
    brand: brandInfo.brand,
    last4: number.slice(-4),
    amountCents,
    capturedAt: new Date().toISOString(),
  };
}

export function refund(paymentRef, amountCents) {
  if (!paymentRef) throw badRequest('Nothing to refund');
  return { ref: `re_${uuid().slice(0, 18)}`, paymentRef, amountCents, refundedAt: new Date().toISOString() };
}
