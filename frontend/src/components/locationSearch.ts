import locations from "../data/swiss_locations.json";

export type SwissLocation = {
  id: string;
  municipality: string;
  canton: string;
  zip: string;
};

const ALL_LOCATIONS: SwissLocation[] = (locations as SwissLocation[]).map((entry) => ({
  ...entry,
  canton: entry.canton.toUpperCase(),
}));

function normalize(value: string): string {
  return value
    .replace(/ä/gi, "ae")
    .replace(/ö/gi, "oe")
    .replace(/ü/gi, "ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function searchSwissLocations(query: string, limit = 8): SwissLocation[] {
  const normalized = normalize(query);
  if (!normalized) return [];

  const startsWith: SwissLocation[] = [];
  const includes: SwissLocation[] = [];

  for (const location of ALL_LOCATIONS) {
    const haystack = normalize(`${location.municipality} ${location.canton} ${location.zip}`);
    if (haystack.startsWith(normalized)) {
      startsWith.push(location);
    } else if (haystack.includes(normalized)) {
      includes.push(location);
    }
  }

  return [...startsWith, ...includes].slice(0, limit);
}

export function findSwissLocationByCode(canton: string, municipalityId: string): SwissLocation | null {
  return (
    ALL_LOCATIONS.find(
      (entry) => entry.canton === canton.toUpperCase() && entry.id === municipalityId,
    ) || null
  );
}

export function findSwissLocationByZip(zip: string): SwissLocation | null {
  const normalizedZip = zip.trim();
  return ALL_LOCATIONS.find((entry) => entry.zip === normalizedZip) || null;
}

export function isValidSwissLocationSelection(canton: string, municipalityId: string): boolean {
  return Boolean(findSwissLocationByCode(canton, municipalityId));
}
