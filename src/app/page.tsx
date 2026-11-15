import fs from "node:fs";
import path from "node:path";
import { ChevronDown } from "lucide-react";
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
    <div className="min-h-screen bg-[#f5f2eb] text-[#171717]">
      {/* Top Archival Masthead Bar */}
      <div className="border-b border-[#d6d0c4] bg-[#fcfaf5]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[11px] font-mono uppercase tracking-widest text-[#57534e] sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-2 w-2 bg-[#1b4332]" />
            <span className="font-semibold text-[#171717]">
              Municipal Climate Lens
            </span>
            <span className="text-[#a8a29e]">/</span>
            <span>Paraná, BR · {manifest.municipalities.length} Municipalities</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px]">
            <span>SEEG Coleção 14.0</span>
            <span className="text-[#a8a29e]">·</span>
            <span>AdaptaBrasil MCTI</span>
            <span className="text-[#a8a29e]">·</span>
            <span>IBGE Censo 2022</span>
            <span className="border border-[#d6d0c4] bg-[#f5f2eb] px-1.5 py-0.5 text-[#171717]">
              v{manifest.schema_version}
            </span>
          </div>
        </div>
      </div>

      {/* Editorial Hero */}
      <header className="border-b border-[#d6d0c4] bg-[#fcfaf5]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="space-y-3 lg:col-span-8">
              <h1 className="font-serif text-3xl font-normal tracking-tight text-[#171717] sm:text-5xl sm:leading-[1.08]">
                Paraná Municipal GHG Baselines{" "}
                <span className="italic text-[#57534e]">&amp; Data-Gap Ledger</span>
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-[#57534e] sm:text-base">
                An open diagnostic of municipal emissions and climate vulnerability
                across all 399 cities in Paraná—separating{" "}
                <strong className="font-semibold text-[#171717]">data origin</strong>{" "}
                from{" "}
                <strong className="font-semibold text-[#171717]">
                  evidence verification
                </strong>
                , and exposing missing Scope 2 electricity explicitly instead of
                coercing it to zero.
              </p>
            </div>

            <div className="lg:col-span-4 lg:flex lg:justify-end">
              <details className="group w-full border border-[#d6d0c4] bg-[#f5f2eb] text-xs lg:max-w-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[#171717] transition hover:bg-[#ede8dc]">
                  <span>How to read provenance</span>
                  <ChevronDown className="h-3.5 w-3.5 text-[#57534e] transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-2.5 border-t border-[#d6d0c4] bg-[#fcfaf5] p-3.5 text-xs text-[#57534e]">
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 shrink-0 bg-[#1b4332]" />
                    <span>
                      <strong className="text-[#171717]">LOCAL</strong> — Municipal
                      utility, fuel, or weighbridge entry (entered locally;
                      requires evidence &amp; compatible boundary).
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 shrink-0 bg-[#1d4ed8]" />
                    <span>
                      <strong className="text-[#171717]">MODELED</strong> — SEEG
                      Coleção 14.0 AFOLU modeled via MapBiomas &amp; IBGE
                      PPM/PAM; AdaptaBrasil MCTI risk indices.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 shrink-0 bg-[#b45309]" />
                    <span>
                      <strong className="text-[#171717]">PROXY</strong> — Top-down
                      disaggregation from{" "}
                      <strong className="text-[#171717]">
                        SEEG Coleção 14.0
                      </strong>{" "}
                      (state/national Energy, Transport, Waste &amp; IPPU totals
                      allocated via population, fleet, or SNIS proxies).
                    </span>
                  </div>
                  <p className="border-t border-[#e7e2d8] pt-2 text-[11px] leading-snug text-[#78716c]">
                    Data origin is distinct from IPCC methodological Tiers (1/2/3)
                    and independent audit verification.
                  </p>
                </div>
              </details>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <CitySelectorClient municipalities={manifest.municipalities} />
      </main>
    </div>
  );
}
