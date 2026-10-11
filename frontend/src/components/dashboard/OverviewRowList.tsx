import React from "react";

export interface OverviewRowItem {
  label: string;
  value: React.ReactNode;
}

type OverviewRowListProps = {
  rows: OverviewRowItem[];
  className?: string;
  rowClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
};

export const OverviewRowList: React.FC<OverviewRowListProps> = ({
  rows,
  className = "text-xs text-slate-300",
  rowClassName = "flex items-center justify-between gap-3 py-1",
  labelClassName = "font-medium",
  valueClassName = "text-slate-100 text-right",
}) => {
  return (
    <div className={className}>
      {rows.map((row, index) => (
        <div
          key={row.label}
          className={`${rowClassName} ${index < rows.length - 1 ? "border-b border-slate-700/40" : ""}`}
        >
          <span className={labelClassName}>{row.label}</span>
          <span className={valueClassName}>{row.value}</span>
        </div>
      ))}
    </div>
  );
};
