import { useEffect, useRef } from "react";
import { useModelDownload } from "./useModelDownload";
import { useSettingsStore, setResolvedLLMConfig } from "../stores/settingsStore";

const MIGRATION_FLAG = "localSummaryModelMigratedTo2B";
const OLD_DEFAULT = "qwen3.5-4b-q4_k_m";
const NEW_DEFAULT = "qwen3.5-2b-q4_k_m";

/**
 * One-time upgrade migration to the faster local default. Users who onboarded
 * on the old auto-default assistant (Qwen 3.5 4B) are moved to 2B — now the
 * default for everyone. 2B downloads in the background and the chat + summary
 * scopes switch to it once it's ready, so 4B keeps working until then.
 *
 * Only touches users still sitting on the old local 4B default — never a
 * deliberate cloud or other-model choice — and never re-downloads when 2B is
 * already present. The done-flag is set only after the switch actually happens,
 * so an offline/failed attempt simply retries on the next launch.
 */
export function useLocalSummaryModelMigration(): void {
  const startedRef = useRef(false);
  const download = useModelDownload({ modelType: "llm" });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        if (localStorage.getItem(MIGRATION_FLAG)) return;
      } catch {
        return;
      }

      const s = useSettingsStore.getState();
      const onOldLocal4B =
        s.chatAgentMode === "local" &&
        s.chatAgentProvider === "qwen" &&
        s.chatAgentModel === OLD_DEFAULT;

      const markDone = () => {
        try {
          localStorage.setItem(MIGRATION_FLAG, "1");
        } catch {
          /* private mode / storage disabled — retry next launch is harmless */
        }
      };

      // New default, a cloud setup, or a deliberately chosen model — leave it be.
      if (!onOldLocal4B) {
        markDone();
        return;
      }

      const switchToNew = () => {
        const patch = { mode: "local" as const, provider: "qwen", model: NEW_DEFAULT };
        setResolvedLLMConfig("chatIntelligence", patch);
        setResolvedLLMConfig("noteFormatting", patch);
        markDone();
      };

      const all = await window.electronAPI?.modelGetAll?.().catch(() => undefined);
      const has2B = Array.isArray(all) && all.some((m) => m.id === NEW_DEFAULT && m.isDownloaded);
      if (has2B) {
        switchToNew();
        return;
      }

      // Background download; switch only once it lands. Flag stays unset on
      // failure so the next launch retries (or finds 2B already present).
      download.downloadModel(NEW_DEFAULT, () => switchToNew());
    })();
  }, [download]);
}
