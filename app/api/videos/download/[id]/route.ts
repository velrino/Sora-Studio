import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 401 }
      );
    }

    const variantParam = request.nextUrl.searchParams.get('variant');
    const variant = variantParam === 'thumbnail' || variantParam === 'spritesheet' ? variantParam : 'video';

    const openai = new OpenAI({ apiKey });
    const content = await openai.videos.downloadContent(id, { variant });

    const arrayBuffer = await content.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const variantMeta = {
      video: { contentType: 'video/mp4', disposition: `attachment; filename="video-${id}.mp4"` },
      thumbnail: { contentType: 'image/webp', disposition: `inline; filename="thumbnail-${id}.webp"` },
      spritesheet: { contentType: 'image/webp', disposition: `inline; filename="spritesheet-${id}.webp"` },
    }[variant];

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': variantMeta.contentType,
        'Content-Disposition': variantMeta.disposition,
        'Cache-Control': variant === 'video' ? 'no-store' : 'private, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('Video download error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to download video' },
      { status: 500 }
    );
  }
}
