export type CsvExportVersion = "1.0";

export type MissingFieldMode = "error" | "skip";

export type ExportCSVData = {
  timestamp: string;
  projectId: string | null;
  exportVersion: CsvExportVersion;
  birthDate: string | null;
  gender: "male" | "female" | "";
  civilStatus: string;
  livingSituation: string;
  taxDomicileCanton: string;
  firstPillarExpectedPension: number | null;
  firstPillarContributionYears: number | null;
  secondPillarGuthaben: number | null;
  secondPillarProvider: string;
  thirdPillar3aAccounts: number | null;
  thirdPillar3aRate: number | null;
  thirdPillar3bPortfolioValue: number | null;
  capitalNeedPercent: number | null;
  totalAssetValue: number | null;
  severanceAmountChf: number | null;
  investmentPortfolioTotalChf: number | null;
  profilePayloadJson: string;
};

export type ParsedCsvImport = {
  row: ExportCSVData;
  warnings: string[];
};
