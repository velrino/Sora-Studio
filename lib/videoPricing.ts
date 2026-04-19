// Per-second USD pricing as of 2026-04-18. Source: OpenAI model pages.
// Keys: model → size → price per second in USD.
const PRICING: Record<string, Record<string, number>> = {
  'sora-2': {
    '1280x720': 0.1,
    '720x1280': 0.1,
  },
  'sora-2-pro': {
    '1280x720': 0.3,
    '720x1280': 0.3,
    '1792x1024': 0.5,
    '1024x1792': 0.5,
    '1920x1080': 0.7,
    '1080x1920': 0.7,
  },
};

export interface VideoCostEstimate {
  perSecond: number;
  seconds: number;
  total: number;
}

export function estimateVideoCost(params: {
  model: string;
  size: string;
  seconds: string | number;
}): VideoCostEstimate | null {
  const perSecond = PRICING[params.model]?.[params.size];
  if (typeof perSecond !== 'number') return null;

  const seconds = typeof params.seconds === 'string' ? Number(params.seconds) : params.seconds;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  return {
    perSecond,
    seconds,
    total: perSecond * seconds,
  };
}
