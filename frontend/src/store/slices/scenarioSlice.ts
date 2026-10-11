export type ScenarioState = {
  pensionDeposit: number;
  savingsAmount: number;
  payoutDirect: number;
  returnPensionFund: number;
  returnSavingsPortf: number;
  lastUpdateTimestamp: string;
};

type ScenarioAction =
  | { type: "SET_PENSION_DEPOSIT"; payload: number }
  | { type: "SET_SAVINGS_AMOUNT"; payload: number }
  | { type: "SET_PAYOUT_DIRECT"; payload: number }
  | { type: "SET_RETURN_PENSION_FUND"; payload: number }
  | { type: "SET_RETURN_SAVINGS_PORTF"; payload: number }
  | { type: "SET_ALL"; payload: Partial<ScenarioState> };

const round2 = (value: number) => Math.round(value * 100) / 100;

export function scenarioReducer(state: ScenarioState, action: ScenarioAction): ScenarioState {
  const now = new Date().toISOString();
  switch (action.type) {
    case "SET_PENSION_DEPOSIT":
      return { ...state, pensionDeposit: round2(Math.max(0, action.payload)), lastUpdateTimestamp: now };
    case "SET_SAVINGS_AMOUNT":
      return { ...state, savingsAmount: round2(Math.max(0, action.payload)), lastUpdateTimestamp: now };
    case "SET_PAYOUT_DIRECT":
      return { ...state, payoutDirect: round2(Math.max(0, action.payload)), lastUpdateTimestamp: now };
    case "SET_RETURN_PENSION_FUND":
      return { ...state, returnPensionFund: round2(Math.max(0, action.payload)), lastUpdateTimestamp: now };
    case "SET_RETURN_SAVINGS_PORTF":
      return { ...state, returnSavingsPortf: round2(Math.max(0, action.payload)), lastUpdateTimestamp: now };
    case "SET_ALL":
      return { ...state, ...action.payload, lastUpdateTimestamp: now };
    default:
      return state;
  }
}
