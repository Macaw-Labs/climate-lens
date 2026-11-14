import fs from "node:fs";
import path from "node:path";
import { CityClimateRecord, CityIndexManifest } from "../../data/schema/city";

const DATA_DIR = path.join(process.cwd(), "public", "data");

export function loadIndexManifest(): CityIndexManifest {
  const raw = fs.readFileSync(path.join(DATA_DIR, "index.json"), "utf-8");
  return JSON.parse(raw) as CityIndexManifest;
}

export function isValidIbgeCode(ibgeCode: string): boolean {
  return /^\d{7}$/.test(ibgeCode);
}

export function loadCityRecordByCode(ibgeCode: string): CityClimateRecord | null {
  if (!isValidIbgeCode(ibgeCode)) {
    return null;
  }
  const cityPath = path.join(DATA_DIR, `${ibgeCode}.json`);
  if (!fs.existsSync(cityPath)) {
    return null;
  }
  const raw = fs.readFileSync(cityPath, "utf-8");
  return JSON.parse(raw) as CityClimateRecord;
}
