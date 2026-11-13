"use client";

import React, { useEffect, useState } from "react";
import {
  Calculator,
  RotateCcw,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { LocalOverride } from "../../data/schema/city";
import {
  BRAZIL_EMISSION_FACTORS,
  calculateElectricityEmissions,
  calculateFleetFuelEmissions,
  calculateSolidWasteEmissions,
} from "../lib/emissionsCalculator";

interface LocalOverrideDrawerProps {
  open: boolean;
  onClose: () => void;
  cityName: string;
  defaultYear: number;
  currentOverride: LocalOverride | null;
  onSave: (override: LocalOverride) => void;
  onReset: () => void;
}

function parseNonNegative(val: string): number {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function LocalOverrideDrawer({
  open,
  onClose,
  cityName,
  defaultYear,
  currentOverride,
  onSave,
  onReset,
}: LocalOverrideDrawerProps) {
  const [refYear, setRefYear] = useState<string>(String(defaultYear));

  // Electricity
  const [useElec, setUseElec] = useState(false);
  const [mwhPerYear, setMwhPerYear] = useState("");
  const [elecSource, setElecSource] = useState("");

  // Fleet fuels
  const [useFleet, setUseFleet] = useState(false);
  const [dieselLiters, setDieselLiters] = useState("");
  const [gasolineLiters, setGasolineLiters] = useState("");
  const [ethanolLiters, setEthanolLiters] = useState("");
  const [fleetSource, setFleetSource] = useState("");

  // Solid waste
  const [useWaste, setUseWaste] = useState(false);
  const [wasteTons, setWasteTons] = useState("");
  const [hasMethaneCapture, setHasMethaneCapture] = useState(false);
  const [wasteSource, setWasteSource] = useState("");

  useEffect(() => {
    setRefYear(String(currentOverride?.reference_year ?? defaultYear));

    setUseElec(currentOverride?.electricity !== undefined);
    setMwhPerYear(
      currentOverride?.electricity
        ? String(currentOverride.electricity.mwh_per_year)
        : ""
    );
    setElecSource(currentOverride?.electricity?.source_note ?? "");

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
    setFleetSource(currentOverride?.fleet_fuels?.source_note ?? "");

    setUseWaste(currentOverride?.solid_waste !== undefined);
    setWasteTons(
      currentOverride?.solid_waste
        ? String(currentOverride.solid_waste.tons_per_year)
        : ""
    );
    setHasMethaneCapture(
      currentOverride?.solid_waste?.has_methane_capture ?? false
    );
    setWasteSource(currentOverride?.solid_waste?.source_note ?? "");
  }, [currentOverride, defaultYear, open]);

  if (!open) return null;

  const previewElec = useElec
    ? calculateElectricityEmissions(parseNonNegative(mwhPerYear))
    : null;
  const previewFleet = useFleet
    ? calculateFleetFuelEmissions({
        diesel_liters: parseNonNegative(dieselLiters),
        gasoline_liters: parseNonNegative(gasolineLiters),
        ethanol_liters: parseNonNegative(ethanolLiters),
      })
    : null;
  const previewWaste = useWaste
    ? calculateSolidWasteEmissions({
        tons_per_year: parseNonNegative(wasteTons),
        has_methane_capture: hasMethaneCapture,
      })
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedYear = parseInt(refYear, 10);
    const nextOverride: LocalOverride = {
      reference_year:
        Number.isInteger(parsedYear) && parsedYear >= 1990 && parsedYear <= 2100
          ? parsedYear
          : defaultYear,
    };

    if (useElec) {
      nextOverride.electricity = {
        mwh_per_year: parseNonNegative(mwhPerYear),
        source_note: elecSource.trim() || undefined,
      };
    }
    if (useFleet) {
      nextOverride.fleet_fuels = {
        diesel_liters: parseNonNegative(dieselLiters),
        gasoline_liters: parseNonNegative(gasolineLiters),
        ethanol_liters: parseNonNegative(ethanolLiters),
        source_note: fleetSource.trim() || undefined,
      };
    }
    if (useWaste) {
      nextOverride.solid_waste = {
        tons_per_year: parseNonNegative(wasteTons),
        has_methane_capture: hasMethaneCapture,
        source_note: wasteSource.trim() || undefined,
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

  return (
    <div
      className="no-print fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="override-drawer-title"
    >
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="h-5 w-5 text-emerald-700" />
            <div>
              <h2
                id="override-drawer-title"
                className="text-lg font-bold text-slate-900"
              >
                Local Municipal Data Override — {cityName}
              </h2>
              <p className="text-xs text-slate-500">
                100% client-side deterministic recalculation. Saved to browser{" "}
                <code className="font-mono">localStorage</code>.
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

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-6 overflow-y-auto px-6 py-5"
        >
          {/* Reference Year */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <label
                htmlFor="override-ref-year"
                className="text-xs font-semibold text-slate-800"
              >
                Local Activity Reference Year
              </label>
              <p className="text-[11px] text-slate-500">
                Year of the municipal utility, fuel, or landfill records.
              </p>
            </div>
            <input
              id="override-ref-year"
              type="number"
              min={1990}
              max={2100}
              value={refYear}
              onChange={(e) => setRefYear(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-right font-mono text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {/* 1. Grid Electricity */}
          <div className="rounded-xl border border-slate-200 p-4">
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-900">
                  1. Grid Electricity Consumption (Scope 2)
                </span>
                <p className="text-xs text-slate-500">
                  Upgrades <code className="font-mono">grid_electricity</code>{" "}
                  to <code className="font-mono text-emerald-700">T1_LOCAL</code>
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
                  <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600">
                    <div className="font-semibold text-slate-800">
                      Deterministic Formula (Brazil SIN Grid):
                    </div>
                    <div className="mt-0.5 font-mono">
                      MWh × {BRAZIL_EMISSION_FACTORS.SIN_GRID_TCO2E_PER_MWH}{" "}
                      tCO₂e/MWh
                    </div>
                    <div className="mt-1 font-mono font-semibold text-emerald-700">
                      Preview: {previewElec?.toLocaleString("en-US")} tCO₂e
                    </div>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Optional source note (e.g. Copel Distribuição 2025 Annual Report)"
                  value={elecSource}
                  onChange={(e) => setElecSource(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* 2. Fleet Fuel Consumption */}
          <div className="rounded-xl border border-slate-200 p-4">
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-900">
                  2. On-Road Fleet Fuel Consumption
                </span>
                <p className="text-xs text-slate-500">
                  Upgrades{" "}
                  <code className="font-mono">on_road_transportation</code> to{" "}
                  <code className="font-mono text-emerald-700">T1_LOCAL</code>
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
                      placeholder="e.g. 150000000"
                      value={dieselLiters}
                      onChange={(e) => setDieselLiters(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                    <span className="mt-0.5 block font-mono text-[10px] text-slate-500">
                      × {BRAZIL_EMISSION_FACTORS.DIESEL_B14_TCO2E_PER_LITER}{" "}
                      tCO₂e/L
                    </span>
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
                      placeholder="e.g. 140000000"
                      value={gasolineLiters}
                      onChange={(e) => setGasolineLiters(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                    <span className="mt-0.5 block font-mono text-[10px] text-slate-500">
                      × {BRAZIL_EMISSION_FACTORS.GASOLINE_C_TCO2E_PER_LITER}{" "}
                      tCO₂e/L
                    </span>
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
                      placeholder="e.g. 85000000"
                      value={ethanolLiters}
                      onChange={(e) => setEthanolLiters(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                    <span className="mt-0.5 block font-mono text-[10px] text-slate-500">
                      ×{" "}
                      {BRAZIL_EMISSION_FACTORS.ETHANOL_HYDRATED_TCO2E_PER_LITER}{" "}
                      tCO₂e/L
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span className="text-slate-600">
                    MCTI / GHG Protocol Brazil Mobile Combustion Factors
                  </span>
                  <span className="font-mono font-semibold text-emerald-700">
                    Preview: {previewFleet?.toLocaleString("en-US")} tCO₂e
                  </span>
                </div>

                <input
                  type="text"
                  placeholder="Optional source note (e.g. ANP SIMP Retail Sales + TCCC Fleet Log)"
                  value={fleetSource}
                  onChange={(e) => setFleetSource(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* 3. Solid Waste Landfill */}
          <div className="rounded-xl border border-slate-200 p-4">
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-900">
                  3. Solid Waste Landfill Tonnage
                </span>
                <p className="text-xs text-slate-500">
                  Upgrades{" "}
                  <code className="font-mono">solid_waste_disposal</code> to{" "}
                  <code className="font-mono text-emerald-700">T1_LOCAL</code>
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
                    <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={hasMethaneCapture}
                        onChange={(e) => setHasMethaneCapture(e.target.checked)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      Active landfill biogas (CH₄) capture &amp; flaring (55%
                      reduction)
                    </label>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600">
                    <div className="font-semibold text-slate-800">
                      Deterministic Formula (IPCC / SEEG MSW):
                    </div>
                    <div className="mt-0.5 font-mono">
                      Tons ×{" "}
                      {BRAZIL_EMISSION_FACTORS.SOLID_WASTE_UNCAPTURED_TCO2E_PER_TON}{" "}
                      tCO₂e/t × (1 − {hasMethaneCapture ? "0.55" : "0.00"})
                    </div>
                    <div className="mt-1 font-mono font-semibold text-emerald-700">
                      Preview: {previewWaste?.toLocaleString("en-US")} tCO₂e
                    </div>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Optional source note (e.g. Municipal Landfill Weighbridge 2025)"
                  value={wasteSource}
                  onChange={(e) => setWasteSource(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            )}
          </div>
        </form>

        {/* Footer Actions */}
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
              Apply &amp; Recalculate
              <Calculator className="h-3.5 w-3.5 opacity-80" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
