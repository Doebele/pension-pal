import React from "react";
import { useTranslation } from "react-i18next";
import { appIcons } from "../icons/iconMap";
import { useNavigationLock } from "../../context/NavigationLockContext";
import { ChoreographedGrid } from "./ChoreographedGrid";
import { KnowledgeEntryLink } from "../common/KnowledgeEntryLink";

export type CardId =
  | "personal"
  | "ahv"
  | "bvg"
  | "pillar3"
  | "lifeInsurance"
  | "severance"
  | "assets";
export type CardStatus = "ok" | "missing";
export interface OverviewItem {
  label: string;
  value: string | number;
}
export interface OverviewCardData {
  title: string;
  items: OverviewItem[];
}
export interface OverviewState {
  cards: OverviewCardData[];
}

const CARD_ICON: Record<CardId, React.ReactNode> = {
  personal: appIcons.personal,
  ahv: appIcons.ahv,
  bvg: appIcons.pension,
  pillar3: appIcons.privat,
  lifeInsurance: appIcons.lifeInsurance,
  severance: appIcons.severance,
  assets: appIcons.investments,
};

type DashboardCardProps = {
  id: CardId;
  title: string;
  children: React.ReactNode;
  active: boolean;
  dimmed?: boolean;
  forceComplete?: boolean;
  status: CardStatus;
  completionPercent: number;
  completionFilled: number;
  completionTotal: number;
  onActivate: () => void;
};

const DashboardCard: React.FC<DashboardCardProps> = ({
  id,
  title,
  children,
  active,
  dimmed = false,
  forceComplete = false,
  status,
  completionPercent,
  completionFilled,
  completionTotal,
  onActivate,
}) => {
  const completionColor = "text-slate-300";
  const effectiveCompletionPercent = forceComplete ? 100 : completionPercent;

  return (
    <div
      className={`relative cursor-pointer rounded-xl border border-slate-700 bg-surface p-section pt-6 shadow-sm transition-all duration-300 ease-out ${
        active
          ? "detail-view-card"
          : "summary-tile-card hover:border-slate-600"
      } ${dimmed ? "dimmed" : ""}`}
      onClick={onActivate}
    >
      <div className="absolute inset-x-0 top-0 h-1 overflow-hidden rounded-t-xl bg-slate-700/80">
        <div
          className={`h-full rounded-t-xl transition-all duration-500 ease-out ${
            forceComplete ? "full-progress-green" : "bg-slate-200/80"
          }`}
          style={{ width: `${effectiveCompletionPercent}%` }}
        />
      </div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-50">
          <span className="text-slate-300">{CARD_ICON[id]}</span>
          {title}
        </h3>
        <div className="text-right">
          <span
            className={`block text-xs font-medium ${completionColor}`}
          >
            {effectiveCompletionPercent}%
          </span>
        </div>
      </div>
      <div className="text-sm text-slate-300">{children}</div>
      {active ? <KnowledgeEntryLink cardId={id} className="mt-3 border-t border-slate-700 pt-2" /> : null}
    </div>
  );
};

type CardRenderer = (isActive: boolean) => React.ReactNode;

type CardLayoutProps = {
  personalCard: CardRenderer;
  ahvCard: CardRenderer;
  bvgCard: CardRenderer;
  pillar3Card: CardRenderer;
  lifeInsuranceCard: CardRenderer;
  severanceCard: CardRenderer;
  assetsCard: CardRenderer;
  statusByCard: Record<CardId, CardStatus>;
  completionByCard: Record<
    CardId,
    { percent: number; filled: number; total: number }
  >;
  activeCard?: CardId;
  onActiveChange?: (prev: CardId, next: CardId) => void;
  mainFooter?: React.ReactNode;
};

export const CardLayout: React.FC<CardLayoutProps> = ({
  personalCard,
  ahvCard,
  bvgCard,
  pillar3Card,
  lifeInsuranceCard,
  severanceCard,
  assetsCard,
  statusByCard,
  completionByCard,
  activeCard: externalActiveCard,
  onActiveChange,
  mainFooter,
}) => {
  const { isLocked, lockFor } = useNavigationLock();
  const { t } = useTranslation();

  const cards: { id: CardId; title: string; render: CardRenderer }[] = [
    { id: "personal", title: t("cards.personal"), render: personalCard },
    { id: "ahv", title: t("cards.ahv"), render: ahvCard },
    { id: "bvg", title: t("cards.bvg"), render: bvgCard },
    { id: "pillar3", title: t("cards.pillar3"), render: pillar3Card },
    {
      id: "lifeInsurance",
      title: t("cards.lifeInsurance"),
      render: lifeInsuranceCard,
    },
    { id: "severance", title: t("cards.severance"), render: severanceCard },
    { id: "assets", title: t("cards.assets"), render: assetsCard },
  ];

  const active =
    externalActiveCard && cards.some((card) => card.id === externalActiveCard)
      ? externalActiveCard
      : "personal";
  const activeCard = cards.find((c) => c.id === active)!;
  const sideCards = cards.map((card) => ({
    ...card,
    isCurrent: card.id === active,
  }));

  const handleActivate = (next: CardId) => {
    if (next === active || isLocked) return;
    const previous = active;
    void lockFor(220);
    if (onActiveChange) {
      onActiveChange(previous, next);
    }
  };

  return (
    <ChoreographedGrid
      isAnimating={isLocked}
      mainCard={activeCard}
      sideCards={sideCards}
      mainFooter={mainFooter}
      onActivate={handleActivate}
      renderCard={(card, isActive, onActivate) => (
        <DashboardCard
          id={card.id}
          title={card.title}
          active={isActive}
          dimmed={
            !isActive && Boolean((card as { isCurrent?: boolean }).isCurrent)
          }
          forceComplete={
            !isActive && Boolean((card as { isCurrent?: boolean }).isCurrent)
          }
          status={statusByCard[card.id]}
          completionPercent={completionByCard[card.id].percent}
          completionFilled={completionByCard[card.id].filled}
          completionTotal={completionByCard[card.id].total}
          onActivate={onActivate}
        >
          <div className="mt-2">{card.render(isActive)}</div>
        </DashboardCard>
      )}
    />
  );
};
