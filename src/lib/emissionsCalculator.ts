/**
 * Pure, deterministic emission calculation and override engine for Municipal Climate Lens.
 *
 * Uses the versioned factor registry (`src/lib/emissionFactors.ts`).
 * Strictly zero LLM calls or non-deterministic randomness.
 *
 * Reliability guarantees:
 * 1. Missing values (`null`, `UNAVAILABLE`) are never coerced to `0.0`.
 * 2. Local origin (`LOCAL`) is separated from `verification_status` (`DOCUMENTED`,
 *    `REVIEW_REQUIRED`, `UNVERIFIED`, `INDEPENDENTLY_VERIFIED`). Local entry alone
 *    never implies verification.
 * 3. Partial boundaries (`MUNICIPAL_GOVERNMENT_FLEET`, `PUBLIC_TRANSIT_OPERATOR`,
 *    `PARTIAL_FACILITY_OR_SECTOR`, `UNKNOWN`) and mismatched inventory years never
 *    overwrite citywide baseline totals; they are retained separately as
 *    `PartialOrUnmergedEstimate` records.
 * 4. Factors are selected strictly by activity and reporting year. Unverified factors
 *    prevent the resulting estimate from being marked validated/documented.
 */

import {
  CityClimateRecord,
  CoverageBoundary,
  CoverageStatus,
  DataOrigin,
  EmissionsSummary,
  GPC_SECTOR_CODES,
  GPCSectorCode,
  LocalOverride,
  PartialOrUnmergedEstimate,
  ProvenanceMix,
  SectorEmissionRecord,
  SubsectorEmissionRecord,
  validateLocalOverride,
  VerificationStatus,
} from "../../data/schema/city";
import {
  EmissionFactorEntry,
  selectEmissionFactor,
} from "./emissionFactors";

export interface FactorCalculationOutput {
  fossil_tco2e: number;
  biogenic_co2_tco2: number;
  factor_ids: string[];
  all_factors_verified: boolean;
  factor_warnings: string[];
  used_factors: EmissionFactorEntry[];
}

export interface AppliedOverrideResult {
  city: CityClimateRecord;
  merged_components: Array<"electricity" | "fleet_fuels" | "solid_waste">;
  partial_or_unmerged_estimates: PartialOrUnmergedEstimate[];
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function round4(val: number): number {
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
}

/**
 * Calculate Stationary Energy grid electricity emissions (tCO2e) using the
 * versioned SIN grid factor strictly matched to `reportingYear`.
 */
export function calculateElectricityEmissions(
  mwhPerYear: number,
  reportingYear: number
): FactorCalculationOutput {
  if (!Number.isFinite(mwhPerYear) || mwhPerYear < 0) {
    throw new Error("mwhPerYear must be a non-negative finite number");
  }
  const lookup = selectEmissionFactor("grid_electricity_sin", reportingYear);
  if (!lookup.found || !lookup.factor) {
    throw new Error(lookup.reason);
  }

  const f = lookup.factor;
  const warnings =
    f.verification_status === "UNVERIFIED"
      ? [f.assumptions_and_limitations]
      : [];

  return {
    fossil_tco2e: round2(mwhPerYear * f.fossil_value),
    biogenic_co2_tco2: round2(mwhPerYear * f.biogenic_co2_value),
    factor_ids: [f.factor_id],
    all_factors_verified: f.verification_status === "VERIFIED",
    factor_warnings: warnings,
    used_factors: [f],
  };
}

/**
 * Calculate On-Road Transportation emissions (fossil tCO2e + separate biogenic CO2)
 * using the versioned mobile combustion factor registry.
 */
export function calculateFleetFuelEmissions(
  fuels: {
    diesel_liters: number;
    gasoline_liters: number;
    ethanol_liters: number;
  },
  reportingYear: number
): FactorCalculationOutput {
  const { diesel_liters, gasoline_liters, ethanol_liters } = fuels;
  if (
    !Number.isFinite(diesel_liters) ||
    diesel_liters < 0 ||
    !Number.isFinite(gasoline_liters) ||
    gasoline_liters < 0 ||
    !Number.isFinite(ethanol_liters) ||
    ethanol_liters < 0
  ) {
    throw new Error("Fuel liter amounts must be non-negative finite numbers");
  }

  const dieselLookup = selectEmissionFactor("diesel_b14_mobile", reportingYear);
  const gasLookup = selectEmissionFactor("gasoline_c_mobile", reportingYear);
  const ethLookup = selectEmissionFactor(
    "ethanol_hydrated_mobile",
    reportingYear
  );

  // Mobile combustion factors in registry are currently registered for 2024;
  // never silently substitute across years.
  if (!dieselLookup.found || !dieselLookup.factor) {
    throw new Error(dieselLookup.reason);
  }
  if (!gasLookup.found || !gasLookup.factor) {
    throw new Error(gasLookup.reason);
  }
  if (!ethLookup.found || !ethLookup.factor) {
    throw new Error(ethLookup.reason);
  }

  const df = dieselLookup.factor;
  const gf = gasLookup.factor;
  const ef = ethLookup.factor;

  const fossil =
    diesel_liters * df.fossil_value +
    gasoline_liters * gf.fossil_value +
    ethanol_liters * ef.fossil_value;
  const biogenic =
    diesel_liters * df.biogenic_co2_value +
    gasoline_liters * gf.biogenic_co2_value +
    ethanol_liters * ef.biogenic_co2_value;

  const used = [df, gf, ef];
  const warnings = used
    .filter((f) => f.verification_status === "UNVERIFIED")
    .map((f) => `${f.factor_id}: ${f.assumptions_and_limitations}`);

  return {
    fossil_tco2e: round2(fossil),
    biogenic_co2_tco2: round2(biogenic),
    factor_ids: used.map((f) => f.factor_id),
    all_factors_verified: used.every((f) => f.verification_status === "VERIFIED"),
    factor_warnings: warnings,
    used_factors: used,
  };
}

/**
 * Calculate Solid Waste landfill emissions using the simplified MSW screening
 * method, explicitly returning its factor verification status and limitations.
 */
export function calculateSolidWasteEmissions(
  waste: {
    tons_per_year: number;
    has_methane_capture: boolean;
    methane_capture_efficiency?: number;
  },
  reportingYear: number
): FactorCalculationOutput {
  const { tons_per_year, has_methane_capture, methane_capture_efficiency } =
    waste;
  if (!Number.isFinite(tons_per_year) || tons_per_year < 0) {
    throw new Error("tons_per_year must be a non-negative finite number");
  }

  const lookup = selectEmissionFactor(
    "solid_waste_landfill_simplified",
    reportingYear
  );
  if (!lookup.found || !lookup.factor) {
    throw new Error(lookup.reason);
  }
  const f = lookup.factor;

  const captureRate = has_methane_capture ? (methane_capture_efficiency ?? 0.55) : 0;
  if (!Number.isFinite(captureRate) || captureRate < 0 || captureRate > 1) {
    throw new Error("methane_capture_efficiency must be between 0.0 and 1.0");
  }

  const gross = tons_per_year * f.fossil_value;
  const net = gross * (1 - captureRate);

  return {
    fossil_tco2e: round2(net),
    biogenic_co2_tco2: 0,
    factor_ids: [f.factor_id],
    all_factors_verified: f.verification_status === "VERIFIED",
    factor_warnings:
      f.verification_status === "UNVERIFIED"
        ? [f.assumptions_and_limitations]
        : [],
    used_factors: [f],
  };
}

function determineOverrideVerificationStatus(params: {
  sourceReference: string;
  needsReview?: boolean;
  allFactorsVerified: boolean;
}): VerificationStatus {
  const hasAdequateSource = params.sourceReference.trim().length >= 5;
  if (params.needsReview) {
    return "REVIEW_REQUIRED";
  }
  if (!params.allFactorsVerified) {
    return "UNVERIFIED";
  }
  if (!hasAdequateSource) {
    return "REVIEW_REQUIRED";
  }
  // Client-side entry with adequate evidence & verified factor is DOCUMENTED,
  // never INDEPENDENTLY_VERIFIED without an external review mechanism.
  return "DOCUMENTED";
}

function buildProvenanceMixLabel(
  localShare: number,
  modeledShare: number,
  proxyShare: number,
  missingCount: number
): { is_mixed: boolean; summary_label: string } {
  const parts: string[] = [];
  if (localShare > 0.0005) parts.push(`${(localShare * 100).toFixed(1)}% Local`);
  if (modeledShare > 0.0005)
    parts.push(`${(modeledShare * 100).toFixed(1)}% Modeled`);
  if (proxyShare > 0.0005) parts.push(`${(proxyShare * 100).toFixed(1)}% Proxy`);

  const isMixed = parts.length > 1;
  const prefix = isMixed ? "Mixed: " : "";
  const coverageSuffix =
    missingCount > 0
      ? ` — Partial coverage (${missingCount} component${missingCount > 1 ? "s" : ""} unavailable)`
      : "";

  return {
    is_mixed: isMixed,
    summary_label:
      parts.length > 0
        ? `${prefix}${parts.join(" / ")}${coverageSuffix}`
        : `No available emissions${coverageSuffix}`,
  };
}

/**
 * Recompute a sector's total emissions, coverage status, missing subsectors,
 * and honest aggregate origin/verification status from its subsectors.
 */
export function recalculateSectorRecord(
  sector: SectorEmissionRecord
): SectorEmissionRecord {
  const availableSubs = sector.subsectors.filter(
    (s) => s.availability_status === "AVAILABLE" && s.emissions_tco2e !== null
  );
  const missingSubsectors = sector.subsectors
    .filter((s) => s.availability_status !== "AVAILABLE")
    .map((s) => s.subsector_key);

  const coverageStatus: CoverageStatus =
    availableSubs.length === 0
      ? "UNAVAILABLE"
      : missingSubsectors.length > 0
        ? "PARTIAL"
        : "COMPLETE";

  const totalEmissions =
    availableSubs.length === 0
      ? null
      : round2(
          availableSubs.reduce(
            (sum, s) => sum + (s.emissions_tco2e as number),
            0
          )
        );

  const origins = new Set<DataOrigin>(
    sector.subsectors.map((s) => s.data_origin)
  );
  const dataOrigin: DataOrigin | "MIXED" =
    origins.size === 1 ? [...origins][0] : "MIXED";

  // Conservative aggregate verification: only DOCUMENTED/INDEPENDENTLY_VERIFIED if all AVAILABLE subsectors are
  const availStatuses = new Set(availableSubs.map((s) => s.verification_status));
  let verificationStatus: VerificationStatus = "UNVERIFIED";
  if (availStatuses.has("REVIEW_REQUIRED")) {
    verificationStatus = "REVIEW_REQUIRED";
  } else if (availStatuses.has("UNVERIFIED")) {
    verificationStatus = "UNVERIFIED";
  } else if (availStatuses.has("DOCUMENTED")) {
    verificationStatus = "DOCUMENTED";
  } else if (availStatuses.has("INDEPENDENTLY_VERIFIED")) {
    verificationStatus = "INDEPENDENTLY_VERIFIED";
  }

  return {
    ...sector,
    emissions_tco2e: totalEmissions,
    coverage_status: coverageStatus,
    missing_subsectors: missingSubsectors,
    data_origin: dataOrigin,
    verification_status: verificationStatus,
  };
}

/**
 * Compute citywide EmissionsSummary from the 5 GPC sectors.
 * Never coerces missing subsectors to 0; labels incomplete totals as PARTIAL.
 */
export function computeEmissionsSummary(
  sectors: Record<GPCSectorCode, SectorEmissionRecord>,
  population: number,
  referenceYear: number
): EmissionsSummary {
  let totalEmissions = 0;
  let availableSectorCount = 0;
  let dominantSector: GPCSectorCode | null = null;
  let maxSectorEmissions = -Infinity;

  const missingComponents: string[] = [];
  let totalAbsSubsector = 0;
  let localAbs = 0;
  let modeledAbs = 0;
  let proxyAbs = 0;

  for (const code of GPC_SECTOR_CODES) {
    const sector = sectors[code];
    for (const missingKey of sector.missing_subsectors) {
      missingComponents.push(`${code}.${missingKey}`);
    }

    if (sector.emissions_tco2e !== null) {
      totalEmissions += sector.emissions_tco2e;
      availableSectorCount += 1;
      if (sector.emissions_tco2e > maxSectorEmissions) {
        maxSectorEmissions = sector.emissions_tco2e;
        dominantSector = code;
      }
    }

    for (const sub of sector.subsectors) {
      if (sub.availability_status !== "AVAILABLE" || sub.emissions_tco2e === null) {
        continue;
      }
      const absVal = Math.abs(sub.emissions_tco2e);
      totalAbsSubsector += absVal;
      if (sub.data_origin === "LOCAL") localAbs += absVal;
      else if (sub.data_origin === "MODELED") modeledAbs += absVal;
      else proxyAbs += absVal;
    }
  }

  const roundedTotal =
    availableSectorCount === 0 ? null : round2(totalEmissions);
  const perCapita =
    roundedTotal !== null && population > 0
      ? round4(roundedTotal / population)
      : null;

  const coverageStatus: CoverageStatus =
    availableSectorCount === 0
      ? "UNAVAILABLE"
      : missingComponents.length > 0
        ? "PARTIAL"
        : "COMPLETE";

  let localShare = 0;
  let modeledShare = 0;
  let proxyShare = 0;
  if (totalAbsSubsector > 0) {
    localShare = round4(localAbs / totalAbsSubsector);
    modeledShare = round4(modeledAbs / totalAbsSubsector);
    proxyShare = round4(Math.max(0, 1 - localShare - modeledShare));
  }

  const mixMeta = buildProvenanceMixLabel(
    localShare,
    modeledShare,
    proxyShare,
    missingComponents.length
  );

  const provenanceMix: ProvenanceMix = {
    local_share: localShare,
    modeled_share: modeledShare,
    proxy_share: proxyShare,
    is_mixed: mixMeta.is_mixed,
    summary_label: mixMeta.summary_label,
  };

  return {
    total_emissions_tco2e: roundedTotal,
    per_capita_tco2e: perCapita,
    coverage_status: coverageStatus,
    missing_components: missingComponents,
    reference_year: referenceYear,
    dominant_sector: dominantSector,
    provenance_mix: provenanceMix,
  };
}

function checkMergeCompatibility(params: {
  boundary: CoverageBoundary;
  reportingYear: number;
  baseYear: number;
  factorVerified: boolean;
}): { canMerge: boolean; reason: string } {
  if (params.boundary !== "MUNICIPALITY_WIDE") {
    return {
      canMerge: false,
      reason: `Boundary "${params.boundary}" is partial or unknown and cannot replace the municipality-wide baseline without double-counting or under-counting.`,
    };
  }
  if (params.reportingYear !== params.baseYear) {
    return {
      canMerge: false,
      reason: `Reporting year ${params.reportingYear} does not match the city baseline inventory year ${params.baseYear}; different inventory years are never silently combined into a single-year total.`,
    };
  }
  if (!params.factorVerified) {
    return {
      canMerge: false,
      reason:
        "Emission factor is marked UNVERIFIED in the factor registry and cannot replace the citywide baseline as a validated figure.",
    };
  }
  return { canMerge: true, reason: "Compatible municipality-wide inventory input." };
}

/**
 * Pure, deterministic override engine.
 * - Preserves `baseCity` immutably.
 * - Replaces citywide subsectors ONLY when boundary === "MUNICIPALITY_WIDE",
 *   reporting_year === baseCity.emissions_summary.reference_year, and factor is VERIFIED.
 * - Keeps partial, mismatched-year, or unverified-factor inputs separately in
 *   `partial_or_unmerged_estimates` without altering the citywide baseline.
 */
export function applyLocalOverrides(
  baseCity: CityClimateRecord,
  override: LocalOverride
): AppliedOverrideResult {
  const validation = validateLocalOverride(override);
  if (!validation.valid) {
    throw new Error(
      `Invalid LocalOverride payload: ${validation.errors.join("; ")}`
    );
  }

  const nextCity: CityClimateRecord = JSON.parse(JSON.stringify(baseCity));
  const baseYear = nextCity.emissions_summary.reference_year;
  const mergedComponents: Array<"electricity" | "fleet_fuels" | "solid_waste"> =
    [];
  const partialOrUnmerged: PartialOrUnmergedEstimate[] = [];

  // 1. Grid Electricity
  if (override.electricity !== undefined) {
    const e = override.electricity;
    const calc = calculateElectricityEmissions(e.mwh_per_year, e.reporting_year);
    const verStatus = determineOverrideVerificationStatus({
      sourceReference: e.source_reference,
      needsReview: e.needs_review,
      allFactorsVerified: calc.all_factors_verified,
    });
    const compat = checkMergeCompatibility({
      boundary: e.coverage_boundary,
      reportingYear: e.reporting_year,
      baseYear,
      factorVerified: calc.all_factors_verified,
    });

    if (compat.canMerge) {
      mergedComponents.push("electricity");
      nextCity.sectors.STATIONARY_ENERGY.subsectors =
        nextCity.sectors.STATIONARY_ENERGY.subsectors.map((sub) =>
          sub.subsector_key === "grid_electricity"
            ? {
                ...sub,
                emissions_tco2e: calc.fossil_tco2e,
                biogenic_co2_tco2: calc.biogenic_co2_tco2,
                availability_status: "AVAILABLE",
                availability_reason: `Local municipality-wide electricity activity supplied (${e.mwh_per_year.toLocaleString("en-US")} MWh/yr).`,
                data_origin: "LOCAL",
                verification_status: verStatus,
                data_source:
                  e.source_reference.trim() || "Local entry (source reference missing)",
                source_reference:
                  e.source_reference.trim() || "Source reference missing",
                reference_year: e.reporting_year,
                reporting_period: String(e.reporting_year),
                geographic_coverage: `Municipality-wide (${nextCity.metadata.ibge_code})`,
                operational_coverage: "Scope 2 purchased grid electricity",
                methodology_note:
                  e.methodology_note?.trim() ||
                  `${e.mwh_per_year.toLocaleString("en-US")} MWh × ${calc.used_factors[0].fossil_value} ${calc.used_factors[0].unit} (${calc.factor_ids[0]}).`,
                factor_id: calc.factor_ids[0],
                limitations: calc.used_factors[0].assumptions_and_limitations,
                gap_note:
                  verStatus === "DOCUMENTED"
                    ? "Local activity and source reference documented; external third-party verification not performed in this static tool."
                    : "Review required: provide a verifiable municipal utility billing reference.",
              }
            : sub
        );
      nextCity.sectors.STATIONARY_ENERGY = recalculateSectorRecord(
        nextCity.sectors.STATIONARY_ENERGY
      );
    } else {
      partialOrUnmerged.push({
        component: "electricity",
        target_sector: "STATIONARY_ENERGY",
        target_subsector: "grid_electricity",
        calculated_tco2e: calc.fossil_tco2e,
        biogenic_co2_tco2: calc.biogenic_co2_tco2,
        reporting_year: e.reporting_year,
        coverage_boundary: e.coverage_boundary,
        data_origin: "LOCAL",
        verification_status: verStatus,
        factor_ids: calc.factor_ids,
        factor_verified: calc.all_factors_verified,
        source_reference: e.source_reference.trim() || "Source reference missing",
        reason_not_merged: compat.reason,
        limitations: calc.used_factors[0].assumptions_and_limitations,
      });
    }
  }

  // 2. Fleet Fuels
  if (override.fleet_fuels !== undefined) {
    const f = override.fleet_fuels;
    const calc = calculateFleetFuelEmissions(
      {
        diesel_liters: f.diesel_liters,
        gasoline_liters: f.gasoline_liters,
        ethanol_liters: f.ethanol_liters,
      },
      f.reporting_year
    );
    const verStatus = determineOverrideVerificationStatus({
      sourceReference: f.source_reference,
      needsReview: f.needs_review,
      allFactorsVerified: calc.all_factors_verified,
    });
    const compat = checkMergeCompatibility({
      boundary: f.coverage_boundary,
      reportingYear: f.reporting_year,
      baseYear,
      factorVerified: calc.all_factors_verified,
    });

    if (compat.canMerge) {
      mergedComponents.push("fleet_fuels");
      nextCity.sectors.TRANSPORTATION.subsectors =
        nextCity.sectors.TRANSPORTATION.subsectors.map((sub) =>
          sub.subsector_key === "on_road_transportation"
            ? {
                ...sub,
                emissions_tco2e: calc.fossil_tco2e,
                biogenic_co2_tco2: calc.biogenic_co2_tco2,
                availability_status: "AVAILABLE",
                availability_reason:
                  "Local municipality-wide on-road fuel sales supplied.",
                data_origin: "LOCAL",
                verification_status: verStatus,
                data_source:
                  f.source_reference.trim() || "Local entry (source reference missing)",
                source_reference:
                  f.source_reference.trim() || "Source reference missing",
                reference_year: f.reporting_year,
                reporting_period: String(f.reporting_year),
                geographic_coverage: `Municipality-wide (${nextCity.metadata.ibge_code})`,
                operational_coverage:
                  "Scope 1 on-road mobile combustion (fossil CO2e; biogenic CO2 tracked separately)",
                methodology_note:
                  f.methodology_note?.trim() ||
                  `Diesel ${f.diesel_liters.toLocaleString("en-US")} L + Gasoline C ${f.gasoline_liters.toLocaleString("en-US")} L + Ethanol ${f.ethanol_liters.toLocaleString("en-US")} L using ${calc.factor_ids.join(", ")}.`,
                factor_id: calc.factor_ids.join(", "),
                limitations: calc.factor_warnings.join(" | "),
                gap_note:
                  "Audit fuel factors against the official PBGHG Excel tool for the exact reporting year.",
              }
            : sub
        );
      nextCity.sectors.TRANSPORTATION = recalculateSectorRecord(
        nextCity.sectors.TRANSPORTATION
      );
    } else {
      partialOrUnmerged.push({
        component: "fleet_fuels",
        target_sector: "TRANSPORTATION",
        target_subsector: "on_road_transportation",
        calculated_tco2e: calc.fossil_tco2e,
        biogenic_co2_tco2: calc.biogenic_co2_tco2,
        reporting_year: f.reporting_year,
        coverage_boundary: f.coverage_boundary,
        data_origin: "LOCAL",
        verification_status: verStatus,
        factor_ids: calc.factor_ids,
        factor_verified: calc.all_factors_verified,
        source_reference: f.source_reference.trim() || "Source reference missing",
        reason_not_merged: compat.reason,
        limitations: calc.factor_warnings.join(" | "),
      });
    }
  }

  // 3. Solid Waste
  if (override.solid_waste !== undefined) {
    const w = override.solid_waste;
    const calc = calculateSolidWasteEmissions(
      {
        tons_per_year: w.tons_per_year,
        has_methane_capture: w.has_methane_capture,
        methane_capture_efficiency: w.methane_capture_efficiency,
      },
      w.reporting_year
    );
    const verStatus = determineOverrideVerificationStatus({
      sourceReference: w.source_reference,
      needsReview: w.needs_review,
      allFactorsVerified: calc.all_factors_verified,
    });
    const compat = checkMergeCompatibility({
      boundary: w.coverage_boundary,
      reportingYear: w.reporting_year,
      baseYear,
      factorVerified: calc.all_factors_verified,
    });

    if (compat.canMerge) {
      mergedComponents.push("solid_waste");
      nextCity.sectors.WASTE.subsectors =
        nextCity.sectors.WASTE.subsectors.map((sub) =>
          sub.subsector_key === "solid_waste_disposal"
            ? {
                ...sub,
                emissions_tco2e: calc.fossil_tco2e,
                biogenic_co2_tco2: 0,
                availability_status: "AVAILABLE",
                availability_reason:
                  "Local municipality-wide solid waste landfill tonnage supplied.",
                data_origin: "LOCAL",
                verification_status: verStatus,
                data_source:
                  w.source_reference.trim() || "Local entry (source reference missing)",
                source_reference:
                  w.source_reference.trim() || "Source reference missing",
                reference_year: w.reporting_year,
                reporting_period: String(w.reporting_year),
                geographic_coverage: `Municipality-wide (${nextCity.metadata.ibge_code})`,
                operational_coverage: "Solid waste landfill disposal",
                methodology_note:
                  w.methodology_note?.trim() ||
                  `${w.tons_per_year.toLocaleString("en-US")} t/yr using ${calc.factor_ids[0]}.`,
                factor_id: calc.factor_ids[0],
                limitations: calc.used_factors[0].assumptions_and_limitations,
                gap_note:
                  "Replace simplified screening factor with a calibrated IPCC FOD cohort model and landfill gas flow logs.",
              }
            : sub
        );
      nextCity.sectors.WASTE = recalculateSectorRecord(nextCity.sectors.WASTE);
    } else {
      partialOrUnmerged.push({
        component: "solid_waste",
        target_sector: "WASTE",
        target_subsector: "solid_waste_disposal",
        calculated_tco2e: calc.fossil_tco2e,
        biogenic_co2_tco2: 0,
        reporting_year: w.reporting_year,
        coverage_boundary: w.coverage_boundary,
        data_origin: "LOCAL",
        verification_status: verStatus,
        factor_ids: calc.factor_ids,
        factor_verified: calc.all_factors_verified,
        source_reference: w.source_reference.trim() || "Source reference missing",
        reason_not_merged: compat.reason,
        limitations: calc.used_factors[0].assumptions_and_limitations,
      });
    }
  }

  nextCity.emissions_summary = computeEmissionsSummary(
    nextCity.sectors,
    nextCity.metadata.population,
    baseYear
  );

  return {
    city: nextCity,
    merged_components: mergedComponents,
    partial_or_unmerged_estimates: partialOrUnmerged,
  };
}
