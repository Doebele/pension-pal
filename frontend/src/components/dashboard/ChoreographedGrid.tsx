import React from "react";

type CardId =
  | "personal"
  | "ahv"
  | "bvg"
  | "pillar3"
  | "lifeInsurance"
  | "severance"
  | "assets";

type GridCard = {
  id: CardId;
  title: string;
  isCurrent?: boolean;
};

type ChoreographedGridProps<T extends GridCard> = {
  isAnimating: boolean;
  mainCard: T;
  sideCards: T[];
  mainFooter?: React.ReactNode;
  renderCard: (card: T, isActive: boolean, onActivate: () => void) => React.ReactNode;
  onActivate: (id: CardId) => void;
};

// Generic so renderCard gets the caller's card type (CardLayout's cards carry a render function)
export const ChoreographedGrid = <T extends GridCard>({
  isAnimating,
  mainCard,
  sideCards,
  mainFooter,
  renderCard,
  onActivate,
}: ChoreographedGridProps<T>) => {
  return (
    <div
      className={`relative grid min-w-0 items-stretch grid-cols-1 gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] ${isAnimating ? "pointer-events-none" : ""}`}
    >
      {/* Höhe nur ab xl begrenzen: darunter stehen beide Spalten untereinander und wachsen mit dem Inhalt,
          sonst teilen sie sich die Fensterhöhe und die Detailkarte ragt unter die Übersicht */}
      <div className="detail-view-shell flex min-w-0 flex-col xl:min-h-0 gap-3">
        <div key={mainCard.id} className="min-h-[420px] transition-all duration-300 ease-out">
          {renderCard(mainCard, true, () => undefined)}
        </div>
      </div>

      <div className="summary-rail-shell flex min-w-0 flex-col xl:h-full xl:min-h-0">
        <div className="side-scroll pr-1 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          <div className="flex min-h-full flex-col gap-3">
            {sideCards.map((card) => (
              <div
                key={card.id}
                className={`relative transform-gpu will-change-transform transition-all duration-700 ease-in-out ${
                  card.isCurrent ? "dimmed" : "hover:translate-x-1"
                }`}
              >
                {renderCard(card, false, () => (card.isCurrent ? undefined : onActivate(card.id)))}
              </div>
            ))}
          </div>
        </div>
        {mainFooter ? (
          <div className="mt-3 shrink-0 pt-3">
            {mainFooter}
          </div>
        ) : null}
      </div>
    </div>
  );
};
