import React from "react";

type AutoSaveManagerProps<T> = {
  state: T;
  enabled?: boolean;
  debounceMs?: number;
  onSave: (state: T) => Promise<void>;
  onStatusChange?: (status: "idle" | "saving" | "saved" | "error") => void;
};

/**
 * Speichert `state` entprellt. Nur eine echte Änderung des Zustands löst ein Speichern aus:
 * onSave/onStatusChange stehen in Refs, weil sie oft bei jedem Render neu entstehen — als
 * Effekt-Abhängigkeit startete das jedes Mal den Timer neu, und die Statusmeldung nach dem
 * Speichern löste den nächsten Render und damit das nächste Speichern aus (Endlosschleife).
 */
export function AutoSaveManager<T>({
  state,
  enabled = true,
  debounceMs = 500,
  onSave,
  onStatusChange,
}: AutoSaveManagerProps<T>) {
  const timeoutRef = React.useRef<number | null>(null);
  const latestStateRef = React.useRef(state);
  const onSaveRef = React.useRef(onSave);
  const onStatusRef = React.useRef(onStatusChange);
  const lastSavedRef = React.useRef<string | null>(null);
  latestStateRef.current = state;
  onSaveRef.current = onSave;
  onStatusRef.current = onStatusChange;

  const serialized = JSON.stringify(state);

  React.useEffect(() => {
    if (!enabled) return undefined;
    // Erster Stand nach dem Laden (oder unverändert): nichts zu speichern
    if (lastSavedRef.current === null) {
      lastSavedRef.current = serialized;
      return undefined;
    }
    if (serialized === lastSavedRef.current) return undefined;
    timeoutRef.current = window.setTimeout(async () => {
      try {
        onStatusRef.current?.("saving");
        await onSaveRef.current(latestStateRef.current);
        lastSavedRef.current = serialized;
        onStatusRef.current?.("saved");
      } catch {
        onStatusRef.current?.("error");
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [debounceMs, enabled, serialized]);

  return null;
}
