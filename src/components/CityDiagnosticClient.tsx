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
  migrateLegacyOverride,
  validateLocalOverride,
} from "../../data/schema/city";
import {
  AppliedOverrideResult,
  applyLocalOverrides,
} from "../lib/emissionsCalculator";
import {
  EMISSION_FACTOR_REGISTRY,
  FACTOR_REGISTRY_VERSION,
} from "../lib/emissionFactors";
import {
  CoverageBadge,
  getRiskBarClass,
  OriginBadge,
  RiskClassBadge,
  VerificationBadge,
} from "./ConfidenceBadge";
import { LocalOverrideDrawer } from "./LocalOverrideDrawer";

function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDeltaPct(baseVal: number | null, nextVal: number | null): string {
  if (baseVal === null || nextVal === null) {
    return "N/A";
  }
  if (baseVal === 0) {
    return nextVal === 0 ? "0.0%" : "+∞%";
  }
  const pct = ((nextVal - baseVal) / Math.abs(baseVal)) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

const SECTOR_COLORS: Record<GPCSectorCode, string> = {
  STATIONARY_ENERGY: "bg-[#334155]",
  TRANSPORTATION: "bg-[#b45309]",
  WASTE: "bg-[#1b4332]",
  IPPU: "bg-[#6d28d9]",
  AFOLU: "bg-[#0f766e]",
};

const OVERRIDE_STORAGE_PREFIX = "climate-lens:override:";

export function CityDiagnosticClient({
  city: baseCity,
}: {
  city: CityClimateRecord;
}) {
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

  // Hydrate persisted LocalOverride from localStorage (migrating v1.0.0 if needed)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (validateLocalOverride(parsed).valid) {
          setOverride(parsed as LocalOverride);
        } else {
          const migrated = migrateLegacyOverride(
            parsed,
            baseCity.emissions_summary.reference_year
          );
          if (migrated && validateLocalOverride(migrated).valid) {
            setOverride(migrated);
            window.localStorage.setItem(storageKey, JSON.stringify(migrated));
          }
        }
      }
    } catch {
      // Ignore malformed localStorage state
    }
  }, [storageKey, baseCity.emissions_summary.reference_year]);

  const overrideResult: AppliedOverrideResult = useMemo(() => {
    if (!override) {
      return {
        city: baseCity,
        merged_components: [],
        partial_or_unmerged_estimates: [],
      };
    }
    try {
      return applyLocalOverrides(baseCity, override);
    } catch {
      return {
        city: baseCity,
        merged_components: [],
        partial_or_unmerged_estimates: [],
      };
    }
  }, [baseCity, override]);

  const activeCity = overrideResult.city;

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
      factor_registry_version: FACTOR_REGISTRY_VERSION,
      exported_at: new Date().toISOString(),
      ibge_code: activeCity.metadata.ibge_code,
      municipality: `${activeCity.metadata.name} - ${activeCity.metadata.state}`,
      emission_factors_used: EMISSION_FACTOR_REGISTRY,
      applied_overrides: override,
      merged_components: overrideResult.merged_components,
      partial_or_unmerged_estimates:
        overrideResult.partial_or_unmerged_estimates,
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
  const { provenance_mix } = emissions_summary;

  const localPct = provenance_mix.local_share * 100;
  const modeledPct = provenance_mix.modeled_share * 100;
  const proxyPct = provenance_mix.proxy_share * 100;

  const maxAbsSector = Math.max(
    ...GPC_SECTOR_CODES.map((c) => Math.abs(sectors[c].emissions_tco2e ?? 0)),
    1
  );

  // Collect all subsectors that are unavailable or rely on MODELED/PROXY origin
  const gapItems = GPC_SECTOR_CODES.flatMap((sectorCode) =>
    sectors[sectorCode].subsectors
      .filter(
        (sub) =>
          sub.availability_status !== "AVAILABLE" ||
          sub.data_origin !== "LOCAL" ||
          sub.verification_status === "UNVERIFIED" ||
          sub.verification_status === "REVIEW_REQUIRED"
      )
      .map((sub) => ({
        id: `${sectorCode}:${sub.subsector_key}`,
        sectorCode,
        sectorName: sectors[sectorCode].sector_name,
        subsector: sub,
      }))
  );

  const unavailableRiskCount = climate_risks.filter(
    (r) => r.availability_status !== "AVAILABLE" || r.risk_index === null
  ).length;

  return (
    <div className="space-y-8">
      {/* Top Navigation & Municipality Header */}
      <header className="border border-[#d6d0c4] bg-[#fcfaf5] p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Link
              href="/"
              className="no-print inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#57534e] transition hover:text-[#1b4332]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to all 399 Paraná municipalities
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-3xl font-normal tracking-tight text-[#171717] sm:text-5xl sm:leading-[1.08]">
                {metadata.name}{" "}
                <span className="italic text-[#57534e]">— {metadata.state}</span>
              </h1>
              <span className="border border-[#d6d0c4] bg-[#f5f2eb] px-2 py-0.5 font-mono text-xs text-[#171717]">
                IBGE {metadata.ibge_code}
              </span>
              <CoverageBadge status={emissions_summary.coverage_status} />
              {hasActiveOverride && (
                <span className="border border-[#1b4332]/40 bg-[#1b4332]/10 px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[#1b4332]">
                  Local Inputs Saved
                </span>
              )}
            </div>
            <p className="text-sm text-[#57534e]">
              Population:{" "}
              <strong className="font-mono font-medium text-[#171717]">
                {formatNumber(metadata.population, 0)}
              </strong>{" "}
              (Censo {metadata.population_year})
              {metadata.area_km2 ? (
                <>
                  {" "}
                  · Area:{" "}
                  <strong className="font-mono font-medium text-[#171717]">
                    {formatNumber(metadata.area_km2, 1)} km²
                  </strong>
                </>
              ) : null}
              {metadata.biome ? (
                <>
                  {" "}
                  · Biome:{" "}
                  <strong className="font-medium text-[#171717]">
                    {metadata.biome}
                  </strong>
                </>
              ) : null}
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="no-print flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 border border-[#1b4332] bg-[#1b4332] px-3.5 py-2 text-xs font-medium text-[#fcfaf5] transition hover:bg-[#143326]"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {hasActiveOverride ? "Edit Local Data" : "Input Local Data"}
            </button>

            {hasActiveOverride && (
              <button
                type="button"
                onClick={handleResetOverride}
                className="inline-flex items-center gap-1.5 border border-[#d6d0c4] bg-[#f5f2eb] px-3 py-2 text-xs font-medium text-[#171717] transition hover:bg-[#ede8dc]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to Public Baseline
              </button>
            )}

            <button
              type="button"
              onClick={handleExportAuditJson}
              className="inline-flex items-center gap-1.5 border border-[#d6d0c4] bg-[#f5f2eb] px-3 py-2 text-xs font-medium text-[#171717] transition hover:bg-[#ede8dc]"
            >
              <Download className="h-3.5 w-3.5" />
              Export Audit JSON
            </button>

            <button
              type="button"
              onClick={handlePrintBrief}
              className="inline-flex items-center gap-1.5 border border-[#d6d0c4] bg-[#f5f2eb] px-3 py-2 text-xs font-medium text-[#171717] transition hover:bg-[#ede8dc]"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF Brief
            </button>
          </div>
        </div>

        {/* Ledger KPI Strip */}
        <div className="mt-6 grid divide-y divide-[#d6d0c4] border border-[#d6d0c4] bg-[#f5f2eb] md:grid-cols-3 md:divide-x md:divide-y-0">
          <div className="p-4">
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#57534e]">
              01 ·{" "}
              {overrideResult.merged_components.length > 0
                ? "Recalculated Total"
                : "Baseline Emissions"}{" "}
              ({emissions_summary.reference_year})
              {emissions_summary.coverage_status === "PARTIAL"
                ? " · Partial"
                : ""}
            </div>
            <div className="mt-2 font-serif text-3xl font-normal tracking-tight tabular-nums text-[#171717]">
              {emissions_summary.total_emissions_tco2e !== null ? (
                <>
                  {formatNumber(emissions_summary.total_emissions_tco2e, 2)}{" "}
                  <span className="font-mono text-xs text-[#57534e]">
                    tCO₂e
                  </span>
                </>
              ) : (
                <span className="text-lg text-[#78716c]">Data unavailable</span>
              )}
            </div>
          </div>

          <div className="p-4">
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#57534e]">
              02 · Per Capita Emissions
            </div>
            <div className="mt-2 font-serif text-3xl font-normal tracking-tight tabular-nums text-[#171717]">
              {emissions_summary.per_capita_tco2e !== null ? (
                <>
                  {formatNumber(emissions_summary.per_capita_tco2e, 2)}{" "}
                  <span className="font-mono text-xs text-[#57534e]">
                    tCO₂e/hab
                  </span>
                </>
              ) : (
                <span className="text-lg text-[#78716c]">Data unavailable</span>
              )}
            </div>
          </div>

          <div className="p-4">
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#57534e]">
              03 · Data Origin Mix
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <div>
                <span className="font-serif text-2xl font-normal tabular-nums text-[#b45309]">
                  {formatNumber(proxyPct, 1)}%
                </span>
                <span className="ml-1 font-mono text-[10px] uppercase text-[#57534e]">
                  Proxy
                </span>
              </div>
              <div>
                <span className="font-serif text-2xl font-normal tabular-nums text-[#1d4ed8]">
                  {formatNumber(modeledPct, 1)}%
                </span>
                <span className="ml-1 font-mono text-[10px] uppercase text-[#57534e]">
                  Modeled
                </span>
              </div>
              <div>
                <span className="font-serif text-2xl font-normal tabular-nums text-[#1b4332]">
                  {formatNumber(localPct, 1)}%
                </span>
                <span className="ml-1 font-mono text-[10px] uppercase text-[#57534e]">
                  Local
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Missing Components Callout when Coverage is PARTIAL */}
      {emissions_summary.missing_components.length > 0 && (
        <div className="border border-[#b45309]/40 bg-[#b45309]/5 p-4 text-xs text-[#78350f]">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b45309]" />
            <div>
              <span className="font-semibold text-[#171717]">
                Partial Inventory Coverage:
              </span>{" "}
              Total emissions exclude unmeasured components rather than coercing
              them to zero:{" "}
              <span className="font-mono text-[#171717]">
                {emissions_summary.missing_components.join(", ")}
              </span>
              .
            </div>
          </div>
        </div>
      )}

      {/* Audit Comparison Card (when Local Overrides are Merged into Citywide Baseline) */}
      {overrideResult.merged_components.length > 0 && (
        <section className="print-break-inside-avoid border border-[#1b4332]/40 bg-[#1b4332]/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#1b4332]">
              Audit Comparison: Public Baseline vs. Local Input (Merged
              Citywide)
            </h2>
            <span className="font-mono text-xs text-[#1b4332]">
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
            <div className="border border-[#1b4332]/30 bg-[#fcfaf5] p-3">
              <div className="font-mono text-[11px] uppercase tracking-wider text-[#57534e]">
                City Total
              </div>
              <div className="mt-1 text-xs text-[#57534e]">
                Public:{" "}
                <span className="font-mono text-[#171717]">
                  {baseCity.emissions_summary.total_emissions_tco2e !== null
                    ? formatNumber(
                        baseCity.emissions_summary.total_emissions_tco2e,
                        2
                      )
                    : "Data unavailable"}
                </span>
              </div>
              <div className="text-sm font-semibold text-[#171717]">
                Local:{" "}
                <span className="font-mono">
                  {activeCity.emissions_summary.total_emissions_tco2e !== null
                    ? formatNumber(
                        activeCity.emissions_summary.total_emissions_tco2e,
                        2
                      )
                    : "Data unavailable"}
                </span>{" "}
                <span className="font-mono text-xs font-semibold text-[#1b4332]">
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
              const changed =
                (baseVal ?? 0) !== (nextVal ?? 0) ||
                baseCity.sectors[code].coverage_status !==
                  activeCity.sectors[code].coverage_status;
              return (
                <div
                  key={code}
                  className={`border p-3 ${
                    changed
                      ? "border-[#1b4332]/30 bg-[#fcfaf5]"
                      : "border-[#d6d0c4] bg-[#f5f2eb]/70 opacity-75"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-[#57534e]">
                      {activeCity.sectors[code].sector_name}
                    </span>
                    <div className="flex items-center gap-1">
                      <OriginBadge
                        origin={activeCity.sectors[code].data_origin}
                        compact
                      />
                      <VerificationBadge
                        status={activeCity.sectors[code].verification_status}
                      />
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-[#57534e]">
                    Public:{" "}
                    <span className="font-mono text-[#171717]">
                      {baseVal !== null
                        ? formatNumber(baseVal, 2)
                        : "Data unavailable"}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-[#171717]">
                    Local:{" "}
                    <span className="font-mono">
                      {nextVal !== null
                        ? formatNumber(nextVal, 2)
                        : "Data unavailable"}
                    </span>{" "}
                    <span className="font-mono text-xs font-semibold text-[#1b4332]">
                      ({formatDeltaPct(baseVal, nextVal)})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Unmerged / Partial / Incompatible Local Estimates */}
      {overrideResult.partial_or_unmerged_estimates.length > 0 && (
        <section className="print-break-inside-avoid border border-[#b45309]/40 bg-[#b45309]/5 p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#b45309]" />
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#9a3412]">
              Unmerged Local Inputs (Citywide Baseline Preserved)
            </h2>
          </div>
          <p className="mt-1.5 text-xs text-[#78350f]">
            The inputs below are calculated deterministically and preserved in
            the audit export, but were NOT merged into the citywide baseline
            because their geographic/operational boundary, reporting year, or
            emission factor verification status is incompatible with a full-city{" "}
            {baseCity.emissions_summary.reference_year} inventory replacement.
          </p>

          <div className="mt-3 space-y-2.5">
            {overrideResult.partial_or_unmerged_estimates.map((est, i) => (
              <div
                key={`${est.component}-${i}`}
                className="border border-[#d6d0c4] bg-[#fcfaf5] p-3.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold uppercase text-[#171717]">
                      {est.component.replace("_", " ")}
                    </span>
                    <span className="border border-[#d6d0c4] bg-[#f5f2eb] px-1.5 py-0.5 font-mono text-[11px] text-[#57534e]">
                      {est.coverage_boundary}
                    </span>
                    <span className="border border-[#d6d0c4] bg-[#f5f2eb] px-1.5 py-0.5 font-mono text-[11px] text-[#57534e]">
                      Year {est.reporting_year}
                    </span>
                    <OriginBadge origin={est.data_origin} compact />
                    <VerificationBadge status={est.verification_status} />
                  </div>
                  <div className="font-mono font-semibold text-[#171717]">
                    {formatNumber(est.calculated_tco2e, 2)} tCO₂e fossil
                    {est.biogenic_co2_tco2 > 0
                      ? ` · ${formatNumber(est.biogenic_co2_tco2, 2)} tCO₂ biogenic`
                      : ""}
                  </div>
                </div>
                <p className="mt-1.5 text-[#9a3412]">
                  <strong>Reason not merged:</strong> {est.reason_not_merged}
                </p>
                <p className="mt-0.5 text-[#57534e]">
                  <strong className="text-[#171717]">Source reference:</strong>{" "}
                  {est.source_reference || "None provided"} ·{" "}
                  <strong className="text-[#171717]">Factor(s):</strong>{" "}
                  <span className="font-mono">{est.factor_ids.join(", ")}</span>{" "}
                  ({est.factor_verified ? "Verified" : "Unverified"})
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 1. Data Trust & Provenance Banner */}
      <section className="print-break-inside-avoid border border-[#d6d0c4] bg-[#fcfaf5] p-6">
        <div className="flex flex-col gap-3 border-b border-[#e7e2d8] pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[#b45309]" />
              <h2 className="font-serif text-xl font-medium text-[#171717]">
                Data Origin &amp; Evidence Status
              </h2>
            </div>
            <p className="max-w-3xl text-sm text-[#57534e]">
              Provenance origin is separated from evidence verification and
              distinct from IPCC methodological Tiers 1/2/3.{" "}
              <strong className="font-semibold text-[#171717]">
                {provenance_mix.summary_label}
              </strong>
              : {formatNumber(localPct, 1)}% local origin,{" "}
              {formatNumber(modeledPct, 1)}% spatially modeled, and{" "}
              {formatNumber(proxyPct, 1)}% top-down proxy disaggregation.
            </p>
          </div>
          <div className="shrink-0 border border-[#b45309]/40 bg-[#b45309]/10 px-3 py-1.5 font-mono text-[11px] font-medium text-[#9a3412]">
            {gapItems.length} subsector(s) need local data or verification
          </div>
        </div>

        {/* Stacked Provenance Bar */}
        <div className="mt-5">
          <div className="flex h-2 w-full overflow-hidden bg-[#e7e2d8]">
            {localPct > 0 && (
              <div
                style={{ width: `${localPct}%` }}
                className="bg-[#1b4332] transition-all"
                title={`Local origin: ${formatNumber(localPct, 1)}%`}
              />
            )}
            {modeledPct > 0 && (
              <div
                style={{ width: `${modeledPct}%` }}
                className="bg-[#1d4ed8] transition-all"
                title={`Modeled origin: ${formatNumber(modeledPct, 1)}%`}
              />
            )}
            {proxyPct > 0 && (
              <div
                style={{ width: `${proxyPct}%` }}
                className="bg-[#b45309] transition-all"
                title={`Proxy origin: ${formatNumber(proxyPct, 1)}%`}
              />
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="border border-[#d6d0c4] bg-[#f5f2eb] p-3.5">
              <div className="flex items-center justify-between">
                <OriginBadge origin="LOCAL" />
                <span className="font-serif text-xl font-normal tabular-nums text-[#1b4332]">
                  {formatNumber(localPct, 1)}%
                </span>
              </div>
              <p className="mt-1.5 text-xs text-[#57534e]">
                Municipal utility, fuel, or landfill records (verification status
                tracked separately).
              </p>
            </div>

            <div className="border border-[#d6d0c4] bg-[#f5f2eb] p-3.5">
              <div className="flex items-center justify-between">
                <OriginBadge origin="MODELED" />
                <span className="font-serif text-xl font-normal tabular-nums text-[#1d4ed8]">
                  {formatNumber(modeledPct, 1)}%
                </span>
              </div>
              <p className="mt-1.5 text-xs text-[#57534e]">
                Spatially modeled (MapBiomas land-use &amp; IBGE agricultural
                census).
              </p>
            </div>

            <div className="border border-[#d6d0c4] bg-[#f5f2eb] p-3.5">
              <div className="flex items-center justify-between">
                <OriginBadge origin="PROXY" />
                <span className="font-serif text-xl font-normal tabular-nums text-[#b45309]">
                  {formatNumber(proxyPct, 1)}%
                </span>
              </div>
              <p className="mt-1.5 text-xs text-[#57534e]">
                State/national top-down disaggregation awaiting local records.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. GPC Emissions Breakdown */}
      <section className="print-break-inside-avoid border border-[#d6d0c4] bg-[#fcfaf5] p-6">
        <div className="mb-6 flex flex-col gap-2 border-b border-[#e7e2d8] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-xl font-medium text-[#171717]">
              GPC-Aligned GHG Emissions Breakdown
            </h2>
            <p className="text-sm text-[#57534e]">
              SEEG Municípios Coleção 14.0 (GWP-AR5,{" "}
              {emissions_summary.reference_year}) mapped into the 5 GPC sectors.
              Unmeasured components remain explicitly unavailable rather than
              zero.
            </p>
          </div>
        </div>

        {/* Horizontal Bar Chart */}
        <div className="mb-8 space-y-3.5 border border-[#e7e2d8] bg-[#f5f2eb] p-4">
          {GPC_SECTOR_CODES.map((code) => {
            const sec = sectors[code];
            const secVal = sec.emissions_tco2e;
            const widthPct =
              secVal !== null
                ? Math.min(100, (Math.abs(secVal) / maxAbsSector) * 100)
                : 0;
            const totalVal = emissions_summary.total_emissions_tco2e;
            const sharePct =
              secVal !== null && totalVal !== null && totalVal !== 0
                ? (secVal / totalVal) * 100
                : 0;

            return (
              <div key={code} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#171717]">
                      {sec.sector_name}
                    </span>
                    <OriginBadge origin={sec.data_origin} compact />
                    <VerificationBadge status={sec.verification_status} />
                    {sec.coverage_status === "PARTIAL" && (
                      <CoverageBadge status="PARTIAL" />
                    )}
                  </div>
                  <div className="font-mono tabular-nums text-[#171717]">
                    {secVal !== null ? (
                      <>
                        <strong>{formatNumber(secVal, 2)}</strong> tCO₂e (
                        {formatNumber(sharePct, 1)}%)
                      </>
                    ) : (
                      <span className="text-[#78716c]">Data unavailable</span>
                    )}
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden bg-[#e7e2d8]">
                  <div
                    style={{
                      width: `${
                        secVal !== null
                          ? Math.max(widthPct, secVal !== 0 ? 1.5 : 0)
                          : 0
                      }%`,
                    }}
                    className={`h-full ${SECTOR_COLORS[code]}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Expandable Sector / Subsector Table */}
        <div className="overflow-x-auto border border-[#d6d0c4]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-[#d6d0c4] bg-[#f5f2eb] font-mono text-[11px] uppercase tracking-wider text-[#57534e]">
              <tr>
                <th className="px-4 py-3 font-medium">Sector / Subsector</th>
                <th className="px-4 py-3 text-right font-medium">
                  Emissions (tCO₂e)
                </th>
                <th className="px-4 py-3 text-right font-medium">Share</th>
                <th className="px-4 py-3 font-medium">
                  Origin &amp; Verification
                </th>
                <th className="px-4 py-3 font-medium">Year</th>
                <th className="px-4 py-3 font-medium">
                  Data Source &amp; Methodology
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7e2d8]">
              {GPC_SECTOR_CODES.map((code) => {
                const sec = sectors[code];
                const isExpanded = expandedSectors[code];
                const totalVal = emissions_summary.total_emissions_tco2e;
                const secShare =
                  sec.emissions_tco2e !== null &&
                  totalVal !== null &&
                  totalVal !== 0
                    ? (sec.emissions_tco2e / totalVal) * 100
                    : 0;

                return (
                  <React.Fragment key={code}>
                    <tr
                      onClick={() => toggleSector(code)}
                      className="cursor-pointer bg-[#fcfaf5] transition hover:bg-[#f5f2eb]"
                    >
                      <td className="px-4 py-3.5 font-semibold text-[#171717]">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="no-print h-4 w-4 text-[#57534e]" />
                          ) : (
                            <ChevronRight className="no-print h-4 w-4 text-[#57534e]" />
                          )}
                          <span>{sec.sector_name}</span>
                          <span className="font-mono text-[11px] font-normal text-[#78716c]">
                            ({sec.subsectors.length})
                          </span>
                          {sec.coverage_status === "PARTIAL" && (
                            <CoverageBadge status="PARTIAL" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold tabular-nums text-[#171717]">
                        {sec.emissions_tco2e !== null ? (
                          formatNumber(sec.emissions_tco2e, 2)
                        ) : (
                          <span className="text-xs font-normal text-[#78716c]">
                            Data unavailable
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-[#57534e]">
                        {sec.emissions_tco2e !== null
                          ? `${formatNumber(secShare, 1)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          <OriginBadge origin={sec.data_origin} compact />
                          <VerificationBadge status={sec.verification_status} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-[#57534e]">
                        {sec.reference_year}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#57534e]">
                        {sec.data_source}
                      </td>
                    </tr>

                    {isExpanded &&
                      sec.subsectors.map((sub) => {
                        const subShare =
                          sub.emissions_tco2e !== null &&
                          totalVal !== null &&
                          totalVal !== 0
                            ? (sub.emissions_tco2e / totalVal) * 100
                            : 0;
                        const isAvailable =
                          sub.availability_status === "AVAILABLE" &&
                          sub.emissions_tco2e !== null;
                        return (
                          <tr
                            key={sub.subsector_key}
                            className="bg-[#f5f2eb]/60 text-xs"
                          >
                            <td className="py-3 pl-10 pr-4 font-medium text-[#171717]">
                              <div>{sub.subsector_name}</div>
                              <div className="font-mono text-[11px] text-[#78716c]">
                                {sub.subsector_key}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums text-[#171717]">
                              {isAvailable ? (
                                <div>
                                  {formatNumber(sub.emissions_tco2e!, 2)}
                                  {sub.biogenic_co2_tco2 &&
                                  sub.biogenic_co2_tco2 > 0 ? (
                                    <div className="text-[10px] text-[#57534e]">
                                      +{formatNumber(sub.biogenic_co2_tco2, 2)}{" "}
                                      bio CO₂
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-[#78716c]">
                                  Data unavailable
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums text-[#57534e]">
                              {isAvailable ? `${formatNumber(subShare, 1)}%` : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                <OriginBadge origin={sub.data_origin} compact />
                                <VerificationBadge
                                  status={sub.verification_status}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-[#57534e]">
                              {sub.reference_year}
                            </td>
                            <td className="max-w-md px-4 py-3 text-[#57534e]">
                              <div className="font-medium text-[#171717]">
                                {sub.data_source}
                              </div>
                              {!isAvailable && (
                                <p className="mt-0.5 font-medium text-[#9a3412]">
                                  {sub.availability_reason}
                                </p>
                              )}
                              <p className="mt-0.5 text-[#57534e]">
                                {sub.methodology_note}
                              </p>
                              {sub.factor_id && (
                                <p className="mt-0.5 font-mono text-[10px] text-[#78716c]">
                                  Factor: {sub.factor_id}
                                </p>
                              )}
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
      <section className="print-page-break print-break-inside-avoid border border-[#d6d0c4] bg-[#fcfaf5] p-6">
        <div className="mb-5 flex flex-col gap-2 border-b border-[#e7e2d8] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[#9a3412]" />
              <h2 className="font-serif text-xl font-medium text-[#171717]">
                AdaptaBrasil MCTI Climate Risk Panel
              </h2>
            </div>
            <p className="text-sm text-[#57534e]">
              Municipal climate risk indices (0.00 minimal to 1.00 severe)
              across AdaptaBrasil MCTI strategic sectors. Unavailable indicators
              are shown as missing rather than coerced to zero.
            </p>
          </div>
          {unavailableRiskCount > 0 && (
            <span className="inline-flex items-center gap-1.5 border border-[#b45309]/40 bg-[#b45309]/10 px-3 py-1.5 font-mono text-[11px] font-medium text-[#9a3412]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {unavailableRiskCount} indicator(s) unavailable in AdaptaBrasil API
            </span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {climate_risks.map((risk, idx) => {
            const isAvailable =
              risk.availability_status === "AVAILABLE" &&
              risk.risk_index !== null;
            return (
              <div
                key={`${risk.sector_code}-${idx}`}
                className="flex flex-col justify-between border border-[#d6d0c4] bg-[#f5f2eb]/70 p-4"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#57534e]">
                      {risk.sector_name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-[#57534e]">
                        Ref. {risk.reference_year}
                      </span>
                      <RiskClassBadge
                        riskClass={risk.risk_class}
                        availabilityStatus={risk.availability_status}
                      />
                    </div>
                  </div>

                  <h3 className="mt-1.5 text-sm font-semibold text-[#171717]">
                    {risk.indicator_name}
                  </h3>

                  <div className="mt-3 flex items-center gap-3">
                    {isAvailable ? (
                      <>
                        <div className="h-2 flex-1 overflow-hidden bg-[#e7e2d8]">
                          <div
                            style={{
                              width: `${Math.max(risk.risk_index! * 100, 2)}%`,
                            }}
                            className={`h-full ${getRiskBarClass(risk.risk_class)}`}
                          />
                        </div>
                        <span className="font-mono text-sm font-semibold tabular-nums text-[#171717]">
                          {risk.risk_index!.toFixed(2)}
                        </span>
                      </>
                    ) : (
                      <div className="w-full border border-[#d6d0c4] bg-[#fcfaf5] px-3 py-2 text-xs text-[#57534e]">
                        <strong className="text-[#171717]">
                          Data unavailable:
                        </strong>{" "}
                        {risk.availability_reason}
                      </div>
                    )}
                  </div>

                  <p className="mt-2.5 text-xs text-[#57534e]">
                    {risk.hazard_description}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#e7e2d8] pt-2.5 text-[11px] text-[#57534e]">
                  <span>{risk.data_source}</span>
                  <div className="flex items-center gap-1">
                    <OriginBadge origin={risk.data_origin} compact />
                    <VerificationBadge status={risk.verification_status} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Actionable Data-Gap & Verification Checklist */}
      <section className="print-break-inside-avoid border border-[#d6d0c4] bg-[#fcfaf5] p-6">
        <div className="mb-5 flex flex-col gap-2 border-b border-[#e7e2d8] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-[#1b4332]" />
              <h2 className="font-serif text-xl font-medium text-[#171717]">
                Actionable Data-Gap &amp; Verification Checklist
              </h2>
            </div>
            <p className="text-sm text-[#57534e]">
              Practical municipal records required from local utilities, transit
              authorities, and environmental agencies to replace{" "}
              <code className="font-mono text-xs text-[#171717]">PROXY</code> /{" "}
              <code className="font-mono text-xs text-[#171717]">MODELED</code>{" "}
              /{" "}
              <code className="font-mono text-xs text-[#171717]">
                UNAVAILABLE
              </code>{" "}
              subsectors with documented local evidence.
            </p>
          </div>

          <div className="no-print inline-flex items-center gap-1.5 border border-[#d6d0c4] bg-[#f5f2eb] px-3 py-1.5 font-mono text-[11px] text-[#171717]">
            <Info className="h-3.5 w-3.5 text-[#57534e]" />
            {Object.values(checkedGaps).filter(Boolean).length} /{" "}
            {gapItems.length} reviewed
          </div>
        </div>

        {gapItems.length === 0 ? (
          <div className="flex items-center gap-2 border border-[#1b4332]/30 bg-[#1b4332]/5 p-4 text-sm text-[#1b4332]">
            <FileCheck2 className="h-5 w-5" />
            All subsectors have documented or independently audited local data.
          </div>
        ) : (
          <div className="space-y-2.5">
            {gapItems.map((item) => {
              const isChecked = !!checkedGaps[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleGap(item.id)}
                  className={`flex w-full items-start gap-3.5 border p-4 text-left transition ${
                    isChecked
                      ? "border-[#1b4332]/40 bg-[#1b4332]/5"
                      : "border-[#d6d0c4] bg-[#fcfaf5] hover:bg-[#f5f2eb]"
                  }`}
                >
                  <span className="no-print mt-0.5 shrink-0 text-[#78716c]">
                    {isChecked ? (
                      <CheckSquare className="h-5 w-5 text-[#1b4332]" />
                    ) : (
                      <Square className="h-5 w-5" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#57534e]">
                          {item.sectorName}
                        </span>
                        <span className="text-[#a8a29e]">·</span>
                        <span
                          className={`text-sm font-semibold ${
                            isChecked
                              ? "text-[#78716c] line-through"
                              : "text-[#171717]"
                          }`}
                        >
                          {item.subsector.subsector_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#57534e]">
                          {item.subsector.emissions_tco2e !== null
                            ? `${formatNumber(item.subsector.emissions_tco2e, 2)} tCO₂e`
                            : "Data unavailable"}
                        </span>
                        <OriginBadge
                          origin={item.subsector.data_origin}
                          compact
                        />
                        <VerificationBadge
                          status={item.subsector.verification_status}
                        />
                      </div>
                    </div>

                    <p className="text-xs leading-relaxed text-[#57534e]">
                      <strong className="text-[#171717]">Action needed:</strong>{" "}
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
        baseInventoryYear={baseCity.emissions_summary.reference_year}
        currentOverride={override}
        onSave={handleSaveOverride}
        onReset={handleResetOverride}
      />
    </div>
  );
}
