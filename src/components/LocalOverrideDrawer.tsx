"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  RotateCcw,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  CoverageBoundary,
  CURRENT_SCHEMA_VERSION,
  LocalOverride,
} from "../../data/schema/city";
import {
  calculateElectricityEmissions,
  calculateFleetFuelEmissions,
  calculateSolidWasteEmissions,
  FactorCalculationOutput,
} from "../lib/emissionsCalculator";

interface LocalOverrideDrawerProps {
  open: boolean;
  onClose: () => void;
  cityName: string;
  baseInventoryYear: number;
  currentOverride: LocalOverride | null;
  onSave: (override: LocalOverride) => void;
  onReset: () => void;
}

const BOUNDARY_OPTIONS: Array<{ value: CoverageBoundary; label: string }> = [
  { value: "MUNICIPALITY_WIDE", label: "Municipality-wide (Full City)" },
  {
    value: "MUNICIPAL_GOVERNMENT_FLEET",
    label: "Municipal Government Fleet / Buildings Only (Partial)",
  },
  {
    value: "PUBLIC_TRANSIT_OPERATOR",
    label: "Public Transit Operator Only (Partial)",
  },
  {
    value: "PARTIAL_FACILITY_OR_SECTOR",
    label: "Partial Facility / Subset (Partial)",
  },
  { value: "UNKNOWN", label: "Unknown Boundary (Cannot Merge)" },
];

function parseNonNegative(val: string): number {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseYear(val: string, fallback: number): number {
  const n = parseInt(val, 10);
  return Number.isInteger(n) && n >= 1990 && n <= 2100 ? n : fallback;
}

function safeCalc(fn: () => FactorCalculationOutput): {
  output: FactorCalculationOutput | null;
  error: string | null;
} {
  try {
    return { output: fn(), error: null };
  } catch (err) {
    return {
      output: null,
      error: err instanceof Error ? err.message : "Factor lookup failed",
    };
  }
}

export function LocalOverrideDrawer({
  open,
  onClose,
  cityName,
  baseInventoryYear,
  currentOverride,
  onSave,
  onReset,
}: LocalOverrideDrawerProps) {
  // Electricity
  const [useElec, setUseElec] = useState(false);
  const [mwhPerYear, setMwhPerYear] = useState("");
  const [elecYear, setElecYear] = useState("2024");
  const [elecBoundary, setElecBoundary] =
    useState<CoverageBoundary>("MUNICIPALITY_WIDE");
  const [elecSource, setElecSource] = useState("");

  // Fleet fuels
  const [useFleet, setUseFleet] = useState(false);
  const [dieselLiters, setDieselLiters] = useState("");
  const [gasolineLiters, setGasolineLiters] = useState("");
  const [ethanolLiters, setEthanolLiters] = useState("");
  const [fleetYear, setFleetYear] = useState("2024");
  const [fleetBoundary, setFleetBoundary] = useState<CoverageBoundary>(
    "MUNICIPAL_GOVERNMENT_FLEET"
  );
  const [fleetSource, setFleetSource] = useState("");

  // Solid waste
  const [useWaste, setUseWaste] = useState(false);
  const [wasteTons, setWasteTons] = useState("");
  const [hasMethaneCapture, setHasMethaneCapture] = useState(false);
  const [wasteYear, setWasteYear] = useState(String(baseInventoryYear));
  const [wasteBoundary, setWasteBoundary] =
    useState<CoverageBoundary>("MUNICIPALITY_WIDE");
  const [wasteSource, setWasteSource] = useState("");

  useEffect(() => {
    setUseElec(currentOverride?.electricity !== undefined);
    setMwhPerYear(
      currentOverride?.electricity
        ? String(currentOverride.electricity.mwh_per_year)
        : ""
    );
    setElecYear(
      String(currentOverride?.electricity?.reporting_year ?? 2024)
    );
    setElecBoundary(
      currentOverride?.electricity?.coverage_boundary ?? "MUNICIPALITY_WIDE"
    );
    setElecSource(currentOverride?.electricity?.source_reference ?? "");

    setUseFleet(currentOverride?.fleet_fuels !== undefined);
    setDieselLiters(
      currentOverride?.fleet_fuels
        ? String(currentOverride.fleet_fuels.diesel_liters)
        : ""
    );
    setGasolineLiters(
      currentOverride?.fleet_fuels
        ? String(currentOverride.fleet_fuels.gasoline_liters)
        : ""
    );
    setEthanolLiters(
      currentOverride?.fleet_fuels
        ? String(currentOverride.fleet_fuels.ethanol_liters)
        : ""
    );
    setFleetYear(
      String(currentOverride?.fleet_fuels?.reporting_year ?? 2024)
    );
    setFleetBoundary(
      currentOverride?.fleet_fuels?.coverage_boundary ??
        "MUNICIPAL_GOVERNMENT_FLEET"
    );
    setFleetSource(currentOverride?.fleet_fuels?.source_reference ?? "");

    setUseWaste(currentOverride?.solid_waste !== undefined);
    setWasteTons(
      currentOverride?.solid_waste
        ? String(currentOverride.solid_waste.tons_per_year)
        : ""
    );
    setHasMethaneCapture(
      currentOverride?.solid_waste?.has_methane_capture ?? false
    );
    setWasteYear(
      String(currentOverride?.solid_waste?.reporting_year ?? baseInventoryYear)
    );
    setWasteBoundary(
      currentOverride?.solid_waste?.coverage_boundary ?? "MUNICIPALITY_WIDE"
    );
    setWasteSource(currentOverride?.solid_waste?.source_reference ?? "");
  }, [currentOverride, baseInventoryYear, open]);

  if (!open) return null;

  const elecCalc = useElec
    ? safeCalc(() =>
        calculateElectricityEmissions(
          parseNonNegative(mwhPerYear),
          parseYear(elecYear, 2024)
        )
      )
    : null;

  const fleetCalc = useFleet
    ? safeCalc(() =>
        calculateFleetFuelEmissions(
          {
            diesel_liters: parseNonNegative(dieselLiters),
            gasoline_liters: parseNonNegative(gasolineLiters),
            ethanol_liters: parseNonNegative(ethanolLiters),
          },
          parseYear(fleetYear, 2024)
        )
      )
    : null;

  const wasteCalc = useWaste
    ? safeCalc(() =>
        calculateSolidWasteEmissions(
          {
            tons_per_year: parseNonNegative(wasteTons),
            has_methane_capture: hasMethaneCapture,
          },
          parseYear(wasteYear, baseInventoryYear)
        )
      )
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextOverride: LocalOverride = {
      override_schema_version: CURRENT_SCHEMA_VERSION,
    };

    if (useElec) {
      nextOverride.electricity = {
        mwh_per_year: parseNonNegative(mwhPerYear),
        reporting_year: parseYear(elecYear, 2024),
        coverage_boundary: elecBoundary,
        source_reference: elecSource.trim(),
        needs_review: false,
      };
    }
    if (useFleet) {
      nextOverride.fleet_fuels = {
        diesel_liters: parseNonNegative(dieselLiters),
        gasoline_liters: parseNonNegative(gasolineLiters),
        ethanol_liters: parseNonNegative(ethanolLiters),
        reporting_year: parseYear(fleetYear, 2024),
        coverage_boundary: fleetBoundary,
        source_reference: fleetSource.trim(),
        needs_review: false,
      };
    }
    if (useWaste) {
      nextOverride.solid_waste = {
        tons_per_year: parseNonNegative(wasteTons),
        has_methane_capture: hasMethaneCapture,
        reporting_year: parseYear(wasteYear, baseInventoryYear),
        coverage_boundary: wasteBoundary,
        source_reference: wasteSource.trim(),
        needs_review: false,
      };
    }

    if (
      !nextOverride.electricity &&
      !nextOverride.fleet_fuels &&
      !nextOverride.solid_waste
    ) {
      onReset();
    } else {
      onSave(nextOverride);
    }
    onClose();
  };

  const renderMergeNotice = (
    boundary: CoverageBoundary,
    year: number,
    calc: { output: FactorCalculationOutput | null; error: string | null } | null
  ) => {
    if (calc?.error) {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{calc.error}</span>
        </div>
      );
    }
    const reasons: string[] = [];
    if (boundary !== "MUNICIPALITY_WIDE") {
      reasons.push(
        `Boundary "${boundary}" is partial/unknown — will be stored as a separate unmerged estimate (will NOT replace citywide total).`
      );
    }
    if (year !== baseInventoryYear) {
      reasons.push(
        `Reporting year ${year} differs from baseline ${baseInventoryYear} — will NOT be silently combined into the ${baseInventoryYear} citywide total.`
      );
    }
    if (calc?.output && !calc.output.all_factors_verified) {
      reasons.push(
        `Factor is UNVERIFIED (${calc.output.factor_ids.join(", ")}) — cannot replace citywide baseline as a validated figure.`
      );
    }
    if (reasons.length === 0) return null;
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <div className="space-y-1">
          {reasons.map((r, i) => (
            <div key={i}>{r}</div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="override-drawer-title"
    >
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="h-5 w-5 text-emerald-700" />
            <div>
              <h2
                id="override-drawer-title"
                className="text-lg font-bold text-slate-900"
              >
                Local Municipal Activity Input — {cityName}
              </h2>
              <p className="text-xs text-slate-500">
                Citywide replacement requires Municipality-wide boundary, year{" "}
                {baseInventoryYear}, verified factor, and source reference.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close override drawer"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-6 overflow-y-auto px-6 py-5"
        >
          {/* 1. Grid Electricity */}
          <div className="rounded-xl border border-slate-200 p-4">
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-900">
                  1. Grid Electricity Consumption (Scope 2)
                </span>
                <p className="text-xs text-slate-500">
                  MCTI/SIRENE SIN grid factor (verified for 2023 &amp; 2024;
                  unverified for 2025)
                </p>
              </div>
              <input
                type="checkbox"
                checked={useElec}
                onChange={(e) => setUseElec(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
            </label>

            {useElec && (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="input-mwh"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Annual Consumption (MWh / year)
                    </label>
                    <input
                      id="input-mwh"
                      type="number"
                      min={0}
                      step="any"
                      placeholder="e.g. 1150000"
                      value={mwhPerYear}
                      onChange={(e) => setMwhPerYear(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="input-elec-year"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Reporting Year (2023 / 2024 verified)
                    </label>
                    <input
                      id="input-elec-year"
                      type="number"
                      min={1990}
                      max={2100}
                      value={elecYear}
                      onChange={(e) => setElecYear(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="input-elec-boundary"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Inventory Boundary / Coverage
                  </label>
                  <select
                    id="input-elec-boundary"
                    value={elecBoundary}
                    onChange={(e) =>
                      setElecBoundary(e.target.value as CoverageBoundary)
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                  >
                    {BOUNDARY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  type="text"
                  placeholder="Required source reference (e.g. Copel Distribuição S.A. 2024 Report)"
                  value={elecSource}
                  onChange={(e) => setElecSource(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-600 focus:outline-none"
                />

                {elecCalc?.output && (
                  <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-700">
                    <div>
                      Factor: <code className="font-mono">{elecCalc.output.factor_ids[0]}</code>{" "}
                      ({elecCalc.output.used_factors[0].fossil_value}{" "}
                      {elecCalc.output.used_factors[0].unit}) •{" "}
                      <strong>
                        {elecCalc.output.all_factors_verified
                          ? "VERIFIED"
                          : "UNVERIFIED"}
                      </strong>
                    </div>
                    <div className="mt-0.5 font-mono font-semibold text-emerald-700">
                      Calculated: {elecCalc.output.fossil_tco2e.toLocaleString("en-US")} tCO₂e
                    </div>
                  </div>
                )}

                {renderMergeNotice(
                  elecBoundary,
                  parseYear(elecYear, 2024),
                  elecCalc
                )}
              </div>
            )}
          </div>

          {/* 2. Fleet Fuels */}
          <div className="rounded-xl border border-slate-200 p-4">
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-900">
                  2. Fleet Fuel Consumption (Mobile Combustion)
                </span>
                <p className="text-xs text-slate-500">
                  Tracks fossil tCO₂e and biogenic CO₂ separately (PBGHG
                  provisional factors)
                </p>
              </div>
              <input
                type="checkbox"
                checked={useFleet}
                onChange={(e) => setUseFleet(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
            </label>

            {useFleet && (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="input-diesel"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Diesel B14 (Liters/yr)
                    </label>
                    <input
                      id="input-diesel"
                      type="number"
                      min={0}
                      step="any"
                      placeholder="e.g. 500000"
                      value={dieselLiters}
                      onChange={(e) => setDieselLiters(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="input-gasoline"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Gasoline C (Liters/yr)
                    </label>
                    <input
                      id="input-gasoline"
                      type="number"
                      min={0}
                      step="any"
                      placeholder="e.g. 250000"
                      value={gasolineLiters}
                      onChange={(e) => setGasolineLiters(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="input-ethanol"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Hydrated Ethanol (Liters/yr)
                    </label>
                    <input
                      id="input-ethanol"
                      type="number"
                      min={0}
                      step="any"
                      placeholder="e.g. 100000"
                      value={ethanolLiters}
                      onChange={(e) => setEthanolLiters(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="input-fleet-year"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Reporting Year
                    </label>
                    <input
                      id="input-fleet-year"
                      type="number"
                      min={1990}
                      max={2100}
                      value={fleetYear}
                      onChange={(e) => setFleetYear(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="input-fleet-boundary"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Inventory Boundary / Coverage
                    </label>
                    <select
                      id="input-fleet-boundary"
                      value={fleetBoundary}
                      onChange={(e) =>
                        setFleetBoundary(e.target.value as CoverageBoundary)
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    >
                      {BOUNDARY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Required source reference (e.g. SEMOB Municipal Fleet Fuel Log 2024)"
                  value={fleetSource}
                  onChange={(e) => setFleetSource(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-600 focus:outline-none"
                />

                {fleetCalc?.output && (
                  <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-700">
                    <div className="font-mono font-semibold text-emerald-700">
                      Fossil: {fleetCalc.output.fossil_tco2e.toLocaleString("en-US")} tCO₂e
                      {" • "}
                      <span className="text-sky-700">
                        Biogenic CO₂ (separate):{" "}
                        {fleetCalc.output.biogenic_co2_tco2.toLocaleString("en-US")} tCO₂
                      </span>
                    </div>
                  </div>
                )}

                {renderMergeNotice(
                  fleetBoundary,
                  parseYear(fleetYear, 2024),
                  fleetCalc
                )}
              </div>
            )}
          </div>

          {/* 3. Solid Waste */}
          <div className="rounded-xl border border-slate-200 p-4">
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-900">
                  3. Solid Waste Landfill Tonnage (Simplified Screening)
                </span>
                <p className="text-xs text-slate-500">
                  Screening mass-balance approximation (not full IPCC FOD cohort
                  model)
                </p>
              </div>
              <input
                type="checkbox"
                checked={useWaste}
                onChange={(e) => setUseWaste(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
            </label>

            {useWaste && (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="input-waste-tons"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Landfill Mass (Metric tons / year)
                    </label>
                    <input
                      id="input-waste-tons"
                      type="number"
                      min={0}
                      step="any"
                      placeholder="e.g. 135000"
                      value={wasteTons}
                      onChange={(e) => setWasteTons(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={hasMethaneCapture}
                        onChange={(e) => setHasMethaneCapture(e.target.checked)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      Active landfill biogas capture (55% default reduction)
                    </label>
                  </div>

                  <div>
                    <label
                      htmlFor="input-waste-year"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Reporting Year
                    </label>
                    <input
                      id="input-waste-year"
                      type="number"
                      min={1990}
                      max={2100}
                      value={wasteYear}
                      onChange={(e) => setWasteYear(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="input-waste-boundary"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Inventory Boundary / Coverage
                  </label>
                  <select
                    id="input-waste-boundary"
                    value={wasteBoundary}
                    onChange={(e) =>
                      setWasteBoundary(e.target.value as CoverageBoundary)
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                  >
                    {BOUNDARY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  type="text"
                  placeholder="Required source reference (e.g. Municipal Landfill Weighbridge 2025)"
                  value={wasteSource}
                  onChange={(e) => setWasteSource(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-600 focus:outline-none"
                />

                {wasteCalc?.output && (
                  <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-700">
                    <div className="font-mono font-semibold text-emerald-700">
                      Screening Estimate:{" "}
                      {wasteCalc.output.fossil_tco2e.toLocaleString("en-US")} tCO₂e
                    </div>
                  </div>
                )}

                {renderMergeNotice(
                  wasteBoundary,
                  parseYear(wasteYear, baseInventoryYear),
                  wasteCalc
                )}
              </div>
            )}
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              onReset();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Public Baseline
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800"
            >
              <Save className="h-3.5 w-3.5" />
              Save &amp; Evaluate
              <Calculator className="h-3.5 w-3.5 opacity-80" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
