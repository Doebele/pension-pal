import React from "react";
import { useTranslation } from "react-i18next";
import { Refresh } from "iconoir-react";

type DirtySaveButtonProps = {
  isDirty: boolean;
  isSaving: boolean;
  savedState: "idle" | "saved";
  onClick: () => void | Promise<void>;
  label?: string;
};

export const DirtySaveButton: React.FC<DirtySaveButtonProps> = ({
  isDirty,
  isSaving,
  savedState,
  onClick,
  label,
}) => {
  const { t } = useTranslation();
  const effectiveLabel = label ?? t("common.save");
  const disabled = !isDirty || isSaving;

  const handleClick = async () => {
    console.debug("[DirtySaveButton] Save clicked", {
      isDirty,
      isSaving,
      savedState,
    });
    try {
      await onClick();
    } catch (error) {
      console.error("[DirtySaveButton] Save error:", error);
      throw error; // Re-throw the error to propagate it
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? t("common.noChanges") : t("common.saveChanges")}
      className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
        disabled
          ? "cursor-not-allowed bg-slate-700 text-slate-400"
          : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
      }`}
      onClick={async () => {
        try {
          await handleClick();
        } catch (error) {
          console.error("[DirtySaveButton] Unhandled error during click:", error);
          // Additional error handling logic if needed
        }
      }}
    >
      {isSaving && <Refresh className="h-3.5 w-3.5 animate-spin" />}
      {!isSaving && savedState === "saved" ? t("common.saved") : effectiveLabel}
    </button>
  );
};
