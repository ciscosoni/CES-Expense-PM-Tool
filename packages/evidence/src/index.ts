export {
  dHashFromGray,
  bitsToHex,
  hammingDistance,
  isNearDuplicate,
} from './perceptual-hash.js';
export { haversineMeters, distanceToNearestSite, type GeoCircle } from './geo.js';
export { parseReceiptText, type ParsedReceipt } from './ocr-parse.js';
export {
  scoreBillableJustification,
  type BillableBand,
  type BillableJustificationInput,
  type BillableJustificationResult,
} from './billable.js';
