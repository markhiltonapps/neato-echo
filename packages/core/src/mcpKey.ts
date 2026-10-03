// Shared, platform-agnostic bits for the "Connect AI Agent" flow.
//
// A user mints a personal MCP access key on-device, stores only its SHA-256 hash in
// public.echo_mcp_keys (scoped to their own account by RLS), and pastes a personalized
// URL into their AI agent's connector. The hosted edge function (meetings-mcp) hashes
// the incoming key, looks up the account, and returns only that account's meetings.
//
// Random-byte generation and hashing differ per platform (Web Crypto in the desktop
// renderer vs. expo-crypto on mobile), so those stay at each call site. Everything that
// can be shared lives here.

/** The hosted remote MCP endpoint (same for every user; the key identifies the account). */
export const MCP_ENDPOINT =
  "https://djrgoduukyqarozqyxbu.supabase.co/functions/v1/meetings-mcp";

/** Human-readable name to suggest for the connector. */
export const MCP_CONNECTOR_NAME = "Neato Echo Meetings";

/** Prefix on every minted key, so it is recognizable and greppable. */
export const MCP_KEY_PREFIX = "echo_";

/** Number of random bytes behind a key (32 hex chars → 128 bits of entropy). */
export const MCP_KEY_RANDOM_BYTES = 16;

/** Turn raw random hex into a full key string, e.g. "echo_ab12…". */
export function formatMcpKey(randomHex: string): string {
  return `${MCP_KEY_PREFIX}${randomHex}`;
}

/**
 * The single personalized URL a user pastes into their agent's "Web address" field,
 * leaving the access-key field blank. The function accepts the key via ?key=.
 */
export function buildMcpConnectUrl(key: string): string {
  return `${MCP_ENDPOINT}?key=${encodeURIComponent(key)}`;
}

/** Lowercase-hex of a byte array (shared formatting for both platforms' hashes/randoms). */
export function bytesToHex(bytes: ArrayLike<number>): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}
