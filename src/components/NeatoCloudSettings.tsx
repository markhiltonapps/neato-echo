import { useEffect, useState } from "react";
import {
  neatoCloud,
  pushNotesToCloud,
  pullNotesFromCloud,
  pushConversationsToCloud,
  pullConversationsFromCloud,
} from "../services/neatoCloud";
import ConnectAiAgentCard from "./ConnectAiAgentCard";

// Neato Cloud settings section: sign in to the shared Supabase backend and push the
// desktop's notes so they appear in the mobile app. First increment = metadata push
// (titles, summaries, transcripts); audio + two-way sync come next.
export default function NeatoCloudSettings() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  // Auto-push is on unless explicitly turned off. When on, each finished meeting
  // uploads itself so nothing has to be pushed by hand.
  const [autoPush, setAutoPush] = useState(() => {
    try {
      return localStorage.getItem("neato.autoPush.v1") !== "off";
    } catch {
      return true;
    }
  });

  function toggleAutoPush(next: boolean) {
    setAutoPush(next);
    try {
      localStorage.setItem("neato.autoPush.v1", next ? "on" : "off");
    } catch {
      // setting unavailable — defaults to on
    }
  }

  useEffect(() => {
    neatoCloud.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = neatoCloud.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await neatoCloud.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setPassword("");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function signUp() {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await neatoCloud.auth.signUp({ email: email.trim(), password });
      if (error) throw error;
      setStatus("Account created — you can sign in now.");
      setPassword("");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function push() {
    setPushing(true);
    setStatus("");
    setError("");
    try {
      const n = await pushNotesToCloud();
      let chatMsg = "";
      try {
        const c = await pushConversationsToCloud();
        if (c > 0) chatMsg = ` and ${c} chat${c === 1 ? "" : "s"}`;
      } catch {
        // chat sync is best-effort; the notes push already succeeded
      }
      setStatus(
        `Pushed ${n} note${n === 1 ? "" : "s"}${chatMsg} to Neato Cloud. Open the mobile app and Pull to see them.`
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setPushing(false);
    }
  }

  async function pull() {
    setPulling(true);
    setStatus("");
    setError("");
    try {
      const n = await pullNotesFromCloud();
      let chatMsg = "";
      try {
        const c = await pullConversationsFromCloud();
        if (c > 0) chatMsg = ` and ${c} chat${c === 1 ? "" : "s"}`;
      } catch {
        // chat pull is best-effort; the notes pull already succeeded
      }
      setStatus(
        n > 0 || chatMsg
          ? `Pulled ${n} recording${n === 1 ? "" : "s"}${chatMsg} from other devices into your notes.`
          : "You're up to date — nothing new to pull."
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setPulling(false);
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Neato Cloud</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sync your notes to Neato Cloud so they appear in the Neato Echo mobile app. Sign in with the same
          account on both.
        </p>
      </div>

      {session ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <span className="truncate text-sm text-foreground">✓ Signed in as {session.user?.email}</span>
            <button
              onClick={() => neatoCloud.auth.signOut()}
              className="ml-3 shrink-0 text-sm font-medium text-destructive hover:opacity-80"
            >
              Sign out
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={push}
              disabled={pushing || pulling}
              className="flex-1 rounded-lg bg-primary py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pushing ? "Pushing…" : "↑ Push notes"}
            </button>
            <button
              onClick={pull}
              disabled={pushing || pulling}
              className="flex-1 rounded-lg border border-border py-2.5 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              {pulling ? "Pulling…" : "↓ Pull recordings"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pull brings recordings made on your phone into your notes. It only adds new ones — it never
            changes or removes your existing notes.
          </p>

          <label className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <span className="text-sm text-foreground">
              Auto-sync new meetings
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Upload each meeting automatically when it finishes — no need to press Push.
              </span>
            </span>
            <input
              type="checkbox"
              checked={autoPush}
              onChange={(e) => toggleAutoPush(e.target.checked)}
              className="ml-3 h-4 w-4 shrink-0 accent-primary"
            />
          </label>

          {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
          <p className="text-xs text-muted-foreground">
            Pushes titles, summaries, transcripts, and meeting audio.
          </p>

          {session.user?.id ? <ConnectAiAgentCard userId={session.user.id} /> : null}
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoCapitalize="none"
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={signIn}
              disabled={busy}
              className="flex-1 rounded-lg bg-primary py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Sign in
            </button>
            <button
              onClick={signUp}
              disabled={busy}
              className="flex-1 rounded-lg border border-border py-2.5 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              Create account
            </button>
          </div>
          {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
