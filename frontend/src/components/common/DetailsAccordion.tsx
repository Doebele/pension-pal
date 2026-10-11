import React from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";

type DetailsAccordionProps = {
  title?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

export const DetailsAccordion: React.FC<DetailsAccordionProps> = ({
  title,
  isOpen,
  onToggle,
  children,
}) => {
  const { t } = useTranslation();
  const effectiveTitle = title ?? t("bvg.moreDetails");
  return (
    <div className="rounded-lg border border-slate-700 bg-gray-800/60">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/50"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span>{isOpen ? t("commonUi.hideDetails") : effectiveTitle}</span>
        <span className="text-slate-400">{isOpen ? "−" : "+"}</span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-700 p-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
