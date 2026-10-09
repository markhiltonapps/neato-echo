import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { cn } from "../lib/utils";
import {
  getActionDescription,
  getActionName,
  initializeActions,
  useActions,
} from "../../stores/actionStore";
import type { ActionItem } from "../../types/electron";
import { ASK_SUMMARY_AFTER_RECORDING_KEY } from "./summaryPromptPreference";

interface PostRecordingSummaryDialogProps {
  open: boolean;
  onPick: (action: ActionItem) => void;
  onSkip: () => void;
}

/**
 * Shown once when a meeting recording ends: lets the user pick one of the
 * summary actions (built-in presets or their own) for the note just recorded.
 */
export default function PostRecordingSummaryDialog({
  open,
  onPick,
  onSkip,
}: PostRecordingSummaryDialogProps) {
  const { t } = useTranslation();
  const actions = useActions();
  const [dontAskAgain, setDontAskAgain] = useState(false);

  useEffect(() => {
    if (open) void initializeActions();
  }, [open]);

  const persistPreference = () => {
    if (dontAskAgain) {
      try {
        localStorage.setItem(ASK_SUMMARY_AFTER_RECORDING_KEY, "false");
      } catch {
        // Preference is a convenience only.
      }
    }
  };

  const handleSkip = () => {
    persistPreference();
    onSkip();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : handleSkip())}>
      <DialogContent className="sm:max-w-md p-6 gap-5">
        <DialogHeader>
          <DialogTitle>{t("notes.actions.summaryPrompt.title")}</DialogTitle>
          <DialogDescription>{t("notes.actions.summaryPrompt.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto -mx-1 px-1">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                persistPreference();
                onPick(action);
              }}
              className={cn(
                "flex items-start gap-3 w-full rounded-lg border border-border/60 px-3 py-2.5 text-left",
                "hover:bg-accent/8 dark:hover:bg-accent/12 hover:border-accent/40",
                "transition-colors duration-150"
              )}
            >
              <Sparkles size={14} className="mt-0.5 shrink-0 text-accent/60" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {getActionName(action, t)}
                </span>
                {action.description && (
                  <span className="block text-xs text-muted-foreground truncate">
                    {getActionDescription(action, t)}
                  </span>
                )}
              </span>
            </button>
          ))}
          {actions.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("notes.actions.noActions")}</p>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-3 sm:justify-between">
          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(event) => setDontAskAgain(event.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            {t("notes.actions.summaryPrompt.dontAsk")}
          </label>
          <Button variant="outline" size="sm" onClick={handleSkip}>
            {t("notes.actions.summaryPrompt.skip")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
