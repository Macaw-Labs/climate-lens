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
    <div className="min-h-screen bg-[#f5f2eb] text-[#171717]">
      {/* Top Archival Masthead Bar */}
      <div className="no-print border-b border-[#d6d0c4] bg-[#fcfaf5]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[11px] font-mono uppercase tracking-widest text-[#57534e] sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-2 w-2 bg-[#1b4332]" />
            <span className="font-semibold text-[#171717]">
              Municipal Climate Lens
            </span>
            <span className="text-[#a8a29e]">/</span>
            <span>
              Paraná, BR · {city.metadata.name} ({city.metadata.ibge_code})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px]">
            <span>SEEG Coleção 14.0</span>
            <span className="text-[#a8a29e]">·</span>
            <span>AdaptaBrasil MCTI</span>
            <span className="text-[#a8a29e]">·</span>
            <span>IBGE Censo 2022</span>
            <span className="border border-[#d6d0c4] bg-[#f5f2eb] px-1.5 py-0.5 text-[#171717]">
              v{city.schema_version}
            </span>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <CityDiagnosticClient city={city} />
      </main>
    </div>
  );
}
