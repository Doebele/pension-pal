import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { WarningCircle, CheckCircle, Upload } from "iconoir-react";

type FileDropZoneProps = {
  label?: string;
  onFileSelected?: (file: File) => void | Promise<void>;
  onFileError?: (message: string) => void;
};

export const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  label,
  onFileSelected,
  onFileError,
}) => {
  const { t } = useTranslation();
  const effectiveLabel = label ?? t("upload.defaultLabel");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [validationError, setValidationError] = useState<string>("");
  const [isValidFile, setIsValidFile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const fileNameLower = file.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => fileNameLower.endsWith(ext));
    if (!hasValidExtension) {
      return t("upload.onlyPdfJpgPng");
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return t("upload.tooLarge", { max: MAX_FILE_SIZE_MB });
    }
    return null;
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    const error = validateFile(file);
    if (error) {
      setValidationError(error);
      setIsValidFile(false);
      if (onFileError) {
        onFileError(error);
      }
      return;
    }
    setValidationError("");
    setIsValidFile(true);
    if (!onFileSelected) return;
    setIsUploading(true);
    try {
      await onFileSelected(file);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mt-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        onChange={(event) => {
          const file = event.target.files?.[0];
          void handleFile(file);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsDragging(false);
          const file = event.dataTransfer.files?.[0];
          void handleFile(file);
        }}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
          validationError
            ? "border-red-500 bg-gray-900 text-red-200"
            : isValidFile
            ? "border-green-500 bg-gray-900 text-green-200"
            : isDragging
            ? "border-green-500 bg-gray-800 text-green-200"
            : "border-slate-700 bg-gray-900 text-slate-300 hover:border-green-500/60 hover:bg-gray-800"
        }`}
        aria-label={t("upload.ariaSuffix", { label: effectiveLabel })}
        title={validationError || t("upload.maxNote", { label: effectiveLabel, max: MAX_FILE_SIZE_MB })}
      >
        {validationError ? (
          <WarningCircle className="h-3.5 w-3.5 text-red-300" />
        ) : isValidFile ? (
          <CheckCircle className="h-3.5 w-3.5 text-green-300" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        <span>{isUploading ? t("upload.uploading") : effectiveLabel}</span>
      </button>
      {validationError && <p className="mt-1 text-2xs text-red-300">{validationError}</p>}
    </div>
  );
};
