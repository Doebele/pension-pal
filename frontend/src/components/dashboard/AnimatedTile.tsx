import React from "react";
import { motion } from "framer-motion";

type AnimatedTileProps = {
  children: React.ReactNode;
  tileId: string;
  className?: string;
  zIndex?: number;
};

export const AnimatedTile: React.FC<AnimatedTileProps> = ({
  children,
  tileId,
  className,
  zIndex = 1,
}) => {
  return (
    <motion.div
      layout
      layoutId={`tile-${tileId}`}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      style={{ transitionDuration: "600ms", zIndex, position: "relative" }}
      className={`transform-gpu will-change-transform ${className || ""}`}
    >
      {children}
    </motion.div>
  );
};
