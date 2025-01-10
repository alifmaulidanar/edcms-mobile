import { createClient } from '@supabase/supabase-js';

// Get the Supabase URL and Anon Key from the environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
