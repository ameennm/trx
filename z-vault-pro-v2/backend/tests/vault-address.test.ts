import { describe, expect, it } from 'vitest';
import { computeTronVaultAddress } from '../src/lib/tronAddress.js';

describe('computeTronVaultAddress', () => {
  it('returns a TRON base58 address', () => {
    const result = computeTronVaultAddress(
      'TZ2KnAvkher2xBdWk5j6SQvH9Amyoz1pz5',
      'TXggTLVK2ZSsxcMTvdX31gxYr1MJSqaYcc',
      'TQsosYn1JGd3kbyqwHW9eae55X5PhdrETQ'
    );

    expect(result.startsWith('T')).toBe(true);
    expect(result.length).toBe(34);
  });
});
