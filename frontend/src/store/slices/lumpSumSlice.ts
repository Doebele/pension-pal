import type { LumpSumAllocationModel } from "../../types/financialModels";

type Patch = Partial<Pick<LumpSumAllocationModel, "depositPensionChf" | "mutualFundsChf" | "directPayoutChf">>;

const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function applyLumpSumAllocationPatch(
  current: LumpSumAllocationModel,
  patch: Patch,
): LumpSumAllocationModel {
  const limit = Math.max(0, current.netLumpSumLimitChf);
  const next = {
    ...current,
    ...patch,
  };
  let deposit = clamp(round2(next.depositPensionChf), 0, limit);
  let mutual = clamp(round2(next.mutualFundsChf), 0, limit);
  let direct = clamp(round2(next.directPayoutChf), 0, limit);
  const total = deposit + mutual + direct;
  if (total > limit) {
    const overflow = total - limit;
    direct = Math.max(0, round2(direct - overflow));
  }
  return {
    ...next,
    depositPensionChf: deposit,
    mutualFundsChf: mutual,
    directPayoutChf: direct,
  };
}
