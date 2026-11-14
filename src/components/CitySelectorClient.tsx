"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Search,
} from "lucide-react";
import {
  CityIndexEntry,
  GPC_SECTOR_CODES,
  GPCSectorCode,
} from "../../data/schema/city";
import { CoverageBadge, RiskClassBadge } from "./ConfidenceBadge";

const SECTOR_LABELS: Record<GPCSectorCode, string> = {
  STATIONARY_ENERGY: "Stationary Energy",
  TRANSPORTATION: "Transportation",
  WASTE: "Waste",
  IPPU: "IPPU",
  AFOLU: "AFOLU",
};

const SECTOR_BAR_COLORS: Record<GPCSectorCode, string> = {
  STATIONARY_ENERGY: "bg-[#334155]",
  TRANSPORTATION: "bg-[#b45309]",
  WASTE: "bg-[#1b4332]",
  IPPU: "bg-[#6d28d9]",
  AFOLU: "bg-[#0f766e]",
};

const FEATURED_IBGE_CODES = [
  "4106902", // Curitiba
  "4113700", // Londrina
  "4115200", // Maringá
  "4104808", // Cascavel
  "4119905", // Ponta Grossa
  "4108304", // Foz do Iguaçu
];

type RiskFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";
type MatrixLens = "RISK" | "PROXY" | "PER_CAPITA";
type SortField =
  | "name"
  | "population"
  | "emissions"
  | "per_capita"
  | "proxy"
  | "risk";
type SortDir = "asc" | "desc";

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getRiskBucket(
  entry: CityIndexEntry
): "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE" {
  const r = entry.top_climate_risk;
  if (!r || r.availability_status !== "AVAILABLE" || r.risk_index === null) {
    return "UNAVAILABLE";
  }
  if (r.risk_class === "VERY_HIGH" || r.risk_class === "HIGH") return "HIGH";
  if (r.risk_class === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function getTileColor(entry: CityIndexEntry, lens: MatrixLens): string {
  if (lens === "RISK") {
    const r = entry.top_climate_risk;
    if (!r || r.availability_status !== "AVAILABLE" || r.risk_index === null) {
      return "bg-[#e7e2d8]";
    }
    if (r.risk_class === "VERY_HIGH") return "bg-[#9a3412]";
    if (r.risk_class === "HIGH") return "bg-[#d97706]";
    if (r.risk_class === "MEDIUM") return "bg-[#eab308]";
    return "bg-[#1b4332]/75";
  }

  if (lens === "PROXY") {
    const p = entry.proxy_share_pct;
    if (p >= 75) return "bg-[#b45309]";
    if (p >= 50) return "bg-[#d97706]";
    if (p >= 25) return "bg-[#0284c7]";
    return "bg-[#1d4ed8]";
  }

  // PER_CAPITA
  const pc = entry.per_capita_tco2e;
  if (pc === null) return "bg-[#e7e2d8]";
  if (pc >= 20) return "bg-[#7c2d12]";
  if (pc >= 10) return "bg-[#b45309]";
  if (pc >= 4) return "bg-[#0f766e]";
  return "bg-[#1b4332]/50";
}

export function CitySelectorClient({
  municipalities,
}: {
  municipalities: CityIndexEntry[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("ALL");
  const [matrixLens, setMatrixLens] = useState<MatrixLens>("RISK");
  const [hoveredCity, setHoveredCity] = useState<CityIndexEntry | null>(null);
  const [sortField, setSortField] = useState<SortField>("emissions");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const maringa = useMemo(
    () => municipalities.find((m) => m.ibge_code === "4115200"),
    [municipalities]
  );

  const featuredCities = useMemo(() => {
    const byCode = new Map(municipalities.map((m) => [m.ibge_code, m]));
    return FEATURED_IBGE_CODES.map((code) => byCode.get(code)).filter(
      (c): c is CityIndexEntry => Boolean(c)
    );
  }, [municipalities]);

  // Deterministic Paraná Statewide KPI Rollup (excluding missing/null values from numerical sums)
  const statewide = useMemo(() => {
    let totalEmissions = 0;
    let totalPopulation = 0;
    let weightedT2 = 0;
    let weightedT3 = 0;
    let totalAbsForOrigin = 0;
    let highRiskCount = 0;
    let mediumRiskCount = 0;
    let lowRiskCount = 0;
    let unavailableRiskCount = 0;
    let partialCityCount = 0;
    let topEmitter: CityIndexEntry | null = null;
    let topPerCapita: CityIndexEntry | null = null;

    const sectorTotals: Record<GPCSectorCode, number> = {
      STATIONARY_ENERGY: 0,
      TRANSPORTATION: 0,
      WASTE: 0,
      IPPU: 0,
      AFOLU: 0,
    };

    for (const m of municipalities) {
      totalPopulation += m.population;
      if (m.coverage_status !== "COMPLETE") {
        partialCityCount += 1;
      }

      if (m.total_tco2e !== null) {
        totalEmissions += m.total_tco2e;
        const weight = Math.abs(m.total_tco2e);
        totalAbsForOrigin += weight;
        weightedT2 += weight * (m.modeled_share_pct / 100);
        weightedT3 += weight * (m.proxy_share_pct / 100);

        if (
          topEmitter === null ||
          (topEmitter.total_tco2e ?? -Infinity) < m.total_tco2e
        ) {
          topEmitter = m;
        }
      }

      if (m.per_capita_tco2e !== null) {
        if (
          topPerCapita === null ||
          (topPerCapita.per_capita_tco2e ?? -Infinity) < m.per_capita_tco2e
        ) {
          topPerCapita = m;
        }
      }

      const bucket = getRiskBucket(m);
      if (bucket === "HIGH") highRiskCount += 1;
      else if (bucket === "MEDIUM") mediumRiskCount += 1;
      else if (bucket === "LOW") lowRiskCount += 1;
      else unavailableRiskCount += 1;

      if (m.sector_totals) {
        for (const code of GPC_SECTOR_CODES) {
          const val = m.sector_totals[code];
          if (val !== null && val !== undefined) {
            sectorTotals[code] += val;
          }
        }
      }
    }

    const availableRiskCities = municipalities.length - unavailableRiskCount;
    const perCapitaAvg =
      totalPopulation > 0 ? totalEmissions / totalPopulation : 0;
    const modeledSharePct =
      totalAbsForOrigin > 0 ? (weightedT2 / totalAbsForOrigin) * 100 : 0;
    const proxySharePct =
      totalAbsForOrigin > 0 ? (weightedT3 / totalAbsForOrigin) * 100 : 0;
    const highRiskPct =
      availableRiskCities > 0 ? (highRiskCount / availableRiskCities) * 100 : 0;
    const maxAbsSector = Math.max(
      ...GPC_SECTOR_CODES.map((c) => Math.abs(sectorTotals[c])),
      1
    );

    return {
      totalEmissions,
      totalPopulation,
      perCapitaAvg,
      modeledSharePct,
      proxySharePct,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
      unavailableRiskCount,
      availableRiskCities,
      partialCityCount,
      highRiskPct,
      sectorTotals,
      maxAbsSector,
      topEmitter,
      topPerCapita,
    };
  }, [municipalities]);

  const matrixCities = useMemo(() => {
    return [...municipalities].sort((a, b) => {
      if (matrixLens === "RISK") {
        const ra =
          a.top_climate_risk?.availability_status === "AVAILABLE"
            ? (a.top_climate_risk.risk_index ?? -1)
            : -1;
        const rb =
          b.top_climate_risk?.availability_status === "AVAILABLE"
            ? (b.top_climate_risk.risk_index ?? -1)
            : -1;
        return rb - ra;
      }
      if (matrixLens === "PROXY") {
        return b.proxy_share_pct - a.proxy_share_pct;
      }
      return (b.per_capita_tco2e ?? -1) - (a.per_capita_tco2e ?? -1);
    });
  }, [municipalities, matrixLens]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "name" ? "asc" : "desc");
    }
  };

  const filteredAndSorted = useMemo(() => {
    const q = normalizeText(query);
    const filtered = municipalities.filter((m) => {
      if (riskFilter !== "ALL" && getRiskBucket(m) !== riskFilter) {
        return false;
      }
      if (!q) return true;
      return (
        normalizeText(m.name).includes(q) ||
        m.ibge_code.includes(q) ||
        normalizeText(`${m.name} ${m.state}`).includes(q)
      );
    });

    const mult = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "name":
          return mult * a.name.localeCompare(b.name, "pt-BR");
        case "population":
          return mult * (a.population - b.population);
        case "emissions": {
          if (a.total_tco2e === null && b.total_tco2e === null) return 0;
          if (a.total_tco2e === null) return 1;
          if (b.total_tco2e === null) return -1;
          return mult * (a.total_tco2e - b.total_tco2e);
        }
        case "per_capita": {
          if (a.per_capita_tco2e === null && b.per_capita_tco2e === null)
            return 0;
          if (a.per_capita_tco2e === null) return 1;
          if (b.per_capita_tco2e === null) return -1;
          return mult * (a.per_capita_tco2e - b.per_capita_tco2e);
        }
        case "proxy":
          return mult * (a.proxy_share_pct - b.proxy_share_pct);
        case "risk": {
          const ra =
            a.top_climate_risk?.availability_status === "AVAILABLE"
              ? a.top_climate_risk.risk_index
              : null;
          const rb =
            b.top_climate_risk?.availability_status === "AVAILABLE"
              ? b.top_climate_risk.risk_index
              : null;
          if (ra === null && rb === null) return 0;
          if (ra === null) return 1;
          if (rb === null) return -1;
          return mult * (ra - rb);
        }
      }
    });
  }, [municipalities, query, riskFilter, sortField, sortDir]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-[#a8a29e]" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-[#1b4332]" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-[#1b4332]" />
    );
  };

  return (
    <div className="space-y-10">
      {/* 1. Editorial Ledger KPI Strip */}
      <section aria-label="Paraná Statewide Overview" className="space-y-6">
        <div className="grid border border-[#d6d0c4] bg-[#fcfaf5] md:grid-cols-3 md:divide-x md:divide-[#d6d0c4]">
          {/* KPI 1: Total GHG */}
          <div className="border-b border-[#d6d0c4] p-6 md:border-b-0">
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-[#57534e]">
              <span>01 · Paraná Total GHG (2025)</span>
              {statewide.partialCityCount > 0 && (
                <CoverageBadge status="PARTIAL" />
              )}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-serif text-3xl font-normal tracking-tight tabular-nums text-[#171717] sm:text-4xl">
                {formatNumber(statewide.totalEmissions / 1_000_000, 2)}M
              </span>
              <span className="font-mono text-xs text-[#57534e]">tCO₂e</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#57534e]">
              <strong className="font-mono font-medium text-[#171717]">
                {formatNumber(statewide.perCapitaAvg, 2)} tCO₂e/hab
              </strong>{" "}
              across {formatNumber(statewide.totalPopulation)} residents.{" "}
              <span className="text-[#b45309]">
                {statewide.partialCityCount}/{municipalities.length} cities
                missing Scope 2 electricity.
              </span>
            </p>
          </div>

          {/* KPI 2: Origin Mix */}
          <div className="border-b border-[#d6d0c4] p-6 md:border-b-0">
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#57534e]">
              02 · Statewide Origin Mix
            </div>
            <div className="mt-3 flex items-baseline gap-4">
              <div>
                <span className="font-serif text-3xl font-normal tracking-tight tabular-nums text-[#b45309] sm:text-4xl">
                  {formatNumber(statewide.proxySharePct, 1)}%
                </span>
                <span className="ml-1.5 font-mono text-[11px] uppercase text-[#57534e]">
                  Proxy
                </span>
              </div>
              <div>
                <span className="font-serif text-2xl font-normal tracking-tight tabular-nums text-[#1d4ed8]">
                  {formatNumber(statewide.modeledSharePct, 1)}%
                </span>
                <span className="ml-1.5 font-mono text-[11px] uppercase text-[#57534e]">
                  Modeled
                </span>
              </div>
            </div>
            <div className="mt-3 flex h-2 w-full overflow-hidden bg-[#e7e2d8]">
              <div
                style={{ width: `${statewide.modeledSharePct}%` }}
                className="bg-[#1d4ed8]"
                title={`Origin Modeled: ${formatNumber(statewide.modeledSharePct, 1)}%`}
              />
              <div
                style={{ width: `${statewide.proxySharePct}%` }}
                className="bg-[#b45309]"
                title={`Origin Proxy: ${formatNumber(statewide.proxySharePct, 1)}%`}
              />
            </div>
            <p className="mt-2 text-xs text-[#57534e]">
              <strong className="font-mono font-medium text-[#171717]">
                0.0%
              </strong>{" "}
              Local origin in public baseline.
            </p>
          </div>

          {/* KPI 3: Climate Risk */}
          <div className="p-6">
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#57534e]">
              03 · High / Very High Climate Risk
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-serif text-3xl font-normal tracking-tight tabular-nums text-[#9a3412] sm:text-4xl">
                {statewide.highRiskCount}
              </span>
              <span className="font-mono text-xs text-[#57534e]">
                / {statewide.availableRiskCities} available (
                {formatNumber(statewide.highRiskPct, 1)}%)
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#57534e]">
              Cities with at least one{" "}
              <strong className="font-semibold text-[#171717]">HIGH</strong> or{" "}
              <strong className="font-semibold text-[#171717]">
                VERY_HIGH
              </strong>{" "}
              AdaptaBrasil MCTI risk index.
            </p>
          </div>
        </div>

        {/* 2. Interactive 399-Municipality Atlas Matrix + Sector Composition */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* 399-City Waffle Matrix */}
          <div className="border border-[#d6d0c4] bg-[#fcfaf5] p-5 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e2d8] pb-3">
              <div>
                <h2 className="font-serif text-lg font-medium text-[#171717]">
                  The 399-Municipality Atlas
                </h2>
                <p className="text-xs text-[#57534e]">
                  One cell per municipality, sorted high-to-low. Hover to
                  inspect, click to open diagnostic.
                </p>
              </div>
              <div className="flex border border-[#d6d0c4] bg-[#f5f2eb] p-0.5 font-mono text-[11px]">
                {(
                  [
                    { key: "RISK", label: "Risk" },
                    { key: "PROXY", label: "Proxy %" },
                    { key: "PER_CAPITA", label: "Per-Capita" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setMatrixLens(tab.key)}
                    className={`px-2.5 py-1 transition ${
                      matrixLens === tab.key
                        ? "bg-[#171717] text-[#fcfaf5]"
                        : "text-[#57534e] hover:text-[#171717]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Matrix Grid */}
            <div
              className="mt-4 grid gap-1"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(12px, 1fr))",
              }}
              onMouseLeave={() => setHoveredCity(null)}
            >
              {matrixCities.map((city) => (
                <button
                  key={city.ibge_code}
                  type="button"
                  onMouseEnter={() => setHoveredCity(city)}
                  onFocus={() => setHoveredCity(city)}
                  onClick={() => router.push(`/city/${city.ibge_code}`)}
                  aria-label={`${city.name} (${city.ibge_code})`}
                  className={`h-3 w-full transition-transform hover:z-10 hover:scale-150 hover:ring-1 hover:ring-[#171717] focus:outline-none focus:ring-1 focus:ring-[#171717] ${getTileColor(
                    city,
                    matrixLens
                  )}`}
                />
              ))}
            </div>

            {/* Readout & Legend Footer */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#e7e2d8] pt-3 text-xs">
              {hoveredCity ? (
                <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                  <span className="font-sans text-xs font-semibold text-[#171717]">
                    {hoveredCity.name}
                  </span>
                  <span className="text-[#57534e]">
                    {hoveredCity.ibge_code}
                  </span>
                  <span className="text-[#171717]">
                    {hoveredCity.total_tco2e !== null
                      ? `${formatNumber(hoveredCity.total_tco2e, 0)} tCO₂e`
                      : "N/A"}
                  </span>
                  <span className="text-[#b45309]">
                    {formatNumber(hoveredCity.proxy_share_pct, 0)}% Proxy
                  </span>
                  {hoveredCity.top_climate_risk?.availability_status ===
                    "AVAILABLE" &&
                    hoveredCity.top_climate_risk.risk_index !== null && (
                      <span className="text-[#9a3412]">
                        Risk{" "}
                        {hoveredCity.top_climate_risk.risk_index.toFixed(2)}
                      </span>
                    )}
                </div>
              ) : (
                <span className="font-mono text-[11px] text-[#78716c]">
                  Hover any cell to inspect municipality metrics
                </span>
              )}

              <div className="flex items-center gap-2 font-mono text-[10px] text-[#57534e]">
                {matrixLens === "RISK" && (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 bg-[#9a3412]" /> Very High
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 bg-[#d97706]" /> High
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 bg-[#eab308]" /> Med
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 bg-[#1b4332]/75" /> Low
                    </span>
                  </>
                )}
                {matrixLens === "PROXY" && (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 bg-[#b45309]" /> ≥75% Proxy
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 bg-[#d97706]" /> 50–74%
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 bg-[#0284c7]" /> 25–49%
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 bg-[#1d4ed8]" /> &lt;25%
                    </span>
                  </>
                )}
                {matrixLens === "PER_CAPITA" && (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 bg-[#7c2d12]" /> ≥20 t
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 bg-[#b45309]" /> 10–19 t
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 bg-[#0f766e]" /> 4–9 t
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 bg-[#1b4332]/50" /> &lt;4 t
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Statewide GPC Sector Composition */}
          <div className="flex flex-col justify-between border border-[#d6d0c4] bg-[#fcfaf5] p-5 lg:col-span-5">
            <div>
              <div className="border-b border-[#e7e2d8] pb-3">
                <h2 className="font-serif text-lg font-medium text-[#171717]">
                  GPC Sector Composition
                </h2>
                <p className="text-xs text-[#57534e]">
                  2025 partial coverage · Stationary Energy excludes Scope 2
                  electricity
                </p>
              </div>

              <div className="mt-4 space-y-3.5">
                {GPC_SECTOR_CODES.map((code) => {
                  const val = statewide.sectorTotals[code];
                  const share =
                    statewide.totalEmissions !== 0
                      ? (val / statewide.totalEmissions) * 100
                      : 0;
                  const widthPct = Math.min(
                    100,
                    (Math.abs(val) / statewide.maxAbsSector) * 100
                  );

                  return (
                    <div key={code} className="space-y-1">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-medium text-[#171717]">
                          {SECTOR_LABELS[code]}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-[#57534e]">
                          <strong className="font-semibold text-[#171717]">
                            {formatNumber(val / 1_000_000, 2)}M
                          </strong>{" "}
                          tCO₂e ({formatNumber(share, 1)}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-[#e7e2d8]">
                        <div
                          style={{
                            width: `${Math.max(widthPct, val !== 0 ? 2 : 0)}%`,
                          }}
                          className={`h-full ${SECTOR_BAR_COLORS[code]}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 border-t border-[#e7e2d8] pt-3 font-mono text-[11px] text-[#57534e]">
              Scope 2 blind spot:{" "}
              <span className="text-[#b45309]">
                grid_electricity is null across all 399 SEEG baselines
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Reference Benchmark & State Extremes Strip */}
      <section
        aria-label="Reference Benchmarks"
        className="grid border border-[#d6d0c4] bg-[#fcfaf5] md:grid-cols-3 md:divide-x md:divide-[#d6d0c4]"
      >
        {/* Pinned Maringá Reference */}
        {maringa && (
          <div className="border-b border-[#d6d0c4] bg-[#f0f4ef] p-5 md:border-b-0">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-[#1b4332]">
                Pinned Benchmark · {maringa.ibge_code}
              </span>
              <CoverageBadge status={maringa.coverage_status} />
            </div>
            <h3 className="mt-2 font-serif text-xl font-medium text-[#171717]">
              {maringa.name}, {maringa.state}
            </h3>
            <p className="mt-1 text-xs text-[#57534e]">
              Pop. {formatNumber(maringa.population)} ·{" "}
              <span className="font-mono text-[#171717]">
                {maringa.total_tco2e !== null
                  ? `${formatNumber(maringa.total_tco2e, 0)} tCO₂e`
                  : "N/A"}
              </span>{" "}
              ({formatNumber(maringa.proxy_share_pct, 1)}% Proxy)
            </p>
            <Link
              href={`/city/${maringa.ibge_code}`}
              className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#1b4332] underline-offset-4 hover:underline"
            >
              Open diagnostic
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {/* Highest Total Emissions */}
        {statewide.topEmitter && (
          <div className="border-b border-[#d6d0c4] p-5 md:border-b-0">
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#57534e]">
              Highest Total Emissions · {statewide.topEmitter.ibge_code}
            </div>
            <h3 className="mt-2 font-serif text-xl font-medium text-[#171717]">
              {statewide.topEmitter.name}, {statewide.topEmitter.state}
            </h3>
            <p className="mt-1 text-xs text-[#57534e]">
              <span className="font-mono font-semibold text-[#171717]">
                {statewide.topEmitter.total_tco2e !== null
                  ? `${formatNumber(statewide.topEmitter.total_tco2e, 0)} tCO₂e`
                  : "N/A"}
              </span>{" "}
              · Pop. {formatNumber(statewide.topEmitter.population)}
            </p>
            <Link
              href={`/city/${statewide.topEmitter.ibge_code}`}
              className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#171717] underline-offset-4 hover:underline"
            >
              Inspect baseline
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {/* Highest Per-Capita Emissions */}
        {statewide.topPerCapita && (
          <div className="p-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#57534e]">
              Highest Per-Capita · {statewide.topPerCapita.ibge_code}
            </div>
            <h3 className="mt-2 font-serif text-xl font-medium text-[#171717]">
              {statewide.topPerCapita.name}, {statewide.topPerCapita.state}
            </h3>
            <p className="mt-1 text-xs text-[#57534e]">
              <span className="font-mono font-semibold text-[#171717]">
                {statewide.topPerCapita.per_capita_tco2e !== null
                  ? `${formatNumber(statewide.topPerCapita.per_capita_tco2e, 2)} tCO₂e/hab`
                  : "N/A"}
              </span>{" "}
              · Pop. {formatNumber(statewide.topPerCapita.population)}
            </p>
            <Link
              href={`/city/${statewide.topPerCapita.ibge_code}`}
              className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#171717] underline-offset-4 hover:underline"
            >
              Inspect baseline
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </section>

      {/* 4. Interactive All-Cities Directory (All 399 Municipalities) */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716c]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all 399 Paraná municipalities by name (e.g. Maringá, Curitiba) or 7-digit IBGE code..."
              aria-label="Search municipalities by name or IBGE code"
              className="w-full border border-[#d6d0c4] bg-[#fcfaf5] py-2.5 pl-10 pr-4 text-sm text-[#171717] placeholder:text-[#a8a29e] focus:border-[#1b4332] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { key: "ALL", label: `All (${municipalities.length})` },
                { key: "HIGH", label: `High Risk (${statewide.highRiskCount})` },
                {
                  key: "MEDIUM",
                  label: `Medium (${statewide.mediumRiskCount})`,
                },
                { key: "LOW", label: `Low (${statewide.lowRiskCount})` },
                ...(statewide.unavailableRiskCount > 0
                  ? [
                      {
                        key: "UNAVAILABLE" as const,
                        label: `Unavailable (${statewide.unavailableRiskCount})`,
                      },
                    ]
                  : []),
              ] as const
            ).map((pill) => {
              const active = riskFilter === pill.key;
              return (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setRiskFilter(pill.key)}
                  className={`border px-3 py-2 font-mono text-[11px] font-medium transition ${
                    active
                      ? "border-[#171717] bg-[#171717] text-[#fcfaf5]"
                      : "border-[#d6d0c4] bg-[#fcfaf5] text-[#57534e] hover:border-[#171717] hover:text-[#171717]"
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick-Jump Major Cities */}
        {featuredCities.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#78716c]">
              Quick jump:
            </span>
            {featuredCities.map((c) => (
              <Link
                key={c.ibge_code}
                href={`/city/${c.ibge_code}`}
                className="border border-[#d6d0c4] bg-[#fcfaf5] px-2.5 py-1 font-mono text-[11px] text-[#171717] transition hover:border-[#1b4332] hover:bg-[#f0f4ef]"
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[#57534e]">
          <span>
            Showing{" "}
            <strong className="text-[#171717]">
              {filteredAndSorted.length}
            </strong>{" "}
            of <strong className="text-[#171717]">{municipalities.length}</strong>{" "}
            municipalities
          </span>
          <span>
            Select any row to open its diagnostic &amp; boundary-aware override
            workbench
          </span>
        </div>

        {filteredAndSorted.length === 0 ? (
          <div className="border border-dashed border-[#d6d0c4] bg-[#fcfaf5] p-10 text-center">
            <Building2 className="mx-auto h-7 w-7 text-[#a8a29e]" />
            <p className="mt-2 text-sm font-medium text-[#171717]">
              No municipalities matched &ldquo;{query}&rdquo;
            </p>
            <p className="mt-1 text-xs text-[#57534e]">
              Try clearing the risk filter or searching by city name without
              accents.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#d6d0c4] bg-[#fcfaf5]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-[#d6d0c4] bg-[#f5f2eb] font-mono text-[11px] font-medium uppercase tracking-wider text-[#57534e]">
                <tr>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("name")}
                      className="inline-flex items-center gap-1.5 hover:text-[#171717]"
                    >
                      Municipality &amp; IBGE
                      {renderSortIcon("name")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("population")}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-[#171717]"
                    >
                      Population
                      {renderSortIcon("population")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("emissions")}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-[#171717]"
                    >
                      Total (tCO₂e)
                      {renderSortIcon("emissions")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("per_capita")}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-[#171717]"
                    >
                      Per-Capita
                      {renderSortIcon("per_capita")}
                    </button>
                  </th>
                  <th className="px-4 py-3">Sector Mix</th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("proxy")}
                      className="inline-flex items-center gap-1.5 hover:text-[#171717]"
                    >
                      Origin Mix
                      {renderSortIcon("proxy")}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("risk")}
                      className="inline-flex items-center gap-1.5 hover:text-[#171717]"
                    >
                      Top AdaptaBrasil Risk
                      {renderSortIcon("risk")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e7e2d8]">
                {filteredAndSorted.map((city) => {
                  const absSectorSum = city.sector_totals
                    ? GPC_SECTOR_CODES.reduce(
                        (acc, code) =>
                          acc + Math.abs(city.sector_totals?.[code] ?? 0),
                        0
                      )
                    : 0;

                  return (
                    <tr
                      key={city.ibge_code}
                      onClick={() => router.push(`/city/${city.ibge_code}`)}
                      className="cursor-pointer transition hover:bg-[#f0f4ef]/70"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/city/${city.ibge_code}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-[#171717] hover:text-[#1b4332]"
                        >
                          {city.name}
                        </Link>
                        <div className="font-mono text-[11px] text-[#78716c]">
                          {city.ibge_code} · {city.state}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[#57534e]">
                        {formatNumber(city.population)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[#171717]">
                        {city.total_tco2e !== null ? (
                          <div>
                            {formatNumber(city.total_tco2e, 0)}
                            {city.coverage_status === "PARTIAL" && (
                              <span className="ml-1 text-[10px] font-normal text-[#b45309]">
                                (partial)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs font-normal text-[#78716c]">
                            Data unavailable
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[#57534e]">
                        {city.per_capita_tco2e !== null
                          ? formatNumber(city.per_capita_tco2e, 2)
                          : "Data unavailable"}
                      </td>
                      <td className="px-4 py-3">
                        {absSectorSum > 0 && city.sector_totals ? (
                          <div
                            className="flex h-2 w-24 overflow-hidden bg-[#e7e2d8]"
                            title={GPC_SECTOR_CODES.map(
                              (c) =>
                                `${SECTOR_LABELS[c]}: ${formatNumber(city.sector_totals?.[c] ?? 0, 0)} tCO₂e`
                            ).join(" | ")}
                          >
                            {GPC_SECTOR_CODES.map((code) => {
                              const val = Math.abs(
                                city.sector_totals?.[code] ?? 0
                              );
                              const pct = (val / absSectorSum) * 100;
                              if (pct <= 0) return null;
                              return (
                                <div
                                  key={code}
                                  style={{ width: `${pct}%` }}
                                  className={SECTOR_BAR_COLORS[code]}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          <span className="font-mono text-[11px] text-[#a8a29e]">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-mono text-[11px]">
                            <span className="text-[#1d4ed8]">
                              {formatNumber(city.modeled_share_pct, 0)}%M
                            </span>
                            <span className="text-[#d6d0c4]">/</span>
                            <span className="text-[#b45309]">
                              {formatNumber(city.proxy_share_pct, 0)}%P
                            </span>
                          </div>
                          <div className="flex h-1 w-20 overflow-hidden bg-[#e7e2d8]">
                            <div
                              style={{ width: `${city.modeled_share_pct}%` }}
                              className="bg-[#1d4ed8]"
                            />
                            <div
                              style={{ width: `${city.proxy_share_pct}%` }}
                              className="bg-[#b45309]"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {city.top_climate_risk &&
                        city.top_climate_risk.availability_status ===
                          "AVAILABLE" &&
                        city.top_climate_risk.risk_index !== null ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold tabular-nums text-[#171717]">
                              {city.top_climate_risk.risk_index.toFixed(2)}
                            </span>
                            <RiskClassBadge
                              riskClass={city.top_climate_risk.risk_class}
                              availabilityStatus={
                                city.top_climate_risk.availability_status
                              }
                            />
                          </div>
                        ) : (
                          <RiskClassBadge
                            riskClass={null}
                            availabilityStatus="UNAVAILABLE"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
