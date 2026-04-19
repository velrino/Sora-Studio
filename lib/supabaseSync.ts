import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  bucket: string;
}

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey: string | null = null;

function clientKey(config: SupabaseConfig): string {
  return `${config.url}|${config.anonKey}`;
}

export function getSupabaseClient(config: SupabaseConfig | null): SupabaseClient | null {
  if (!config?.url || !config?.anonKey) return null;
  const key = clientKey(config);
  if (cachedClient && cachedConfigKey === key) return cachedClient;
  cachedClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: false },
  });
  cachedConfigKey = key;
  return cachedClient;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export async function uploadImage(
  config: SupabaseConfig,
  path: string,
  dataUrl: string,
): Promise<string> {
  const client = getSupabaseClient(config);
  if (!client) throw new Error('Supabase not configured');

  const blob = await dataUrlToBlob(dataUrl);
  const { error } = await client.storage
    .from(config.bucket)
    .upload(path, blob, {
      contentType: 'image/png',
      upsert: false,
    });

  if (error) throw new Error(error.message);

  const { data } = client.storage.from(config.bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function removeImage(config: SupabaseConfig, path: string): Promise<void> {
  const client = getSupabaseClient(config);
  if (!client) return;
  await client.storage.from(config.bucket).remove([path]);
}

export async function testConnection(config: SupabaseConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const client = getSupabaseClient(config);
    if (!client) return { ok: false, message: 'Missing URL or key' };

    const { error } = await client.storage.from(config.bucket).list('', { limit: 1 });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: 'Connected' };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Connection failed' };
  }
}

// Path inside the bucket.
export function imagePathFor(groupId: string, indexInGroup: number): string {
  return `${groupId}/${indexInGroup}.png`;
}
