// Neato Echo edition switches.
//
// Neato Echo ships local-first: no account is required and nothing leaves the
// machine. The upstream cloud account code stays intact for a future
// "Neato Echo Cloud" tier and is re-enabled with a build-time flag:
//   VITE_NEATO_ACCOUNTS_ENABLED=true
//
// Read defensively: Vite injects import.meta.env in the renderer, while the
// Node test runner (and any main-process import) has no such object.
function readFlag(name: string): string | undefined {
  const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  if (viteEnv && name in viteEnv) return viteEnv[name];
  if (typeof process !== "undefined" && process.env) return process.env[name];
  return undefined;
}

export const ACCOUNTS_ENABLED = readFlag("VITE_NEATO_ACCOUNTS_ENABLED") === "true";

// Local-first defaults apply whenever accounts are off.
export const LOCAL_FIRST = !ACCOUNTS_ENABLED;
