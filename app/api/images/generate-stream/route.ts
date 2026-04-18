import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { parseOpenAIError } from '@/lib/errors';

const ALLOWED_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto']);
const ALLOWED_QUALITIES = new Set(['low', 'medium', 'high', 'auto']);
const ALLOWED_PARTIALS = new Set([1, 2, 3]);

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key is required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json();
  const {
    prompt,
    n = 1,
    size = '1024x1024',
    quality = 'auto',
    partialImages = 2,
  } = body;

  if (!prompt || typeof prompt !== 'string') {
    return new Response(JSON.stringify({ error: 'Prompt is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const count = Math.min(Math.max(Number(n) || 1, 1), 4);
  const resolvedSize = ALLOWED_SIZES.has(size) ? size : '1024x1024';
  const resolvedQuality = ALLOWED_QUALITIES.has(quality) ? quality : 'auto';
  const resolvedPartials = ALLOWED_PARTIALS.has(Number(partialImages))
    ? Number(partialImages)
    : 2;

  const openai = new OpenAI({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        for (let i = 0; i < count; i++) {
          send({ kind: 'image_started', index: i, total: count });

          const toolConfig: Record<string, unknown> = {
            type: 'image_generation',
            partial_images: resolvedPartials,
          };
          if (resolvedSize !== 'auto') toolConfig.size = resolvedSize;
          if (resolvedQuality !== 'auto') toolConfig.quality = resolvedQuality;

          const responseStream = await openai.responses.create({
            model: 'gpt-4.1-mini',
            input: prompt,
            stream: true,
            tools: [toolConfig as any],
          });

          let finalB64: string | null = null;

          for await (const event of responseStream as AsyncIterable<any>) {
            const type: string = event?.type ?? '';

            if (type.includes('partial_image')) {
              const b64 = event.partial_image_b64 ?? event.b64_json;
              const pIdx = event.partial_image_index ?? 0;
              if (b64) {
                send({ kind: 'partial', index: i, partialIndex: pIdx, b64 });
              }
            } else if (type.includes('image_generation_call') && type.includes('completed')) {
              finalB64 = event.result ?? event.b64_json ?? finalB64;
            } else if (type === 'response.output_item.done') {
              const item = event.item;
              if (item?.type === 'image_generation_call' && item?.result) {
                finalB64 = item.result;
              }
            } else if (type === 'response.completed') {
              const outputs = event.response?.output ?? [];
              for (const out of outputs) {
                if (out?.type === 'image_generation_call' && out?.result) {
                  finalB64 = out.result;
                }
              }
            }
          }

          if (!finalB64) {
            send({ kind: 'error', index: i, message: 'No image returned from stream' });
            continue;
          }

          send({ kind: 'final', index: i, b64: finalB64 });
        }

        send({ kind: 'done' });
        controller.close();
      } catch (error: any) {
        console.error('Image stream error:', error);
        const parsed = parseOpenAIError(error);
        send({ kind: 'error', message: parsed.error.message, code: parsed.error.code });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
