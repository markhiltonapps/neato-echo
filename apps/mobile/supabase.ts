import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
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

// React Native suspends JS timers in the background, so `autoRefreshToken` alone can't
// keep the session alive — the access token silently expires and every sync call then
// fails with a 401 (surfaced in the UI as "sync failed"). Per the supabase-js RN guide,
// drive refresh from the app's foreground state: refresh while active (this also forces
// an immediate refresh on return, so a token that expired in the background is renewed
// before the next query), pause while backgrounded. The app launches active, so start now.
supabase.auth.startAutoRefresh();
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
