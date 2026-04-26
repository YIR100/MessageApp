import { requireSupabase } from './supabase';

export async function uploadAttachment(file: File): Promise<string> {
  const sb = requireSupabase();
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
  const filePath = `attachments/${fileName}`;

  const { error } = await sb.storage
    .from('attachments')
    .upload(filePath, file);

  if (error) {
    throw error;
  }

  const { data } = sb.storage.from('attachments').getPublicUrl(filePath);
  return data.publicUrl;
}
