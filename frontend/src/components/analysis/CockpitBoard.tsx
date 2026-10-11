import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Drag, NavArrowDown, NavArrowRight, Refresh } from "iconoir-react";

export type CockpitCard = { id: string; title: string; content: React.ReactNode };

type Layout = { order: string[]; collapsed: string[] };
const STORAGE_KEY = "pensionpal-cockpit-layout-v1";

const readLayout = (): Layout => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { order: Array.isArray(raw.order) ? raw.order : [], collapsed: Array.isArray(raw.collapsed) ? raw.collapsed : [] };
  } catch {
    return { order: [], collapsed: [] };
  }
};
const writeLayout = (layout: Layout) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch { /* nur Komfort */ }
};

/** Gespeicherte Reihenfolge anwenden; neue Karten (nicht gespeichert) an ihrer Standardposition einfügen */
function ordered(cards: CockpitCard[], order: string[]): CockpitCard[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const known = order.filter((id) => byId.has(id));
  cards.forEach((c, i) => { if (!known.includes(c.id)) known.splice(Math.min(i, known.length), 0, c.id); });
  return known.map((id) => byId.get(id)!);
}

function SortableCard({ card, collapsed, onToggle }: { card: CockpitCard; collapsed: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`cockpit-card${isDragging ? " cockpit-card--dragging" : ""}`}
    >
      <div className="cockpit-card-head">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="cockpit-card-handle"
          aria-label={t("cockpit.dragCard", { title: card.title })}
          title={t("cockpit.dragHint")}
          {...attributes}
          {...listeners}
        >
          <Drag className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="cockpit-card-toggle" aria-expanded={!collapsed} onClick={onToggle}>
          {collapsed ? <NavArrowRight className="h-3.5 w-3.5" /> : <NavArrowDown className="h-3.5 w-3.5" />}
          <span>{card.title}</span>
        </button>
      </div>
      {!collapsed && <div className="cockpit-card-body">{card.content}</div>}
    </section>
  );
}

/** Karten im Cockpit: einzeln ein-/ausklappbar und per Griff (Maus, Touch oder Tastatur) sortierbar */
export function CockpitBoard({ cards }: { cards: CockpitCard[] }) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<Layout>(readLayout);
  const update = (next: Layout) => { setLayout(next); writeLayout(next); };
  const list = ordered(cards, layout.order);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = list.map((c) => c.id);
    update({ ...layout, order: arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))) });
  };
  const toggle = (id: string) =>
    update({ ...layout, collapsed: layout.collapsed.includes(id) ? layout.collapsed.filter((x) => x !== id) : [...layout.collapsed, id] });
  const allCollapsed = list.every((c) => layout.collapsed.includes(c.id));

  return (
    <div className="flex flex-col gap-3">
      <div className="cockpit-toolbar flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="seg-btn" onClick={() => update({ ...layout, collapsed: allCollapsed ? [] : list.map((c) => c.id) })}>
          {allCollapsed ? t("cockpit.expandAll") : t("cockpit.collapseAll")}
        </button>
        <button type="button" className="seg-btn inline-flex items-center gap-1" onClick={() => update({ order: [], collapsed: [] })}>
          <Refresh className="h-3 w-3" /> {t("cockpit.resetLayout")}
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={list.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {list.map((card) => (
            <SortableCard key={card.id} card={card} collapsed={layout.collapsed.includes(card.id)} onToggle={() => toggle(card.id)} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
