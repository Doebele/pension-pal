export type PdfFieldGroup = "bvg" | "life_insurance" | "generic";
export type PdfFieldPriority = "essential" | "secondary";

export type PdfFieldSchema = {
  id: string;
  label: string;
  value: string;
  confidenceScore: number;
  group: PdfFieldGroup;
  priority: PdfFieldPriority;
  status: "ok" | "to_review";
  sourcePattern?: string;
};

// Optional field catalogs used by OCR/parser layers.
export type BvgPdfFieldId =
  | "currentOldageCapital"
  | "conversionRate"
  | "entryAge"
  | "ahvNumber"
  | "contributionAge"
  | "insurancePeriod"
  | "pensionerCapital"
  | "deathBenefit";

export type LifeInsurancePdfFieldId =
  | "capitalSumChf"
  | "annualPensionChf"
  | "entryAge"
  | "contractNumber"
  | "interestCredit"
  | "runtimeYears"
  | "surrenderValue"
  | "deathRiskCost"
  | "bonusClaims";
