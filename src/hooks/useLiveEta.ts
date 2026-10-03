import { useEffect, useRef, useState } from "react";

/**
 * Smooths a coarse ETA (updated only when a transcription segment finishes,
 * which can be tens of seconds apart) into a value that ticks down every
 * second. Re-syncs whenever the source estimate changes; passing null (no
 * estimate yet, or finished) yields null.
 */
export function useLiveEta(sourceSeconds: number | null): number | null {
  const [value, setValue] = useState<number | null>(sourceSeconds);
  const sourceRef = useRef<number | null>(sourceSeconds);

  useEffect(() => {
    sourceRef.current = sourceSeconds;
    setValue(sourceSeconds);
  }, [sourceSeconds]);

  useEffect(() => {
    if (sourceSeconds === null) return;
    const id = setInterval(() => {
      setValue((prev) => {
        if (prev === null) return prev;
        // Don't tick below 1s; the real completion event clears it to null.
        return prev <= 1 ? 1 : prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [sourceSeconds]);

  return value;
}
