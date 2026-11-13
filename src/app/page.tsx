import fs from "node:fs";
import path from "node:path";
import { Globe2, Layers, ShieldCheck } from "lucide-react";
import { CityIndexManifest } from "../../data/schema/city";
import { CitySelectorClient } from "@/components/CitySelectorClient";

function loadIndexManifest(): CityIndexManifest {
  const filePath = path.join(process.cwd(), "public", "data", "index.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as CityIndexManifest;
}

export default function HomePage() {
  const manifest = loadIndexManifest();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">
              <Globe2 className="h-4 w-4" />
              <span>Municipal Climate Lens • Paraná (399 Municipalities)</span>
            </div>

            <div className="max-w-3xl space-y-3">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Municipal GHG Baselines &amp; Data-Gap Explorer
              </h1>
              <p className="text-base leading-relaxed text-slate-600">
                Most municipal climate dashboards hide whether an emission number
                comes from a local utility meter or a national population proxy.{" "}
                <strong className="font-semibold text-slate-900">
                  Municipal Climate Lens
                </strong>{" "}
                combines official Brazilian datasets—
                <span className="font-medium text-slate-800">
                  SEEG Coleção 14.0
                </span>
                ,{" "}
                <span className="font-medium text-slate-800">
                  AdaptaBrasil MCTI
                </span>
                , and{" "}
                <span className="font-medium text-slate-800">
                  IBGE Censo 2022
                </span>
                —and tags every number with an explicit provenance tier and an
                actionable checklist to close local data gaps.
              </p>
            </div>

            {/* Provenance Legend */}
            <div className="flex flex-wrap gap-3 pt-1 text-xs">
              <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-900">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  <strong>T1_LOCAL</strong> — Verified municipal meter / fuel /
                  landfill logs
                </span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sky-900">
                <Layers className="h-3.5 w-3.5 text-sky-600" />
                <span>
                  <strong>T2_MODELED</strong> — Spatially modeled (MapBiomas /
                  AdaptaBrasil)
                </span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-900">
                <Layers className="h-3.5 w-3.5 text-amber-600" />
                <span>
                  <strong>T3_PROXY</strong> — State/national top-down
                  disaggregation
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Selector */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <CitySelectorClient municipalities={manifest.municipalities} />
      </main>
    </div>
  );
}
