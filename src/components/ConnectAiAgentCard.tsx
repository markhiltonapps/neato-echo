import { useEffect, useState } from "react";
import {
  MCP_ENDPOINT,
  MCP_CONNECTOR_NAME,
  MCP_KEY_RANDOM_BYTES,
  formatMcpKey,
  buildMcpConnectUrl,
  bytesToHex,
} from "@neato/core";
import { neatoCloud } from "../services/neatoCloud";
import { useCopyFeedback } from "../hooks/useCopyFeedback";

// "Connect an AI agent": mints a personal, read-only MCP access key on-device, stores
// only its SHA-256 hash (RLS-scoped to this account), and shows a single personalized
// URL to paste into an outside AI agent. We never store the plaintext key, so it is
// shown once; losing it means regenerating.
//
// English is hard-coded here to match the rest of NeatoCloudSettings (which does not use
// i18n yet); translate the whole section together later.

async function mintKey(userId: string): Promise<{ key: string; url: string }> {
  const bytes = new Uint8Array(MCP_KEY_RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  const key = formatMcpKey(bytesToHex(bytes));

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const keyHash = bytesToHex(new Uint8Array(digest));

  // One link per account: drop any previous keys, then insert the new hash.
  await neatoCloud.from("echo_mcp_keys").delete().eq("user_id", userId);
  const { error } = await neatoCloud
    .from("echo_mcp_keys")
    .insert({ key_hash: keyHash, user_id: userId, label: "AI agent" });
  if (error) throw error;

  return { key, url: buildMcpConnectUrl(key) };
}

export default function ConnectAiAgentCard({ userId }: { userId: string }) {
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showFields, setShowFields] = useState(false);
  // Plaintext key + URL live only in component memory, only until this view unmounts.
  const [minted, setMinted] = useState<{ key: string; url: string } | null>(null);

  const urlCopy = useCopyFeedback(minted?.url ?? "");
  const endpointCopy = useCopyFeedback(MCP_ENDPOINT);
  const keyCopy = useCopyFeedback(minted?.key ?? "");

  useEffect(() => {
    let active = true;
    neatoCloud
      .from("echo_mcp_keys")
      .select("key_hash")
      .eq("user_id", userId)
      .limit(1)
      .then(({ data }) => {
        if (active) {
          setHasExistingKey((data?.length ?? 0) > 0);
          setChecking(false);
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const result = await mintKey(userId);
      setMinted(result);
      setHasExistingKey(true);
      setShowFields(false);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Connect an AI agent</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Give an outside AI agent read-only access to your meetings over the internet. It can search
          and read your transcripts — it can never change or delete anything.
        </p>
      </div>

      {minted ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              Your connection link
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={minted.url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 truncate rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground"
              />
              <button
                onClick={urlCopy.copy}
                className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {urlCopy.copied ? "Copied ✓" : "Copy link"}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              In your agent, add a custom/remote MCP connector and paste this into its{" "}
              <strong>Web address</strong> field. Leave the access-key field blank.
            </p>
          </div>

          <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Copy this now. For your security we only keep a scrambled copy, so you won't be able to see
            this link again — but you can generate a new one anytime.
          </div>

          <button
            onClick={() => setShowFields((v) => !v)}
            className="text-xs font-medium text-primary hover:opacity-80"
          >
            {showFields ? "Hide separate fields" : "My agent asks for separate fields"}
          </button>

          {showFields ? (
            <div className="space-y-2 rounded-md border border-border/60 p-3">
              <FieldRow label="Name" value={MCP_CONNECTOR_NAME} />
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Web address</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={MCP_ENDPOINT}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 truncate rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground"
                  />
                  <button
                    onClick={endpointCopy.copy}
                    className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    {endpointCopy.copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Access key</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={minted.key}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 truncate rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground"
                  />
                  <button
                    onClick={keyCopy.copy}
                    className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    {keyCopy.copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          {hasExistingKey && !checking ? (
            <p className="text-xs text-muted-foreground">
              ✓ A connection link is active. Regenerating makes a new link and stops the old one from
              working.
            </p>
          ) : null}
          <button
            onClick={generate}
            disabled={busy || checking}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy
              ? "Generating…"
              : hasExistingKey
                ? "Regenerate connection link"
                : "Generate connection link"}
          </button>
        </div>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground">{value}</span>
    </div>
  );
}
