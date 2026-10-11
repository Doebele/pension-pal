/**
 * Text Quality Standard (Deutsch, UTF-8)
 *
 * Diese Richtlinie gilt für alle neuen/angepassten UI-Texte:
 * - Umlaute und Sonderzeichen immer als echte UTF-8-Zeichen schreiben: ä, ö, ü, Ä, Ö, Ü, ß.
 * - Keine HTML-Entities für Umlaute verwenden (z. B. "a-Umlaut-Entity"), außer technisch zwingend.
 * - Keine manuelle Transliterationen in Labels/Tooltips/Meldungen (z. B. "für", "jährlich"), wenn echte Umlaute möglich sind.
 * - Einheitliche Zeichensetzung und klare, vollständige Sätze für nutzernahe Texte.
 *
 * Prüfen:
 * - Vor Merge `npm run check:text` ausführen.
 * - Bei Abweichungen zuerst die UI-Texte bereinigen, danach den Build prüfen.
 */
export const TEXT_QUALITY_STANDARD_VERSION = "2026-03-09";
