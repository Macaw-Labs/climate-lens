/**
 * Canonical Data Contract for Municipal Climate Lens
 *
 * Defines the TypeScript types and runtime validators for a Brazilian municipality
 * climate baseline and data-gap record indexed by its 7-digit IBGE code (`ibge_code`),
 * aligned with the Global Protocol for Community-Scale Greenhouse Gas Emission Inventories (GPC)
 * and AdaptaBrasil MCTI climate risk indicators.
 */

export type ConfidenceTier = "T1_LOCAL" | "T2_MODELED" | "T3_PROXY";

export type GPCSectorCode =
  | "STATIONARY_ENERGY"
  | "TRANSPORTATION"
  | "WASTE"
  | "IPPU"
  | "AFOLU";

export const GPC_SECTOR_CODES: readonly GPCSectorCode[] = [
  "STATIONARY_ENERGY",
  "TRANSPORTATION",
  "WASTE",
  "IPPU",
  "AFOLU",
] as const;

export const CONFIDENCE_TIERS: readonly ConfidenceTier[] = [
  "T1_LOCAL",
  "T2_MODELED",
  "T3_PROXY",
] as const;

/**
 * Standardized subsector keys enabling deterministic client-side local overrides
 * and transparent traceability across cities.
 */
export type GPCSubsectorKey =
  | "grid_electricity"
  | "stationary_fuel_combustion"
  | "on_road_transportation"
  | "off_road_and_aviation"
  | "solid_waste_disposal"
  | "wastewater_treatment"
  | "industrial_processes"
  | "agriculture_and_livestock"
  | "land_use_and_forestry"
  | (string & {});

/**
 * Every emission value strictly requires explicit provenance and gap metadata.
 */
export interface SubsectorEmissionRecord {
  subsector_key: GPCSubsectorKey;
  subsector_name: string;
  emissions_tco2e: number;
  confidence_tier: ConfidenceTier;
  data_source: string;
  reference_year: number;
  methodology_note: string;
  /**
   * Explicitly states what local municipal record is needed to upgrade this subsector to `T1_LOCAL`,
   * or confirms the local record applied when already at `T1_LOCAL`.
   */
  gap_note: string;
}

export interface SectorEmissionRecord {
  sector_code: GPCSectorCode;
  sector_name: string;
  emissions_tco2e: number;
  confidence_tier: ConfidenceTier;
  data_source: string;
  reference_year: number;
  methodology_note: string;
  gap_note: string;
  subsectors: SubsectorEmissionRecord[];
}

export type AdaptaBrasilSectorCode =
  | "GEO_HYDROLOGICAL_DISASTERS"
  | "WATER_RESOURCES"
  | "HEALTH"
  | "ENERGY"
  | "FOOD_SECURITY";

export type ClimateRiskClass =
  | "VERY_LOW"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "VERY_HIGH";

export type ClimateScenario =
  | "HISTORICAL_BASELINE"
  | "RCP4_5_2030"
  | "RCP4_5_2050"
  | "RCP8_5_2030"
  | "RCP8_5_2050"
  | "SSP2_4_5_2030"
  | "SSP5_8_5_2050";

export interface ClimateRiskIndicator {
  sector_code: AdaptaBrasilSectorCode;
  sector_name: string;
  indicator_name: string;
  hazard_description: string;
  /** Normalized risk index from 0.0 (minimal risk) to 1.0 (maximum risk) */
  risk_index: number;
  risk_class: ClimateRiskClass;
  reference_scenario: ClimateScenario;
  reference_year: number;
  confidence_tier: ConfidenceTier;
  data_source: string;
  methodology_note: string;
  gap_note: string;
}

export interface MunicipalityMetadata {
  /** 7-digit IBGE municipality code (e.g., "4115200" for Maringá, PR) */
  ibge_code: string;
  name: string;
  /** 2-letter Brazilian UF state code (e.g., "PR") */
  state: string;
  population: number;
  population_year: number;
  area_km2?: number;
  biome?: string;
}

export interface EmissionsSummary {
  total_emissions_tco2e: number;
  per_capita_tco2e: number;
  reference_year: number;
  dominant_sector: GPCSectorCode;
  tier_breakdown: {
    T1_LOCAL_share: number;
    T2_MODELED_share: number;
    T3_PROXY_share: number;
  };
}

export interface CityClimateRecord {
  schema_version: "1.0.0";
  metadata: MunicipalityMetadata;
  emissions_summary: EmissionsSummary;
  sectors: Record<GPCSectorCode, SectorEmissionRecord>;
  climate_risks: ClimateRiskIndicator[];
  last_updated: string;
}

/**
 * Structured client-side LocalOverride schema supporting primary municipal activity inputs:
 * - Grid electricity consumption (MWh/year) using Brazil's SIN grid emission factor.
 * - Municipal/urban fleet fuel consumption (diesel, gasoline, ethanol liters) using Brazilian MCTI/GHG Protocol emission factors.
 * - Solid waste landfill tonnage (tons/year and methane capture boolean).
 */
export interface LocalOverride {
  reference_year?: number;
  electricity?: {
    mwh_per_year: number;
    source_note?: string;
  };
  fleet_fuels?: {
    diesel_liters: number;
    gasoline_liters: number;
    ethanol_liters: number;
    source_note?: string;
  };
  solid_waste?: {
    tons_per_year: number;
    has_methane_capture: boolean;
    /** Optional capture efficiency override (default 0.55 when has_methane_capture is true) */
    methane_capture_efficiency?: number;
    source_note?: string;
  };
}

export interface CityIndexEntry {
  ibge_code: string;
  name: string;
  state: string;
  population: number;
  population_year: number;
  total_emissions_tco2e: number;
  total_tco2e: number;
  per_capita_tco2e: number;
  dominant_sector: GPCSectorCode;
  primary_confidence_tier: ConfidenceTier;
  proxy_share_pct: number;
  modeled_share_pct: number;
  sector_totals: Record<GPCSectorCode, number>;
  top_climate_risk: {
    sector_code: AdaptaBrasilSectorCode;
    indicator_name: string;
    risk_index: number;
    risk_class: ClimateRiskClass;
  } | null;
}

export interface CityIndexManifest {
  schema_version: "1.0.0";
  generated_at: string;
  municipalities: CityIndexEntry[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const IBGE_CODE_REGEX = /^\d{7}$/;
const STATE_UF_REGEX = /^[A-Z]{2}$/;

function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

function isFiniteNonNegativeNumber(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val) && val >= 0;
}

/**
 * Deterministic runtime validator for a SubsectorEmissionRecord.
 */
export function validateSubsectorRecord(
  record: unknown,
  pathPrefix = "subsector"
): string[] {
  const errors: string[] = [];
  if (!record || typeof record !== "object") {
    return [`${pathPrefix}: must be an object`];
  }
  const r = record as Record<string, unknown>;

  if (!isNonEmptyString(r.subsector_key)) {
    errors.push(`${pathPrefix}.subsector_key: must be a non-empty string`);
  }
  if (!isNonEmptyString(r.subsector_name)) {
    errors.push(`${pathPrefix}.subsector_name: must be a non-empty string`);
  }
  if (typeof r.emissions_tco2e !== "number" || !Number.isFinite(r.emissions_tco2e)) {
    errors.push(`${pathPrefix}.emissions_tco2e: must be a finite number`);
  }
  if (
    typeof r.confidence_tier !== "string" ||
    !CONFIDENCE_TIERS.includes(r.confidence_tier as ConfidenceTier)
  ) {
    errors.push(
      `${pathPrefix}.confidence_tier: must be one of ${CONFIDENCE_TIERS.join(", ")}`
    );
  }
  if (!isNonEmptyString(r.data_source)) {
    errors.push(`${pathPrefix}.data_source: must be a non-empty string`);
  }
  if (
    typeof r.reference_year !== "number" ||
    !Number.isInteger(r.reference_year) ||
    r.reference_year < 1990 ||
    r.reference_year > 2100
  ) {
    errors.push(
      `${pathPrefix}.reference_year: must be an integer between 1990 and 2100`
    );
  }
  if (!isNonEmptyString(r.methodology_note)) {
    errors.push(`${pathPrefix}.methodology_note: must be a non-empty string`);
  }
  if (!isNonEmptyString(r.gap_note)) {
    errors.push(`${pathPrefix}.gap_note: must be a non-empty string`);
  }

  return errors;
}

/**
 * Deterministic runtime validator for a CityClimateRecord.
 */
export function validateCityClimateRecord(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Root value must be an object"] };
  }

  const record = data as Record<string, unknown>;

  if (record.schema_version !== "1.0.0") {
    errors.push(`schema_version: expected "1.0.0", got "${String(record.schema_version)}"`);
  }

  // Validate metadata
  const meta = record.metadata as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== "object") {
    errors.push("metadata: must be an object");
  } else {
    if (typeof meta.ibge_code !== "string" || !IBGE_CODE_REGEX.test(meta.ibge_code)) {
      errors.push("metadata.ibge_code: must be a 7-digit string");
    }
    if (!isNonEmptyString(meta.name)) {
      errors.push("metadata.name: must be a non-empty string");
    }
    if (typeof meta.state !== "string" || !STATE_UF_REGEX.test(meta.state)) {
      errors.push("metadata.state: must be a 2-letter uppercase UF code");
    }
    if (
      typeof meta.population !== "number" ||
      !Number.isInteger(meta.population) ||
      meta.population <= 0
    ) {
      errors.push("metadata.population: must be a positive integer");
    }
    if (
      typeof meta.population_year !== "number" ||
      !Number.isInteger(meta.population_year) ||
      meta.population_year < 1990 ||
      meta.population_year > 2100
    ) {
      errors.push("metadata.population_year: must be an integer year");
    }
  }

  // Validate sectors
  const sectors = record.sectors as Record<string, unknown> | undefined;
  if (!sectors || typeof sectors !== "object") {
    errors.push("sectors: must be an object");
  } else {
    for (const sectorCode of GPC_SECTOR_CODES) {
      const s = sectors[sectorCode] as Record<string, unknown> | undefined;
      const prefix = `sectors.${sectorCode}`;
      if (!s || typeof s !== "object") {
        errors.push(`${prefix}: missing required GPC sector`);
        continue;
      }
      if (s.sector_code !== sectorCode) {
        errors.push(`${prefix}.sector_code: must equal "${sectorCode}"`);
      }
      if (!isNonEmptyString(s.sector_name)) {
        errors.push(`${prefix}.sector_name: must be a non-empty string`);
      }
      if (typeof s.emissions_tco2e !== "number" || !Number.isFinite(s.emissions_tco2e)) {
        errors.push(`${prefix}.emissions_tco2e: must be a finite number`);
      }
      if (
        typeof s.confidence_tier !== "string" ||
        !CONFIDENCE_TIERS.includes(s.confidence_tier as ConfidenceTier)
      ) {
        errors.push(
          `${prefix}.confidence_tier: must be one of ${CONFIDENCE_TIERS.join(", ")}`
        );
      }
      if (!isNonEmptyString(s.data_source)) {
        errors.push(`${prefix}.data_source: must be a non-empty string`);
      }
      if (
        typeof s.reference_year !== "number" ||
        !Number.isInteger(s.reference_year) ||
        s.reference_year < 1990 ||
        s.reference_year > 2100
      ) {
        errors.push(`${prefix}.reference_year: must be a valid integer year`);
      }
      if (!isNonEmptyString(s.methodology_note)) {
        errors.push(`${prefix}.methodology_note: must be a non-empty string`);
      }
      if (!isNonEmptyString(s.gap_note)) {
        errors.push(`${prefix}.gap_note: must be a non-empty string`);
      }
      if (!Array.isArray(s.subsectors) || s.subsectors.length === 0) {
        errors.push(`${prefix}.subsectors: must be a non-empty array`);
      } else {
        let subsectorSum = 0;
        s.subsectors.forEach((sub, idx) => {
          errors.push(
            ...validateSubsectorRecord(sub, `${prefix}.subsectors[${idx}]`)
          );
          if (
            sub &&
            typeof sub === "object" &&
            typeof (sub as Record<string, unknown>).emissions_tco2e === "number"
          ) {
            subsectorSum += (sub as Record<string, unknown>).emissions_tco2e as number;
          }
        });
        if (
          typeof s.emissions_tco2e === "number" &&
          Math.abs(s.emissions_tco2e - subsectorSum) > 0.01
        ) {
          errors.push(
            `${prefix}.emissions_tco2e (${s.emissions_tco2e}) does not match sum of subsectors (${subsectorSum.toFixed(2)})`
          );
        }
      }
    }
  }

  // Validate climate_risks
  const risks = record.climate_risks;
  if (!Array.isArray(risks) || risks.length === 0) {
    errors.push("climate_risks: must be a non-empty array");
  } else {
    risks.forEach((risk, idx) => {
      const prefix = `climate_risks[${idx}]`;
      if (!risk || typeof risk !== "object") {
        errors.push(`${prefix}: must be an object`);
        return;
      }
      const r = risk as Record<string, unknown>;
      if (!isNonEmptyString(r.sector_code)) {
        errors.push(`${prefix}.sector_code: must be a non-empty string`);
      }
      if (!isNonEmptyString(r.sector_name)) {
        errors.push(`${prefix}.sector_name: must be a non-empty string`);
      }
      if (!isNonEmptyString(r.indicator_name)) {
        errors.push(`${prefix}.indicator_name: must be a non-empty string`);
      }
      if (
        typeof r.risk_index !== "number" ||
        !Number.isFinite(r.risk_index) ||
        r.risk_index < 0 ||
        r.risk_index > 1
      ) {
        errors.push(`${prefix}.risk_index: must be a number between 0.0 and 1.0`);
      }
      if (!isNonEmptyString(r.risk_class)) {
        errors.push(`${prefix}.risk_class: must be a non-empty string`);
      }
      if (!isNonEmptyString(r.reference_scenario)) {
        errors.push(`${prefix}.reference_scenario: must be a non-empty string`);
      }
      if (
        typeof r.confidence_tier !== "string" ||
        !CONFIDENCE_TIERS.includes(r.confidence_tier as ConfidenceTier)
      ) {
        errors.push(
          `${prefix}.confidence_tier: must be one of ${CONFIDENCE_TIERS.join(", ")}`
        );
      }
      if (!isNonEmptyString(r.data_source)) {
        errors.push(`${prefix}.data_source: must be a non-empty string`);
      }
      if (!isNonEmptyString(r.methodology_note)) {
        errors.push(`${prefix}.methodology_note: must be a non-empty string`);
      }
      if (!isNonEmptyString(r.gap_note)) {
        errors.push(`${prefix}.gap_note: must be a non-empty string`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Deterministic runtime validator for LocalOverride inputs.
 */
export function validateLocalOverride(override: unknown): ValidationResult {
  const errors: string[] = [];

  if (!override || typeof override !== "object") {
    return { valid: false, errors: ["LocalOverride must be an object"] };
  }

  const o = override as Record<string, unknown>;

  if (o.reference_year !== undefined) {
    if (
      typeof o.reference_year !== "number" ||
      !Number.isInteger(o.reference_year) ||
      o.reference_year < 1990 ||
      o.reference_year > 2100
    ) {
      errors.push("reference_year: must be an integer between 1990 and 2100");
    }
  }

  if (o.electricity !== undefined) {
    if (!o.electricity || typeof o.electricity !== "object") {
      errors.push("electricity: must be an object");
    } else {
      const elec = o.electricity as Record<string, unknown>;
      if (!isFiniteNonNegativeNumber(elec.mwh_per_year)) {
        errors.push("electricity.mwh_per_year: must be a non-negative finite number");
      }
    }
  }

  if (o.fleet_fuels !== undefined) {
    if (!o.fleet_fuels || typeof o.fleet_fuels !== "object") {
      errors.push("fleet_fuels: must be an object");
    } else {
      const fuels = o.fleet_fuels as Record<string, unknown>;
      if (!isFiniteNonNegativeNumber(fuels.diesel_liters)) {
        errors.push("fleet_fuels.diesel_liters: must be a non-negative finite number");
      }
      if (!isFiniteNonNegativeNumber(fuels.gasoline_liters)) {
        errors.push("fleet_fuels.gasoline_liters: must be a non-negative finite number");
      }
      if (!isFiniteNonNegativeNumber(fuels.ethanol_liters)) {
        errors.push("fleet_fuels.ethanol_liters: must be a non-negative finite number");
      }
    }
  }

  if (o.solid_waste !== undefined) {
    if (!o.solid_waste || typeof o.solid_waste !== "object") {
      errors.push("solid_waste: must be an object");
    } else {
      const waste = o.solid_waste as Record<string, unknown>;
      if (!isFiniteNonNegativeNumber(waste.tons_per_year)) {
        errors.push("solid_waste.tons_per_year: must be a non-negative finite number");
      }
      if (typeof waste.has_methane_capture !== "boolean") {
        errors.push("solid_waste.has_methane_capture: must be a boolean");
      }
      if (waste.methane_capture_efficiency !== undefined) {
        if (
          typeof waste.methane_capture_efficiency !== "number" ||
          !Number.isFinite(waste.methane_capture_efficiency) ||
          waste.methane_capture_efficiency < 0 ||
          waste.methane_capture_efficiency > 1
        ) {
          errors.push(
            "solid_waste.methane_capture_efficiency: must be a number between 0.0 and 1.0"
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
