import React from "react";
import { useTranslation } from "react-i18next";

type CardId = "personal" | "ahv" | "bvg" | "pillar3" | "lifeInsurance" | "severance" | "assets";

const KNOWLEDGE_HASH_BY_CARD: Record<CardId, string> = {
  personal: "#wissen/fruehpension-ab-58/detail",
  ahv: "#wissen/fruehpension-ab-58/detail",
  bvg: "#wissen/bvg-umwandlungssatz-verstehen/detail",
  pillar3: "#wissen/saeule-3a-splitting/detail",
  lifeInsurance: "#wissen/compliance-pension-formeln/detail",
  severance: "#wissen/abfindung-steuern-verwendung/detail",
  assets: "#wissen/eigenheimbezug-steuerfolgen/detail",
};

type KnowledgeEntryLinkProps = {
  cardId: CardId;
  className?: string;
};

export const KnowledgeEntryLink: React.FC<KnowledgeEntryLinkProps> = ({ cardId, className }) => {
  const { t } = useTranslation();
  return (
    <div className={className || "mt-3"}>
      <a
        href={KNOWLEDGE_HASH_BY_CARD[cardId]}
        className="text-xs text-blue-300 hover:text-blue-200"
      >
        {t("common.viewKnowledgeEntry")}
      </a>
    </div>
  );
};

