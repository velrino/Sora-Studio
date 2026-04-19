import { useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { apiCall } from './api';
import { toast } from 'sonner';

async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function previewUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function b64ToDataUrl(b64: string): string {
  return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
}

export function useImageGeneration() {
  const generateImages = useCallback(async () => {
    const state = useAppStore.getState();
    const {
      apiKey,
      chatMessages,
      baseImage,
      imageConfig,
      updateImageGeneration,
      resetImageGeneration,
      saveImageGroup,
      addChatMessage,
      saveCurrentConversation,
    } = state;

    if (!apiKey) {
      toast.error('Please set your OpenAI API key in settings');
      return;
    }

    const userMessages = chatMessages
      .filter((msg) => msg.role === 'user')
      .map((msg) => msg.content)
      .join(' ');

    if (!userMessages.trim()) {
      toast.error('Please describe the image you want in the chat');
      return;
    }

    const prompt = userMessages;
    const title =
      prompt.trim().split(/\s+/).slice(0, 8).join(' ').slice(0, 80) || 'Untitled Image';

    const useStream = imageConfig.partialImages > 0;

    try {
      resetImageGeneration();
      updateImageGeneration({
        status: 'generating',
        error: null,
        startedAt: Date.now(),
        partialPreviews: Array(imageConfig.n).fill(null),
        activeIndex: 0,
      });

      addChatMessage({
        role: 'info',
        content: `Generating ${imageConfig.n} image${imageConfig.n > 1 ? 's' : ''}: "${title}".`,
        metadata: {
          type: 'generation',
          status: 'started',
          title,
          mediaType: 'image',
        },
      });

      let inputImageBase64: string | null = null;
      if (baseImage) {
        try {
          if (baseImage.file) {
            inputImageBase64 = await fileToBase64(baseImage.file);
          } else if (baseImage.previewUrl) {
            inputImageBase64 = await previewUrlToBase64(baseImage.previewUrl);
          }
        } catch (err) {
          console.error('Failed to prepare base image:', err);
          toast.warning('Failed to use base image. Continuing without it.');
        }
      }

      if (useStream && !inputImageBase64) {
        await runStreaming({
          apiKey,
          prompt,
          title,
          imageConfig,
        });
      } else {
        await runBatch({
          apiKey,
          prompt,
          title,
          imageConfig,
          inputImageBase64,
        });
      }
    } catch (error) {
      let errorMessage = 'Unknown error occurred';
      let errorCode = 'unknown_error';
      try {
        const parsed = JSON.parse((error as Error).message);
        errorMessage = parsed.message || errorMessage;
        errorCode = parsed.code || errorCode;
      } catch {
        errorMessage = (error as Error).message || errorMessage;
      }

      toast.error(errorMessage);
      addChatMessage({
        role: 'error',
        content: errorMessage,
        errorMetadata: { code: errorCode },
      });
      updateImageGeneration({ status: 'failed', error: errorMessage, errorCode });
    }
  }, []);

  return { generateImages };
}

async function runBatch(params: {
  apiKey: string;
  prompt: string;
  title: string;
  imageConfig: ReturnType<typeof useAppStore.getState>['imageConfig'];
  inputImageBase64: string | null;
}) {
  const { apiKey, prompt, title, imageConfig, inputImageBase64 } = params;
  const {
    updateImageGeneration,
    saveImageGroup,
    addChatMessage,
    saveCurrentConversation,
  } = useAppStore.getState();

  const response = await apiCall(
    '/api/images/create',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        n: imageConfig.n,
        size: imageConfig.size,
        quality: imageConfig.quality,
        model: imageConfig.model,
        inputImageBase64,
      }),
    },
    apiKey,
  );

  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.error?.message || data.error || 'Failed to generate images';
    const errorCode = data.error?.code || 'image_generation_failed';
    toast.error(errorMessage);
    addChatMessage({ role: 'error', content: errorMessage, errorMetadata: { code: errorCode } });
    updateImageGeneration({ status: 'failed', error: errorMessage, errorCode });
    return;
  }

  const images: string[] = data.images || [];
  if (images.length === 0) {
    const msg = 'No images returned by the API';
    toast.error(msg);
    addChatMessage({ role: 'error', content: msg, errorMetadata: { code: 'empty_response' } });
    updateImageGeneration({ status: 'failed', error: msg });
    return;
  }

  saveCurrentConversation();
  const imageIds = saveImageGroup(images, prompt, title, {
    model: data.model || imageConfig.model,
    size: data.size || imageConfig.size,
    quality: data.quality || imageConfig.quality,
    hadBaseImage: Boolean(inputImageBase64),
  });

  addChatMessage({
    role: 'info',
    content: `Generated ${images.length} image${images.length > 1 ? 's' : ''}: "${title}".`,
    imageIds,
    metadata: { type: 'generation', status: 'completed', title, mediaType: 'image' },
  });

  saveCurrentConversation();
  updateImageGeneration({ status: 'completed' });
}

async function runStreaming(params: {
  apiKey: string;
  prompt: string;
  title: string;
  imageConfig: ReturnType<typeof useAppStore.getState>['imageConfig'];
}) {
  const { apiKey, prompt, title, imageConfig } = params;
  const {
    updateImageGeneration,
    saveImageGroup,
    addChatMessage,
    saveCurrentConversation,
  } = useAppStore.getState();

  const response = await fetch('/api/images/generate-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      prompt,
      n: imageConfig.n,
      size: imageConfig.size,
      quality: imageConfig.quality,
      partialImages: imageConfig.partialImages,
    }),
  });

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({ error: 'Streaming failed' }));
    const errorMessage = data.error?.message || data.error || 'Streaming failed';
    const errorCode = data.error?.code || 'stream_failed';
    toast.error(errorMessage);
    addChatMessage({ role: 'error', content: errorMessage, errorMetadata: { code: errorCode } });
    updateImageGeneration({ status: 'failed', error: errorMessage, errorCode });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const finals: string[] = new Array(imageConfig.n).fill('');
  let streamError: { message: string; code?: string } | null = null as { message: string; code?: string } | null;

  const applyEvent = (payload: any) => {
    if (!payload || typeof payload !== 'object') return;
    switch (payload.kind) {
      case 'image_started': {
        updateImageGeneration({ activeIndex: payload.index });
        break;
      }
      case 'partial': {
        const { partialPreviews } = useAppStore.getState().imageGeneration;
        const next = [...partialPreviews];
        next[payload.index] = b64ToDataUrl(payload.b64);
        updateImageGeneration({ partialPreviews: next, activeIndex: payload.index });
        break;
      }
      case 'final': {
        const dataUrl = b64ToDataUrl(payload.b64);
        finals[payload.index] = dataUrl;
        const { partialPreviews } = useAppStore.getState().imageGeneration;
        const next = [...partialPreviews];
        next[payload.index] = dataUrl;
        updateImageGeneration({ partialPreviews: next });
        break;
      }
      case 'error': {
        streamError = { message: payload.message, code: payload.code };
        break;
      }
      case 'done':
      default:
        break;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;
      try {
        applyEvent(JSON.parse(jsonStr));
      } catch {
        // ignore malformed line
      }
    }
  }

  if (streamError) {
    toast.error(streamError.message);
    addChatMessage({
      role: 'error',
      content: streamError.message,
      errorMetadata: { code: streamError.code || 'stream_error' },
    });
    updateImageGeneration({
      status: 'failed',
      error: streamError.message,
      errorCode: streamError.code,
    });
    return;
  }

  const completed = finals.filter(Boolean);
  if (completed.length === 0) {
    const msg = 'No images returned from stream';
    toast.error(msg);
    addChatMessage({ role: 'error', content: msg, errorMetadata: { code: 'empty_response' } });
    updateImageGeneration({ status: 'failed', error: msg });
    return;
  }

  saveCurrentConversation();
  const imageIds = saveImageGroup(completed, prompt, title, {
    model: imageConfig.model,
    size: imageConfig.size,
    quality: imageConfig.quality,
    hadBaseImage: false,
  });

  addChatMessage({
    role: 'info',
    content: `Generated ${completed.length} image${completed.length > 1 ? 's' : ''}: "${title}".`,
    imageIds,
    metadata: { type: 'generation', status: 'completed', title, mediaType: 'image' },
  });

  saveCurrentConversation();
  updateImageGeneration({ status: 'completed' });
}
