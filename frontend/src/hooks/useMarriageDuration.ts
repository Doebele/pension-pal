import React from "react";
import type { MaritalStatusValue } from "../types/personalDataTypes";

const MIN_YEAR = 1900;

function toInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

export function useMarriageDuration(
  maritalStatus: MaritalStatusValue | "",
  marriageYearRaw: string,
  divorceYearRaw: string,
) {
  const currentYear = new Date().getFullYear();
  const maxAdultYear = currentYear - 18;
  const marriageYear = toInt(marriageYearRaw);
  const divorceYear = toInt(divorceYearRaw);

  const shouldShowMarriageFields =
    maritalStatus === "married"
    || maritalStatus === "divorced"
    || maritalStatus === "widowed"
    || maritalStatus === "concubinage";
  const shouldShowDivorceYear = maritalStatus === "divorced";

  const years = React.useMemo(() => {
    if (!marriageYear || marriageYear < MIN_YEAR) return 0;
    if (divorceYear && divorceYear > marriageYear) return divorceYear - marriageYear;
    return Math.max(0, currentYear - marriageYear);
  }, [currentYear, divorceYear, marriageYear]);

  const errors = React.useMemo(() => {
    const next: {
      marriageYear?: string;
      divorceYear?: string;
    } = {};
    if (shouldShowMarriageFields && marriageYearRaw.trim()) {
      if (!marriageYear || marriageYear < MIN_YEAR || marriageYear > maxAdultYear) {
        next.marriageYear = `Heiratsjahr muss zwischen ${MIN_YEAR} und ${maxAdultYear} liegen.`;
      }
    }
    if (shouldShowDivorceYear && !divorceYearRaw.trim()) {
      next.divorceYear = "Bitte Scheidungsjahr angeben für Geschieden.";
    } else if (shouldShowDivorceYear && divorceYearRaw.trim()) {
      if (!divorceYear || divorceYear < MIN_YEAR || divorceYear > maxAdultYear) {
        next.divorceYear = `Scheidungsjahr muss zwischen ${MIN_YEAR} und ${maxAdultYear} liegen.`;
      } else if (marriageYear && divorceYear < marriageYear + 1) {
        next.divorceYear = "Scheidungsjahr muss nach Heiratsjahr liegen.";
      }
    }
    return next;
  }, [
    divorceYear,
    divorceYearRaw,
    marriageYear,
    marriageYearRaw,
    maxAdultYear,
    shouldShowDivorceYear,
    shouldShowMarriageFields,
  ]);

  return {
    shouldShowMarriageFields,
    shouldShowDivorceYear,
    years,
    errors,
    maxAdultYear,
  };
}
