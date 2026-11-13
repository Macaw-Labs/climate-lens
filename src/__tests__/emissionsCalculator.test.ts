import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CityClimateRecord,
  CityIndexManifest,
  GPC_SECTOR_CODES,
  LocalOverride,
  validateCityClimateRecord,
  validateLocalOverride,
} from "../../data/schema/city";
import {
  applyLocalOverrides,
  BRAZIL_EMISSION_FACTORS,
  calculateElectricityEmissions,
  calculateFleetFuelEmissions,
  calculateSolidWasteEmissions,
} from "../lib/emissionsCalculator";

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

describe("Canonical Schema & Fixtures Validation", () => {
  it("validates Maringá (4115200.json) against CityClimateRecord contract", () => {
    const maringa = loadMaringaFixture();
    const result = validateCityClimateRecord(maringa);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(maringa.metadata.ibge_code).toBe("4115200");
    expect(maringa.metadata.name).toBe("Maringá");
    expect(maringa.metadata.state).toBe("PR");

    // Ensure all 5 GPC sectors exist and require gap_note on every subsector
    for (const sectorCode of GPC_SECTOR_CODES) {
      const sector = maringa.sectors[sectorCode];
      expect(sector).toBeDefined();
      expect(sector.gap_note.length).toBeGreaterThan(10);
      for (const sub of sector.subsectors) {
        expect(sub.gap_note.length).toBeGreaterThan(10);
        expect(["T1_LOCAL", "T2_MODELED", "T3_PROXY"]).toContain(
          sub.confidence_tier
        );
      }
    }

    // Ensure AdaptaBrasil MCTI climate risk indicators are valid
    expect(maringa.climate_risks.length).toBeGreaterThanOrEqual(5);
    for (const risk of maringa.climate_risks) {
      expect(risk.risk_index).toBeGreaterThanOrEqual(0);
      expect(risk.risk_index).toBeLessThanOrEqual(1);
    }
  });

  it("validates public/data/index.json manifest", () => {
    const raw = fs.readFileSync(INDEX_FIXTURE_PATH, "utf-8");
    const index = JSON.parse(raw) as CityIndexManifest;
    const maringa = loadMaringaFixture();

    expect(index.schema_version).toBe("1.0.0");
    expect(index.municipalities).toHaveLength(399);
    const maringaEntry = index.municipalities.find(
      (m) => m.ibge_code === "4115200"
    );
    expect(maringaEntry).toBeDefined();
    expect(maringaEntry!.total_emissions_tco2e).toBe(
      maringa.emissions_summary.total_emissions_tco2e
    );
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

  it("validates LocalOverride payloads and rejects negative activity numbers", () => {
    const validOverride: LocalOverride = {
      reference_year: 2024,
      electricity: { mwh_per_year: 1200000 },
      fleet_fuels: {
        diesel_liters: 100000,
        gasoline_liters: 50000,
        ethanol_liters: 20000,
      },
      solid_waste: {
        tons_per_year: 135000,
        has_methane_capture: true,
      },
    };
    expect(validateLocalOverride(validOverride).valid).toBe(true);

    const invalidOverride = {
      electricity: { mwh_per_year: -500 },
    };
    const res = validateLocalOverride(invalidOverride);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("electricity.mwh_per_year");
  });
});

describe("Deterministic Emissions Factor Math & Confidence Tier Upgrades", () => {
  it("calculates SIN grid electricity emissions accurately", () => {
    // 1,000,000 MWh * 0.0385 tCO2e/MWh = 38,500 tCO2e
    const result = calculateElectricityEmissions(1_000_000);
    expect(result).toBe(38500);
  });

  it("calculates Brazilian MCTI/GHG Protocol fleet fuel emissions accurately", () => {
    // 1,000,000 L Diesel B14 (2,292 t) + 1,000,000 L Gasoline C (1,674 t) + 1,000,000 L Ethanol (28 t) = 3,994 tCO2e
    const result = calculateFleetFuelEmissions({
      diesel_liters: 1_000_000,
      gasoline_liters: 1_000_000,
      ethanol_liters: 1_000_000,
    });
    expect(result).toBe(3994);
  });

  it("calculates solid waste landfill emissions with and without methane capture", () => {
    // 100,000 tons * 1.18 tCO2e/t = 118,000 tCO2e without capture
    const uncaptured = calculateSolidWasteEmissions({
      tons_per_year: 100_000,
      has_methane_capture: false,
    });
    expect(uncaptured).toBe(118000);

    // With default 55% methane capture: 118,000 * (1 - 0.55) = 53,100 tCO2e
    const capturedDefault = calculateSolidWasteEmissions({
      tons_per_year: 100_000,
      has_methane_capture: true,
    });
    expect(capturedDefault).toBe(53100);

    // With custom 70% methane capture: 118,000 * (1 - 0.70) = 35,400 tCO2e
    const capturedCustom = calculateSolidWasteEmissions({
      tons_per_year: 100_000,
      has_methane_capture: true,
      methane_capture_efficiency: 0.7,
    });
    expect(capturedCustom).toBe(35400);
  });

  it("applies LocalOverride immutably, recalculates totals, and upgrades tiers from T3_PROXY/T2_MODELED to T1_LOCAL", () => {
    const baseMaringa = loadMaringaFixture();

    // Verify initial confidence tiers before override
    const initialElecSub = baseMaringa.sectors.STATIONARY_ENERGY.subsectors.find(
      (s) => s.subsector_key === "grid_electricity"
    )!;
    const initialRoadSub = baseMaringa.sectors.TRANSPORTATION.subsectors.find(
      (s) => s.subsector_key === "on_road_transportation"
    )!;
    const initialWasteSub = baseMaringa.sectors.WASTE.subsectors.find(
      (s) => s.subsector_key === "solid_waste_disposal"
    )!;

    expect(initialElecSub.confidence_tier).toBe("T3_PROXY");
    expect(initialRoadSub.confidence_tier).toBe("T3_PROXY");
    expect(initialWasteSub.confidence_tier).toBe("T3_PROXY");
    expect(baseMaringa.emissions_summary.tier_breakdown.T1_LOCAL_share).toBe(0);

    const baseStatFuel =
      baseMaringa.sectors.STATIONARY_ENERGY.subsectors.find(
        (s) => s.subsector_key === "stationary_fuel_combustion"
      )!.emissions_tco2e;
    const baseOffRoad =
      baseMaringa.sectors.TRANSPORTATION.subsectors.find(
        (s) => s.subsector_key === "off_road_and_aviation"
      )!.emissions_tco2e;
    const baseWastewater =
      baseMaringa.sectors.WASTE.subsectors.find(
        (s) => s.subsector_key === "wastewater_treatment"
      )!.emissions_tco2e;
    const baseIppu = baseMaringa.sectors.IPPU.emissions_tco2e;
    const baseAfolu = baseMaringa.sectors.AFOLU.emissions_tco2e;

    const override: LocalOverride = {
      reference_year: 2024,
      electricity: {
        mwh_per_year: 1_200_000, // 1,200,000 * 0.0385 = 46,200 tCO2e
        source_note: "Copel Distribuição S.A. Maringá 2024 Annual Report",
      },
      fleet_fuels: {
        diesel_liters: 150_000_000, // 343,800
        gasoline_liters: 140_000_000, // 234,360
        ethanol_liters: 85_000_000, // 2,380 -> sum = 580,540 tCO2e
        source_note: "ANP SIMP 2024 Retail Sales + TCCC Fleet Log",
      },
      solid_waste: {
        tons_per_year: 140_000,
        has_methane_capture: true, // 140,000 * 1.18 * 0.45 = 74,340 tCO2e
        source_note: "Selurb Maringá Weighbridge 2024",
      },
    };

    const updated = applyLocalOverrides(baseMaringa, override);

    // 1. Ensure baseMaringa was not mutated
    expect(
      baseMaringa.sectors.STATIONARY_ENERGY.subsectors[0].confidence_tier
    ).toBe("T3_PROXY");

    // 2. Verify updated record still passes full schema validation
    const validation = validateCityClimateRecord(updated);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);

    // 3. Verify subsector upgrades to T1_LOCAL and exact deterministic math
    const updatedElecSub = updated.sectors.STATIONARY_ENERGY.subsectors.find(
      (s) => s.subsector_key === "grid_electricity"
    )!;
    expect(updatedElecSub.confidence_tier).toBe("T1_LOCAL");
    expect(updatedElecSub.emissions_tco2e).toBe(46200);
    expect(updatedElecSub.reference_year).toBe(2024);

    expect(updated.sectors.STATIONARY_ENERGY.emissions_tco2e).toBeCloseTo(
      46200 + baseStatFuel,
      2
    );

    const updatedRoadSub = updated.sectors.TRANSPORTATION.subsectors.find(
      (s) => s.subsector_key === "on_road_transportation"
    )!;
    expect(updatedRoadSub.confidence_tier).toBe("T1_LOCAL");
    expect(updatedRoadSub.emissions_tco2e).toBe(580540);
    // Since on_road_transportation is >96% of TRANSPORTATION, sector tier upgrades to T1_LOCAL
    expect(updated.sectors.TRANSPORTATION.confidence_tier).toBe("T1_LOCAL");
    expect(updated.sectors.TRANSPORTATION.emissions_tco2e).toBeCloseTo(
      580540 + baseOffRoad,
      2
    );

    const updatedWasteSub = updated.sectors.WASTE.subsectors.find(
      (s) => s.subsector_key === "solid_waste_disposal"
    )!;
    expect(updatedWasteSub.confidence_tier).toBe("T1_LOCAL");
    expect(updatedWasteSub.emissions_tco2e).toBe(74340);
    // 74,340 / (74,340 + 53,874.10) = 57.98% (< 60% T1_LOCAL threshold)
    expect(updated.sectors.WASTE.confidence_tier).toBe("T3_PROXY");
    expect(updated.sectors.WASTE.emissions_tco2e).toBeCloseTo(
      74340 + baseWastewater,
      2
    );

    // 4. Verify city-wide total and T1_LOCAL share upgrade
    const expectedTotal =
      46200 +
      baseStatFuel +
      580540 +
      baseOffRoad +
      74340 +
      baseWastewater +
      baseIppu +
      baseAfolu;
    expect(updated.emissions_summary.total_emissions_tco2e).toBeCloseTo(
      expectedTotal,
      2
    );
    expect(updated.emissions_summary.tier_breakdown.T1_LOCAL_share).toBeGreaterThan(
      0.65
    );
  });
});
