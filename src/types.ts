export const CATEGORIES = [
  'face',
  'card_like_object',
  'document',
  'screen',
  'address_like_text',
  'other_sensitive',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const GRID_CELLS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;
export type GridCell = (typeof GRID_CELLS)[number];

export const SIZES = ['small', 'medium', 'large'] as const;
export type Size = (typeof SIZES)[number];

export const CONFIDENCES = ['low', 'medium', 'high'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const IMAGE_QUALITIES = ['clear', 'too_small_or_blurry'] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

/** One possible private item. Position is the model's estimate, never verified. */
export interface Finding {
  category: Category;
  cell: GridCell;
  size: Size;
  confidence: Confidence;
}

/** Category-level result only. The scanner never reads or returns text, numbers or names. */
export interface ScanResult {
  findings: Finding[];
  imageQuality: ImageQuality;
}

/** Which engine actually ran. MOCK exists for development only. */
export type InferenceSource = 'ON_DEVICE' | 'IN_CLOUD' | 'MOCK';

export interface ScanOutcome {
  result: ScanResult;
  source: InferenceSource;
  elapsedMs: number;
}

export interface DescribeOutcome {
  text: string;
  source: InferenceSource;
  elapsedMs: number;
}

export class DeviceUnavailableError extends Error {
  constructor(public readonly reason: string, cause?: unknown) {
    super(`On-device model unavailable: ${reason}`, { cause });
    this.name = 'DeviceUnavailableError';
  }
}

export class ScanParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScanParseError';
  }
}

export const AUDIENCES = ['family', 'friends', 'strangers', 'public'] as const;
export type Audience = (typeof AUDIENCES)[number];
