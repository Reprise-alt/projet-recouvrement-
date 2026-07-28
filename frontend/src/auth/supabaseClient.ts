import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// null tant qu'aucun projet Supabase n'est connecté — le formulaire de
// connexion bascule alors sur /api/auth/dev-token (voir AuthContext).
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
