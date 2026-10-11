type ZipLookupResult = {
  municipality: string;
  canton: string;
};

const LOCAL_ZIP_FALLBACK: Record<string, ZipLookupResult> = {
  "8001": { municipality: "Zürich", canton: "ZH" },
  "3000": { municipality: "Bern", canton: "BE" },
  "1200": { municipality: "Genève", canton: "GE" },
  "4000": { municipality: "Basel", canton: "BS" },
  "6003": { municipality: "Luzern", canton: "LU" },
  "6900": { municipality: "Lugano", canton: "TI" },
  "7000": { municipality: "Chur", canton: "GR" },
  "8274": { municipality: "Tägerwilen", canton: "TG" },
};

export async function lookupSwissZip(zipCode: string): Promise<ZipLookupResult | null> {
  const zip = zipCode.trim();
  if (!/^\d{4}$/.test(zip)) return null;

  try {
    const res = await fetch(`https://api.zippopotam.us/ch/${zip}`);
    if (res.ok) {
      const data = (await res.json()) as {
        places?: Array<{ "place name"?: string; "state abbreviation"?: string }>;
      };
      const first = data.places?.[0];
      if (first?.["place name"] && first?.["state abbreviation"]) {
        return {
          municipality: first["place name"],
          canton: first["state abbreviation"].toUpperCase(),
        };
      }
    }
  } catch {
    // ignore and fallback to local lookup
  }

  return LOCAL_ZIP_FALLBACK[zip] ?? null;
}

