"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Database,
  Download,
  FileCheck2,
  Info,
  Printer,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import {
  CityClimateRecord,
  GPC_SECTOR_CODES,
  GPCSectorCode,
  LocalOverride,
  validateLocalOverride,
} from "../../data/schema/city";
import {
  applyLocalOverrides,
  BRAZIL_EMISSION_FACTORS,
} from "../lib/emissionsCalculator";
import {
  ConfidenceBadge,
  getRiskBarClass,
  RiskClassBadge,
} from "./ConfidenceBadge";
import { LocalOverrideDrawer } from "./LocalOverrideDrawer";

function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDeltaPct(baseVal: number, nextVal: number): string {
  if (baseVal === 0) {
    return nextVal === 0 ? "0.0%" : "+∞%";
  }
  const pct = ((nextVal - baseVal) / Math.abs(baseVal)) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

const SECTOR_COLORS: Record<GPCSectorCode, string> = {
  STATIONARY_ENERGY: "bg-indigo-500",
  TRANSPORTATION: "bg-amber-500",
  WASTE: "bg-emerald-600",
  IPPU: "bg-purple-500",
  AFOLU: "bg-teal-600",
};

const OVERRIDE_STORAGE_PREFIX = "climate-lens:override:";

export function CityDiagnosticClient({ city: baseCity }: { city: CityClimateRecord }) {
  const storageKey = `${OVERRIDE_STORAGE_PREFIX}${baseCity.metadata.ibge_code}`;

  const [override, setOverride] = useState<LocalOverride | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [expandedSectors, setExpandedSectors] = useState<
    Record<GPCSectorCode, boolean>
  >({
    STATIONARY_ENERGY: true,
    TRANSPORTATION: true,
    WASTE: false,
    IPPU: false,
    AFOLU: false,
  });

  const [checkedGaps, setCheckedGaps] = useState<Record<string, boolean>>({});

  // Hydrate persisted LocalOverride from localStorage
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (validateLocalOverride(parsed).valid) {
          setOverride(parsed as LocalOverride);
        }
      }
    } catch {
      // Ignore malformed localStorage state
    }
  }, [storageKey]);

  const activeCity = useMemo(() => {
    if (!override) return baseCity;
    try {
      return applyLocalOverrides(baseCity, override);
    } catch {
      return baseCity;
    }
  }, [baseCity, override]);

  const hasActiveOverride =
    override !== null &&
    Boolean(
      override.electricity || override.fleet_fuels || override.solid_waste
    );

  const handleSaveOverride = (next: LocalOverride) => {
    setOverride(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  };

  const handleResetOverride = () => {
    setOverride(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage errors
    }
  };

  const handleExportAuditJson = () => {
    const auditPackage = {
      package_type: "municipal_climate_lens_audit",
      schema_version: activeCity.schema_version,
      exported_at: new Date().toISOString(),
      ibge_code: activeCity.metadata.ibge_code,
      municipality: `${activeCity.metadata.name} - ${activeCity.metadata.state}`,
      emission_factors_used: BRAZIL_EMISSION_FACTORS,
      applied_overrides: override,
      base_record: baseCity,
      recalculated_record: activeCity,
    };

    const blob = new Blob([JSON.stringify(auditPackage, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `climate-lens-audit-${activeCity.metadata.ibge_code}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrintBrief = () => {
    window.print();
  };

  const toggleSector = (code: GPCSectorCode) => {
    setExpandedSectors((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const toggleGap = (key: string) => {
    setCheckedGaps((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const { metadata, emissions_summary, sectors, climate_risks } = activeCity;
  const { tier_breakdown } = emissions_summary;

  const t1Pct = tier_breakdown.T1_LOCAL_share * 100;
  const t2Pct = tier_breakdown.T2_MODELED_share * 100;
  const t3Pct = tier_breakdown.T3_PROXY_share * 100;

  const maxAbsSector = Math.max(
    ...GPC_SECTOR_CODES.map((c) => Math.abs(sectors[c].emissions_tco2e)),
    1
  );

  // Collect all T2_MODELED and T3_PROXY subsectors for the actionable checklist
  const gapItems = GPC_SECTOR_CODES.flatMap((sectorCode) =>
    sectors[sectorCode].subsectors
      .filter((sub) => sub.confidence_tier !== "T1_LOCAL")
      .map((sub) => ({
        id: `${sectorCode}:${sub.subsector_key}`,
        sectorCode,
        sectorName: sectors[sectorCode].sector_name,
        subsector: sub,
      }))
  );

  const missingRiskCount = climate_risks.filter(
    (r) =>
      r.data_source.toLowerCase().includes("missing") ||
      r.data_source.toLowerCase().includes("unavailable")
  ).length;

  return (
    <div className="space-y-8">
      {/* Top Navigation & Municipality Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Link
            href="/"
            className="no-print inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-emerald-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to all 399 Paraná municipalities
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {metadata.name} — {metadata.state}
            </h1>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-700">
              IBGE {metadata.ibge_code}
            </span>
            {hasActiveOverride && (
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                Local Overrides Active
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            Population:{" "}
            <strong className="text-slate-800">
              {formatNumber(metadata.population, 0)}
            </strong>{" "}
            (Censo {metadata.population_year})
            {metadata.area_km2 ? (
              <>
                {" "}
                • Area:{" "}
                <strong className="text-slate-800">
                  {formatNumber(metadata.area_km2, 1)} km²
                </strong>
              </>
            ) : null}
            {metadata.biome ? (
              <>
                {" "}
                • Biome:{" "}
                <strong className="text-slate-800">{metadata.biome}</strong>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          {/* Action Toolbar */}
          <div className="no-print flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-800"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {hasActiveOverride ? "Edit Local Data" : "Input Local Data"}
            </button>

            {hasActiveOverride && (
              <button
                type="button"
                onClick={handleResetOverride}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to Public Baseline
              </button>
            )}

            <button
              type="button"
              onClick={handleExportAuditJson}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export Audit JSON
            </button>

            <button
              type="button"
              onClick={handlePrintBrief}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF Brief
            </button>
          </div>

          <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {hasActiveOverride ? "Recalculated Total" : "Baseline Emissions"}{" "}
                ({emissions_summary.reference_year})
              </div>
              <div className="text-2xl font-bold tabular-nums text-slate-900">
                {formatNumber(emissions_summary.total_emissions_tco2e, 2)}{" "}
                <span className="text-xs font-normal text-slate-500">
                  tCO₂e
                </span>
              </div>
            </div>
            <div className="border-l border-slate-200 pl-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Per Capita
              </div>
              <div className="text-2xl font-bold tabular-nums text-slate-900">
                {formatNumber(emissions_summary.per_capita_tco2e, 2)}{" "}
                <span className="text-xs font-normal text-slate-500">
                  tCO₂e/hab
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Comparison Card (when Local Overrides are Active) */}
      {hasActiveOverride && (
        <section className="print-break-inside-avoid rounded-2xl border border-emerald-300 bg-emerald-50/50 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-900">
              Audit Comparison: Original Public Estimate vs. Local Verified
              Value
            </h2>
            <span className="font-mono text-xs text-emerald-800">
              Total Delta:{" "}
              <strong>
                {formatDeltaPct(
                  baseCity.emissions_summary.total_emissions_tco2e,
                  activeCity.emissions_summary.total_emissions_tco2e
                )}
              </strong>
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-emerald-200 bg-white p-3">
              <div className="text-[11px] font-semibold text-slate-500">
                City Total
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Public:{" "}
                <span className="font-mono">
                  {formatNumber(
                    baseCity.emissions_summary.total_emissions_tco2e,
                    2
                  )}
                </span>
              </div>
              <div className="text-sm font-bold text-slate-900">
                Local:{" "}
                <span className="font-mono">
                  {formatNumber(
                    activeCity.emissions_summary.total_emissions_tco2e,
                    2
                  )}
                </span>{" "}
                <span className="text-xs font-semibold text-emerald-700">
                  (
                  {formatDeltaPct(
                    baseCity.emissions_summary.total_emissions_tco2e,
                    activeCity.emissions_summary.total_emissions_tco2e
                  )}
                  )
                </span>
              </div>
            </div>

            {(
              ["STATIONARY_ENERGY", "TRANSPORTATION", "WASTE"] as GPCSectorCode[]
            ).map((code) => {
              const baseVal = baseCity.sectors[code].emissions_tco2e;
              const nextVal = activeCity.sectors[code].emissions_tco2e;
              const changed = Math.abs(nextVal - baseVal) > 0.01;
              return (
                <div
                  key={code}
                  className={`rounded-xl border p-3 ${
                    changed
                      ? "border-emerald-200 bg-white"
                      : "border-slate-200 bg-white/60 opacity-75"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-600">
                      {activeCity.sectors[code].sector_name}
                    </span>
                    <ConfidenceBadge
                      tier={activeCity.sectors[code].confidence_tier}
                      compact
                    />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Public: <span className="font-mono">{formatNumber(baseVal, 2)}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    Local: <span className="font-mono">{formatNumber(nextVal, 2)}</span>{" "}
                    <span className="text-xs font-semibold text-emerald-700">
                      ({formatDeltaPct(baseVal, nextVal)})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 1. Data Trust & Provenance Banner */}
      <section className="print-break-inside-avoid rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-amber-600" />
              <h2 className="text-lg font-bold text-slate-900">
                Data Trust &amp; Provenance Banner
              </h2>
            </div>
            <p className="max-w-3xl text-sm text-slate-600">
              Share of total absolute GHG emissions by provenance tier.{" "}
              {t1Pct > 0 ? (
                <strong className="text-emerald-800">
                  {formatNumber(t1Pct, 1)}% is now verified with local T1_LOCAL
                  records
                </strong>
              ) : (
                <strong className="text-amber-800">
                  {formatNumber(t3Pct, 1)}% of {metadata.name}&rsquo;s baseline
                </strong>
              )}{" "}
              {t1Pct > 0
                ? `(${formatNumber(t3Pct, 1)}% remains T3_PROXY).`
                : "relies on national/state proxy disaggregations (T3_PROXY) rather than verified municipal utility, fuel, or landfill records."}
            </p>
          </div>
          <div className="shrink-0 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
            {gapItems.length} subsectors need local verification
          </div>
        </div>

        {/* Stacked Provenance Bar */}
        <div className="mt-5">
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
            {t1Pct > 0 && (
              <div
                style={{ width: `${t1Pct}%` }}
                className="bg-emerald-500 transition-all"
                title={`T1 Local Verified: ${formatNumber(t1Pct, 1)}%`}
              />
            )}
            {t2Pct > 0 && (
              <div
                style={{ width: `${t2Pct}%` }}
                className="bg-sky-500 transition-all"
                title={`T2 Spatially Modeled: ${formatNumber(t2Pct, 1)}%`}
              />
            )}
            {t3Pct > 0 && (
              <div
                style={{ width: `${t3Pct}%` }}
                className="bg-amber-400 transition-all"
                title={`T3 National Proxy: ${formatNumber(t3Pct, 1)}%`}
              />
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
              <div className="flex items-center justify-between">
                <ConfidenceBadge tier="T1_LOCAL" />
                <span className="text-lg font-bold tabular-nums text-emerald-900">
                  {formatNumber(t1Pct, 1)}%
                </span>
              </div>
              <p className="mt-1.5 text-xs text-emerald-800">
                Primary municipal meter, fuel sales, or weighbridge records.
              </p>
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3.5">
              <div className="flex items-center justify-between">
                <ConfidenceBadge tier="T2_MODELED" />
                <span className="text-lg font-bold tabular-nums text-sky-900">
                  {formatNumber(t2Pct, 1)}%
                </span>
              </div>
              <p className="mt-1.5 text-xs text-sky-800">
                Spatially modeled (MapBiomas 30m land-use &amp; IBGE agricultural
                census).
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
              <div className="flex items-center justify-between">
                <ConfidenceBadge tier="T3_PROXY" />
                <span className="text-lg font-bold tabular-nums text-amber-900">
                  {formatNumber(t3Pct, 1)}%
                </span>
              </div>
              <p className="mt-1.5 text-xs text-amber-800">
                State/national top-down disaggregation awaiting local records.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. GPC Emissions Breakdown */}
      <section className="print-break-inside-avoid rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              GPC-Aligned GHG Emissions Breakdown
            </h2>
            <p className="text-sm text-slate-600">
              SEEG Municípios Coleção 14.0 (GWP-AR5,{" "}
              {emissions_summary.reference_year}) mapped into the 5 GPC sectors.
              Click any sector row to inspect subsectors and methodology notes.
            </p>
          </div>
        </div>

        {/* Horizontal Bar Chart */}
        <div className="mb-8 space-y-3 rounded-xl bg-slate-50 p-4">
          {GPC_SECTOR_CODES.map((code) => {
            const sec = sectors[code];
            const widthPct = Math.min(
              100,
              (Math.abs(sec.emissions_tco2e) / maxAbsSector) * 100
            );
            const sharePct =
              emissions_summary.total_emissions_tco2e !== 0
                ? (sec.emissions_tco2e /
                    emissions_summary.total_emissions_tco2e) *
                  100
                : 0;

            return (
              <div key={code} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">
                      {sec.sector_name}
                    </span>
                    <ConfidenceBadge tier={sec.confidence_tier} compact />
                  </div>
                  <div className="font-mono tabular-nums text-slate-700">
                    <strong>{formatNumber(sec.emissions_tco2e, 2)}</strong>{" "}
                    tCO₂e ({formatNumber(sharePct, 1)}%)
                  </div>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    style={{
                      width: `${Math.max(widthPct, sec.emissions_tco2e !== 0 ? 1.5 : 0)}%`,
                    }}
                    className={`h-full rounded-full ${SECTOR_COLORS[code]}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Expandable Sector / Subsector Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-4 py-3">Sector / Subsector</th>
                <th className="px-4 py-3 text-right">Emissions (tCO₂e)</th>
                <th className="px-4 py-3 text-right">Share</th>
                <th className="px-4 py-3">Provenance Tier</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Data Source &amp; Methodology</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {GPC_SECTOR_CODES.map((code) => {
                const sec = sectors[code];
                const isExpanded = expandedSectors[code];
                const secShare =
                  emissions_summary.total_emissions_tco2e !== 0
                    ? (sec.emissions_tco2e /
                        emissions_summary.total_emissions_tco2e) *
                      100
                    : 0;

                return (
                  <React.Fragment key={code}>
                    <tr
                      onClick={() => toggleSector(code)}
                      className="cursor-pointer bg-white transition hover:bg-slate-50"
                    >
                      <td className="px-4 py-3.5 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="no-print h-4 w-4 text-slate-500" />
                          ) : (
                            <ChevronRight className="no-print h-4 w-4 text-slate-500" />
                          )}
                          <span>{sec.sector_name}</span>
                          <span className="font-mono text-[11px] font-normal text-slate-400">
                            ({sec.subsectors.length})
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {formatNumber(sec.emissions_tco2e, 2)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-600">
                        {formatNumber(secShare, 1)}%
                      </td>
                      <td className="px-4 py-3.5">
                        <ConfidenceBadge tier={sec.confidence_tier} compact />
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-600">
                        {sec.reference_year}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {sec.data_source}
                      </td>
                    </tr>

                    {isExpanded &&
                      sec.subsectors.map((sub) => {
                        const subShare =
                          emissions_summary.total_emissions_tco2e !== 0
                            ? (sub.emissions_tco2e /
                                emissions_summary.total_emissions_tco2e) *
                              100
                            : 0;
                        return (
                          <tr
                            key={sub.subsector_key}
                            className="bg-slate-50/70 text-xs"
                          >
                            <td className="py-3 pl-10 pr-4 font-medium text-slate-800">
                              <div>{sub.subsector_name}</div>
                              <div className="font-mono text-[11px] text-slate-400">
                                {sub.subsector_key}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                              {formatNumber(sub.emissions_tco2e, 2)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-500">
                              {formatNumber(subShare, 1)}%
                            </td>
                            <td className="px-4 py-3">
                              <ConfidenceBadge
                                tier={sub.confidence_tier}
                                compact
                              />
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600">
                              {sub.reference_year}
                            </td>
                            <td className="max-w-md px-4 py-3 text-slate-600">
                              <div className="font-medium text-slate-700">
                                {sub.data_source}
                              </div>
                              <p className="mt-0.5 text-slate-500">
                                {sub.methodology_note}
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. AdaptaBrasil MCTI Climate Risk Panel */}
      <section className="print-page-break print-break-inside-avoid rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-orange-600" />
              <h2 className="text-lg font-bold text-slate-900">
                AdaptaBrasil MCTI Climate Risk Panel
              </h2>
            </div>
            <p className="text-sm text-slate-600">
              Municipal climate risk indices (0.00 minimal to 1.00 severe)
              across AdaptaBrasil MCTI strategic sectors.
            </p>
          </div>
          {missingRiskCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              {missingRiskCount} indicator(s) unavailable in AdaptaBrasil API
            </span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {climate_risks.map((risk, idx) => (
            <div
              key={`${risk.sector_code}-${idx}`}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {risk.sector_name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-500">
                      Ref. {risk.reference_year}
                    </span>
                    <RiskClassBadge riskClass={risk.risk_class} />
                  </div>
                </div>

                <h3 className="mt-1.5 text-sm font-semibold text-slate-900">
                  {risk.indicator_name}
                </h3>

                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      style={{
                        width: `${Math.max(risk.risk_index * 100, 2)}%`,
                      }}
                      className={`h-full rounded-full ${getRiskBarClass(risk.risk_class)}`}
                    />
                  </div>
                  <span className="font-mono text-sm font-bold tabular-nums text-slate-900">
                    {risk.risk_index.toFixed(2)}
                  </span>
                </div>

                <p className="mt-2.5 text-xs text-slate-600">
                  {risk.hazard_description}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-200/80 pt-2.5 text-[11px] text-slate-500">
                <span>{risk.data_source}</span>
                <ConfidenceBadge tier={risk.confidence_tier} compact />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Actionable Data-Gap & Verification Checklist */}
      <section className="print-break-inside-avoid rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-emerald-700" />
              <h2 className="text-lg font-bold text-slate-900">
                Actionable Data-Gap &amp; Verification Checklist
              </h2>
            </div>
            <p className="text-sm text-slate-600">
              Practical municipal records required from local utilities, transit
              authorities, and environmental agencies to upgrade{" "}
              <code className="font-mono text-xs">T2_MODELED</code> and{" "}
              <code className="font-mono text-xs">T3_PROXY</code> subsectors to{" "}
              <code className="font-mono text-xs">T1_LOCAL</code>.
            </p>
          </div>

          <div className="no-print inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
            <Info className="h-3.5 w-3.5 text-slate-500" />
            {Object.values(checkedGaps).filter(Boolean).length} /{" "}
            {gapItems.length} reviewed
          </div>
        </div>

        {gapItems.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
            <FileCheck2 className="h-5 w-5" />
            All subsectors are verified at T1_LOCAL.
          </div>
        ) : (
          <div className="space-y-3">
            {gapItems.map((item) => {
              const isChecked = !!checkedGaps[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleGap(item.id)}
                  className={`flex w-full items-start gap-3.5 rounded-xl border p-4 text-left transition ${
                    isChecked
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                  }`}
                >
                  <span className="no-print mt-0.5 shrink-0 text-slate-400">
                    {isChecked ? (
                      <CheckSquare className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <Square className="h-5 w-5" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          {item.sectorName}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span
                          className={`text-sm font-semibold ${
                            isChecked
                              ? "text-slate-500 line-through"
                              : "text-slate-900"
                          }`}
                        >
                          {item.subsector.subsector_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-600">
                          {formatNumber(item.subsector.emissions_tco2e, 2)} tCO₂e
                        </span>
                        <ConfidenceBadge
                          tier={item.subsector.confidence_tier}
                          compact
                        />
                      </div>
                    </div>

                    <p className="text-xs leading-relaxed text-slate-700">
                      <strong className="text-slate-900">Action needed:</strong>{" "}
                      {item.subsector.gap_note}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Local Data Override Drawer */}
      <LocalOverrideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        cityName={metadata.name}
        defaultYear={baseCity.emissions_summary.reference_year}
        currentOverride={override}
        onSave={handleSaveOverride}
        onReset={handleResetOverride}
      />
    </div>
  );
}
