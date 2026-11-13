"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Building2,
  Database,
  Search,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  CityIndexEntry,
  GPC_SECTOR_CODES,
  GPCSectorCode,
} from "../../data/schema/city";
import { ConfidenceBadge, RiskClassBadge } from "./ConfidenceBadge";

const SECTOR_LABELS: Record<GPCSectorCode, string> = {
  STATIONARY_ENERGY: "Stationary Energy",
  TRANSPORTATION: "Transportation",
  WASTE: "Waste",
  IPPU: "IPPU",
  AFOLU: "AFOLU",
};

const SECTOR_BAR_COLORS: Record<GPCSectorCode, string> = {
  STATIONARY_ENERGY: "bg-indigo-500",
  TRANSPORTATION: "bg-amber-500",
  WASTE: "bg-emerald-600",
  IPPU: "bg-purple-500",
  AFOLU: "bg-teal-600",
};

type RiskFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW";
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

function getRiskBucket(entry: CityIndexEntry): "HIGH" | "MEDIUM" | "LOW" {
  const rc = entry.top_climate_risk?.risk_class;
  if (rc === "VERY_HIGH" || rc === "HIGH") return "HIGH";
  if (rc === "MEDIUM") return "MEDIUM";
  return "LOW";
}

export function CitySelectorClient({
  municipalities,
}: {
  municipalities: CityIndexEntry[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("ALL");
  const [sortField, setSortField] = useState<SortField>("emissions");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const maringa = useMemo(
    () => municipalities.find((m) => m.ibge_code === "4115200"),
    [municipalities]
  );

  // Deterministic Paraná Statewide KPI Rollup
  const statewide = useMemo(() => {
    let totalEmissions = 0;
    let totalPopulation = 0;
    let weightedT2 = 0;
    let weightedT3 = 0;
    let totalAbsForTier = 0;
    let highRiskCount = 0;
    let mediumRiskCount = 0;
    let lowRiskCount = 0;

    const sectorTotals: Record<GPCSectorCode, number> = {
      STATIONARY_ENERGY: 0,
      TRANSPORTATION: 0,
      WASTE: 0,
      IPPU: 0,
      AFOLU: 0,
    };

    for (const m of municipalities) {
      totalEmissions += m.total_tco2e;
      totalPopulation += m.population;

      const weight = Math.abs(m.total_tco2e);
      totalAbsForTier += weight;
      weightedT2 += weight * (m.modeled_share_pct / 100);
      weightedT3 += weight * (m.proxy_share_pct / 100);

      const bucket = getRiskBucket(m);
      if (bucket === "HIGH") highRiskCount += 1;
      else if (bucket === "MEDIUM") mediumRiskCount += 1;
      else lowRiskCount += 1;

      if (m.sector_totals) {
        for (const code of GPC_SECTOR_CODES) {
          sectorTotals[code] += m.sector_totals[code] ?? 0;
        }
      }
    }

    const perCapitaAvg =
      totalPopulation > 0 ? totalEmissions / totalPopulation : 0;
    const t2SharePct =
      totalAbsForTier > 0 ? (weightedT2 / totalAbsForTier) * 100 : 0;
    const t3SharePct =
      totalAbsForTier > 0 ? (weightedT3 / totalAbsForTier) * 100 : 0;
    const highRiskPct =
      municipalities.length > 0
        ? (highRiskCount / municipalities.length) * 100
        : 0;
    const maxAbsSector = Math.max(
      ...GPC_SECTOR_CODES.map((c) => Math.abs(sectorTotals[c])),
      1
    );

    return {
      totalEmissions,
      totalPopulation,
      perCapitaAvg,
      t2SharePct,
      t3SharePct,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
      highRiskPct,
      sectorTotals,
      maxAbsSector,
    };
  }, [municipalities]);

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
        case "emissions":
          return mult * (a.total_tco2e - b.total_tco2e);
        case "per_capita":
          return mult * (a.per_capita_tco2e - b.per_capita_tco2e);
        case "proxy":
          return mult * (a.proxy_share_pct - b.proxy_share_pct);
        case "risk":
          return (
            mult *
            ((a.top_climate_risk?.risk_index ?? 0) -
              (b.top_climate_risk?.risk_index ?? 0))
          );
      }
    });
  }, [municipalities, query, riskFilter, sortField, sortDir]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-emerald-700" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-emerald-700" />
    );
  };

  return (
    <div className="space-y-8">
      {/* 1. Paraná Statewide KPI Rollup */}
      <section aria-label="Paraná Statewide Overview" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Total Statewide GHG */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span>Paraná Total GHG (2025)</span>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
              {formatNumber(statewide.totalEmissions, 0)}{" "}
              <span className="text-xs font-normal text-slate-500">tCO₂e</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Statewide avg:{" "}
              <strong className="font-mono text-slate-800">
                {formatNumber(statewide.perCapitaAvg, 2)} tCO₂e/hab
              </strong>{" "}
              across {formatNumber(statewide.totalPopulation)} residents (
              {municipalities.length} cities)
            </p>
          </div>

          {/* Statewide Data Provenance */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span>Statewide Provenance Mix</span>
              <Database className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-2xl font-bold tabular-nums text-amber-700">
                {formatNumber(statewide.t3SharePct, 1)}%{" "}
                <span className="text-xs font-normal text-slate-500">
                  T3 Proxy
                </span>
              </span>
              <span className="text-lg font-bold tabular-nums text-sky-700">
                {formatNumber(statewide.t2SharePct, 1)}%{" "}
                <span className="text-xs font-normal text-slate-500">
                  T2 Modeled
                </span>
              </span>
            </div>
            <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                style={{ width: `${statewide.t2SharePct}%` }}
                className="bg-sky-500"
                title={`T2 Modeled: ${formatNumber(statewide.t2SharePct, 1)}%`}
              />
              <div
                style={{ width: `${statewide.t3SharePct}%` }}
                className="bg-amber-400"
                title={`T3 Proxy: ${formatNumber(statewide.t3SharePct, 1)}%`}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              0.0% T1_LOCAL verified in public baseline; local overrides run
              client-side per city.
            </p>
          </div>

          {/* Climate Vulnerability Exposure */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span>High / Very High Climate Risk</span>
              <ShieldAlert className="h-4 w-4 text-orange-600" />
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-orange-700">
              {statewide.highRiskCount}{" "}
              <span className="text-sm font-semibold text-slate-500">
                / {municipalities.length} cities (
                {formatNumber(statewide.highRiskPct, 1)}%)
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Municipalities with at least one{" "}
              <strong className="text-slate-800">HIGH</strong> or{" "}
              <strong className="text-slate-800">VERY_HIGH</strong> AdaptaBrasil
              MCTI risk index.
            </p>
          </div>
        </div>

        {/* Statewide Sector Composition */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Paraná Statewide GPC Sector Composition (2025)
              </h2>
            </div>
            <span className="text-xs text-slate-500">
              Aggregated across all {municipalities.length} municipalities
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
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
                <div
                  key={code}
                  className="rounded-xl border border-slate-100 bg-slate-50/80 p-3"
                >
                  <div className="text-[11px] font-semibold text-slate-600">
                    {SECTOR_LABELS[code]}
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-900">
                    {formatNumber(val / 1_000_000, 2)}M{" "}
                    <span className="text-[10px] font-normal text-slate-500">
                      tCO₂e
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      style={{ width: `${Math.max(widthPct, val !== 0 ? 3 : 0)}%` }}
                      className={`h-full rounded-full ${SECTOR_BAR_COLORS[code]}`}
                    />
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-500">
                    {formatNumber(share, 1)}% of PR
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 2. Pinned Reference Benchmark Card for Maringá (4115200) */}
      {maringa && (
        <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 via-white to-slate-50 p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-0.5 text-xs font-semibold text-white">
                  Pinned Reference Benchmark
                </span>
                <span className="font-mono text-xs text-slate-500">
                  IBGE {maringa.ibge_code}
                </span>
                <ConfidenceBadge tier={maringa.primary_confidence_tier} />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                {maringa.name} — {maringa.state}
              </h2>
              <p className="text-sm text-slate-600">
                Population {formatNumber(maringa.population)} (IBGE Censo{" "}
                {maringa.population_year}) • Dominant sector:{" "}
                <span className="font-medium text-slate-800">
                  {SECTOR_LABELS[maringa.dominant_sector]}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Total Baseline
                </div>
                <div className="text-xl font-bold tabular-nums text-slate-900">
                  {formatNumber(maringa.total_tco2e, 0)}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    tCO₂e
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {formatNumber(maringa.per_capita_tco2e, 2)} tCO₂e/hab
                </div>
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Proxy vs. Modeled
                </div>
                <div className="text-xl font-bold tabular-nums text-amber-700">
                  {formatNumber(maringa.proxy_share_pct, 1)}%{" "}
                  <span className="text-xs font-normal text-slate-500">
                    Proxy
                  </span>
                </div>
                <div className="text-xs text-sky-700">
                  {formatNumber(maringa.modeled_share_pct, 1)}% Modeled
                </div>
              </div>

              <Link
                href={`/city/${maringa.ibge_code}`}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Open Diagnostic
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* 3. Interactive All-Cities Explorer (All 399 Municipalities) */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all 399 Paraná municipalities by name (e.g. Maringa, Curitiba, Londrina) or 7-digit IBGE code..."
              aria-label="Search municipalities by name or IBGE code"
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            />
          </div>

          {/* Risk Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                {
                  key: "ALL",
                  label: `All (${municipalities.length})`,
                },
                {
                  key: "HIGH",
                  label: `HIGH Risk (${statewide.highRiskCount})`,
                },
                {
                  key: "MEDIUM",
                  label: `MEDIUM Risk (${statewide.mediumRiskCount})`,
                },
                {
                  key: "LOW",
                  label: `LOW Risk (${statewide.lowRiskCount})`,
                },
              ] as const
            ).map((pill) => {
              const active = riskFilter === pill.key;
              return (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setRiskFilter(pill.key)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border-emerald-700 bg-emerald-700 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing{" "}
            <strong className="text-slate-800">
              {filteredAndSorted.length}
            </strong>{" "}
            of <strong className="text-slate-800">{municipalities.length}</strong>{" "}
            Paraná municipalities
          </span>
          <span>Click any row to open its full diagnostic &amp; override workbench</span>
        </div>

        {filteredAndSorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Building2 className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-slate-700">
              No municipalities matched &ldquo;{query}&rdquo;
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Try clearing the risk filter or searching by city name without
              accents.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("name")}
                      className="inline-flex items-center gap-1.5 hover:text-slate-900"
                    >
                      Municipality &amp; IBGE
                      {renderSortIcon("name")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("population")}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-slate-900"
                    >
                      Population
                      {renderSortIcon("population")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("emissions")}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-slate-900"
                    >
                      Total (tCO₂e)
                      {renderSortIcon("emissions")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("per_capita")}
                      className="inline-flex items-center justify-end gap-1.5 hover:text-slate-900"
                    >
                      Per-Capita
                      {renderSortIcon("per_capita")}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("proxy")}
                      className="inline-flex items-center gap-1.5 hover:text-slate-900"
                    >
                      Provenance Mix
                      {renderSortIcon("proxy")}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("risk")}
                      className="inline-flex items-center gap-1.5 hover:text-slate-900"
                    >
                      Top AdaptaBrasil Risk
                      {renderSortIcon("risk")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSorted.map((city) => (
                  <tr
                    key={city.ibge_code}
                    onClick={() => router.push(`/city/${city.ibge_code}`)}
                    className="cursor-pointer transition hover:bg-emerald-50/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/city/${city.ibge_code}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-slate-900 hover:text-emerald-700"
                      >
                        {city.name} — {city.state}
                      </Link>
                      <div className="font-mono text-xs text-slate-500">
                        {city.ibge_code}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-700">
                      {formatNumber(city.population)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                      {formatNumber(city.total_tco2e, 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-600">
                      {formatNumber(city.per_capita_tco2e, 2)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-medium text-sky-700">
                          {formatNumber(city.modeled_share_pct, 0)}% T2
                        </span>
                        <span className="text-slate-300">/</span>
                        <span className="font-mono font-medium text-amber-700">
                          {formatNumber(city.proxy_share_pct, 0)}% T3
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {city.top_climate_risk ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold tabular-nums text-slate-800">
                            {city.top_climate_risk.risk_index.toFixed(2)}
                          </span>
                          <RiskClassBadge
                            riskClass={city.top_climate_risk.risk_class}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
