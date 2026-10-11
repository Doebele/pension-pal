import React from "react";
import { ArrowLeft, OpenBook, CheckCircle, Home, Bank, PiggyBank, Coins } from "iconoir-react";

type Topic = "AHV" | "BVG" | "Saeule3a" | "Bezug" | "Wohneigentum" | "PolitikReformen" | "Compliance";

type KnowledgeItem = {
  id: string;
  slug: string;
  title: string;
  topic: Topic;
  summary: string;
  tips: string[];
  detailIntro: string;
  detailParagraphs: string[];
  lastReviewedAt: string;
  sources: Array<{ label: string; url: string }>;
  formulaInfoBox?: {
    title: string;
    steps: string[];
    formula: string;
    note?: string;
    example?: {
      title: string;
      lines: string[];
      result: string;
    };
    comparisonExample?: {
      title: string;
      lines: string[];
      result: string;
    };
  };
};

const estimateReadingTimeMinutes = (text: string): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
};

const formatSwissDate = (isoDate: string): string => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

const ITEMS: KnowledgeItem[] = [
  {
    id: "severance-tax-usage",
    slug: "abfindung-steuern-verwendung",
    title: "Abfindung: Steuern, Vorsorge-Einkauf und Investitionsvergleich",
    topic: "Compliance",
    summary:
      "Abfindungen beeinflussen Steuerprogression und Vorsorgeplanung. Entscheidend ist der Vergleich zwischen Sofortbezug, BVG-Einkauf und Anlageoptionen.",
    detailIntro:
      "Wer eine Abfindung erhält, sollte nicht nur den Auszahlungsbetrag betrachten. Relevant sind Steuerfolgen, die geplante Mittelverwendung und der Zeithorizont bis zur Pensionierung.",
    tips: [
      "Brutto und Netto immer getrennt prüfen (Steuerabzug sichtbar machen).",
      "BVG-Einkäufe nur im Rahmen der persönlichen Limiten planen.",
      "ETF-Renditeannahmen mit Gebühren und Risikoabschlag vergleichen.",
      "Defensivere 58+ Produkte gegen höhere, volatilere Marktoptionen abwägen.",
    ],
    detailParagraphs: [
      "Eine Abfindung kann die steuerbare Einkommensbasis erhöhen und dadurch progressive Effekte auslösen. Darum ist die Kantonsperspektive wichtig: Schon kleine Tarifunterschiede können den Nettoauszahlungsbetrag spürbar verändern.",
      "Bei der Verwendung in der zweiten Säule steht meist die steuerliche Entlastung im Vordergrund. Gleichzeitig gelten Limiten und Reglementsfragen der BVG Pensionskasse. Eine gute Planung dokumentiert deshalb, welcher Teil effektiv einkaufbar ist.",
      "ETF-Sparpläne bieten langfristig höhere Renditechancen, aber mit Kursschwankungen. Für eine faire Vergleichsrechnung müssen Kosten, Risikoprofil und Laufzeit in denselben Rahmen gesetzt werden.",
      "Produkte im Segment 58+ werden oft defensiver positioniert und auf Stabilität ausgerichtet. Sie können eine Brückenlösung sein, wenn Kapitalerhalt wichtiger ist als maximale Rendite. Die Auswahl sollte immer mit Risiko- und Liquiditätsbedarf abgestimmt werden.",
    ],
    lastReviewedAt: "2026-03-14",
    sources: [
      { label: "UBS 58+ Produkte", url: "https://www.ubs.com/ch/de/private/pension/58-plus.html" },
      { label: "Steuerrechner (Swissquote)", url: "https://www.swissquote.com/steuern-rechner" },
      { label: "AHV/IV Gesetzesgrundlagen (Fedlex)", url: "https://www.fedlex.admin.ch/eli/cc/63/837_843_843/de" },
    ],
  },
  {
    id: "ahv-early-retirement-58",
    slug: "fruehpension-ab-58",
    title: "Frühpensionierung: Pensionskasse ab 58, AHV ab 63, Überbrückung",
    topic: "AHV",
    summary:
      "Wer früher aufhört, bekommt aus Pensionskasse und AHV dauerhaft weniger – und muss die Jahre bis zum AHV-Bezug selbst finanzieren.",
    detailIntro:
      "Eine Frühpensionierung betrifft jede Säule anders: Die Pensionskasse erlaubt den Altersrücktritt je nach Reglement ab 58, die AHV-Rente lässt sich seit der Reform AHV 21 frühestens ab 63 vorbeziehen. Dazwischen entsteht eine Lücke, die aus Kapital überbrückt werden muss.",
    tips: [
      "AHV-Vorbezug frühestens ab 63 (Frauen Jahrgang 1961–1969 ab 62), Kürzung 6,8 % pro Jahr – lebenslang.",
      "Pensionskasse: Altersrücktritt je nach Reglement ab 58, tieferer Umwandlungssatz und fehlende Altersgutschriften.",
      "Bis zum Referenzalter AHV-Beiträge als Nichterwerbstätige/r einplanen.",
      "In Pension-Pal: Analyse → Bezugsplanung → Vergleich Pensionierung mit 60–66.",
    ],
    detailParagraphs: [
      "AHV: Seit AHV 21 (in Kraft seit 1. Januar 2024) liegt das Referenzalter für Männer und Frauen bei 65 Jahren; für Frauen der Jahrgänge 1961–1963 steigt es schrittweise an. Die Altersrente kann frühestens ab dem Monat nach dem 63. Geburtstag vorbezogen werden, ganz oder anteilig (mindestens 20 %). Die Kürzung beträgt 6,8 % pro Vorbezugsjahr (monatsgenau, maximal 13,6 % bei zwei Jahren) und gilt lebenslang. Für Frauen der Übergangsgeneration gelten tiefere Kürzungssätze. Ein Aufschub um ein bis fünf Jahre erhöht die Rente dagegen dauerhaft.",
      "Pensionskasse: Das BVG erlaubt den Altersrücktritt frühestens mit 58, wenn das Reglement der Kasse das vorsieht. Die Rente fällt aus zwei Gründen tiefer aus: Es fehlen die Altersgutschriften und Zinsen der letzten Jahre, und die Kasse wendet einen tieferen Umwandlungssatz an, weil sie die Rente länger zahlt. Wie stark der Satz sinkt, steht im Reglement; Pension-Pal rechnet mit rund 5 % weniger Umwandlungssatz pro Jahr (z. B. 6,0 % mit 65 → 4,5 % mit 60).",
      "Überbrückung: Zwischen Erwerbsende und AHV-Beginn fehlt das Einkommen. Übliche Quellen sind ein Kapitalbezug aus der Pensionskasse, gestaffelte 3a-Bezüge (frühestens fünf Jahre vor dem Referenzalter, also ab 60), 3b-Kapital und freies Vermögen. Manche Kassen bieten eine Überbrückungsrente, die man mit einer tieferen Altersrente selbst bezahlt.",
      "Oft übersehen: Wer nicht mehr erwerbstätig ist, bleibt bis zum Referenzalter AHV-beitragspflichtig. Die Beiträge als Nichterwerbstätige/r richten sich nach Vermögen und Renteneinkommen und können mehrere tausend Franken pro Jahr ausmachen. Dazu kommen die längere Bezugsdauer und das Risiko, dass das Vermögen bei tiefen Renditen schneller aufgebraucht ist.",
      "Pension-Pal zeigt diese Effekte in der Analyse unter «Bezugsplanung»: Die Vergleichstabelle rechnet dieselben Einstellungen für eine Pensionierung mit 60 bis 66 durch – mit AHV-Beginn, Einkommen bis zur AHV, sicher verfügbarem Monatsbetrag und Abstand zum Median der Pensionierten.",
    ],
    lastReviewedAt: "2026-09-28",
    formulaInfoBox: {
      title: "So rechnet die Vergleichstabelle (vereinfacht)",
      steps: [
        "AHV-Beginn = max(Pensionierungsalter, Referenzalter − 2).",
        "AHV-Faktor = 1 − 6,8 % × Vorbezugsjahre (bzw. + 5,2 % pro Aufschubjahr).",
        "PK-Kapital = Kapital mit 65 − Jahre früher × (Altersgutschrift + Zins pro Jahr).",
        "Umwandlungssatz = Satz mit 65 × (1 − 5 % × Jahre früher).",
        "3a-Bezüge verschieben sich um dieselbe Anzahl Jahre.",
      ],
      formula: "Monatlich verfügbar = (Renten × (1 − Steuersatz) + sichere Entnahme aus dem Kapital) / 12",
      note: "Die Faktoren der Pensionskasse sind Annahmen; massgebend ist das Reglement Ihrer Kasse.",
      example: {
        title: "Beispiel: Pensionierung mit 60 statt 65",
        lines: [
          "AHV 28'000 CHF p.a. ungekürzt → Bezug ab 63 mit Faktor 1 − 2 × 6,8 % = 0,864 → 24'192 CHF.",
          "PK-Kapital 500'000 CHF mit 65, Altersgutschrift + Zins 18'000 CHF p.a. → 500'000 − 5 × 18'000 = 410'000 CHF.",
          "Umwandlungssatz 6,0 % × (1 − 5 × 5 %) = 4,5 % → Rente 18'450 CHF p.a. statt 30'000 CHF.",
          "Von 60 bis 63 fehlt die AHV ganz – diese drei Jahre trägt das Kapital.",
        ],
        result: "Renten ab 63: 42'642 CHF statt 58'000 CHF p.a. (−26 %), lebenslang.",
      },
    },
    sources: [
      { label: "AHV/IV Merkblatt 3.04 – Flexibler Rentenbezug", url: "https://www.ahv-iv.ch/p/3.04.d" },
      { label: "AHV/IV Merkblatt 2.03 – Beiträge der Nichterwerbstätigen", url: "https://www.ahv-iv.ch/p/2.03.d" },
      { label: "Fedlex – AHVG", url: "https://www.fedlex.admin.ch/eli/cc/63/837_843_843/de" },
      { label: "Fedlex – BVG", url: "https://www.fedlex.admin.ch/eli/cc/1983/797_797_797/de" },
      { label: "ch.ch – Pensionierung", url: "https://www.ch.ch/de/pensionierung/" },
    ],
  },
  {
    id: "bvg-capital-or-pension",
    slug: "pensionskasse-kapital-oder-rente",
    title: "Pensionskasse: Kapital, Rente oder beides",
    topic: "Bezug",
    summary:
      "Rente heisst lebenslange Sicherheit, Kapital heisst Flexibilität mit Anlage- und Langlebigkeitsrisiko. Oft ist eine Mischung sinnvoll.",
    detailIntro:
      "Bei der Pensionierung entscheiden Sie, ob Sie das Guthaben der Pensionskasse als lebenslange Rente, als Kapital oder gemischt beziehen. Der Entscheid ist unwiderruflich und hat grosse Folgen für Einkommen, Steuern und Erbe.",
    tips: [
      "Mindestens ein Viertel des obligatorischen Guthabens darf als Kapital bezogen werden, oft mehr gemäss Reglement.",
      "Anmeldefrist im Reglement beachten; Verheiratete brauchen die schriftliche Zustimmung des Ehepartners.",
      "Nach einem Einkauf gilt eine Sperrfrist von drei Jahren für Kapitalbezüge.",
      "Kapitalsteuer mit 3a-Bezügen im selben Jahr zusammenrechnen – Staffeln spart Steuern.",
    ],
    detailParagraphs: [
      "Die Rente ergibt sich aus Alterskapital × Umwandlungssatz. Gesetzlich gilt für den obligatorischen Teil ein Mindestsatz von 6,8 %, umhüllende Kassen wenden auf das ganze Guthaben meist tiefere Sätze an. Die Rente wird lebenslang bezahlt, beim Tod geht in der Regel eine Ehegattenrente von 60 % weiter. Sie ist aber meist nicht an die Teuerung angepasst: Bei 1 % Inflation verliert sie in 20 Jahren rund ein Fünftel ihrer Kaufkraft.",
      "Das Kapital wird beim Bezug einmalig und getrennt vom übrigen Einkommen besteuert, zu einem reduzierten Satz. Die Höhe hängt stark von Kanton, Gemeinde, Zivilstand und Betrag ab, weil der Tarif progressiv ist. Alle Kapitalleistungen aus Vorsorge eines Steuerjahres – Pensionskasse und 3a, bei Ehepaaren beider Partner – werden zusammengezählt. Danach gehört das Geld Ihnen: Es kann angelegt, vererbt oder für Hypothek und Überbrückung eingesetzt werden, unterliegt aber der Vermögenssteuer.",
      "Die Rente wird dagegen jedes Jahr voll als Einkommen besteuert. Welche Variante steuerlich günstiger ist, hängt von der Lebensdauer ab: Je länger Sie leben, desto eher lohnt sich die Rente. Mit Kapital tragen Sie selbst das Risiko, dass das Geld nicht reicht – wegen schwacher Märkte oder weil Sie sehr alt werden.",
      "Eine Mischung verbindet beides: Eine Rente, die zusammen mit der AHV die Fixkosten deckt, und Kapital für Flexibilität und Überbrückung. In Pension-Pal stellen Sie den Kapitalanteil in der Bezugsplanung stufenlos ein. Die App rechnet die Kapitalsteuer mit den offiziellen Werten der ESTV für den Hauptort Ihres Kantons und zeigt, wie viel Einkommen die Anlage des Kapitals liefern kann.",
    ],
    lastReviewedAt: "2026-09-28",
    formulaInfoBox: {
      title: "So rechnet die Bezugsplanung",
      steps: [
        "Rente p.a. = PK-Guthaben × (1 − Kapitalanteil) × Umwandlungssatz, nominal fix.",
        "Kapitalsteuer: alle PK- und 3a-Bezüge eines Alters addieren, Steuer aus der ESTV-Tabelle (26 Kantonshauptorte, 18 Beträge) linear interpolieren.",
        "Netto-Kapital wird in die gewählten Anlagetöpfe investiert.",
        "Aus dem Kapital wird eine real konstante Entnahme bis zum Zielalter berechnet.",
      ],
      formula: "Nettokapital = Σ Kapitalbezüge des Jahres − Kapitalsteuer(Summe, Kanton, Zivilstand)",
      note: "Annahmen der Steuertabelle: Kantonshauptort, ohne Kirchensteuer, keine Kinder, Bezug mit 65. Ihre Gemeinde kann abweichen.",
    },
    sources: [
      { label: "ESTV – Steuerrechner Kapitalauszahlung", url: "https://swisstaxcalculator.estv.admin.ch/" },
      { label: "Fedlex – BVG (Art. 14, 37, 37a, 79b)", url: "https://www.fedlex.admin.ch/eli/cc/1983/797_797_797/de" },
      { label: "Fedlex – DBG (Art. 38 Kapitalleistungen)", url: "https://www.fedlex.admin.ch/eli/cc/1991/1184_1184_1184/de" },
      { label: "BFS – Berufliche Vorsorge 2024: Neurenten und Kapitalbezüge", url: "https://www.bfs.admin.ch/bfs/de/home/aktuell/neue-veroeffentlichungen.assetdetail.36180570.html" },
    ],
  },
  {
    id: "pillar-3a-staggered-payout",
    slug: "saeule-3a-gestaffelt-beziehen",
    title: "Säule 3a gestaffelt beziehen",
    topic: "Saeule3a",
    summary:
      "3a-Konten werden je Konto ganz ausbezahlt. Wer mehrere Konten auf verschiedene Jahre verteilt, bricht die Steuerprogression.",
    detailIntro:
      "Das 3a-Guthaben kann frühestens fünf Jahre vor dem AHV-Referenzalter bezogen werden, also ab 60. Weil jedes Konto nur als Ganzes ausbezahlt wird, bestimmt die Anzahl Konten, wie fein Sie die Bezüge über die Jahre verteilen können.",
    tips: [
      "Bezug frühestens ab 60, spätestens mit dem Referenzalter – bei Weiterarbeit bis 70.",
      "Pro Jahr möglichst nur ein Konto beziehen und nicht im selben Jahr wie das PK-Kapital.",
      "Bei Ehepaaren die Bezüge beider Partner zusammen planen.",
      "In Pension-Pal: Bezugsjahre der 3a-Konten in der Bezugsplanung einzeln wählen.",
    ],
    detailParagraphs: [
      "Die Verordnung über die gebundene Selbstvorsorge (BVV 3) erlaubt den Bezug der Altersleistung frühestens fünf Jahre vor dem Referenzalter. Wer über das Referenzalter hinaus erwerbstätig bleibt, kann den Bezug um bis zu fünf Jahre aufschieben. Vorzeitig ist ein Bezug nur in Sonderfällen möglich, etwa für Wohneigentum, die Aufnahme einer Selbständigkeit oder beim definitiven Wegzug.",
      "Kapitalleistungen aus Vorsorge werden pro Steuerjahr zusammengezählt und progressiv besteuert. Zwei Bezüge von je 100'000 CHF in zwei Jahren kosten deshalb meist deutlich weniger Steuern als 200'000 CHF in einem Jahr. Zählt man noch das Pensionskassenkapital im selben Jahr dazu, steigt die Belastung weiter.",
      "Eine typische Staffelung verteilt drei bis fünf 3a-Konten auf die Jahre 60 bis 65 und bezieht das PK-Kapital in einem eigenen Jahr. Das Geld aus den frühen Bezügen kann die Jahre bis zum AHV-Beginn überbrücken oder angelegt werden.",
      "Die Bezugsplanung in Pension-Pal zeigt für jedes Jahr die Bezüge, die Kapitalsteuer nach den ESTV-Werten Ihres Kantons und die Ersparnis gegenüber einem Bezug aller Konten im selben Jahr. Bei einer Frühpensionierung verschiebt die Vergleichstabelle die 3a-Bezüge automatisch mit.",
    ],
    lastReviewedAt: "2026-09-28",
    sources: [
      { label: "Fedlex – BVV 3 (Art. 3 Ausrichtung der Leistungen)", url: "https://www.fedlex.admin.ch/eli/cc/1985/1778_1778_1778/de" },
      { label: "ESTV – Steuerrechner Kapitalauszahlung", url: "https://swisstaxcalculator.estv.admin.ch/" },
      { label: "BSV: Die dritte Säule", url: "https://www.bsv.admin.ch/bsv/de/home/sozialversicherungen/bv/grundlagen-und-gesetze/grundlagen/gebundene-selbstvorsorge.html" },
    ],
  },
  {
    id: "pillar-3b-life-insurance",
    slug: "saeule-3b-lebensversicherung-kapital-oder-rente",
    title: "Säule 3b: Lebensversicherung als Kapital oder Rente",
    topic: "Bezug",
    summary:
      "Das Kapital einer rückkaufsfähigen Lebensversicherung ist meist steuerfrei. Eine Leibrente wird dagegen laufend zum Teil besteuert.",
    detailIntro:
      "Bei einer gemischten Lebensversicherung der Säule 3b steht der Auszahlungszeitpunkt im Vertrag. Oft kann man bei Ablauf wählen, ob man das Kapital nimmt oder in eine Rente umwandelt.",
    tips: [
      "Ablaufdatum und Wahlrecht Kapital/Rente in der Police nachsehen.",
      "Kapital aus Policen mit periodischen Prämien ist in der Regel einkommenssteuerfrei.",
      "Einmalprämien-Policen: steuerfrei nur mit Auszahlung ab 60, Laufzeit ab 5 Jahren und Abschluss vor 66.",
      "Ein vorzeitiger Rückkauf bringt meist weniger als der Ablaufwert.",
    ],
    detailParagraphs: [
      "Anders als die Säule 3a ist die Säule 3b frei: Beiträge sind in der Regel nicht abziehbar, dafür ist die Auszahlung flexibler. Bei rückkaufsfähigen Kapitalversicherungen ist die Ablaufleistung bei der direkten Bundessteuer steuerfrei, wenn die gesetzlichen Bedingungen erfüllt sind. Bei Einmalprämien-Policen muss die Auszahlung nach dem 60. Geburtstag erfolgen, der Vertrag mindestens fünf Jahre gelaufen und vor dem 66. Geburtstag abgeschlossen worden sein.",
      "Wählen Sie statt des Kapitals eine Leibrente, wird nur ein Teil davon als Einkommen besteuert. Seit 2025 hängt dieser Ertragsanteil vom Zinsniveau ab, vorher galten pauschal 40 %. Die Rente ist lebenslang und damit eine Absicherung gegen Langlebigkeit, sie ist aber nicht teuerungsgeschützt und bei frühem Tod meist verloren, sofern keine Rückgewähr vereinbart ist.",
      "Während der Laufzeit unterliegt der Rückkaufswert der Vermögenssteuer. Wer vor Ablauf kündigt, erhält den Rückkaufswert, der vor allem in den ersten Jahren deutlich unter den einbezahlten Prämien liegen kann.",
      "In Pension-Pal wählen Sie in der Bezugsplanung pro Police Kapital oder Rente. Das Kapital fliesst steuerfrei in die Anlage, die Rente erscheint ab dem Ablaufalter im Einkommen.",
    ],
    lastReviewedAt: "2026-09-28",
    sources: [
      { label: "Fedlex – DBG (Art. 20, 22, 24)", url: "https://www.fedlex.admin.ch/eli/cc/1991/1184_1184_1184/de" },
      { label: "ESTV – Steuerrechner", url: "https://swisstaxcalculator.estv.admin.ch/" },
      { label: "ch.ch – Pensionierung", url: "https://www.ch.ch/de/pensionierung/" },
    ],
  },
  {
    id: "invest-capital-withdrawal-plan",
    slug: "kapital-anlegen-entnahmeplan",
    title: "Kapital anlegen: Anlagetöpfe, Entnahmeplan und Monte Carlo",
    topic: "Bezug",
    summary:
      "Bezogenes Kapital soll über Jahrzehnte ein Einkommen liefern. Die Aufteilung in Töpfe mit unterschiedlichem Risiko macht das planbar.",
    detailIntro:
      "Wer Kapital bezieht, wird zum eigenen Rentenversicherer. Entscheidend sind die erwartete Rendite, die Schwankung, die Kosten und die Reihenfolge der Renditen in den ersten Jahren nach der Pensionierung.",
    tips: [
      "Ein bis zwei Jahresentnahmen als Liquidität halten, um in Krisen nicht verkaufen zu müssen.",
      "Mittelfristiges Geld defensiv, langfristiges Geld in Aktien anlegen.",
      "Kosten zählen: 1 % Gebühren kosten über 25 Jahre rund einen Fünftel des Vermögens.",
      "Mit dem sicheren Betrag (90 % Erfolgswahrscheinlichkeit) planen, nicht mit dem Durchschnitt.",
    ],
    detailParagraphs: [
      "Die Bezugsplanung in Pension-Pal verteilt das Kapital auf Anlagetöpfe mit eigenem Betrag und eigenen Annahmen: Liquidität, Strategiefonds konservativ, ausgewogen und Wachstum sowie ein Welt-Aktien-ETF. Die Standardwerte (Rendite / Schwankung / Kosten pro Jahr) sind 0,5 / 0,5 / 0 % für Liquidität, 2,5 / 5 / 0,5 % konservativ, 3,5 / 8 / 0,5 % ausgewogen, 4,5 / 11 / 0,5 % Wachstum und 6 / 15 / 0,2 % für Aktien Welt. Alle Werte lassen sich anpassen.",
      "Die Planlinie rechnet mit einer konstanten Rendite. In der Realität schwanken die Märkte, und schlechte Jahre kurz nach der Pensionierung wiegen besonders schwer, weil gleichzeitig Geld entnommen wird (Sequenzrisiko). Deshalb simuliert die App 1'000 zufällige Marktverläufe (Monte Carlo) und zeigt das Band zwischen dem 10. und 90. Perzentil.",
      "Der «sichere» monatliche Betrag ist die höchste Entnahme, bei der das Geld in 90 % der Verläufe bis zum Zielalter reicht. Er liegt meist deutlich unter dem Wert der Planlinie. Mehr Aktien erhöhen die erwartete Rendite, aber auch die Schwankung; der sichere Betrag steigt deshalb nicht beliebig.",
      "Die Entnahme ist real, also teuerungsbereinigt: Sie steigt mit der Inflation. Renten aus Pensionskasse und 3b sind dagegen nominal fix und verlieren über die Jahre an Kaufkraft. Das Kapital ist darum auch ein Inflationsschutz.",
    ],
    lastReviewedAt: "2026-09-28",
    sources: [
      { label: "BFS – Berufliche Vorsorge 2024", url: "https://www.bfs.admin.ch/bfs/de/home/aktuell/neue-veroeffentlichungen.assetdetail.36180570.html" },
      { label: "SNB – Inflationsumfeld Schweiz", url: "https://www.snb.ch" },
    ],
  },
  {
    id: "retiree-median",
    slug: "median-pensionierte-einkommen-vermoegen",
    title: "Wie viel haben Pensionierte? Median von Einkommen und Vermögen",
    topic: "Bezug",
    summary:
      "Pensionierte Einzelpersonen haben im Median rund 3'740 CHF pro Monat verfügbar, Paare rund 5'610 CHF. Das Vermögen ist im Alter meist höher als im Erwerbsleben.",
    detailIntro:
      "Der Median teilt die Bevölkerung in zwei gleich grosse Hälften: Die eine hat weniger, die andere mehr. Pension-Pal vergleicht Ihr geplantes Einkommen und Vermögen mit diesen Werten – dieselben Zahlen wie in Budget-Pal.",
    tips: [
      "Einkommen: Median verfügbar ab 65 = 44'899 CHF p.a. (BFS, SILC 2018).",
      "Paare: Faktor 1,5 nach OECD-Skala → rund 5'610 CHF pro Monat.",
      "Neurenten 2024 aus der Pensionskasse: Median 2'042 CHF (Männer) und 1'227 CHF (Frauen) pro Monat.",
      "Das Vermögen steigt bis ins Rentenalter: Median 65–74 rund 240'700 CHF (Luzern 2020).",
    ],
    detailParagraphs: [
      "Einkommen: Das Bundesamt für Statistik weist für Personen ab 65 ein medianes verfügbares Äquivalenzeinkommen von 44'899 CHF pro Jahr aus (SILC 2018). «Verfügbar» heisst nach Steuern, Sozialbeiträgen und Krankenkassenprämien. Erträge aus Vermögen zählen dazu, der Verzehr des Vermögens nicht. Für Paare gilt die modifizierte OECD-Skala: Die zweite erwachsene Person zählt 0,5, der Haushalt also 1,5-mal so viel.",
      "Vermögen: Eine schweizweite Reihe des Vermögens nach Alter gibt es nicht, weil die Kantone der ESTV kein Alter melden. Pension-Pal nutzt deshalb die Steuerdaten des Kantons Luzern 2020 (LUSTAT): Median des Reinvermögens ohne Pensionskasse, von rund 15'800 CHF bei 18- bis 25-Jährigen bis 240'700 CHF bei 65- bis 74-Jährigen. Pensionierte sind damit im Mittel vermögender als Erwerbstätige, das Einkommen sinkt aber mit der Pensionierung.",
      "Neurenten: Laut der Statistik der beruflichen Vorsorge 2024 erhielten Männer, die neu eine Pensionskassenrente bezogen, im Median 2'042 CHF pro Monat, Frauen 1'227 CHF. Wer Kapital bezog, erhielt im Median 201'825 CHF (Männer) bzw. 82'942 CHF (Frauen). Der Unterschied zeigt die Lücke in der zweiten Säule bei Teilzeit und Erwerbsunterbrüchen.",
      "Grenzen des Vergleichs: Der Einkommensmedian gilt für alle ab 65 zusammen, nicht pro Altersjahr. Pension-Pal zieht bei Ihrem Einkommen die Krankenkassenprämien nicht ab, Ihr Wert ist deshalb etwas zu hoch im Vergleich. Die App zeigt den Vergleich darum zweimal: mit und ohne Entnahme aus dem Kapital.",
    ],
    lastReviewedAt: "2026-09-28",
    sources: [
      { label: "BFS – Berufliche Vorsorge 2024 (Medienmitteilung)", url: "https://www.bfs.admin.ch/bfs/de/home/aktuell/neue-veroeffentlichungen.assetdetail.36180570.html" },
      { label: "BFS – Neurentenstatistik 2023", url: "https://dam-api.bfs.admin.ch/hub/api/dam/assets/32588928/master" },
      { label: "LUSTAT – Vermögen (FinSit 2024)", url: "https://www.lustat.ch/analysen/soziale-sicherheit/finsit-2024/vermoegen" },
      { label: "Die Volkswirtschaft – Die Pensionierten sind reicher als die Erwerbstätigen", url: "https://dievolkswirtschaft.ch/de/2023/02/die-pensionierten-sind-reicher-als-die-erwerbstaetigen/" },
      { label: "BSV – WiSiER (Wirtschaftliche Situation im Erwerbs- und Rentenalter)", url: "https://www.bsv.admin.ch/de/wisier-de" },
    ],
  },
  {
    id: "compliance-pension-formulas",
    slug: "compliance-pension-formeln",
    title: "Compliance-Formeln: AHV, BVG/LPP und Säule 3a",
    topic: "Compliance",
    summary:
      "Transparente Berechnungslogik mit getrennten Formeln pro Säule, Inflationsbereinigung und Szenariovergleich.",
    detailIntro:
      "Diese Vertiefung zeigt, wie die drei Säulen nachvollziehbar berechnet werden, welche Annahmen verwendet werden und wie Inflations- und Szenarioeffekte transparent offengelegt werden.",
    tips: [
      "AHV-Faktor mit Beitragsbasis und Altersanpassung getrennt ausweisen.",
      "BVG-Rente aus Kapital und Umwandlungssatz ableiten, Früh-/Spätpension separat simulieren.",
      "3a-Einzahlungen gegen steuerliche Limiten prüfen und Renditeannahmen offen dokumentieren.",
      "Gesamtrente als Summe aller Säulen mit Quellen und Annahmen anzeigen.",
    ],
    detailParagraphs: [
      "Die Schweizer Altersvorsorge besteht aus mehreren Bausteinen. Wer seine Pension plant, sollte deshalb nicht nur auf eine Endsumme schauen, sondern verstehen, wie diese Summe entsteht. Eine gute Erklärung trennt AHV, BVG und Säule 3a klar voneinander und zeigt, welche Annahmen in die Rechnung einfliessen.",
      "Bei der AHV sind vor allem die Beitragsjahre und das massgebende Einkommen wichtig. Bereits einzelne Lücken können die spätere Pension spürbar senken. Deshalb lohnt sich ein regelmässiger Blick auf den individuellen Kontoauszug bei der Ausgleichskasse.",
      "In der zweiten Säule wird die Pension aus dem vorhandenen Kapital und dem Umwandlungssatz berechnet. Zusätzlich spielt der Zeitpunkt der Pensionierung eine grosse Rolle, weil Früh- oder Spätpensionierung den Betrag verändern können. Wer diese Effekte kennt, kann realistischer planen.",
      "Bei der Säule 3a stehen steuerliche Grenzen, Renditeannahmen und Bezugszeitpunkt im Mittelpunkt. Eine verlässliche Planung zeigt deshalb mehrere Szenarien, nicht nur einen optimistischen Verlauf. So bleibt die Gesamtberechnung verständlich, vergleichbar und transparent.",
    ],
    lastReviewedAt: "2026-03-11",
    sources: [
      {
        label: "Fedlex - AHVG (gesetzliche Grundlagen)",
        url: "https://www.fedlex.admin.ch/eli/cc/63/837_843_843/de",
      },
      {
        label: "Fedlex - BVG/LPP (gesetzliche Grundlagen)",
        url: "https://www.fedlex.admin.ch/eli/cc/1983/797_797_797/de",
      },
      {
        label: "ESTV - Steuerinformationen zur Vorsorge",
        url: "https://www.estv.admin.ch/estv/de/home/direkte-bundessteuer/fachinformationen-dbst/steuerperiode.html",
      },
      {
        label: "SNB - Inflationsumfeld Schweiz",
        url: "https://www.snb.ch",
      },
    ],
  },
  {
    id: "three-a-splitting",
    slug: "saeule-3a-splitting",
    title: "Säule 3a auf mehrere Konten aufteilen",
    topic: "Saeule3a",
    summary: "Gestaffelte Bezüge reduzieren die Steuerprogression beim Kapitalbezug.",
    detailIntro:
      "Die Aufteilung von 3a-Guthaben auf mehrere Konten schafft Flexibilität beim späteren Bezug und kann die Steuerprogression deutlich glätten.",
    tips: [
      "3a-Guthaben auf 2-3 Konten verteilen.",
      "Bezüge über mehrere Steuerjahre staffeln.",
      "Maximale Jahresbeiträge je nach Erwerbsstatus beachten.",
    ],
    detailParagraphs: [
      "Die Säule 3a ist ein zentraler Teil der privaten Vorsorge in der Schweiz. Sie bietet steuerliche Vorteile und ergänzt die Leistungen aus AHV und BVG. Damit diese Vorteile später voll wirken, braucht es eine Planung über mehrere Jahre.",
      "In vielen Fällen ist es sinnvoll, das 3a-Guthaben auf zwei oder drei Konten zu verteilen. Der Grund ist die Steuerprogression bei Kapitalbezügen. Werden Bezüge auf mehrere Steuerjahre verteilt, fällt die Steuerbelastung oft tiefer aus als bei einem einzigen grossen Bezug.",
      "Für die Praxis ist deshalb nicht nur die Rendite entscheidend, sondern auch der Bezugsplan. Wer früh plant, kann die finanzielle Wirkung klar verbessern. Dabei sollten immer auch die kantonalen Unterschiede berücksichtigt werden.",
      "Wichtig sind zudem die jährlich gültigen Maximalbeiträge. Diese Grenzen ändern sich und hängen von der Erwerbssituation ab. Eine gute Strategie kombiniert regelmässige Einzahlungen, realistische Renditeannahmen und einen abgestimmten Bezugszeitpunkt.",
    ],
    lastReviewedAt: "2026-03-11",
    sources: [
      { label: "UBS - Mehrere 3a Konten", url: "https://www.ubs.com/ch/de/help/pension/pillar3a-multiple-accounts.html" },
      { label: "Comparis - 3a Splitting", url: "https://www.comparis.ch/altersvorsorge/saeule3a/splitting-3a" },
    ],
  },
  {
    id: "motion-ettlin",
    slug: "motion-ettlin",
    title: "Motion Ettlin: Beitragslücken in Säule 3a",
    topic: "PolitikReformen",
    summary:
      "Die Motion Ettlin führte zur BVV-3-Anpassung: Beitragslücken können unter Bedingungen nachträglich geschlossen werden.",
    detailIntro:
      "Die Reform erweitert die Planungsmöglichkeiten für Personen mit früheren Beitragslücken. Entscheidend ist die korrekte Reihenfolge bei ordentlichem Beitrag und Einkauf.",
    tips: [
      "Lückenjahre systematisch dokumentieren und mit AHV-pflichtigem Einkommen abgleichen.",
      "Ordentlichen Jahresbeitrag zuerst vollständig einzahlen, danach möglichen Einkauf prüfen.",
      "Kantonale Steuerwirkung und Jahr der Auszahlung/Einzahlung in der Planung berücksichtigen.",
    ],
    detailParagraphs: [
      "Die Motion Ettlin hat das Thema Beitragslücken in der Säule 3a stärker in den Fokus gerückt. Das ist für viele Menschen relevant, weil Erwerbsbiografien heute häufiger Unterbrüche enthalten. Wer solche Lücken kennt, kann sie gezielt in die Vorsorgeplanung einbeziehen.",
      "Wichtig ist eine saubere Dokumentation der betroffenen Jahre und des AHV-pflichtigen Einkommens. Ohne klare Grundlage lassen sich Nachzahlungen und Steuerwirkung kaum verlässlich beurteilen. Deshalb sollten Unterlagen früh gesammelt und mit offiziellen Auszügen abgeglichen werden.",
      "In der Praxis gilt eine klare Reihenfolge: zuerst der ordentliche Jahresbeitrag, danach ein möglicher zusätzlicher Einkauf. Diese Reihenfolge schafft Transparenz und hilft, Fehler bei der steuerlichen Behandlung zu vermeiden.",
      "Die konkrete Entlastung hängt vom Kanton und vom Zeitpunkt der Einzahlung ab. Wer nicht nur ein Jahr, sondern mehrere Jahre plant, kann den Effekt meist besser steuern. Eine gute Erklärung zeigt diese Zusammenhänge einfach und nachvollziehbar.",
    ],
    lastReviewedAt: "2026-03-11",
    sources: [
      {
        label: "Bundesrat (06.11.2024): Nachträgliche Einkaufsmöglichkeit Säule 3a",
        url: "https://www.admin.ch/gov/de/start/dokumentation/medienmitteilungen.msg-id-103044.html",
      },
      { label: "BSV: Die dritte Säule", url: "https://www.bsv.admin.ch/bsv/de/home/sozialversicherungen/bv/grundlagen-und-gesetze/grundlagen/gebundene-selbstvorsorge.html" },
    ],
  },
  {
    id: "ahv-contribution-years",
    slug: "ahv-beitragsjahre-vollrente",
    title: "AHV: Beitragsjahre und Vollrente",
    topic: "AHV",
    summary: "Lücken in den Beitragsjahren führen zu Rentenkürzungen.",
    detailIntro:
      "Die AHV-Rente hängt stark von der Vollständigkeit der Beitragsjahre ab. Fehljahre können die Zielrente dauerhaft reduzieren.",
    tips: [
      "Beitragsverlauf regelmässig prüfen.",
      "Lücken früh identifizieren (Studium, Ausland, Erwerbspausen).",
      "AHV-Auszug als Basis für Prognose nutzen.",
    ],
    detailParagraphs: [
      "Die AHV bildet das Fundament der Schweizer Altersvorsorge. Für eine volle Pension sind in der Regel vollständige Beitragsjahre nötig. Schon wenige fehlende Jahre können die spätere Auszahlung merklich reduzieren.",
      "Deshalb lohnt sich ein früher und regelmässiger Blick auf den Beitragsverlauf. Lücken entstehen oft durch Ausbildung, Auslandaufenthalte oder Erwerbspausen. Wer diese Phasen früh erkennt, kann besser gegensteuern.",
      "Der individuelle AHV-Auszug ist die wichtigste Grundlage für eine realistische Einschätzung. Er zeigt den aktuellen Stand und macht Unstimmigkeiten sichtbar. Bei offenen Fragen sollte man die zuständige Ausgleichskasse direkt kontaktieren.",
      "Für die Gesamtplanung reicht die AHV allein nicht aus. Erst zusammen mit BVG und privater Vorsorge entsteht ein verlässliches Bild der späteren Einkommenssituation. Genau diese Gesamtsicht hilft, bessere Entscheide für die Pensionierung zu treffen.",
    ],
    lastReviewedAt: "2026-03-11",
    formulaInfoBox: {
      title: "AHV-Berechnung in der App (transparente Rechenlogik)",
      steps: [
        "1) Einkommen bestimmen: Entweder manuelles Feld 'Geschätztes durchschnittliches Jahreseinkommen' oder automatisch als Durchschnitt aus der Jahreshistorie.",
        "2) Beitragsjahre bestimmen: Entweder manuelles Feld oder Anzahl vorhandener Jahre in der Beitragshistorie.",
        "3) Einkommensfaktor: incomeFactor = clamp(Einkommen / 88'200, 0.30, 1.00).",
        "4) Basisbetrag: baseAnnual = 14'700 + (29'400 - 14'700) * incomeFactor.",
        "5) Beitragsfaktor: yearsFactor = clamp(Beitragsjahre / 44, 0, 1).",
        "6) Altersfaktor: retirementFactor = clamp(1 - Vorbezug*0.068 + Aufschub*0.052 + ReferenzalterDelta*0.02, 0.70, 1.31).",
        "7) Geschlechtsfaktor: genderFactor = 1.01 (weiblich) oder 1.00 (männlich).",
      ],
      formula:
        "Erwartete AHV p.a. = round(baseAnnual * yearsFactor * retirementFactor * genderFactor)",
      note:
        "Hinweis: Diese Darstellung zeigt die in der App verwendete, vereinfachte Prognose-Logik zur transparenten Planung. Für verbindliche Leistungsabklärungen gelten die offiziellen Auskünfte der Ausgleichskasse.",
      example: {
        title: "Beispiel mit konkreten Werten",
        lines: [
          "Eingaben: Einkommen 72'000 CHF, Beitragsjahre 38, Vorbezug 0, Aufschub 1, ReferenzalterDelta 0, Geschlecht weiblich.",
          "incomeFactor = clamp(72'000 / 88'200, 0.30, 1.00) = 0.8163.",
          "baseAnnual = 14'700 + (29'400 - 14'700) * 0.8163 = 26'699.61 CHF.",
          "yearsFactor = clamp(38 / 44, 0, 1) = 0.8636.",
          "retirementFactor = clamp(1 - 0*0.068 + 1*0.052 + 0*0.02, 0.70, 1.31) = 1.0520.",
          "genderFactor = 1.01.",
        ],
        result:
          "Erwartete AHV p.a. = round(26'699.61 * 0.8636 * 1.0520 * 1.01) = 24'524 CHF.",
      },
      comparisonExample: {
        title: "Vergleichsbeispiel: volle Beitragsjahre, kein Aufschub",
        lines: [
          "Eingaben: Einkommen 72'000 CHF, Beitragsjahre 44, Vorbezug 0, Aufschub 0, ReferenzalterDelta 0, Geschlecht weiblich.",
          "incomeFactor = clamp(72'000 / 88'200, 0.30, 1.00) = 0.8163.",
          "baseAnnual = 14'700 + (29'400 - 14'700) * 0.8163 = 26'699.61 CHF.",
          "yearsFactor = clamp(44 / 44, 0, 1) = 1.0000.",
          "retirementFactor = clamp(1 - 0*0.068 + 0*0.052 + 0*0.02, 0.70, 1.31) = 1.0000.",
          "genderFactor = 1.01.",
        ],
        result:
          "Erwartete AHV p.a. = round(26'699.61 * 1.0000 * 1.0000 * 1.01) = 26'967 CHF.",
      },
    },
    sources: [
      { label: "BSV - AHV/IV", url: "https://www.bsv.admin.ch/bsv/de/home/sozialversicherungen/ahv.html" },
      { label: "AHV/IV Informationsstelle", url: "https://www.ahv-iv.ch/" },
    ],
  },
  {
    id: "bvg-conversion-rate",
    slug: "bvg-umwandlungssatz-verstehen",
    title: "BVG Umwandlungssatz verstehen",
    topic: "BVG",
    summary: "Der Umwandlungssatz steuert direkt die lebenslange Rente aus BVG-Kapital.",
    detailIntro:
      "Der Umwandlungssatz ist eine Schlüsselgrösse für die Rentenhöhe in der zweiten Säule und sollte immer im Kontext von Obligatorium und Überobligatorium gelesen werden.",
    tips: [
      "Obligatorischen und überobligatorischen Teil trennen.",
      "Vorsorgeausweis auf techn. Zinssatz und Umwandlungssatz prüfen.",
      "Kapital- vs. Rentenbezug früh simulieren (siehe «Pensionskasse: Kapital, Rente oder beides»).",
    ],
    detailParagraphs: [
      "Der Umwandlungssatz in der zweiten Säule bestimmt, wie hoch die jährliche Pension aus dem vorhandenen Alterskapital ausfällt. Für viele Haushalte ist das eine Schlüsselzahl, weil sie das verfügbare Einkommen im Ruhestand direkt beeinflusst. Darum sollte sie immer im Zusammenhang mit dem gesamten Vorsorgeausweis gelesen werden.",
      "Wichtig ist die Trennung zwischen obligatorischem und überobligatorischem Teil. Viele BVG Pensionskassen arbeiten hier mit unterschiedlichen Parametern. Dadurch ist die effektive Pension oft komplexer, als es eine einzelne Zahl vermuten lässt.",
      "Zusätzlich verändert der Pensionierungszeitpunkt die Rechnung. Eine Frühpensionierung kann die laufende Pension senken, während ein späterer Bezug je nach Reglement positive Effekte haben kann. Solche Unterschiede sollten mit konkreten CHF-Beispielen erklärt werden.",
      "Der Entscheid zwischen Kapitalbezug und laufender Pension ist immer persönlich. Steuerfolgen, Sicherheitsbedürfnis, Liquidität und Lebenserwartung spielen gemeinsam eine Rolle. Gute Informationsseiten ordnen diese Faktoren verständlich und ohne unnötigen Fachjargon ein.",
    ],
    lastReviewedAt: "2026-03-11",
    sources: [
      { label: "admin.ch - Berufliche Vorsorge", url: "https://www.admin.ch/gov/de/start/dokumentation/medienmitteilungen.msg-id-100726.html" },
      { label: "PAX - BVG Umwandlungssatz", url: "https://www.pax.ch/de/ratgeber/berufliche-vorsorge-verstehen/der-gesetzliche-bvg-umwandlungssatz" },
    ],
  },
  {
    id: "wef-tax",
    slug: "eigenheimbezug-steuerfolgen",
    title: "Eigenheimbezug und Steuerfolgen",
    topic: "Wohneigentum",
    summary: "Bezug aus BVG/3a für Wohneigentum ist möglich, senkt aber Vorsorgekapital.",
    detailIntro:
      "Ein WEF-Bezug kann die Wohnfinanzierung erleichtern, reduziert jedoch langfristig das verfügbare Alterskapital und verändert Steuerprofile.",
    tips: [
      "WEF-Bezug und künftige Rentenreduktion gemeinsam betrachten.",
      "Steuerfolgen im Entnahmejahr einplanen.",
      "Rückzahlungen verbessern künftige Leistungen.",
    ],
    detailParagraphs: [
      "Ein Vorbezug für Wohneigentum aus BVG oder Säule 3a kann den Kauf eines Eigenheims erleichtern. Gleichzeitig reduziert sich jedoch das Kapital für die spätere Altersvorsorge. Dieser Entscheid ist daher immer ein Abwägen zwischen aktuellem Wohnbedarf und langfristiger Einkommenssicherheit.",
      "In der Praxis wird der kurzfristige Nutzen häufig stärker gewichtet als die spätere Wirkung auf die Pension. Genau deshalb braucht es verständliche Beispiele mit konkreten Beträgen. Wer den Effekt auf die zukünftige Monatszahlung kennt, kann den Entscheid realistischer beurteilen.",
      "Im Bezugsjahr fallen zudem Steuern auf Kapitalleistungen an. Die Höhe hängt vom Kanton, von der Bezugsumme und von weiteren Bezügen im gleichen Jahr ab. Eine gute Planung betrachtet deshalb nicht nur die Finanzierung, sondern auch die steuerliche Gesamtwirkung.",
      "Rückzahlungen können das Vorsorgekapital später wieder stärken. Es lohnt sich, WEF-Entscheide in einen mehrjährigen Finanzplan einzubetten und nicht isoliert zu treffen. So bleibt die Balance zwischen Wohneigentum und Altersvorsorge langfristig stabil.",
    ],
    lastReviewedAt: "2026-03-11",
    sources: [
      { label: "AHV/IV & BVG Grundlagen", url: "https://www.ahv-iv.ch/" },
      { label: "ch.ch - Pensionierung", url: "https://www.ch.ch/de/pensionierung/" },
    ],
  },
];

const ICON_BY_TOPIC = {
  AHV: <Bank className="h-4 w-4" />,
  BVG: <PiggyBank className="h-4 w-4" />,
  Saeule3a: <OpenBook className="h-4 w-4" />,
  Bezug: <Coins className="h-4 w-4" />,
  Wohneigentum: <Home className="h-4 w-4" />,
  PolitikReformen: <OpenBook className="h-4 w-4" />,
  Compliance: <CheckCircle className="h-4 w-4" />,
};

export const Knowledge: React.FC = () => {
  const [query, setQuery] = React.useState("");
  const [topic, setTopic] = React.useState<"all" | KnowledgeItem["topic"]>("all");
  const [activeDetailSlug, setActiveDetailSlug] = React.useState<string | null>(null);

  const getItemBySlug = React.useCallback((slug: string) => {
    return ITEMS.find((item) => item.slug === slug) || null;
  }, []);

  React.useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      const match = hash.match(/^wissen\/([^/]+)\/detail$/);
      if (match?.[1] && getItemBySlug(match[1])) {
        setActiveDetailSlug(match[1]);
      } else {
        setActiveDetailSlug(null);
      }
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [getItemBySlug]);

  React.useEffect(() => {
    if (activeDetailSlug) {
      const current = getItemBySlug(activeDetailSlug);
      document.title = current ? `${current.title} | Wissen` : "Wissen";
      if (current) {
        let meta = document.querySelector('meta[name="description"]');
        if (!meta) {
          meta = document.createElement("meta");
          meta.setAttribute("name", "description");
          document.head.appendChild(meta);
        }
        meta.setAttribute(
          "content",
          `${current.title}: ${current.detailIntro}`,
        );
      }
    } else {
      document.title = "Wissen";
    }
  }, [activeDetailSlug, getItemBySlug]);

  const handleTopicChange = (value: string) => {
    if (
      value === "all" ||
      value === "AHV" ||
      value === "BVG" ||
      value === "Saeule3a" ||
      value === "Bezug" ||
      value === "Wohneigentum" ||
      value === "PolitikReformen" ||
      value === "Compliance"
    ) {
      setTopic(value);
    }
  };

  const filtered = React.useMemo(() => {
    return ITEMS.filter((item) => {
      const matchTopic = topic === "all" ? true : item.topic === topic;
      const text = `${item.title} ${item.summary} ${item.tips.join(" ")} ${item.detailParagraphs.join(" ")}`.toLowerCase();
      const matchQuery = query.trim() ? text.includes(query.trim().toLowerCase()) : true;
      return matchTopic && matchQuery;
    });
  }, [query, topic]);

  const openDetail = (item: KnowledgeItem) => {
    const nextHash = `#wissen/${item.slug}/detail`;
    window.history.pushState(null, "", nextHash);
    setActiveDetailSlug(item.slug);
  };

  const closeDetail = () => {
    window.history.pushState(null, "", "#knowledge");
    setActiveDetailSlug(null);
  };

  const activeItem = activeDetailSlug ? getItemBySlug(activeDetailSlug) : null;
  const related = activeItem
    ? ITEMS.filter((item) => item.id !== activeItem.id).slice(0, 3)
    : [];
  const readingTimeMinutes = activeItem
    ? estimateReadingTimeMinutes(`${activeItem.detailIntro} ${activeItem.detailParagraphs.join(" ")}`)
    : 0;
  const reviewedLabel = activeItem ? formatSwissDate(activeItem.lastReviewedAt) : "";

  if (activeItem) {
    return (
      <div className="flex min-h-full flex-col gap-4 pb-6">
        <header className="space-y-2">
          <button
            type="button"
            onClick={closeDetail}
            className="inline-flex items-center gap-2 rounded-md border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Zur Wissensübersicht
          </button>
          <p className="text-xs text-slate-500">
            Wissen / {activeItem.topic === "Saeule3a" ? "Säule 3a" : activeItem.topic} / Detail
          </p>
          <h1 className="text-xl font-light text-slate-50">{activeItem.title}</h1>
          <p className="max-w-3xl text-base text-slate-300">{activeItem.detailIntro}</p>
          <p className="text-xs text-slate-400">
            Lesedauer ca. {readingTimeMinutes} Min. · Zuletzt aktualisiert: {reviewedLabel}
          </p>
        </header>

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <article className="space-y-3 rounded-xl border border-slate-700 bg-surface p-section">
            {activeItem.detailParagraphs.map((paragraph, index) => (
              <p
                key={`${activeItem.id}-paragraph-${index}`}
                className="text-base leading-relaxed text-slate-300"
              >
                {paragraph}
              </p>
            ))}
            {activeItem.formulaInfoBox && (
              <div className="mt-4 rounded-lg border border-emerald-600/40 bg-emerald-900/15 p-box">
                <p className="mb-2 text-sm font-semibold text-emerald-200">
                  {activeItem.formulaInfoBox.title}
                </p>
                <ul className="space-y-1 text-sm leading-relaxed text-emerald-100/95">
                  {activeItem.formulaInfoBox.steps.map((step) => (
                    <li key={step}>- {step}</li>
                  ))}
                </ul>
                <p className="mt-3 rounded border border-emerald-500/30 bg-surface-2 px-2 py-1 text-sm font-medium text-emerald-100">
                  {activeItem.formulaInfoBox.formula}
                </p>
                {activeItem.formulaInfoBox.note && (
                  <p className="mt-2 text-xs text-emerald-100/80">
                    {activeItem.formulaInfoBox.note}
                  </p>
                )}
                {activeItem.formulaInfoBox.example && (
                  <div className="mt-3 rounded-md border border-emerald-500/30 bg-surface-2 p-box-sm">
                    <p className="mb-1 text-sm font-semibold text-emerald-200">
                      {activeItem.formulaInfoBox.example.title}
                    </p>
                    <ul className="space-y-1 text-xs leading-relaxed text-emerald-100/95">
                      {activeItem.formulaInfoBox.example.lines.map((line) => (
                        <li key={line}>- {line}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-sm font-semibold text-emerald-100">
                      {activeItem.formulaInfoBox.example.result}
                    </p>
                  </div>
                )}
                {activeItem.formulaInfoBox.comparisonExample && (
                  <div className="mt-3 rounded-md border border-blue-500/30 bg-surface-2 p-box-sm">
                    <p className="mb-1 text-sm font-semibold text-blue-200">
                      {activeItem.formulaInfoBox.comparisonExample.title}
                    </p>
                    <ul className="space-y-1 text-xs leading-relaxed text-blue-100/95">
                      {activeItem.formulaInfoBox.comparisonExample.lines.map((line) => (
                        <li key={line}>- {line}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-sm font-semibold text-blue-100">
                      {activeItem.formulaInfoBox.comparisonExample.result}
                    </p>
                  </div>
                )}
              </div>
            )}
          </article>

          <aside className="space-y-3">
            <div className="rounded-xl border border-slate-700 bg-surface p-section">
              <p className="mb-2 text-xs text-slate-500">Verwandte Themen</p>
              <div className="space-y-2">
                {related.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openDetail(item)}
                    className="block w-full rounded-md border border-slate-700 px-2 py-1 text-left text-sm text-slate-200 hover:bg-slate-800"
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="rounded-xl border border-slate-700 bg-surface p-section">
          <p className="mb-2 text-xs text-slate-500">Quellenverzeichnis</p>
          <div className="space-y-1">
            {activeItem.sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="block text-sm text-blue-300 hover:text-blue-200"
              >
                {source.label}
              </a>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4 pb-6">
      <header>
        <h1 className="text-xl font-light text-slate-50">Wissen</h1>
        <p className="text-sm text-slate-400">Orientierung zu AHV/BVG/3a mit Schweizer Fokus.</p>
      </header>
      <section className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          className="input-field"
          placeholder="Thema suchen (z.B. 3a, Kapitalbezug, Frühpensionierung, Median)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="input-field" value={topic} onChange={(event) => handleTopicChange(event.target.value)}>
          <option value="all">Alle Themen</option>
          <option value="AHV">AHV</option>
          <option value="BVG">BVG</option>
          <option value="Saeule3a">Säule 3a</option>
          <option value="Bezug">Bezug &amp; Anlage</option>
          <option value="Wohneigentum">Wohneigentum</option>
          <option value="PolitikReformen">Politik/Reformen</option>
          <option value="Compliance">Compliance</option>
        </select>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        {filtered.map((item) => (
          <article key={item.id} className="rounded-xl border border-slate-700 bg-surface p-section text-sm">
            <div className="mb-2 flex items-center gap-2 text-slate-200">
              {ICON_BY_TOPIC[item.topic]}
              <h2 className="font-semibold">{item.title}</h2>
            </div>
            <p className="text-slate-300">{item.summary}</p>
            <ul className="mt-2 space-y-1 text-slate-400">
              {item.tips.map((tip) => (
                <li key={tip}>- {tip}</li>
              ))}
            </ul>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => openDetail(item)}
                className="rounded-md border border-blue-500/50 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200 hover:bg-blue-500/20"
              >
                Mehr Infos
              </button>
            </div>
            <div className="mt-3 border-t border-slate-700 pt-2">
              <p className="mb-1 text-xs text-slate-500">Quellen</p>
              <div className="space-y-1">
                {item.sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs text-blue-300 hover:text-blue-200"
                  >
                    {source.label}
                  </a>
                ))}
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};
