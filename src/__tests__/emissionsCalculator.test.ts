import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CityClimateRecord,
  CityIndexManifest,
  CURRENT_SCHEMA_VERSION,
  GPC_SECTOR_CODES,
  LocalOverride,
  migrateLegacyOverride,
  validateCityClimateRecord,
  validateLocalOverride,
} from "../../data/schema/city";
import {
  applyLocalOverrides,
  calculateElectricityEmissions,
  calculateFleetFuelEmissions,
  calculateSolidWasteEmissions,
} from "../lib/emissionsCalculator";
import {
  EMISSION_FACTOR_REGISTRY,
  FACTOR_REGISTRY_VERSION,
  selectEmissionFactor,
} from "../lib/emissionFactors";

const MARINGA_FIXTURE_PATH = path.resolve(
  __dirname,
  "../../public/data/4115200.json"
);
const INDEX_FIXTURE_PATH = path.resolve(
  __dirname,
  "../../public/data/index.json"
);

function loadMaringaFixture(): CityClimateRecord {
  const raw = fs.readFileSync(MARINGA_FIXTURE_PATH, "utf-8");
  return JSON.parse(raw) as CityClimateRecord;
}

describe("Canonical Schema v2.0.0 & Fixtures Validation", () => {
  it("validates Maringá (4115200.json) against CityClimateRecord v2.0.0 contract", () => {
    const maringa = loadMaringaFixture();
    const result = validateCityClimateRecord(maringa);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(maringa.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(maringa.metadata.ibge_code).toBe("4115200");
    expect(maringa.metadata.name).toBe("Maringá");
    expect(maringa.metadata.state).toBe("PR");

    // Scope 2 grid electricity must be explicitly UNAVAILABLE (null), not coerced to 0
    const gridSub = maringa.sectors.STATIONARY_ENERGY.subsectors.find(
      (s) => s.subsector_key === "grid_electricity"
    );
    expect(gridSub).toBeDefined();
    expect(gridSub!.emissions_tco2e).toBeNull();
    expect(gridSub!.availability_status).toBe("UNAVAILABLE");
    expect(maringa.sectors.STATIONARY_ENERGY.coverage_status).toBe("PARTIAL");
    expect(maringa.emissions_summary.coverage_status).toBe("PARTIAL");
    expect(maringa.emissions_summary.missing_components).toContain(
      "STATIONARY_ENERGY.grid_electricity"
    );

    // Genuine 0.0 IPPU must remain AVAILABLE and 0
    expect(maringa.sectors.IPPU.emissions_tco2e).toBe(0);
    expect(maringa.sectors.IPPU.coverage_status).toBe("COMPLETE");
    expect(maringa.sectors.IPPU.subsectors[0].availability_status).toBe(
      "AVAILABLE"
    );

    for (const sectorCode of GPC_SECTOR_CODES) {
      const sector = maringa.sectors[sectorCode];
      expect(sector).toBeDefined();
      expect(sector.gap_note.length).toBeGreaterThan(10);
      for (const sub of sector.subsectors) {
        expect(sub.gap_note.length).toBeGreaterThan(10);
        expect(["LOCAL", "MODELED", "PROXY"]).toContain(sub.data_origin);
      }
    }

    expect(maringa.climate_risks.length).toBeGreaterThanOrEqual(5);
    for (const risk of maringa.climate_risks) {
      if (risk.availability_status === "AVAILABLE") {
        expect(risk.risk_index).toBeGreaterThanOrEqual(0);
        expect(risk.risk_index).toBeLessThanOrEqual(1);
        expect(risk.risk_class).not.toBeNull();
      } else {
        expect(risk.risk_index).toBeNull();
        expect(risk.risk_class).toBeNull();
      }
    }
  });

  it("validates public/data/index.json manifest (v2.0.0)", () => {
    const raw = fs.readFileSync(INDEX_FIXTURE_PATH, "utf-8");
    const index = JSON.parse(raw) as CityIndexManifest;
    const maringa = loadMaringaFixture();

    expect(index.schema_version).toBe("2.0.0");
    expect(index.municipalities).toHaveLength(399);
    const maringaEntry = index.municipalities.find(
      (m) => m.ibge_code === "4115200"
    );
    expect(maringaEntry).toBeDefined();
    expect(maringaEntry!.total_emissions_tco2e).toBe(
      maringa.emissions_summary.total_emissions_tco2e
    );
    expect(maringaEntry!.coverage_status).toBe("PARTIAL");
    expect(maringaEntry!.missing_components_count).toBeGreaterThan(0);
  });

  it("distinguishes missing (null) risk from genuine 0.0 risk in validator", () => {
    const maringa = loadMaringaFixture();
    const copy = JSON.parse(JSON.stringify(maringa)) as CityClimateRecord;

    // Genuine 0.0 risk
    copy.climate_risks[0].risk_index = 0.0;
    copy.climate_risks[0].risk_class = "VERY_LOW";
    copy.climate_risks[0].availability_status = "AVAILABLE";
    expect(validateCityClimateRecord(copy).valid).toBe(true);

    // Unavailable risk with null
    copy.climate_risks[0].risk_index = null;
    copy.climate_risks[0].risk_class = null;
    copy.climate_risks[0].availability_status = "UNAVAILABLE";
    copy.climate_risks[0].availability_reason =
      "Not published for this municipality";
    expect(validateCityClimateRecord(copy).valid).toBe(true);

    // Invalid: UNAVAILABLE cannot have numeric 0.0
    copy.climate_risks[0].risk_index = 0.0;
    const bad = validateCityClimateRecord(copy);
    expect(bad.valid).toBe(false);
  });

  it("rejects malformed CityClimateRecord payloads", () => {
    const maringa = loadMaringaFixture();
    const broken = JSON.parse(JSON.stringify(maringa));
    broken.metadata.ibge_code = "41152"; // Not 7 digits
    broken.sectors.STATIONARY_ENERGY.subsectors[0].gap_note = ""; // Empty gap_note

    const result = validateCityClimateRecord(broken);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("metadata.ibge_code: must be a 7-digit string");
    expect(result.errors).toContain(
      "sectors.STATIONARY_ENERGY.subsectors[0].gap_note: must be a non-empty string"
    );
  });

  it("validates LocalOverride v2.0.0 payloads and rejects negative numbers", () => {
    const validOverride: LocalOverride = {
      override_schema_version: "2.0.0",
      electricity: {
        mwh_per_year: 1200000,
        reporting_year: 2024,
        coverage_boundary: "MUNICIPALITY_WIDE",
        source_reference: "Copel Relatório Anual 2024",
      },
      fleet_fuels: {
        diesel_liters: 50000,
        gasoline_liters: 30000,
        ethanol_liters: 20000,
        reporting_year: 2024,
        coverage_boundary: "MUNICIPAL_GOVERNMENT_FLEET",
        source_reference: "Frota Municipal 2024",
      },
    };
    expect(validateLocalOverride(validOverride)).toEqual({
      valid: true,
      errors: [],
    });

    const badOverride = {
      override_schema_version: "2.0.0",
      electricity: {
        mwh_per_year: -10,
        reporting_year: 2024,
        coverage_boundary: "MUNICIPALITY_WIDE",
        source_reference: "",
      },
    };
    const res = validateLocalOverride(badOverride);
    expect(res.valid).toBe(false);
    expect(res.errors).toContain(
      "electricity.mwh_per_year: must be a non-negative finite number"
    );
  });
});

describe("Versioned Emission Factor Registry & Selection", () => {
  it("selects verified MCTI/SIRENE grid factors strictly by year without cross-year substitution", () => {
    expect(FACTOR_REGISTRY_VERSION).toBe("2026.11.1");
    expect(EMISSION_FACTOR_REGISTRY.length).toBeGreaterThanOrEqual(7);

    const f2023 = selectEmissionFactor("grid_electricity_sin", 2023);
    expect(f2023.found).toBe(true);
    expect(f2023.factor?.fossil_value).toBe(0.0385);
    expect(f2023.factor?.verification_status).toBe("VERIFIED");

    const f2024 = selectEmissionFactor("grid_electricity_sin", 2024);
    expect(f2024.found).toBe(true);
    expect(f2024.factor?.fossil_value).toBe(0.0599);
    expect(f2024.factor?.verification_status).toBe("VERIFIED");

    // 2025 SIN is explicitly UNVERIFIED
    const f2025 = selectEmissionFactor("grid_electricity_sin", 2025);
    expect(f2025.found).toBe(true);
    expect(f2025.factor?.verification_status).toBe("UNVERIFIED");

    // Unsupported year must fail cleanly rather than silently substituting
    const f2019 = selectEmissionFactor("grid_electricity_sin", 2019);
    expect(f2019.found).toBe(false);
    expect(() => calculateElectricityEmissions(1000, 2019)).toThrow();
  });

  it("tracks fossil and biogenic CO2 separately for mobile fuels", () => {
    const out = calculateFleetFuelEmissions(
      {
        diesel_liters: 100000,
        gasoline_liters: 50000,
        ethanol_liters: 80000,
      },
      2024
    );
    expect(out.fossil_tco2e).toBeGreaterThan(0);
    expect(out.biogenic_co2_tco2).toBeGreaterThan(0);
    // Mobile factors are provisional/unverified in registry
    expect(out.all_factors_verified).toBe(false);
    expect(out.factor_warnings.length).toBeGreaterThan(0);
  });

  it("handles measured 0 consumption distinct from unavailable", () => {
    const out = calculateElectricityEmissions(0, 2024);
    expect(out.fossil_tco2e).toBe(0);
    expect(out.all_factors_verified).toBe(true);
  });
});

describe("Deterministic Override Engine: Provenance, Verification & Boundaries", () => {
  it("keeps partial boundaries (municipal fleet / facility) unmerged so citywide baseline stays intact", () => {
    const maringa = loadMaringaFixture();
    const override: LocalOverride = {
      override_schema_version: "2.0.0",
      fleet_fuels: {
        diesel_liters: 120000,
        gasoline_liters: 40000,
        ethanol_liters: 25000,
        reporting_year: 2024,
        coverage_boundary: "MUNICIPAL_GOVERNMENT_FLEET",
        source_reference: "Secretaria de Logística — Frota 2024",
      },
    };

    const result = applyLocalOverrides(maringa, override);
    expect(result.merged_components).toEqual([]);
    expect(result.partial_or_unmerged_estimates).toHaveLength(1);
    expect(result.partial_or_unmerged_estimates[0].coverage_boundary).toBe(
      "MUNICIPAL_GOVERNMENT_FLEET"
    );
    expect(result.partial_or_unmerged_estimates[0].reason_not_merged).toContain(
      "MUNICIPAL_GOVERNMENT_FLEET"
    );
    // Citywide transportation baseline must NOT be replaced
    expect(result.city.sectors.TRANSPORTATION.emissions_tco2e).toBe(
      maringa.sectors.TRANSPORTATION.emissions_tco2e
    );
    expect(result.city.emissions_summary.total_emissions_tco2e).toBe(
      maringa.emissions_summary.total_emissions_tco2e
    );
  });

  it("merges compatible MUNICIPALITY_WIDE electricity override when year matches base inventory year, marking it DOCUMENTED (never INDEPENDENTLY_VERIFIED)", () => {
    const maringa = loadMaringaFixture();
    // Create a 2024 base record so reporting_year=2024 matches baseYear=2024 and uses VERIFIED 2024 SIN factor
    const base2024 = JSON.parse(JSON.stringify(maringa)) as CityClimateRecord;
    base2024.emissions_summary.reference_year = 2024;
    for (const code of GPC_SECTOR_CODES) {
      base2024.sectors[code].reference_year = 2024;
      for (const sub of base2024.sectors[code].subsectors) {
        sub.reference_year = 2024;
      }
    }

    const override: LocalOverride = {
      override_schema_version: "2.0.0",
      electricity: {
        mwh_per_year: 1_000_000,
        reporting_year: 2024,
        coverage_boundary: "MUNICIPALITY_WIDE",
        source_reference: "Copel Faturamento Municipal 2024",
      },
    };

    const result = applyLocalOverrides(base2024, override);
    expect(result.merged_components).toContain("electricity");
    expect(result.partial_or_unmerged_estimates).toHaveLength(0);

    const gridSub = result.city.sectors.STATIONARY_ENERGY.subsectors.find(
      (s) => s.subsector_key === "grid_electricity"
    )!;
    expect(gridSub.availability_status).toBe("AVAILABLE");
    expect(gridSub.emissions_tco2e).toBe(59900); // 1,000,000 * 0.0599
    expect(gridSub.data_origin).toBe("LOCAL");
    expect(gridSub.verification_status).toBe("DOCUMENTED");
    expect(gridSub.verification_status).not.toBe("INDEPENDENTLY_VERIFIED");

    // Stationary energy is now COMPLETE and MIXED (local grid + proxy stationary fuels)
    expect(result.city.sectors.STATIONARY_ENERGY.coverage_status).toBe(
      "COMPLETE"
    );
    expect(result.city.sectors.STATIONARY_ENERGY.data_origin).toBe("MIXED");
    expect(result.city.emissions_summary.coverage_status).toBe("COMPLETE");
    expect(result.city.emissions_summary.provenance_mix.is_mixed).toBe(true);
  });

  it("marks local entry without source_reference as REVIEW_REQUIRED and unmerged", () => {
    const maringa = loadMaringaFixture();
    const override: LocalOverride = {
      override_schema_version: "2.0.0",
      electricity: {
        mwh_per_year: 500_000,
        reporting_year: 2024,
        coverage_boundary: "MUNICIPALITY_WIDE",
        source_reference: "",
      },
    };

    const result = applyLocalOverrides(maringa, override);
    expect(result.merged_components).toEqual([]);
    expect(result.partial_or_unmerged_estimates).toHaveLength(1);
    expect(result.partial_or_unmerged_estimates[0].verification_status).toBe(
      "REVIEW_REQUIRED"
    );
  });

  it("keeps solid waste override with unverified simplified factor unmerged", () => {
    const maringa = loadMaringaFixture();
    const override: LocalOverride = {
      override_schema_version: "2.0.0",
      solid_waste: {
        tons_per_year: 120000,
        has_methane_capture: true,
        methane_capture_efficiency: 0.6,
        reporting_year: 2025,
        coverage_boundary: "MUNICIPALITY_WIDE",
        source_reference: "Balança Aterro Municipal 2025",
      },
    };

    const calc = calculateSolidWasteEmissions(override.solid_waste!, 2025);
    expect(calc.all_factors_verified).toBe(false);

    const result = applyLocalOverrides(maringa, override);
    expect(result.merged_components).toEqual([]);
    expect(result.partial_or_unmerged_estimates).toHaveLength(1);
    expect(result.partial_or_unmerged_estimates[0].factor_verified).toBe(false);
    expect(result.partial_or_unmerged_estimates[0].verification_status).toBe(
      "UNVERIFIED"
    );
  });

  it("migrates legacy v1.0.0 LocalOverride safely with UNKNOWN boundary and REVIEW_REQUIRED", () => {
    const legacyV1 = {
      reference_year: 2024,
      electricity: { mwh_per_year: 250000, source_note: "Copel draft" },
      fleet_fuels: {
        diesel_liters: 10000,
        gasoline_liters: 5000,
        ethanol_liters: 2000,
      },
    };

    const migrated = migrateLegacyOverride(legacyV1, 2025);
    expect(migrated).not.toBeNull();
    expect(migrated!.override_schema_version).toBe("2.0.0");
    expect(migrated!.electricity?.coverage_boundary).toBe("UNKNOWN");
    expect(migrated!.electricity?.needs_review).toBe(true);
    expect(migrated!.fleet_fuels?.coverage_boundary).toBe("UNKNOWN");
    expect(validateLocalOverride(migrated).valid).toBe(true);

    // Migrated override with UNKNOWN boundary must NOT overwrite citywide baseline
    const maringa = loadMaringaFixture();
    const applied = applyLocalOverrides(maringa, migrated!);
    expect(applied.merged_components).toEqual([]);
    expect(applied.partial_or_unmerged_estimates.length).toBe(2);
  });
});
