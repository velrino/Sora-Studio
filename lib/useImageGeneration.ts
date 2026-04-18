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

export function useImageGeneration() {
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
  } = useAppStore();

  const generateImages = useCallback(async () => {
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

    try {
      resetImageGeneration();
      updateImageGeneration({ status: 'generating', error: null });

      addChatMessage({
        role: 'info',
        content: `Generating ${imageConfig.n} image${imageConfig.n > 1 ? 's' : ''}: "${title}".`,
        metadata: {
          type: 'generation',
          status: 'started',
          title,
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
        addChatMessage({
          role: 'error',
          content: errorMessage,
          errorMetadata: { code: errorCode },
        });

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
        metadata: {
          type: 'generation',
          status: 'completed',
          title,
        },
      });

      saveCurrentConversation();
      updateImageGeneration({ status: 'completed' });
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
  }, [
    apiKey,
    chatMessages,
    baseImage,
    imageConfig,
    updateImageGeneration,
    resetImageGeneration,
    saveImageGroup,
    addChatMessage,
    saveCurrentConversation,
  ]);

  return { generateImages };
}
