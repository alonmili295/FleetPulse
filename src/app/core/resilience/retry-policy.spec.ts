import { retryAfterMs } from './retry-policy';

describe('retryAfterMs', () => {
  // TC-RETRY-1: known retryAfterSeconds
  it('TC-RETRY-1: returns retryAfterSeconds * 1000 when present', () => {
    expect(retryAfterMs({ kind: 'service_unavailable', message: '', retryAfterSeconds: 3 })).toBe(3000);
  });

  it('returns 0 when retryAfterSeconds is 0', () => {
    expect(retryAfterMs({ kind: 'service_unavailable', message: '', retryAfterSeconds: 0 })).toBe(0);
  });

  it('returns scaled ms for non-standard values', () => {
    expect(retryAfterMs({ kind: 'service_unavailable', message: '', retryAfterSeconds: 10 })).toBe(10_000);
  });

  // TC-RETRY-2: missing / invalid retryAfterSeconds → 3 s fallback
  it('TC-RETRY-2: returns 3000 fallback when retryAfterSeconds is undefined', () => {
    expect(retryAfterMs({ kind: 'service_unavailable', message: '' })).toBe(3000);
  });

  it('returns 3000 fallback for negative retryAfterSeconds', () => {
    expect(retryAfterMs({ kind: 'service_unavailable', message: '', retryAfterSeconds: -1 })).toBe(3000);
  });

  it('returns 3000 fallback for NaN retryAfterSeconds', () => {
    expect(retryAfterMs({ kind: 'service_unavailable', message: '', retryAfterSeconds: NaN })).toBe(3000);
  });
});
