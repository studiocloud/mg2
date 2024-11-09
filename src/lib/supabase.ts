import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'x-my-custom-header': 'email-validator'
    }
  }
});

export async function uploadCSV(file: File, userId: string) {
  try {
    const timestamp = new Date().getTime();
    const filePath = `${userId}/original/${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const { data, error } = await supabase.storage
      .from('csv-uploads')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'text/csv'
      });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Upload error:', error);
    throw new Error('Failed to upload file. Please try again.');
  }
}

export async function uploadValidatedCSV(blob: Blob, userId: string, originalName: string) {
  try {
    const timestamp = new Date().getTime();
    const filePath = `${userId}/validated/${timestamp}_validated_${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const { data, error } = await supabase.storage
      .from('csv-uploads')
      .upload(filePath, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'text/csv'
      });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Upload validated CSV error:', error);
    throw new Error('Failed to store validation results');
  }
}

export async function downloadValidatedCSV(path: string) {
  try {
    const { data, error } = await supabase.storage
      .from('csv-uploads')
      .download(path);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Download error:', error);
    throw new Error('Failed to download validated results');
  }
}

export async function getCSVUrl(path: string) {
  try {
    const { data } = await supabase.storage
      .from('csv-uploads')
      .getPublicUrl(path);

    return data.publicUrl;
  } catch (error) {
    console.error('Get URL error:', error);
    throw new Error('Failed to get file URL');
  }
}