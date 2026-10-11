import { api } from "./api";
import type { ExportCSVData, MissingFieldMode, ParsedCsvImport } from "../types/exportTypes";

export async function parseImportCsvFile(
  file: File,
  missingFieldMode: MissingFieldMode,
): Promise<ParsedCsvImport> {
  const response = (await api.validateProfileCsvImport(file, missingFieldMode)) as {
    row: ExportCSVData;
    warnings?: string[];
  };
  return {
    row: response.row,
    warnings: Array.isArray(response.warnings) ? response.warnings : [],
  };
}

export async function applyImportedCsvData(
  file: File,
  missingFieldMode: MissingFieldMode,
): Promise<string[]> {
  const response = (await api.applyProfileCsvImport(file, missingFieldMode)) as {
    imported_sections?: string[];
  };
  return Array.isArray(response.imported_sections) ? response.imported_sections : [];
}
