import React from "react";

type NavTransitionOverlayProps = {
  active: boolean;
};

export const NavTransitionOverlay: React.FC<NavTransitionOverlayProps> = ({ active }) => {
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-40 bg-slate-900/35" />
  );
};
