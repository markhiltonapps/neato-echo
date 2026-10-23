// Pure decision for the Neato Cloud connection-banner state from a Supabase auth event.
// Kept as plain renderer ESM (not inside neatoCloud.ts) so it can be unit-tested with
// `node --test` — the neatoCloud client module pulls in supabase-js and window.electronAPI.
//
//  - A live session => "connected".
//  - A SIGNED_OUT after we'd had a session, that the user did NOT request => "disconnected"
//    (the session lapsed: token expired / refresh failed). This is what raises the banner.
//  - Anything else (never signed in, or a deliberate sign-out) => "unknown" (no banner).
export function decideNeatoConnection({ event, hasSession, hadSession, userSignedOut } = {}) {
  if (hasSession) return "connected";
  if (event === "SIGNED_OUT" && hadSession && !userSignedOut) return "disconnected";
  return "unknown";
}
