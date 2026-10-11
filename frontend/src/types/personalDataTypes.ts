export type MaritalStatusValue = "single" | "married" | "divorced" | "widowed" | "concubinage";
export type LivingSituation = "rent" | "own" | "";
export type ProfileGender = "male" | "female" | "other" | "";

export type AdditionalProperty = {
  id: string;
  label: string;
  isRentalUnit: boolean;
  monthlyRentalIncomeChf: string;
  estimatedMarketValueChf: string;
  mortgageAmountChf: string;
};

export type PersonalDataFormState = {
  birthDate: string;
  gender: ProfileGender;
  maritalStatus: MaritalStatusValue | "";
  marriageYear: string;
  divorceYear: string;
  taxDomicileCanton: string;
  livingSituation: LivingSituation;
};
