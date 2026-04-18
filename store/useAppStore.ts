import { create } from 'zustand';
import { putImage, getImage, deleteImage as deleteImageFromIDB, deleteImages as deleteImagesFromIDB } from '@/lib/imageStorage';

export type InfoMessageType = 'generation' | 'remix_reference';

export interface InfoMessageMetadata {
  type: InfoMessageType;
  status?: 'started' | 'completed';
  title?: string;
  isRemix?: boolean;
}

export interface ErrorMetadata {
  code?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'info' | 'error';
  content: string;
  timestamp: number;
  videoId?: string | null;
  imageIds?: string[] | null;
  metadata?: InfoMessageMetadata;
  errorMetadata?: ErrorMetadata;
}

export interface VideoGeneration {
  id: string | null;
  status: 'idle' | 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  videoUrl: string | null;
  error: string | null;
  errorCode?: string | null;
}

export interface SavedConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  baseImageUrl?: string | null;
}

export interface SavedVideo {
  id: string;
  videoId: string;
  conversationId: string;
  prompt: string;
  title: string;
  createdAt: number;
  model: string;
  remixedFromVideoId?: string | null;
}

export interface SavedImage {
  id: string;
  conversationId: string | null;
  prompt: string;
  title: string;
  dataUrl: string;
  createdAt: number;
  model: string;
  size: string;
  quality: string;
  groupId: string;
  indexInGroup: number;
  hadBaseImage: boolean;
}

export interface VideoConfig {
  size: string;
  seconds: string;
}

export interface ImageConfig {
  n: number;
  size: string;
  quality: string;
  model: string;
  partialImages: 0 | 1 | 2 | 3;
}

export interface ImageGeneration {
  status: 'idle' | 'generating' | 'completed' | 'failed';
  error: string | null;
  errorCode?: string | null;
  startedAt: number | null;
  partialPreviews: (string | null)[];
  activeIndex: number;
}

export type GenerationMode = 'video' | 'image';

interface AppState {
  // API Key
  apiKey: string | null;
  setApiKey: (key: string | null) => void;

  // Model Selection
  selectedModel: 'sora-2' | 'sora-2-pro';
  setSelectedModel: (model: 'sora-2' | 'sora-2-pro') => void;

  // Generation Mode (video vs image)
  generationMode: GenerationMode;
  setGenerationMode: (mode: GenerationMode) => void;

  // Video Configuration
  videoConfig: VideoConfig;
  setVideoConfig: (config: Partial<VideoConfig>) => void;

  // Image Configuration
  imageConfig: ImageConfig;
  setImageConfig: (config: Partial<ImageConfig>) => void;

  // Base Image
  baseImage: { file?: File; previewUrl: string; cropX?: number; cropY?: number } | null;
  setBaseImage: (image: { file?: File; previewUrl: string; cropX?: number; cropY?: number } | null) => void;
  updateBaseImageCrop: (cropX: number, cropY: number) => void;

  // Mode
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  showLibrary: boolean;
  setShowLibrary: (show: boolean) => void;
  showVideoHistory: boolean;
  setShowVideoHistory: (show: boolean) => void;

  // Chat
  chatInput: string;
  setChatInput: (value: string) => void;
  chatMessages: ChatMessage[];
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  readyToGenerate: boolean;
  setReadyToGenerate: (ready: boolean) => void;
  remixReference: { videoId: string; title: string } | null;
  referenceVideoForRemix: (videoId: string, title: string) => void;
  clearRemixReference: () => void;

  // Video Generation
  videoGeneration: VideoGeneration;
  updateVideoGeneration: (updates: Partial<VideoGeneration>) => void;
  resetVideoGeneration: () => void;

  // Image Generation
  imageGeneration: ImageGeneration;
  updateImageGeneration: (updates: Partial<ImageGeneration>) => void;
  resetImageGeneration: () => void;

  // Conversation History
  currentConversationId: string | null;
  savedConversations: SavedConversation[];
  savedVideos: SavedVideo[];
  savedImages: SavedImage[];
  saveCurrentConversation: () => void;
  loadConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  saveVideo: (videoId: string, prompt: string, title: string, remixedFromVideoId?: string | null) => void;
  saveImageGroup: (images: string[], prompt: string, title: string, meta: { model: string; size: string; quality: string; hadBaseImage: boolean }) => string[];
  deleteImage: (id: string) => void;
  newConversation: () => void;
}

function persistSavedImagesMeta(images: SavedImage[]) {
  // Strip dataUrl before writing to localStorage. Blobs live in IndexedDB.
  const meta = images.map(({ dataUrl, ...rest }) => rest);
  try {
    localStorage.setItem('saved_images', JSON.stringify(meta));
  } catch (err) {
    console.error('Failed to persist saved_images metadata:', err);
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  // API Key
  apiKey: null,
  setApiKey: (key) => {
    if (key) {
      localStorage.setItem('openai_api_key', key);
    } else {
      localStorage.removeItem('openai_api_key');
    }
    set({ apiKey: key });
  },

  // Model Selection
  selectedModel: 'sora-2',
  setSelectedModel: (model) => {
    localStorage.setItem('selected_model', model);
    set({ selectedModel: model });
  },

  // Generation Mode
  generationMode: 'video',
  setGenerationMode: (mode) => {
    localStorage.setItem('generation_mode', mode);
    set({ generationMode: mode });
  },

  // Video Configuration
  videoConfig: {
    size: '1280x720',
    seconds: '8',
  },
  setVideoConfig: (config) => {
    const newConfig = { ...get().videoConfig, ...config };
    localStorage.setItem('video_config', JSON.stringify(newConfig));
    set({ videoConfig: newConfig });
  },

  // Image Configuration
  imageConfig: {
    n: 1,
    size: '1024x1024',
    quality: 'auto',
    model: 'gpt-image-1.5',
    partialImages: 0,
  },
  setImageConfig: (config) => {
    const newConfig = { ...get().imageConfig, ...config };
    localStorage.setItem('image_config', JSON.stringify(newConfig));
    set({ imageConfig: newConfig });
  },

  // Base Image
  baseImage: null,
  setBaseImage: (image) => set({ baseImage: image }),
  updateBaseImageCrop: (cropX, cropY) =>
    set((state) => ({
      baseImage: state.baseImage ? { ...state.baseImage, cropX, cropY } : null,
    })),

  // Mode
  showHistory: false,
  setShowHistory: (show) => set({ showHistory: show }),
  showLibrary: false,
  setShowLibrary: (show) => set({ showLibrary: show }),
  showVideoHistory: false,
  setShowVideoHistory: (show) => set({ showVideoHistory: show }),

  // Chat
  chatInput: '',
  setChatInput: (value) => set({ chatInput: value }),
  chatMessages: [
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hi! I\'m here to help you create amazing videos with Sora 2. Tell me what kind of video you\'d like to make and I\'ll help you bring it to life!',
      timestamp: Date.now(),
    },
  ],
  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        {
          ...message,
          id: `msg-${Date.now()}`,
          timestamp: Date.now(),
        },
      ],
    })),
  readyToGenerate: false,
  setReadyToGenerate: (ready) => set({ readyToGenerate: ready }),
  remixReference: null,
  referenceVideoForRemix: (videoId, title) => {
    const state = get();
    if (state.remixReference?.videoId === videoId) {
      return;
    }

    state.addChatMessage({
      role: 'info',
      content: `Using "${title}" as the remix source. Describe the changes you'd like and hit Generate Video when you're ready.`,
      videoId,
      metadata: {
        type: 'remix_reference',
        title,
      },
    });

    set({ remixReference: { videoId, title } });
  },
  clearRemixReference: () => set({ remixReference: null }),

  // Video Generation
  videoGeneration: {
    id: null,
    status: 'idle',
    progress: 0,
    videoUrl: null,
    error: null,
  },
  updateVideoGeneration: (updates) =>
    set((state) => ({
      videoGeneration: { ...state.videoGeneration, ...updates },
    })),
  resetVideoGeneration: () =>
    set({
      videoGeneration: {
        id: null,
        status: 'idle',
        progress: 0,
        videoUrl: null,
        error: null,
      },
    }),

  // Image Generation
  imageGeneration: {
    status: 'idle',
    error: null,
    startedAt: null,
    partialPreviews: [],
    activeIndex: 0,
  },
  updateImageGeneration: (updates) =>
    set((state) => ({
      imageGeneration: { ...state.imageGeneration, ...updates },
    })),
  resetImageGeneration: () =>
    set({
      imageGeneration: {
        status: 'idle',
        error: null,
        startedAt: null,
        partialPreviews: [],
        activeIndex: 0,
      },
    }),

  // Conversation History
  currentConversationId: null,
  savedConversations: [],
  savedVideos: [],
  savedImages: [],

  saveCurrentConversation: () => {
    const state = get();
    const conversationId = state.currentConversationId || `conv-${Date.now()}`;

    // Create title from first user message or default
    const firstUserMsg = state.chatMessages.find(m => m.role === 'user');
    const title = firstUserMsg
      ? firstUserMsg.content.substring(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')
      : 'New Conversation';

    const conversation: SavedConversation = {
      id: conversationId,
      title,
      messages: state.chatMessages,
      createdAt: state.currentConversationId ?
        state.savedConversations.find(c => c.id === conversationId)?.createdAt || Date.now() :
        Date.now(),
      updatedAt: Date.now(),
      baseImageUrl: state.baseImage?.previewUrl || null,
    };

    const updatedConversations = state.savedConversations.filter(c => c.id !== conversationId);
    updatedConversations.unshift(conversation);

    localStorage.setItem('saved_conversations', JSON.stringify(updatedConversations));

    set({
      currentConversationId: conversationId,
      savedConversations: updatedConversations,
    });
  },

  loadConversation: (id) => {
    const state = get();
    const conversation = state.savedConversations.find(c => c.id === id);
    if (conversation) {
      set({
        chatMessages: conversation.messages,
        currentConversationId: id,
        showHistory: false,
        baseImage: conversation.baseImageUrl ? { previewUrl: conversation.baseImageUrl } : null,
        remixReference: null,
      });
    }
  },

  deleteConversation: (id) => {
    const state = get();
    const updatedConversations = state.savedConversations.filter(c => c.id !== id);
    localStorage.setItem('saved_conversations', JSON.stringify(updatedConversations));

    // Delete associated videos
    const updatedVideos = state.savedVideos.filter(v => v.conversationId !== id);
    localStorage.setItem('saved_videos', JSON.stringify(updatedVideos));

    // Delete associated images (both metadata and IndexedDB blobs)
    const orphanedImages = state.savedImages.filter((img) => img.conversationId === id);
    const remainingImages = state.savedImages.filter((img) => img.conversationId !== id);
    persistSavedImagesMeta(remainingImages);
    if (orphanedImages.length > 0) {
      deleteImagesFromIDB(orphanedImages.map((img) => img.id)).catch((err) =>
        console.error('Failed to delete images from IDB:', err),
      );
    }

    set({
      savedConversations: updatedConversations,
      savedVideos: updatedVideos,
      savedImages: remainingImages,
    });
  },

  saveImageGroup: (images, prompt, title, meta) => {
    const state = get();
    const groupId = `img-grp-${Date.now()}`;
    const createdAt = Date.now();
    const conversationId = state.currentConversationId;

    const entries: SavedImage[] = images.map((dataUrl, index) => ({
      id: `img-${createdAt}-${index}`,
      conversationId,
      prompt,
      title,
      dataUrl,
      createdAt,
      model: meta.model,
      size: meta.size,
      quality: meta.quality,
      groupId,
      indexInGroup: index,
      hadBaseImage: meta.hadBaseImage,
    }));

    // Heavy base64 blobs go to IndexedDB (localStorage is too small).
    Promise.all(entries.map((e) => putImage(e.id, e.dataUrl))).catch((err) => {
      console.error('Failed to persist image to IndexedDB:', err);
    });

    const updated = [...entries, ...state.savedImages];
    persistSavedImagesMeta(updated);
    set({ savedImages: updated });

    return entries.map((e) => e.id);
  },

  deleteImage: (id) => {
    const state = get();
    const updated = state.savedImages.filter((img) => img.id !== id);
    persistSavedImagesMeta(updated);
    set({ savedImages: updated });
    deleteImageFromIDB(id).catch((err) => console.error('Failed to delete image from IDB:', err));
  },

  saveVideo: (videoId, prompt, title, remixedFromVideoId = null) => {
    const state = get();
    const video: SavedVideo = {
      id: `vid-${Date.now()}`,
      videoId,
      conversationId: state.currentConversationId || `conv-${Date.now()}`,
      prompt,
      title,
      createdAt: Date.now(),
      model: state.selectedModel,
      remixedFromVideoId,
    };

    const existingVideos = state.savedVideos.filter((v) => v.videoId !== videoId);
    const updatedVideos = [video, ...existingVideos];
    localStorage.setItem('saved_videos', JSON.stringify(updatedVideos));

    set({ savedVideos: updatedVideos });
  },

  newConversation: () => {
    // Save current conversation if it has messages
    const state = get();
    if (state.chatMessages.length > 1) {
      state.saveCurrentConversation();
    }

    set({
      chatMessages: [{
        id: 'welcome',
        role: 'assistant',
        content: 'Hi! I\'m here to help you create amazing videos with Sora 2. Tell me what kind of video you\'d like to make and I\'ll help you bring it to life!',
        timestamp: Date.now(),
      }],
      currentConversationId: null,
      readyToGenerate: false,
      baseImage: null,
      remixReference: null,
      chatInput: '',
    });
  },
}));

// Initialize from localStorage on client side
if (typeof window !== 'undefined') {
  const storedKey = localStorage.getItem('openai_api_key');
  if (storedKey) {
    useAppStore.setState({ apiKey: storedKey });
  }

  const storedModel = localStorage.getItem('selected_model') as 'sora-2' | 'sora-2-pro';
  if (storedModel) {
    useAppStore.setState({ selectedModel: storedModel });
  }

  const storedConfig = localStorage.getItem('video_config');
  if (storedConfig) {
    try {
      useAppStore.setState({ videoConfig: JSON.parse(storedConfig) });
    } catch (e) {
      console.error('Failed to parse video config');
    }
  }

  const storedConversations = localStorage.getItem('saved_conversations');
  if (storedConversations) {
    try {
      useAppStore.setState({ savedConversations: JSON.parse(storedConversations) });
    } catch (e) {
      console.error('Failed to parse saved conversations');
    }
  }

  const storedVideos = localStorage.getItem('saved_videos');
  if (storedVideos) {
    try {
      const parsed = JSON.parse(storedVideos).map((video: any) => ({
        ...video,
        title: video.title || video.prompt || 'Untitled Video',
        remixedFromVideoId: 'remixedFromVideoId' in video ? video.remixedFromVideoId : null,
      }));
      useAppStore.setState({ savedVideos: parsed });
    } catch (e) {
      console.error('Failed to parse saved videos');
    }
  }

  const storedImages = localStorage.getItem('saved_images');
  if (storedImages) {
    try {
      const parsed: SavedImage[] = JSON.parse(storedImages).map((img: any) => ({
        ...img,
        dataUrl: img.dataUrl ?? '',
      }));
      useAppStore.setState({ savedImages: parsed });

      // Migrate: any legacy entries that still carry dataUrl inline get
      // copied into IndexedDB so the next persist (metadata-only) is safe.
      const legacy = parsed.filter((img) => img.dataUrl);
      if (legacy.length > 0) {
        Promise.all(legacy.map((img) => putImage(img.id, img.dataUrl)))
          .then(() => persistSavedImagesMeta(parsed))
          .catch((err) => console.error('Failed to migrate images to IDB:', err));
      }

      // Async-load blobs for entries that didn't have dataUrl inline.
      Promise.all(
        parsed.map(async (img) => {
          if (img.dataUrl) return img;
          const loaded = await getImage(img.id).catch(() => null);
          return loaded ? { ...img, dataUrl: loaded } : img;
        }),
      ).then((withBlobs) => {
        useAppStore.setState({ savedImages: withBlobs });
      });
    } catch (e) {
      console.error('Failed to parse saved images');
    }
  }

  const storedImageConfig = localStorage.getItem('image_config');
  if (storedImageConfig) {
    try {
      const parsed = JSON.parse(storedImageConfig);
      useAppStore.setState((state) => ({ imageConfig: { ...state.imageConfig, ...parsed } }));
    } catch (e) {
      console.error('Failed to parse image config');
    }
  }

  const storedGenerationMode = localStorage.getItem('generation_mode') as GenerationMode | null;
  if (storedGenerationMode === 'video' || storedGenerationMode === 'image') {
    useAppStore.setState({ generationMode: storedGenerationMode });
  }
}
