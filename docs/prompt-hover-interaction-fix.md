# Prompt: Korrektur des Hover-Verhaltens für gestapelte Balkendiagramme

## Problemstellung

### Aktuelles (falsches) Verhalten
Wenn der Benutzer mit dem Cursor über einen Farbbereich innerhalb eines gestapelten Balkens hovert, wird der **gesamte Balken** mit der Farbe dieses Bereichs eingefärbt. Dies ist visuell irreführend, da die Proportionen und die Aufteilung des Balkens verloren gehen.

### Gewünschtes Verhalten

#### Visuelle Hervorhebung bei Hover
- [ ] **Farbbeibehaltung**: Die segmentierte Aufteilung des Balkens mit den verschiedenen Farben bleibt bestehen
- [ ] **1-Pixel-weiße Linie**: Ein feiner weißer Rahmen (border) erscheint um den gesamten Balken herum
- [ ] **Weißer Halo/Corona**: Ein subtiler weißer Schatten (box-shadow) umgibt den Balken, um ihn visuell von den anderen Balken abzuheben
- [ ] **Kontrastverstärkung**: Die Kombination aus weißem Rahmen und Schatten hebt den ausgewählten Balken klar hervor

#### Tooltip-Inhalt bei Hover
- [ ] **Farbkodierte Werte**: Alle Werte des Balkens werden in ihren entsprechenden Farben angezeigt
- [ ] **Segmentbeschriftung**: Jeder Bereich zeigt seinen Wert mit der zugehörigen Farbe an
- [ ] **Gesamtbetrag**: Der kumulierte Gesamtwert aller Bereiche wird deutlich sichtbar angezeigt
- [ ] **Klare Struktur**: Die Anzeige ist übersichtlich und farbcodiert

## Technische Anforderungen

### CSS/Styling
```css
/* Beispiel für die gewünschte Hover-Implementierung */
.bar-container:hover .bar {
  border: 1px solid white;
  box-shadow: 0 0 8px 2px rgba(255, 255, 255, 0.6);
  z-index: 10;
}
```

### Tooltip-Datenstruktur
```typescript
interface TooltipData {
  segments: Array<{
    label: string;
    value: number;
    color: string;
    percentage?: number;
  }>;
  total: number;
  year?: string;
  age?: number;
}
```

## Akzeptanzkriterien

1. **Hover-Zustand**: Beim Hover über einen Balken bleiben alle Farbsegmente sichtbar
2. **Visuelle Abgrenzung**: Weißer Rahmen (1px) und Halo-Effekt sind klar erkennbar
3. **Tooltip-Anzeige**: Alle Segmentwerte werden farbkodiert angezeigt + Gesamtsumme
4. **Performance**: Kein Lag oder Flackern bei schnellem Hover-Wechsel
5. **Responsiv**: Verhalten funktioniert auf allen Bildschirmgrößen
6. **Barrierefreiheit**: Kontrastverhältnisse bleiben WCAG-konform

## Betroffene Dateien (vermutet)
- `frontend/src/components/charts/StackedBarChart.tsx`
- `frontend/src/styles/charts.css`
- `frontend/src/utils/chartHelpers.ts`

## Priorität
Hoher - Dies ist ein visuelles UX-Problem, das die Dateninterpretation beeinträchtigt.

## Screenshots
*Screenshot des aktuellen falschen Verhaltens liegt bei (siehe Upload)*
