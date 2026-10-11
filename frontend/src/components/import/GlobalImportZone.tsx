import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UploadSquare, Upload } from "iconoir-react";
import { MAX_FILE_SIZE_MB } from "../common/FileDropZone";

type GlobalImportZoneProps = {
  pendingCount: number;
  statusLabel?: string;
  onFilesQueued: (files: File[]) => void;
  onError: (message: string) => void;
  className?: string;
};

const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const GlobalImportZone: React.FC<GlobalImportZoneProps> = ({
  pendingCount,
  statusLabel,
  onFilesQueued,
  onError,
  className,
}) => {
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const effectiveStatus = statusLabel || (pendingCount > 0 ? t("upload.filesReady", { count: pendingCount }) : "");

  const validateFiles = (files: File[]) => {
    const valid: File[] = [];
    for (const file of files) {
      const lower = file.name.toLowerCase();
      const isSupported =
        lower.endsWith(".pdf") ||
        lower.endsWith(".csv") ||
        lower.endsWith(".png") ||
        lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg");
      if (!isSupported) {
        onError(t("upload.globalOnlySupported"));
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        onError(t("upload.globalTooLarge", { max: MAX_FILE_SIZE_MB }));
        continue;
      }
      valid.push(file);
    }
    if (valid.length > 0) onFilesQueued(valid);
  };

  return (
    <div
      className={`upload-zone-main z-10 rounded-lg border bg-gray-900/95 px-4 py-2 backdrop-blur ${
        dragOver ? "border-green-500" : "border-gray-800"
      } ${className || ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const files = Array.from(event.dataTransfer.files || []);
        validateFiles(files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.csv,.png,.jpg,.jpeg,application/pdf,text/csv,image/png,image/jpeg"
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          validateFiles(files);
          event.currentTarget.value = "";
        }}
      />
      <div className="upload-zone-content">
        <div className="flex items-center gap-2 text-slate-200">
          <UploadSquare className={`h-4 w-4 ${dragOver ? "text-green-400" : "text-slate-400"}`} />
          {effectiveStatus ? <span>{effectiveStatus}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-600 px-3 py-1 text-slate-200 hover:bg-slate-800"
            onClick={() => inputRef.current?.click()}
          >
            {t("upload.manualUpload")}
          </button>
          <span className="hidden items-center gap-1 text-slate-400 sm:inline-flex">
            <Upload className="h-3.5 w-3.5" />
            {t("upload.dropHere")}
          </span>
        </div>
      </div>
    </div>
  );
};
