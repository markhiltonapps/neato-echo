import { useEffect, useState } from "react";

/**
 * Whole seconds since `startedAt` (epoch ms), ticking once a second. Returns 0
 * when no start time is given. Drives the live elapsed counter on long,
 * unstreamed background work so it never looks stalled.
 */
export function useElapsedSeconds(startedAt: number | undefined | null): number {
  const [elapsed, setElapsed] = useState(() =>
    startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0
  );

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}
