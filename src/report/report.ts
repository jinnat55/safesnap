import type { Audience, Category, Finding, GridCell, ScanOutcome } from '../types';

const CATEGORY_PHRASE: Record<Category, { article: 'a' | 'an' | ''; noun: string }> = {
  face: { article: 'a', noun: 'face or part of a face' },
  card_like_object: { article: 'a', noun: 'card-like object' },
  document: { article: 'a', noun: 'document or paper' },
  screen: { article: 'a', noun: 'screen' },
  address_like_text: { article: '', noun: 'text that may be an address' },
  other_sensitive: { article: 'an', noun: 'item that may be private' },
};

const CELL_PHRASE: Record<GridCell, string> = {
  'top-left': 'top left',
  'top-center': 'top center',
  'top-right': 'top right',
  'middle-left': 'middle left',
  center: 'center',
  'middle-right': 'middle right',
  'bottom-left': 'bottom left',
  'bottom-center': 'bottom center',
  'bottom-right': 'bottom right',
};

export const UNCERTAINTY_NOTE =
  'This is a best-effort check by a small AI model. It can miss things, especially small items. Positions are the model’s estimate, not verified.';

export interface ReportItem {
  /** Short sentence read by a screen reader, e.g. "A small card-like object, bottom left (low confidence)." */
  sentence: string;
  finding: Finding;
}

export interface Report {
  headline: string;
  items: ReportItem[];
  advice: string[];
  note: string;
  /** Plain-language line saying which engine produced this result. */
  engineLine: string;
}

export function describeFinding(f: Finding): string {
  const { article, noun } = CATEGORY_PHRASE[f.category];
  // Medium size is not mentioned. Without a size word we use the natural article ("A card-like object").
  const lead = f.size === 'medium' ? [article, noun].filter(Boolean).join(' ') : `${f.size} ${noun}`;
  const text = lead.charAt(0).toUpperCase() + lead.slice(1);
  const confidence = f.confidence === 'high' ? '' : ` (${f.confidence} confidence)`;
  return `${text}, ${CELL_PHRASE[f.cell]}${confidence}.`;
}

export function engineLine(source: ScanOutcome['source']): string {
  switch (source) {
    case 'ON_DEVICE':
      return 'Checked on this device. The photo did not leave your computer.';
    case 'IN_CLOUD':
      return 'Checked in the cloud, because you allowed it. The photo was sent to Google through Firebase AI Logic.';
    case 'MOCK':
      return 'Development mock: this is not a real scan.';
  }
}

/**
 * Builds the honest report. By design it never says a photo is "safe": the most it says is
 * that nothing was found and that it cannot be certain.
 */
const AUDIENCE_ADVICE: Record<Audience, { found: string; none: string }> = {
  family: {
    found: 'Family may be fine with some of these. Check each item before you send.',
    none: 'Family can still see small details a quick check can miss.',
  },
  friends: {
    found: 'Friends can zoom in and see details you cannot. Decide item by item.',
    none: 'Friends can still see small details a quick check can miss.',
  },
  strangers: {
    found: 'Strangers will see everything in the frame. Retaking without these items is the surest option.',
    none: 'Strangers will see everything in the frame. If you can, ask someone you trust to look too.',
  },
  public: {
    found: 'Anyone can copy a public photo. Retake or crop before you post it.',
    none: 'Anyone can copy a public photo. If you can, ask someone you trust to look before you post.',
  },
};

export function buildReport(outcome: ScanOutcome, audience?: Audience): Report {
  const { result, source } = outcome;
  const items = result.findings.map((finding) => ({ sentence: describeFinding(finding), finding }));
  const n = items.length;
  const headline =
    n === 0
      ? 'I didn’t find anything private, but I can’t be certain.'
      : `I may have found ${n} possible private ${n === 1 ? 'item' : 'items'}.`;

  const advice: string[] = [];
  if (result.imageQuality === 'too_small_or_blurry') {
    advice.push('Parts of the photo may be too small or blurry to check. Move closer and retake it.');
  }
  if (items.some((i) => i.finding.size === 'small')) {
    advice.push('Small items are the easiest to miss. Consider retaking the photo closer, or cropping.');
  }
  if (audience) advice.push(AUDIENCE_ADVICE[audience][n > 0 ? 'found' : 'none']);
  if (n > 0) {
    advice.push('You decide what happens next. Nothing is sent anywhere until you choose.');
  }
  return { headline, items, advice, note: UNCERTAINTY_NOTE, engineLine: engineLine(source) };
}
