import { supabase } from './supabase';

export type QuestionMediaType = 'image' | 'audio';

export async function uploadQuestionMedia(file: File, userId: string) {
  const mediaType: QuestionMediaType | null =
    file.type.startsWith('image/') ? 'image' :
    file.type.startsWith('audio/') ? 'audio' : null;

  if (!mediaType) throw new Error('Choose an image or audio file.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Media files must be 15 MB or smaller.');

  const ext = (file.name.split('.').pop() || (mediaType === 'image' ? 'jpg' : 'mp3'))
    .toLowerCase().replace(/[^a-z0-9]/g,'');
  const path = userId + '/' + Date.now() + '-' + Math.random().toString(36).slice(2,10) + '.' + ext;

  const { error } = await supabase.storage.from('question-media').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type
  });
  if (error) throw error;

  const { data } = supabase.storage.from('question-media').getPublicUrl(path);
  return { media_url: data.publicUrl, media_type: mediaType };
}
