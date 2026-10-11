import { searchSwissLocations } from "./locationSearch";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runLocationSearchUnitTest() {
  const results = searchSwissLocations("zuerich", 10);
  const hasZurichEntry = results.some((entry) => entry.canton === "ZH" && entry.id === "261");
  assert(hasZurichEntry, "Expected Zuerich search to include ZH-261.");
}
