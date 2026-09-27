import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Neato Cloud = the shared Supabase backend (NeatoRecall project). The publishable
// key is safe to ship in the client; row-level security enforces per-user access.
export const SUPABASE_URL = "https://djrgoduukyqarozqyxbu.supabase.co";
export const AUDIO_BUCKET = "echo-audio";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_oFOe6rf_a1tHoHDuwmrciA_bYwE-M5x";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
