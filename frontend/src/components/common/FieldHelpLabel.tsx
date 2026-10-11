import React from "react";

type FieldHelpLabelProps = {
  id: string;
  label: string;
  helpText: string;
  className?: string;
};

export const FieldHelpLabel: React.FC<FieldHelpLabelProps> = ({
  id,
  label,
  helpText,
  className = "input-label",
}) => {
  const [open, setOpen] = React.useState(false);
  const tooltipId = `${id}-help-tooltip`;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const tooltipRef = React.useRef<HTMLDivElement | null>(null);
  const [horizontalAlign, setHorizontalAlign] = React.useState<"left" | "right">("left");

  const updateHorizontalAlign = React.useCallback(() => {
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    if (!container || !tooltip) return;
    const containerRect = container.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth || 0;
    const viewportWidth = window.innerWidth || 0;
    const spaceRight = viewportWidth - containerRect.left;
    if (tooltipWidth + 12 > spaceRight) {
      setHorizontalAlign("right");
      return;
    }
    setHorizontalAlign("left");
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updateHorizontalAlign();
    window.addEventListener("resize", updateHorizontalAlign);
    return () => window.removeEventListener("resize", updateHorizontalAlign);
  }, [open, updateHorizontalAlign]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <label
        htmlFor={id}
        className={`${className} cursor-help`}
        tabIndex={0}
        aria-describedby={tooltipId}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
      >
        {label}
      </label>
      {open && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className={`absolute bottom-full z-30 mb-2 max-w-[min(20rem,calc(100vw-1.5rem))] rounded-md border border-slate-600 bg-slate-900/95 p-box-sm text-xs leading-relaxed text-slate-200 shadow-lg ${
            horizontalAlign === "right" ? "right-0" : "left-0"
          }`}
        >
          {helpText}
        </div>
      )}
    </div>
  );
};

