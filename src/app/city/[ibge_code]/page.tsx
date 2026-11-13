import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import {
  CityClimateRecord,
  CityIndexManifest,
} from "../../../../data/schema/city";
import { CityDiagnosticClient } from "@/components/CityDiagnosticClient";

export function generateStaticParams(): Array<{ ibge_code: string }> {
  const indexPath = path.join(process.cwd(), "public", "data", "index.json");
  const raw = fs.readFileSync(indexPath, "utf-8");
  const manifest = JSON.parse(raw) as CityIndexManifest;
  return manifest.municipalities.map((m) => ({
    ibge_code: m.ibge_code,
  }));
}

function loadCityRecord(ibgeCode: string): CityClimateRecord | null {
  if (!/^\d{7}$/.test(ibgeCode)) {
    return null;
  }
  const cityPath = path.join(
    process.cwd(),
    "public",
    "data",
    `${ibgeCode}.json`
  );
  if (!fs.existsSync(cityPath)) {
    return null;
  }
  const raw = fs.readFileSync(cityPath, "utf-8");
  return JSON.parse(raw) as CityClimateRecord;
}

export default async function CityDiagnosticPage({
  params,
}: {
  params: Promise<{ ibge_code: string }>;
}) {
  const { ibge_code } = await params;
  const city = loadCityRecord(ibge_code);

  if (!city) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <CityDiagnosticClient city={city} />
      </div>
    </main>
  );
}
