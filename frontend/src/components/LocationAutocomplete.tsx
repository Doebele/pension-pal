import React, { useEffect, useMemo, useRef, useState } from "react";
import { SwissLocation, searchSwissLocations } from "./locationSearch";

type LocationAutocompleteProps = {
  value: string;
  onInputChange: (value: string) => void;
  onSelect: (location: SwissLocation) => void;
  placeholder?: string;
};

export const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  value,
  onInputChange,
  onSelect,
  placeholder = "Gemeinde suchen (z.B. Zürich, Bern, 8001)",
}) => {
  const [debouncedQuery, setDebouncedQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(value);
      setIsOpen(value.trim().length > 0);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [value]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const results = useMemo(() => searchSwissLocations(debouncedQuery), [debouncedQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery]);

  const commitSelection = (location: SwissLocation) => {
    onInputChange(location.municipality);
    onSelect(location);
    setIsOpen(false);
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (!isOpen && event.key === "ArrowDown" && results.length > 0) {
      setIsOpen(true);
      return;
    }
    if (!isOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = results[activeIndex];
      if (selected) {
        commitSelection(selected);
      }
      return;
    }
    if (event.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        value={value}
        onChange={(event) => {
          onInputChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (value.trim()) setIsOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
        placeholder={placeholder}
        aria-label="Gemeinde suchen"
        aria-expanded={isOpen}
        aria-controls="location-autocomplete-list"
      />

      {isOpen && results.length > 0 && (
        <ul
          id="location-autocomplete-list"
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-md border border-gray-700 bg-gray-800 shadow-xl"
        >
          {results.map((result, index) => (
            <li key={`${result.canton}-${result.id}`}>
              <button
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                className={`flex w-full items-center justify-between px-2 py-1 text-left text-sm ${
                  activeIndex === index
                    ? "bg-emerald-500/20 text-slate-50"
                    : "text-gray-200 hover:bg-gray-700"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitSelection(result)}
              >
                <span>{result.municipality}</span>
                <span className="text-2xs text-gray-400">
                  {result.canton}-{result.id} {result.zip}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
