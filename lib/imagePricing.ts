// Per-image USD pricing as of 2026-04-18. Source: OpenAI pricing page.
// Keys: model → quality → size → price per image in USD.
const PRICING: Record<string, Record<string, Record<string, number>>> = {
  'gpt-image-1.5': {
    low: { '1024x1024': 0.009, '1024x1536': 0.013, '1536x1024': 0.013 },
    medium: { '1024x1024': 0.034, '1024x1536': 0.05, '1536x1024': 0.05 },
    high: { '1024x1024': 0.133, '1024x1536': 0.2, '1536x1024': 0.2 },
  },
  'gpt-image-1': {
    low: { '1024x1024': 0.011, '1024x1536': 0.016, '1536x1024': 0.016 },
    medium: { '1024x1024': 0.042, '1024x1536': 0.063, '1536x1024': 0.063 },
    high: { '1024x1024': 0.167, '1024x1536': 0.25, '1536x1024': 0.25 },
  },
  'gpt-image-1-mini': {
    low: { '1024x1024': 0.005, '1024x1536': 0.006, '1536x1024': 0.006 },
    medium: { '1024x1024': 0.011, '1024x1536': 0.015, '1536x1024': 0.015 },
    high: { '1024x1024': 0.036, '1024x1536': 0.052, '1536x1024': 0.052 },
  },
};

// Auto falls back to medium quality when estimating cost.
const AUTO_QUALITY_FALLBACK = 'medium';
// Auto size falls back to the square resolution.
const AUTO_SIZE_FALLBACK = '1024x1024';

export interface ImageCostEstimate {
  perImage: number;
  total: number;
  approximate: boolean;
}

export function estimateImageCost(params: {
  model: string;
  quality: string;
  size: string;
  n: number;
}): ImageCostEstimate | null {
  const resolvedQuality = params.quality === 'auto' ? AUTO_QUALITY_FALLBACK : params.quality;
  const resolvedSize = params.size === 'auto' ? AUTO_SIZE_FALLBACK : params.size;
  const approximate = params.quality === 'auto' || params.size === 'auto';

  const perImage = PRICING[params.model]?.[resolvedQuality]?.[resolvedSize];
  if (typeof perImage !== 'number') return null;

  return {
    perImage,
    total: perImage * Math.max(params.n, 1),
    approximate,
  };
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
