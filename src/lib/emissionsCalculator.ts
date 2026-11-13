/**
 * Pure, deterministic emission calculation and override engine for Municipal Climate Lens.
 *
 * Uses official Brazilian emission factors:
 * - SIN (Sistema Interligado Nacional) Grid Electricity Factor (MCTI)
 * - Brazilian GHG Protocol / MCTI Mobile Combustion Factors (B14 commercial diesel,
 *   Gasoline C with 27% anhydrous ethanol blend, Hydrated Ethanol)
 * - IPCC / SEEG Waste FOD simplified emission factor for Brazilian municipal solid waste
 *
 * Strictly zero LLM calls or non-deterministic randomness.
 */

import {
  CityClimateRecord,
  ConfidenceTier,
  EmissionsSummary,
  GPC_SECTOR_CODES,
  GPCSectorCode,
  LocalOverride,
  SectorEmissionRecord,
  SubsectorEmissionRecord,
  validateLocalOverride,
} from "../../data/schema/city";

/**
 * Official Brazilian emission factors (tCO2e per activity unit).
 */
export const BRAZIL_EMISSION_FACTORS = {
  /**
   * Brazil SIN (Sistema Interligado Nacional) annual average grid emission factor
   * in tCO2e / MWh (MCTI 2023/2024 reference baseline: 0.0385 tCO2e/MWh = 38.5 kgCO2e/MWh).
   */
  SIN_GRID_TCO2E_PER_MWH: 0.0385,

  /**
   * Brazilian MCTI / Programa Brasileiro GHG Protocol mobile combustion factors (tCO2e / liter):
   * - Commercial Diesel (B14 blend fossil CO2 + CH4/N2O): 0.002292 tCO2e/L (2.292 kgCO2e/L)
   * - Commercial Gasoline C (73% gasoline A + 27% anhydrous ethanol): 0.001674 tCO2e/L (1.674 kgCO2e/L)
   * - Hydrated Ethanol (biogenic CO2 neutrality; tailpipe CH4 + N2O in CO2e): 0.000028 tCO2e/L (0.028 kgCO2e/L)
   */
  DIESEL_B14_TCO2E_PER_LITER: 0.002292,
  GASOLINE_C_TCO2E_PER_LITER: 0.001674,
  ETHANOL_HYDRATED_TCO2E_PER_LITER: 0.000028,

  /**
   * Solid waste landfill disposal emission factor (IPCC / SEEG Brazil municipal solid waste composition):
   * - Uncaptured sanitary/controlled landfill methane potential: 1.18 tCO2e / ton of MSW disposed
   * - Default active landfill gas (LFG) capture & flaring efficiency when not custom-specified: 55% (0.55)
   */
  SOLID_WASTE_UNCAPTURED_TCO2E_PER_TON: 1.18,
  DEFAULT_METHANE_CAPTURE_EFFICIENCY: 0.55,
} as const;

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function round4(val: number): number {
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
}

/**
 * Calculate Stationary Energy grid electricity emissions (tCO2e) from annual MWh consumption.
 */
export function calculateElectricityEmissions(
  mwhPerYear: number,
  gridFactor = BRAZIL_EMISSION_FACTORS.SIN_GRID_TCO2E_PER_MWH
): number {
  if (!Number.isFinite(mwhPerYear) || mwhPerYear < 0) {
    throw new Error("mwhPerYear must be a non-negative finite number");
  }
  return round2(mwhPerYear * gridFactor);
}

/**
 * Calculate On-Road Transportation emissions (tCO2e) from annual fuel consumption in liters.
 */
export function calculateFleetFuelEmissions(fuels: {
  diesel_liters: number;
  gasoline_liters: number;
  ethanol_liters: number;
}): number {
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

  const total =
    diesel_liters * BRAZIL_EMISSION_FACTORS.DIESEL_B14_TCO2E_PER_LITER +
    gasoline_liters * BRAZIL_EMISSION_FACTORS.GASOLINE_C_TCO2E_PER_LITER +
    ethanol_liters * BRAZIL_EMISSION_FACTORS.ETHANOL_HYDRATED_TCO2E_PER_LITER;

  return round2(total);
}

/**
 * Calculate Solid Waste landfill disposal emissions (tCO2e) from annual tonnage and methane capture status.
 */
export function calculateSolidWasteEmissions(waste: {
  tons_per_year: number;
  has_methane_capture: boolean;
  methane_capture_efficiency?: number;
}): number {
  const { tons_per_year, has_methane_capture, methane_capture_efficiency } = waste;
  if (!Number.isFinite(tons_per_year) || tons_per_year < 0) {
    throw new Error("tons_per_year must be a non-negative finite number");
  }

  const captureRate = has_methane_capture
    ? methane_capture_efficiency ??
      BRAZIL_EMISSION_FACTORS.DEFAULT_METHANE_CAPTURE_EFFICIENCY
    : 0;

  if (!Number.isFinite(captureRate) || captureRate < 0 || captureRate > 1) {
    throw new Error("methane_capture_efficiency must be between 0.0 and 1.0");
  }

  const grossEmissions =
    tons_per_year * BRAZIL_EMISSION_FACTORS.SOLID_WASTE_UNCAPTURED_TCO2E_PER_TON;
  const netEmissions = grossEmissions * (1 - captureRate);

  return round2(netEmissions);
}

/**
 * Derive a sector's aggregate confidence tier from its subsectors:
 * - If all subsectors are `T1_LOCAL`, or `T1_LOCAL` represents >= 75% of the sector's absolute emissions,
 *   and at least one subsector was upgraded/measured locally, the sector is `T1_LOCAL` if all subsectors
 *   are `T1_LOCAL` or dominant subsector (>= 70% of sector emissions) is `T1_LOCAL`.
 * - More strictly:
 *   - If any subsector is `T1_LOCAL` and accounts for >= 60% of sector emissions (or all subsectors are `T1_LOCAL`), sector tier is `T1_LOCAL`.
 *   - Otherwise, if `T1_LOCAL` + `T2_MODELED` account for >= 60% of sector emissions, sector tier is `T2_MODELED`.
 *   - Otherwise `T3_PROXY`.
 */
export function computeSectorConfidenceTier(
  subsectors: SubsectorEmissionRecord[]
): ConfidenceTier {
  if (subsectors.length === 0) {
    return "T3_PROXY";
  }

  if (subsectors.every((s) => s.confidence_tier === "T1_LOCAL")) {
    return "T1_LOCAL";
  }

  const totalAbs = subsectors.reduce(
    (acc, s) => acc + Math.abs(s.emissions_tco2e),
    0
  );

  if (totalAbs === 0) {
    if (subsectors.some((s) => s.confidence_tier === "T1_LOCAL")) {
      return "T1_LOCAL";
    }
    if (subsectors.some((s) => s.confidence_tier === "T2_MODELED")) {
      return "T2_MODELED";
    }
    return "T3_PROXY";
  }

  const t1Abs = subsectors
    .filter((s) => s.confidence_tier === "T1_LOCAL")
    .reduce((acc, s) => acc + Math.abs(s.emissions_tco2e), 0);
  const t2Abs = subsectors
    .filter((s) => s.confidence_tier === "T2_MODELED")
    .reduce((acc, s) => acc + Math.abs(s.emissions_tco2e), 0);

  if (t1Abs / totalAbs >= 0.6) {
    return "T1_LOCAL";
  }
  if ((t1Abs + t2Abs) / totalAbs >= 0.6) {
    return "T2_MODELED";
  }
  return "T3_PROXY";
}

/**
 * Recompute a sector's total emissions and aggregate confidence tier from its subsectors.
 */
export function recalculateSectorRecord(
  sector: SectorEmissionRecord,
  wasOverridden = false
): SectorEmissionRecord {
  const totalSectorEmissions = round2(
    sector.subsectors.reduce((sum, s) => sum + s.emissions_tco2e, 0)
  );
  const updatedTier = computeSectorConfidenceTier(sector.subsectors);

  const allT1 = sector.subsectors.every((s) => s.confidence_tier === "T1_LOCAL");
  const remainingGaps = sector.subsectors
    .filter((s) => s.confidence_tier !== "T1_LOCAL")
    .map((s) => `${s.subsector_name}: ${s.gap_note}`);

  const updatedGapNote = allT1
    ? "All subsectors in this sector use verified T1_LOCAL municipal activity data."
    : remainingGaps.join(" | ");

  return {
    ...sector,
    emissions_tco2e: totalSectorEmissions,
    confidence_tier: wasOverridden && updatedTier !== "T1_LOCAL"
      ? updatedTier
      : updatedTier,
    gap_note: updatedGapNote || sector.gap_note,
  };
}

/**
 * Recompute the city-wide EmissionsSummary (total tCO2e, per-capita tCO2e, dominant sector,
 * and T1/T2/T3 confidence tier breakdown weighted by absolute subsector emissions).
 */
export function computeEmissionsSummary(
  sectors: Record<GPCSectorCode, SectorEmissionRecord>,
  population: number,
  referenceYear: number
): EmissionsSummary {
  let totalEmissions = 0;
  let dominantSector: GPCSectorCode = "STATIONARY_ENERGY";
  let maxSectorEmissions = -Infinity;

  let totalAbsSubsector = 0;
  let t1Abs = 0;
  let t2Abs = 0;
  let t3Abs = 0;

  for (const code of GPC_SECTOR_CODES) {
    const sector = sectors[code];
    totalEmissions += sector.emissions_tco2e;

    if (sector.emissions_tco2e > maxSectorEmissions) {
      maxSectorEmissions = sector.emissions_tco2e;
      dominantSector = code;
    }

    for (const sub of sector.subsectors) {
      const absVal = Math.abs(sub.emissions_tco2e);
      totalAbsSubsector += absVal;
      if (sub.confidence_tier === "T1_LOCAL") {
        t1Abs += absVal;
      } else if (sub.confidence_tier === "T2_MODELED") {
        t2Abs += absVal;
      } else {
        t3Abs += absVal;
      }
    }
  }

  const roundedTotal = round2(totalEmissions);
  const perCapita = population > 0 ? round4(roundedTotal / population) : 0;

  let t1Share = 0;
  let t2Share = 0;
  let t3Share = 0;

  if (totalAbsSubsector > 0) {
    t1Share = round4(t1Abs / totalAbsSubsector);
    t2Share = round4(t2Abs / totalAbsSubsector);
    t3Share = round4(Math.max(0, 1 - t1Share - t2Share));
  }

  return {
    total_emissions_tco2e: roundedTotal,
    per_capita_tco2e: perCapita,
    reference_year: referenceYear,
    dominant_sector: dominantSector,
    tier_breakdown: {
      T1_LOCAL_share: t1Share,
      T2_MODELED_share: t2Share,
      T3_PROXY_share: t3Share,
    },
  };
}

/**
 * Pure, deterministic function that applies client-side `LocalOverride` inputs to a base
 * `CityClimateRecord`, recalculates subsector, sector, and total `tCO2e`, and automatically
 * upgrades overridden subsectors from `T3_PROXY` or `T2_MODELED` to `T1_LOCAL`.
 *
 * Does not mutate the input `baseCity` record.
 */
export function applyLocalOverrides(
  baseCity: CityClimateRecord,
  override: LocalOverride
): CityClimateRecord {
  const validation = validateLocalOverride(override);
  if (!validation.valid) {
    throw new Error(
      `Invalid LocalOverride payload: ${validation.errors.join("; ")}`
    );
  }

  // Deep clone base city record to guarantee immutability
  const nextCity: CityClimateRecord = JSON.parse(JSON.stringify(baseCity));
  const refYear =
    override.reference_year ?? nextCity.emissions_summary.reference_year;

  // 1. Apply Stationary Energy Grid Electricity Override
  if (override.electricity !== undefined) {
    const { mwh_per_year, source_note } = override.electricity;
    const calculatedTco2e = calculateElectricityEmissions(mwh_per_year);
    const stationarySector = nextCity.sectors.STATIONARY_ENERGY;

    stationarySector.subsectors = stationarySector.subsectors.map((sub) => {
      if (sub.subsector_key === "grid_electricity") {
        return {
          ...sub,
          emissions_tco2e: calculatedTco2e,
          confidence_tier: "T1_LOCAL",
          data_source:
            source_note?.trim() ||
            "Municipal Local Override (Utility Billing / ANEEL Distributor Meter Records)",
          reference_year: refYear,
          methodology_note: `Calculated deterministically from ${mwh_per_year.toLocaleString("en-US")} MWh/yr × ${BRAZIL_EMISSION_FACTORS.SIN_GRID_TCO2E_PER_MWH} tCO2e/MWh (Brazil SIN grid factor, MCTI).`,
          gap_note:
            "Upgraded to T1_LOCAL via municipal electricity consumption override (MWh/year).",
        };
      }
      return sub;
    });

    nextCity.sectors.STATIONARY_ENERGY = recalculateSectorRecord(
      stationarySector,
      true
    );
  }

  // 2. Apply Transportation Fleet Fuel Override
  if (override.fleet_fuels !== undefined) {
    const { diesel_liters, gasoline_liters, ethanol_liters, source_note } =
      override.fleet_fuels;
    const calculatedTco2e = calculateFleetFuelEmissions({
      diesel_liters,
      gasoline_liters,
      ethanol_liters,
    });
    const transportSector = nextCity.sectors.TRANSPORTATION;

    transportSector.subsectors = transportSector.subsectors.map((sub) => {
      if (sub.subsector_key === "on_road_transportation") {
        return {
          ...sub,
          emissions_tco2e: calculatedTco2e,
          confidence_tier: "T1_LOCAL",
          data_source:
            source_note?.trim() ||
            "Municipal Local Override (ANP Municipal Fuel Sales / Transit Fleet Logs)",
          reference_year: refYear,
          methodology_note:
            `Calculated deterministically using MCTI/GHG Protocol Brazil mobile factors: ` +
            `Diesel B14 (${diesel_liters.toLocaleString("en-US")} L × ${BRAZIL_EMISSION_FACTORS.DIESEL_B14_TCO2E_PER_LITER} tCO2e/L) + ` +
            `Gasoline C (${gasoline_liters.toLocaleString("en-US")} L × ${BRAZIL_EMISSION_FACTORS.GASOLINE_C_TCO2E_PER_LITER} tCO2e/L) + ` +
            `Hydrated Ethanol (${ethanol_liters.toLocaleString("en-US")} L × ${BRAZIL_EMISSION_FACTORS.ETHANOL_HYDRATED_TCO2E_PER_LITER} tCO2e/L).`,
          gap_note:
            "Upgraded to T1_LOCAL via municipal fuel consumption override (liters/year).",
        };
      }
      return sub;
    });

    nextCity.sectors.TRANSPORTATION = recalculateSectorRecord(
      transportSector,
      true
    );
  }

  // 3. Apply Solid Waste Landfill Tonnage Override
  if (override.solid_waste !== undefined) {
    const {
      tons_per_year,
      has_methane_capture,
      methane_capture_efficiency,
      source_note,
    } = override.solid_waste;
    const calculatedTco2e = calculateSolidWasteEmissions({
      tons_per_year,
      has_methane_capture,
      methane_capture_efficiency,
    });
    const effectiveCapture = has_methane_capture
      ? methane_capture_efficiency ??
        BRAZIL_EMISSION_FACTORS.DEFAULT_METHANE_CAPTURE_EFFICIENCY
      : 0;
    const wasteSector = nextCity.sectors.WASTE;

    wasteSector.subsectors = wasteSector.subsectors.map((sub) => {
      if (sub.subsector_key === "solid_waste_disposal") {
        return {
          ...sub,
          emissions_tco2e: calculatedTco2e,
          confidence_tier: "T1_LOCAL",
          data_source:
            source_note?.trim() ||
            "Municipal Local Override (SNIS-RS / Municipal Landfill Weighbridge Tonnage)",
          reference_year: refYear,
          methodology_note:
            `Calculated deterministically from ${tons_per_year.toLocaleString("en-US")} t/yr MSW × ` +
            `${BRAZIL_EMISSION_FACTORS.SOLID_WASTE_UNCAPTURED_TCO2E_PER_TON} tCO2e/t × ` +
            `(1 - ${(effectiveCapture * 100).toFixed(0)}% methane capture).`,
          gap_note:
            "Upgraded to T1_LOCAL via municipal solid waste landfill tonnage and methane capture override.",
        };
      }
      return sub;
    });

    nextCity.sectors.WASTE = recalculateSectorRecord(wasteSector, true);
  }

  // Recompute overall summary
  nextCity.emissions_summary = computeEmissionsSummary(
    nextCity.sectors,
    nextCity.metadata.population,
    refYear
  );

  return nextCity;
}
