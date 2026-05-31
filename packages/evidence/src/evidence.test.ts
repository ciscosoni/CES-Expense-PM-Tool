import { describe, it, expect } from 'vitest';
import { dHashFromGray, hammingDistance, isNearDuplicate, bitsToHex } from './perceptual-hash.js';
import { haversineMeters, distanceToNearestSite } from './geo.js';
import { parseReceiptText } from './ocr-parse.js';

describe('perceptual hash (dHash)', () => {
  // 9x8 grid: a smooth left→right gradient ⇒ every pixel < its right neighbour ⇒ all 1s.
  const gradient = Array.from({ length: 72 }, (_, i) => (i % 9) * 28);

  it('produces a 16-hex-char (64-bit) hash', () => {
    const h = dHashFromGray(gradient, 9, 8);
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(h).toBe('ffffffffffffffff'); // all "left < right"
  });

  it('throws when given too few pixels', () => {
    expect(() => dHashFromGray([1, 2, 3], 9, 8)).toThrow();
  });

  it('hamming distance + near-duplicate detection', () => {
    expect(hammingDistance('ffffffffffffffff', 'ffffffffffffffff')).toBe(0);
    // flip one nibble's worth of bits
    expect(hammingDistance('ffffffffffffffff', 'fffffffffffffff0')).toBe(4);
    expect(isNearDuplicate('ffffffffffffffff', 'fffffffffffffff0')).toBe(true);
    expect(isNearDuplicate('ffffffffffffffff', '0000000000000000')).toBe(false);
  });

  it('bitsToHex pads correctly', () => {
    expect(bitsToHex('1111')).toBe('f');
    expect(bitsToHex('00000001')).toBe('01');
  });
});

describe('geo', () => {
  it('haversine ~0 for same point, plausible for a known span', () => {
    expect(haversineMeters(28.6, 77.2, 28.6, 77.2)).toBeCloseTo(0, 5);
    // Delhi → Noida is roughly 20 km
    const d = haversineMeters(28.6139, 77.209, 28.5355, 77.391);
    expect(d).toBeGreaterThan(15_000);
    expect(d).toBeLessThan(25_000);
  });

  it('distanceToNearestSite reports inside/outside + edge distance', () => {
    const sites = [{ lat: 28.6, lng: 77.2, radiusMeters: 200 }];
    const inside = distanceToNearestSite(28.6, 77.2, sites);
    expect(inside.insideAny).toBe(true);
    expect(inside.nearestEdgeMeters).toBe(0);

    const far = distanceToNearestSite(28.7, 77.2, sites);
    expect(far.insideAny).toBe(false);
    expect(far.nearestEdgeMeters!).toBeGreaterThan(1000);

    expect(distanceToNearestSite(0, 0, []).nearestEdgeMeters).toBeNull();
  });
});

describe('OCR text parser', () => {
  it('extracts vendor, total amount, currency and date', () => {
    const text = [
      'Taj Hotels',
      'GST Invoice',
      'Date: 12/05/2026',
      'Room charge  4,500.00',
      'Sub Total   8,000.00',
      'Grand Total ₹ 9,440.00',
    ].join('\n');
    const r = parseReceiptText(text);
    expect(r.vendor).toBe('Taj Hotels');
    expect(r.amount).toBe('9440.00'); // grand total wins over subtotal/line items
    expect(r.currency).toBe('INR');
    expect(r.date).toBe('2026-05-12');
  });

  it('handles ISO date + USD + falls back to max value without total keyword', () => {
    const r = parseReceiptText('ACME Cafe\n2026-05-31\nItem A $12.00\nItem B $30.50');
    expect(r.date).toBe('2026-05-31');
    expect(r.currency).toBe('USD');
    expect(r.amount).toBe('30.50');
  });

  it('returns an empty object for unparseable text', () => {
    expect(parseReceiptText('....')).toEqual({});
  });
});
