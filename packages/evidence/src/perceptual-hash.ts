/**
 * Perceptual hashing for near-duplicate receipt detection (dHash).
 *
 * Pure: callers decode + downscale the image to a small grayscale buffer (e.g.
 * via sharp at the I/O boundary) and pass the raw pixels here. dHash compares
 * each pixel to its right neighbour, so it is robust to brightness/scale/JPEG
 * recompression — catching "same receipt re-photographed" that an exact SHA-256
 * hash misses.
 *
 * Standard sizing: a (width = 9) × (height = 8) grayscale grid yields
 * 8 × 8 = 64 comparisons → a 64-bit hash → 16 hex chars (matches the
 * Receipt.perceptualHash CHAR(16) column).
 */
export function dHashFromGray(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): string {
  if (pixels.length < width * height) {
    throw new Error(`dHashFromGray: need ${width * height} pixels, got ${pixels.length}`);
  }
  let bits = '';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const left = pixels[y * width + x]!;
      const right = pixels[y * width + x + 1]!;
      bits += left < right ? '1' : '0';
    }
  }
  return bitsToHex(bits);
}

/** Bit string → zero-padded lowercase hex (4 bits per char). */
export function bitsToHex(bits: string): string {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4).padEnd(4, '0'), 2).toString(16);
  }
  return hex;
}

/** Number of differing bits between two equal-length hex hashes. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error('hammingDistance: hashes must be the same length');
  }
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let xor = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (xor) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

/**
 * Two 64-bit perceptual hashes are "near duplicates" when they differ by at
 * most `threshold` bits (default 10 ≈ 84% similar) — a well-established cut-off
 * for "the same image, re-encoded".
 */
export function isNearDuplicate(a: string, b: string, threshold = 10): boolean {
  return hammingDistance(a, b) <= threshold;
}
