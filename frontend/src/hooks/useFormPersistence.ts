import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

type SnapshotForm = {
  snapshot: string;
};

function toSnapshot(value: unknown): string {
  return JSON.stringify(value ?? {});
}

export function useFormPersistence(
  value: unknown,
  onSave: () => void | Promise<void>,
) {
  const currentSnapshot = useMemo(() => toSnapshot(value), [value]);
  const [baseline, setBaseline] = useState(currentSnapshot);
  const [isSaving, setIsSaving] = useState(false);
  const [savedState, setSavedState] = useState<"idle" | "saved">("idle");
  const [hasUserTouched, setHasUserTouched] = useState(false);

  const form = useForm<SnapshotForm>({
    defaultValues: { snapshot: currentSnapshot },
  });

  useEffect(() => {
    if (!hasUserTouched && !isSaving) {
      // External hydration (profile load/reset) should not mark the form dirty.
      setBaseline(currentSnapshot);
      form.reset({ snapshot: currentSnapshot });
      setSavedState("idle");
      return;
    }
    const shouldDirty = currentSnapshot !== baseline;
    form.setValue("snapshot", currentSnapshot, { shouldDirty });
    if (shouldDirty) {
      setSavedState("idle");
    }
  }, [baseline, currentSnapshot, form, hasUserTouched, isSaving]);

  const handleSave = async () => {
    if (!form.formState.isDirty || isSaving) {
      console.debug(
        "[useFormPersistence] Save skipped - isDirty:",
        form.formState.isDirty,
        "isSaving:",
        isSaving,
      );
      return;
    }

    setIsSaving(true);
    try {
      console.log(
        "[useFormPersistence] Starting save with snapshot:",
        currentSnapshot,
      );

      await onSave();

      // Nach dem Speichern: State neu evaluieren mit aktuellem Snapshot
      const nextBaseline = currentSnapshot;
      setBaseline(nextBaseline);
      form.reset({ snapshot: nextBaseline });
      setHasUserTouched(false);
      setSavedState("saved");

      console.log("[useFormPersistence] Save completed successfully");

      window.setTimeout(() => setSavedState("idle"), 1500);
    } catch (error) {
      console.error("[useFormPersistence] Save failed:", error);
      // State bleibt dirty, damit Benutzer erneut versuchen kann zu speichern
      setSavedState("idle");
      // Re-throw für externe Fehlerbehandlung
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const markUserInteraction = () => {
    if (!hasUserTouched) {
      console.debug("[useFormPersistence] User interaction detected");
      setHasUserTouched(true);
    }
  };

  return {
    isDirty: form.formState.isDirty,
    isSaving,
    savedState,
    handleSave,
    markUserInteraction,
  };
}
