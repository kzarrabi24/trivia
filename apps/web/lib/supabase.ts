import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://jbltdtflcbayizeouxzf.supabase.co';

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_60jltKhN6mLlNOFl77hWxQ_zgF3RKeA';

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
