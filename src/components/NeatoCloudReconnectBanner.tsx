import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import {
  onNeatoCloudConnectionChange,
  type NeatoCloudConnection,
} from "../services/neatoCloud";

// Persistent warning shown whenever the Neato Cloud session has lapsed. Without it, a
// disconnected session silently stops syncing meetings to the cloud (and to connected
// apps like Neato Muse / the MCP), exactly the way it snuck up before. Strings are
// English-only to match the rest of the Neato Cloud UI (NeatoCloudSettings).
export default function NeatoCloudReconnectBanner({
  onReconnect,
}: {
  onReconnect: () => void;
}) {
  const [connection, setConnection] = useState<NeatoCloudConnection>("unknown");

  useEffect(() => onNeatoCloudConnectionChange(setConnection), []);

  if (connection !== "disconnected") return null;

  return (
    <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/12 px-4 py-2 dark:bg-amber-400/10">
      <CloudOff size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="flex-1 text-[13px] text-foreground/80">
        Your Neato Cloud sign-in expired — new meetings have stopped syncing to the cloud
        (and to connected apps). Reconnect to resume.
      </span>
      <button
        onClick={onReconnect}
        className="shrink-0 rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
      >
        Reconnect
      </button>
    </div>
  );
}
