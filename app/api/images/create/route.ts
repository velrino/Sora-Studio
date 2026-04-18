import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { parseOpenAIError, getStatusFromErrorCode } from '@/lib/errors';

const ALLOWED_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto']);
const ALLOWED_QUALITIES = new Set(['low', 'medium', 'high', 'auto']);
const ALLOWED_MODELS = new Set(['gpt-image-1', 'gpt-image-1.5', 'gpt-image-1-mini']);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      prompt,
      n = 1,
      size = '1024x1024',
      quality = 'auto',
      model = 'gpt-image-1.5',
      inputImageBase64,
    } = body;
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 401 });
    }

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const count = Math.min(Math.max(Number(n) || 1, 1), 4);
    const resolvedSize = ALLOWED_SIZES.has(size) ? size : '1024x1024';
    const resolvedQuality = ALLOWED_QUALITIES.has(quality) ? quality : 'auto';
    const resolvedModel = ALLOWED_MODELS.has(model) ? model : 'gpt-image-1.5';

    const openai = new OpenAI({ apiKey });

    let response;
    if (inputImageBase64) {
      const buffer = Buffer.from(inputImageBase64, 'base64');
      const blob = new Blob([buffer], { type: 'image/png' });
      const file = new File([blob], 'input.png', { type: 'image/png' });

      response = await openai.images.edit({
        model: resolvedModel,
        image: file,
        prompt,
        n: count,
        size: resolvedSize,
      } as any);
    } else {
      response = await openai.images.generate({
        model: resolvedModel,
        prompt,
        n: count,
        size: resolvedSize,
        quality: resolvedQuality,
      } as any);
    }

    const images = (response.data || [])
      .map((item: any) => item.b64_json)
      .filter(Boolean)
      .map((b64: string) => `data:image/png;base64,${b64}`);

    return NextResponse.json({
      images,
      model: resolvedModel,
      size: resolvedSize,
      quality: resolvedQuality,
      n: images.length,
    });
  } catch (error: any) {
    console.error('Image creation error:', error);
    const errorResponse = parseOpenAIError(error);
    const statusCode = getStatusFromErrorCode(errorResponse.error.code);
    return NextResponse.json(errorResponse, { status: statusCode });
  }
}
