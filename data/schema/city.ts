/**
 * Canonical Data Contract for Municipal Climate Lens (Schema v2.0.0)
 *
 * Defines TypeScript types, runtime validators, and v1.0.0 -> v2.0.0 migration
 * adapters for Brazilian municipal climate baseline records (`public/data/<ibge_code>.json`),
 * `public/data/index.json`, and client-side `LocalOverride` payloads.
 *
 * Key reliability principles:
 * 1. Explicit missing-data representation (`null` + `availability_status` + `availability_reason`).
 *    Never coerce unmeasured electricity or unavailable risk indices to `0.0`.
 * 2. Separation of `data_origin` (`LOCAL` | `MODELED` | `PROXY`, distinct from IPCC tiers)
 *    from `verification_status` (`UNVERIFIED` | `DOCUMENTED` | `REVIEW_REQUIRED` | `INDEPENDENTLY_VERIFIED`).
 * 3. Strict boundary & period compatibility (`CoverageBoundary` + `reporting_year`) before
 *    replacing citywide baseline values.
 */

export const CURRENT_SCHEMA_VERSION = "2.0.0" as const;

export type AvailabilityStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "NOT_APPLICABLE";

export type CoverageStatus = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";

/**
 * Data origin categories (distinct from IPCC methodological Tiers 1/2/3).
 */
export type DataOrigin = "LOCAL" | "MODELED" | "PROXY";

/**
 * Evidence and review status, independent of data origin.
 */
export type VerificationStatus =
  | "UNVERIFIED"
  | "DOCUMENTED"
  | "REVIEW_REQUIRED"
  | "INDEPENDENTLY_VERIFIED";

export type CoverageBoundary =
  | "MUNICIPALITY_WIDE"
  | "MUNICIPAL_GOVERNMENT_FLEET"
  | "PUBLIC_TRANSIT_OPERATOR"
  | "PARTIAL_FACILITY_OR_SECTOR"
  | "UNKNOWN";

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

export const AVAILABILITY_STATUSES: readonly AvailabilityStatus[] = [
  "AVAILABLE",
  "UNAVAILABLE",
  "NOT_APPLICABLE",
] as const;

export const DATA_ORIGINS: readonly DataOrigin[] = [
  "LOCAL",
  "MODELED",
  "PROXY",
] as const;

export const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  "UNVERIFIED",
  "DOCUMENTED",
  "REVIEW_REQUIRED",
  "INDEPENDENTLY_VERIFIED",
] as const;

export const COVERAGE_BOUNDARIES: readonly CoverageBoundary[] = [
  "MUNICIPALITY_WIDE",
  "MUNICIPAL_GOVERNMENT_FLEET",
  "PUBLIC_TRANSIT_OPERATOR",
  "PARTIAL_FACILITY_OR_SECTOR",
  "UNKNOWN",
] as const;

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

export interface SubsectorEmissionRecord {
  subsector_key: GPCSubsectorKey;
  subsector_name: string;
  emissions_tco2e: number | null;
  biogenic_co2_tco2?: number | null;
  availability_status: AvailabilityStatus;
  availability_reason: string;
  data_origin: DataOrigin;
  verification_status: VerificationStatus;
  data_source: string;
  source_reference: string;
  reference_year: number;
  reporting_period: string;
  geographic_coverage: string;
  operational_coverage: string;
  methodology_note: string;
  factor_id: string | null;
  limitations: string;
  gap_note: string;
}

export interface SectorEmissionRecord {
  sector_code: GPCSectorCode;
  sector_name: string;
  emissions_tco2e: number | null;
  coverage_status: CoverageStatus;
  missing_subsectors: string[];
  data_origin: DataOrigin | "MIXED";
  verification_status: VerificationStatus;
  data_source: string;
  source_reference: string;
  reference_year: number;
  reporting_period: string;
  geographic_coverage: string;
  operational_coverage: string;
  methodology_note: string;
  limitations: string;
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
  /** Normalized risk index from 0.0 to 1.0 when AVAILABLE; strictly null when UNAVAILABLE */
  risk_index: number | null;
  risk_class: ClimateRiskClass | null;
  availability_status: AvailabilityStatus;
  availability_reason: string;
  reference_scenario: ClimateScenario;
  reference_year: number;
  reporting_period: string;
  data_origin: DataOrigin;
  verification_status: VerificationStatus;
  data_source: string;
  source_reference: string;
  methodology_note: string;
  limitations: string;
  gap_note: string;
}

export interface MunicipalityMetadata {
  ibge_code: string;
  name: string;
  state: string;
  population: number | null;
  population_year: number;
  area_km2?: number;
  biome?: string;
}

export interface ProvenanceMix {
  local_share: number;
  modeled_share: number;
  proxy_share: number;
  is_mixed: boolean;
  summary_label: string;
}

export interface EmissionsSummary {
  total_emissions_tco2e: number | null;
  per_capita_tco2e: number | null;
  coverage_status: CoverageStatus;
  missing_components: string[];
  reference_year: number;
  dominant_sector: GPCSectorCode | null;
  provenance_mix: ProvenanceMix;
}

export interface CityClimateRecord {
  schema_version: "2.0.0";
  metadata: MunicipalityMetadata;
  emissions_summary: EmissionsSummary;
  sectors: Record<GPCSectorCode, SectorEmissionRecord>;
  climate_risks: ClimateRiskIndicator[];
  last_updated: string;
}

export interface ElectricityOverrideInput {
  mwh_per_year: number;
  reporting_year: number;
  coverage_boundary: CoverageBoundary;
  source_reference: string;
  methodology_note?: string;
  needs_review?: boolean;
}

export interface FleetFuelsOverrideInput {
  diesel_liters: number;
  gasoline_liters: number;
  ethanol_liters: number;
  reporting_year: number;
  coverage_boundary: CoverageBoundary;
  source_reference: string;
  methodology_note?: string;
  needs_review?: boolean;
}

export interface SolidWasteOverrideInput {
  tons_per_year: number;
  has_methane_capture: boolean;
  methane_capture_efficiency?: number;
  reporting_year: number;
  coverage_boundary: CoverageBoundary;
  source_reference: string;
  methodology_note?: string;
  needs_review?: boolean;
}

export interface LocalOverride {
  override_schema_version: "2.0.0";
  electricity?: ElectricityOverrideInput;
  fleet_fuels?: FleetFuelsOverrideInput;
  solid_waste?: SolidWasteOverrideInput;
}

export interface PartialOrUnmergedEstimate {
  component: "electricity" | "fleet_fuels" | "solid_waste";
  target_sector: GPCSectorCode;
  target_subsector: GPCSubsectorKey;
  calculated_tco2e: number;
  biogenic_co2_tco2: number;
  reporting_year: number;
  coverage_boundary: CoverageBoundary;
  data_origin: "LOCAL";
  verification_status: VerificationStatus;
  factor_ids: string[];
  factor_verified: boolean;
  source_reference: string;
  reason_not_merged: string;
  limitations: string;
}

export interface CityIndexEntry {
  ibge_code: string;
  name: string;
  state: string;
  population: number | null;
  population_year: number;
  total_emissions_tco2e: number | null;
  total_tco2e: number | null;
  per_capita_tco2e: number | null;
  coverage_status: CoverageStatus;
  missing_components_count: number;
  dominant_sector: GPCSectorCode | null;
  provenance_label: string;
  local_share_pct: number;
  modeled_share_pct: number;
  proxy_share_pct: number;
  sector_totals: Record<GPCSectorCode, number | null>;
  top_climate_risk: {
    sector_code: AdaptaBrasilSectorCode;
    indicator_name: string;
    risk_index: number | null;
    risk_class: ClimateRiskClass | null;
    availability_status: AvailabilityStatus;
  } | null;
}

export interface CityIndexManifest {
  schema_version: "2.0.0";
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

function isFiniteNumber(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val);
}

function isFiniteNonNegativeNumber(val: unknown): val is number {
  return isFiniteNumber(val) && val >= 0;
}

/**
 * Deterministic runtime validator for SubsectorEmissionRecord (v2.0.0).
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
  if (
    typeof r.availability_status !== "string" ||
    !AVAILABILITY_STATUSES.includes(r.availability_status as AvailabilityStatus)
  ) {
    errors.push(
      `${pathPrefix}.availability_status: must be one of ${AVAILABILITY_STATUSES.join(", ")}`
    );
  } else if (r.availability_status === "AVAILABLE") {
    if (!isFiniteNumber(r.emissions_tco2e)) {
      errors.push(
        `${pathPrefix}.emissions_tco2e: must be a finite number when availability_status is AVAILABLE`
      );
    }
  } else {
    if (r.emissions_tco2e !== null) {
      errors.push(
        `${pathPrefix}.emissions_tco2e: must be null when availability_status is ${r.availability_status}`
      );
    }
  }

  if (!isNonEmptyString(r.availability_reason)) {
    errors.push(`${pathPrefix}.availability_reason: must be a non-empty string`);
  }
  if (
    typeof r.data_origin !== "string" ||
    !DATA_ORIGINS.includes(r.data_origin as DataOrigin)
  ) {
    errors.push(
      `${pathPrefix}.data_origin: must be one of ${DATA_ORIGINS.join(", ")}`
    );
  }
  if (
    typeof r.verification_status !== "string" ||
    !VERIFICATION_STATUSES.includes(r.verification_status as VerificationStatus)
  ) {
    errors.push(
      `${pathPrefix}.verification_status: must be one of ${VERIFICATION_STATUSES.join(", ")}`
    );
  }
  if (!isNonEmptyString(r.data_source)) {
    errors.push(`${pathPrefix}.data_source: must be a non-empty string`);
  }
  if (!isNonEmptyString(r.source_reference)) {
    errors.push(`${pathPrefix}.source_reference: must be a non-empty string`);
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
  if (!isNonEmptyString(r.reporting_period)) {
    errors.push(`${pathPrefix}.reporting_period: must be a non-empty string`);
  }
  if (!isNonEmptyString(r.geographic_coverage)) {
    errors.push(`${pathPrefix}.geographic_coverage: must be a non-empty string`);
  }
  if (!isNonEmptyString(r.operational_coverage)) {
    errors.push(`${pathPrefix}.operational_coverage: must be a non-empty string`);
  }
  if (!isNonEmptyString(r.methodology_note)) {
    errors.push(`${pathPrefix}.methodology_note: must be a non-empty string`);
  }
  if (!isNonEmptyString(r.limitations)) {
    errors.push(`${pathPrefix}.limitations: must be a non-empty string`);
  }
  if (!isNonEmptyString(r.gap_note)) {
    errors.push(`${pathPrefix}.gap_note: must be a non-empty string`);
  }

  return errors;
}

/**
 * Deterministic runtime validator for CityClimateRecord (v2.0.0).
 */
export function validateCityClimateRecord(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Root value must be an object"] };
  }

  const record = data as Record<string, unknown>;

  if (record.schema_version !== CURRENT_SCHEMA_VERSION) {
    errors.push(
      `schema_version: expected "${CURRENT_SCHEMA_VERSION}", got "${String(record.schema_version)}"`
    );
  }

  // Metadata
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
      meta.population !== null &&
      (typeof meta.population !== "number" ||
        !Number.isInteger(meta.population) ||
        meta.population <= 0)
    ) {
      errors.push("metadata.population: must be a positive integer or null");
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

  // Sectors
  const sectors = record.sectors as Record<string, unknown> | undefined;
  let availableSectorSum = 0;
  let availableSectorCount = 0;

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
      if (!Array.isArray(s.subsectors) || s.subsectors.length === 0) {
        errors.push(`${prefix}.subsectors: must be a non-empty array`);
      } else {
        let subSum = 0;
        let availCount = 0;
        s.subsectors.forEach((sub, idx) => {
          errors.push(
            ...validateSubsectorRecord(sub, `${prefix}.subsectors[${idx}]`)
          );
          if (sub && typeof sub === "object") {
            const subObj = sub as Record<string, unknown>;
            if (
              subObj.availability_status === "AVAILABLE" &&
              isFiniteNumber(subObj.emissions_tco2e)
            ) {
              subSum += subObj.emissions_tco2e;
              availCount += 1;
            }
          }
        });

        if (availCount === 0) {
          if (s.emissions_tco2e !== null) {
            errors.push(
              `${prefix}.emissions_tco2e: must be null when no subsectors are AVAILABLE`
            );
          }
        } else {
          if (!isFiniteNumber(s.emissions_tco2e)) {
            errors.push(
              `${prefix}.emissions_tco2e: must be a finite number when subsectors are AVAILABLE`
            );
          } else {
            if (Math.abs(s.emissions_tco2e - subSum) > 0.02) {
              errors.push(
                `${prefix}.emissions_tco2e (${s.emissions_tco2e}) does not match sum of AVAILABLE subsectors (${subSum.toFixed(2)})`
              );
            }
            availableSectorSum += s.emissions_tco2e;
            availableSectorCount += 1;
          }
        }
      }
    }
  }

  // Summary total parity
  const summary = record.emissions_summary as Record<string, unknown> | undefined;
  if (!summary || typeof summary !== "object") {
    errors.push("emissions_summary: must be an object");
  } else {
    if (availableSectorCount === 0) {
      if (summary.total_emissions_tco2e !== null) {
        errors.push(
          "emissions_summary.total_emissions_tco2e: must be null when no sectors are AVAILABLE"
        );
      }
    } else if (!isFiniteNumber(summary.total_emissions_tco2e)) {
      errors.push("emissions_summary.total_emissions_tco2e: must be a finite number");
    } else if (Math.abs(summary.total_emissions_tco2e - availableSectorSum) > 0.05) {
      errors.push(
        `emissions_summary.total_emissions_tco2e (${summary.total_emissions_tco2e}) does not match sum of AVAILABLE sectors (${availableSectorSum.toFixed(2)})`
      );
    }
  }

  // Climate risks
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
      if (
        typeof r.availability_status !== "string" ||
        !AVAILABILITY_STATUSES.includes(r.availability_status as AvailabilityStatus)
      ) {
        errors.push(`${prefix}.availability_status: invalid`);
      } else if (r.availability_status === "AVAILABLE") {
        if (!isFiniteNumber(r.risk_index) || r.risk_index < 0 || r.risk_index > 1) {
          errors.push(`${prefix}.risk_index: must be between 0.0 and 1.0 when AVAILABLE`);
        }
        if (!isNonEmptyString(r.risk_class)) {
          errors.push(`${prefix}.risk_class: must be non-empty when AVAILABLE`);
        }
      } else {
        if (r.risk_index !== null) {
          errors.push(`${prefix}.risk_index: must be null when ${r.availability_status}`);
        }
        if (r.risk_class !== null) {
          errors.push(`${prefix}.risk_class: must be null when ${r.availability_status}`);
        }
      }

      if (!isNonEmptyString(r.availability_reason)) {
        errors.push(`${prefix}.availability_reason: must be a non-empty string`);
      }
      if (
        typeof r.data_origin !== "string" ||
        !DATA_ORIGINS.includes(r.data_origin as DataOrigin)
      ) {
        errors.push(`${prefix}.data_origin: invalid`);
      }
      if (
        typeof r.verification_status !== "string" ||
        !VERIFICATION_STATUSES.includes(r.verification_status as VerificationStatus)
      ) {
        errors.push(`${prefix}.verification_status: invalid`);
      }
      if (!isNonEmptyString(r.data_source)) {
        errors.push(`${prefix}.data_source: must be a non-empty string`);
      }
      if (!isNonEmptyString(r.source_reference)) {
        errors.push(`${prefix}.source_reference: must be a non-empty string`);
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
 * Deterministic runtime validator for LocalOverride v2.0.0.
 */
export function validateLocalOverride(override: unknown): ValidationResult {
  const errors: string[] = [];

  if (!override || typeof override !== "object") {
    return { valid: false, errors: ["LocalOverride must be an object"] };
  }

  const o = override as Record<string, unknown>;
  if (o.override_schema_version !== CURRENT_SCHEMA_VERSION) {
    errors.push(
      `override_schema_version: expected "${CURRENT_SCHEMA_VERSION}", got "${String(o.override_schema_version)}"`
    );
  }

  const validateSectionMeta = (sec: Record<string, unknown>, name: string) => {
    if (
      typeof sec.reporting_year !== "number" ||
      !Number.isInteger(sec.reporting_year) ||
      sec.reporting_year < 1990 ||
      sec.reporting_year > 2100
    ) {
      errors.push(`${name}.reporting_year: must be an integer between 1990 and 2100`);
    }
    if (
      typeof sec.coverage_boundary !== "string" ||
      !COVERAGE_BOUNDARIES.includes(sec.coverage_boundary as CoverageBoundary)
    ) {
      errors.push(
        `${name}.coverage_boundary: must be one of ${COVERAGE_BOUNDARIES.join(", ")}`
      );
    }
    if (typeof sec.source_reference !== "string") {
      errors.push(`${name}.source_reference: must be a string`);
    }
  };

  if (o.electricity !== undefined) {
    if (!o.electricity || typeof o.electricity !== "object") {
      errors.push("electricity: must be an object");
    } else {
      const elec = o.electricity as Record<string, unknown>;
      if (!isFiniteNonNegativeNumber(elec.mwh_per_year)) {
        errors.push("electricity.mwh_per_year: must be a non-negative finite number");
      }
      validateSectionMeta(elec, "electricity");
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
      validateSectionMeta(fuels, "fleet_fuels");
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
      if (
        waste.methane_capture_efficiency !== undefined &&
        (!isFiniteNumber(waste.methane_capture_efficiency) ||
          waste.methane_capture_efficiency < 0 ||
          waste.methane_capture_efficiency > 1)
      ) {
        errors.push(
          "solid_waste.methane_capture_efficiency: must be between 0.0 and 1.0"
        );
      }
      validateSectionMeta(waste, "solid_waste");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Safely migrate a legacy v1.0.0 LocalOverride payload (from browser localStorage)
 * to v2.0.0. Preserves recoverable numeric inputs and flags missing boundary/evidence
 * metadata with `needs_review: true` and `coverage_boundary: "UNKNOWN"` instead of
 * granting stronger status.
 */
export function migrateLegacyOverride(
  raw: unknown,
  defaultYear = 2025
): LocalOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (obj.override_schema_version === CURRENT_SCHEMA_VERSION) {
    return validateLocalOverride(obj).valid ? (obj as unknown as LocalOverride) : null;
  }

  const legacyYear =
    typeof obj.reference_year === "number" && Number.isInteger(obj.reference_year)
      ? obj.reference_year
      : defaultYear;

  const migrated: LocalOverride = {
    override_schema_version: CURRENT_SCHEMA_VERSION,
  };

  if (obj.electricity && typeof obj.electricity === "object") {
    const e = obj.electricity as Record<string, unknown>;
    if (isFiniteNonNegativeNumber(e.mwh_per_year)) {
      const src = isNonEmptyString(e.source_note) ? e.source_note.trim() : "";
      migrated.electricity = {
        mwh_per_year: e.mwh_per_year,
        reporting_year: legacyYear,
        coverage_boundary: "UNKNOWN",
        source_reference: src,
        needs_review: true,
      };
    }
  }

  if (obj.fleet_fuels && typeof obj.fleet_fuels === "object") {
    const f = obj.fleet_fuels as Record<string, unknown>;
    if (
      isFiniteNonNegativeNumber(f.diesel_liters) &&
      isFiniteNonNegativeNumber(f.gasoline_liters) &&
      isFiniteNonNegativeNumber(f.ethanol_liters)
    ) {
      const src = isNonEmptyString(f.source_note) ? f.source_note.trim() : "";
      migrated.fleet_fuels = {
        diesel_liters: f.diesel_liters,
        gasoline_liters: f.gasoline_liters,
        ethanol_liters: f.ethanol_liters,
        reporting_year: legacyYear,
        coverage_boundary: "UNKNOWN",
        source_reference: src,
        needs_review: true,
      };
    }
  }

  if (obj.solid_waste && typeof obj.solid_waste === "object") {
    const w = obj.solid_waste as Record<string, unknown>;
    if (
      isFiniteNonNegativeNumber(w.tons_per_year) &&
      typeof w.has_methane_capture === "boolean"
    ) {
      const src = isNonEmptyString(w.source_note) ? w.source_note.trim() : "";
      migrated.solid_waste = {
        tons_per_year: w.tons_per_year,
        has_methane_capture: w.has_methane_capture,
        methane_capture_efficiency: isFiniteNumber(w.methane_capture_efficiency)
          ? w.methane_capture_efficiency
          : undefined,
        reporting_year: legacyYear,
        coverage_boundary: "UNKNOWN",
        source_reference: src,
        needs_review: true,
      };
    }
  }

  if (!migrated.electricity && !migrated.fleet_fuels && !migrated.solid_waste) {
    return null;
  }

  return migrated;
}
