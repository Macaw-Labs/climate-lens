/**
 * Versioned Emission Factor Registry (`src/lib/emissionFactors.ts`).
 *
 * Every factor explicitly records:
 * - `factor_id`, `version`, `activity_key`
 * - `applicable_year` (strictly matched; never silently substituted across years)
 * - `unit`, `fossil_value`, `biogenic_co2_value`
 * - `gas_coverage`, `gwp_basis`, `geography`
 * - `source_name`, `source_url`, `verification_status`, `assumptions_and_limitations`
 *
 * Unverified or simplified screening factors are marked `"UNVERIFIED"` so
 * downstream calculators never present their outputs as validated.
 */

export type FactorVerificationStatus = "VERIFIED" | "UNVERIFIED";

export type FactorActivityKey =
  | "grid_electricity_sin"
  | "diesel_b14_mobile"
  | "gasoline_c_mobile"
  | "ethanol_hydrated_mobile"
  | "solid_waste_landfill_simplified";

export interface EmissionFactorEntry {
  factor_id: string;
  version: string;
  activity_key: FactorActivityKey;
  label: string;
  applicable_year: number;
  unit: string;
  /** Fossil/non-biogenic GHG factor in tCO2e (or tCO2) per activity unit */
  fossil_value: number;
  /** Biogenic CO2 factor in tCO2 per activity unit (reported separately per GHG Protocol) */
  biogenic_co2_value: number;
  gas_coverage: string;
  gwp_basis: string;
  geography: string;
  source_name: string;
  source_url: string;
  verification_status: FactorVerificationStatus;
  assumptions_and_limitations: string;
}

export const FACTOR_REGISTRY_VERSION = "2026.11.1";

export const EMISSION_FACTOR_REGISTRY: readonly EmissionFactorEntry[] = [
  {
    factor_id: "MCTI_SIN_GRID_2023",
    version: "SIRENE-2023",
    activity_key: "grid_electricity_sin",
    label: "Brazil SIN National Grid Average Factor (2023)",
    applicable_year: 2023,
    unit: "tCO2/MWh",
    fossil_value: 0.0385,
    biogenic_co2_value: 0,
    gas_coverage: "CO2 only (MCTI/SIRENE grid average)",
    gwp_basis: "N/A (CO2 = 1)",
    geography: "Brazil — Sistema Interligado Nacional (SIN)",
    source_name: "MCTI / SIRENE — Fatores de Emissão de CO2 (Ano-base 2023)",
    source_url:
      "https://www.gov.br/mcti/pt-br/acompanhe-o-mcti/sirene/dados-e-ferramentas/fatores-de-emissao",
    verification_status: "VERIFIED",
    assumptions_and_limitations:
      "National annual average grid emission factor for Scope 2 location-based accounting; covers CO2 only and reflects 2023 hydrological dispatch.",
  },
  {
    factor_id: "MCTI_SIN_GRID_2024",
    version: "SIRENE-2024",
    activity_key: "grid_electricity_sin",
    label: "Brazil SIN National Grid Average Factor (2024)",
    applicable_year: 2024,
    unit: "tCO2/MWh",
    fossil_value: 0.0599,
    biogenic_co2_value: 0,
    gas_coverage: "CO2 only (MCTI/SIRENE grid average)",
    gwp_basis: "N/A (CO2 = 1)",
    geography: "Brazil — Sistema Interligado Nacional (SIN)",
    source_name: "MCTI / SIRENE — Fatores de Emissão de CO2 (Ano-base 2024)",
    source_url:
      "https://www.gov.br/mcti/pt-br/acompanhe-o-mcti/sirene/dados-e-ferramentas/fatores-de-emissao",
    verification_status: "VERIFIED",
    assumptions_and_limitations:
      "National annual average grid emission factor for Scope 2 location-based accounting; covers CO2 only and reflects 2024 thermal/hydro dispatch.",
  },
  {
    factor_id: "MCTI_SIN_GRID_2025_UNVERIFIED",
    version: "UNPUBLISHED-2025",
    activity_key: "grid_electricity_sin",
    label: "Brazil SIN National Grid Factor (2025 — Pending Official Audit)",
    applicable_year: 2025,
    unit: "tCO2/MWh",
    fossil_value: 0.0599,
    biogenic_co2_value: 0,
    gas_coverage: "CO2 only (provisional reference pending 2025 SIRENE release)",
    gwp_basis: "N/A (CO2 = 1)",
    geography: "Brazil — Sistema Interligado Nacional (SIN)",
    source_name:
      "MCTI / SIRENE (2025 annual factor not yet verified in local registry)",
    source_url:
      "https://www.gov.br/mcti/pt-br/acompanhe-o-mcti/sirene/dados-e-ferramentas/fatores-de-emissao",
    verification_status: "UNVERIFIED",
    assumptions_and_limitations:
      "UNVERIFIED for 2025: official 2025 annual MCTI/SIRENE average has not been independently verified in this registry; 2024 value is shown only as an unverified provisional placeholder and must not be treated as validated.",
  },
  {
    factor_id: "PBGHG_DIESEL_COMMERCIAL_2024_PROVISIONAL",
    version: "PBGHG-REF-UNAUDITED",
    activity_key: "diesel_b14_mobile",
    label: "Commercial Diesel (B14 blend) — Mobile Combustion (Provisional)",
    applicable_year: 2024,
    unit: "tCO2e/liter",
    fossil_value: 0.002292,
    biogenic_co2_value: 0.000349,
    gas_coverage: "Fossil CO2, CH4, N2O + separate Biogenic CO2 (biodiesel)",
    gwp_basis: "IPCC AR5",
    geography: "Brazil (ANP commercial diesel blend)",
    source_name:
      "Programa Brasileiro GHG Protocol / FGVces (workbook not directly audited in repo)",
    source_url: "https://fgv.br/ces/ghg",
    verification_status: "UNVERIFIED",
    assumptions_and_limitations:
      "UNVERIFIED: PBGHG Excel workbook requires manual download/audit and annual ANP biodiesel blend mandates vary (B12/B13/B14). Biogenic CO2 from biodiesel is tracked separately and excluded from Scope 1 fossil totals.",
  },
  {
    factor_id: "PBGHG_GASOLINE_C_2024_PROVISIONAL",
    version: "PBGHG-REF-UNAUDITED",
    activity_key: "gasoline_c_mobile",
    label: "Commercial Gasoline C (27% anhydrous ethanol) — Mobile Combustion (Provisional)",
    applicable_year: 2024,
    unit: "tCO2e/liter",
    fossil_value: 0.001674,
    biogenic_co2_value: 0.000405,
    gas_coverage: "Fossil CO2, CH4, N2O + separate Biogenic CO2 (anhydrous ethanol)",
    gwp_basis: "IPCC AR5",
    geography: "Brazil (ANP Gasoline C blend)",
    source_name:
      "Programa Brasileiro GHG Protocol / FGVces (workbook not directly audited in repo)",
    source_url: "https://fgv.br/ces/ghg",
    verification_status: "UNVERIFIED",
    assumptions_and_limitations:
      "UNVERIFIED: PBGHG Excel workbook requires manual download/audit; assumes 73% fossil gasoline A / 27% anhydrous ethanol. Biogenic CO2 is tracked separately.",
  },
  {
    factor_id: "PBGHG_ETHANOL_HYDRATED_2024_PROVISIONAL",
    version: "PBGHG-REF-UNAUDITED",
    activity_key: "ethanol_hydrated_mobile",
    label: "Hydrated Ethanol — Mobile Combustion (Provisional)",
    applicable_year: 2024,
    unit: "tCO2e/liter",
    fossil_value: 0.000028,
    biogenic_co2_value: 0.00145,
    gas_coverage: "Tailpipe CH4, N2O (fossil-equivalent) + separate Biogenic CO2",
    gwp_basis: "IPCC AR5",
    geography: "Brazil",
    source_name:
      "Programa Brasileiro GHG Protocol / FGVces (workbook not directly audited in repo)",
    source_url: "https://fgv.br/ces/ghg",
    verification_status: "UNVERIFIED",
    assumptions_and_limitations:
      "UNVERIFIED: PBGHG Excel workbook requires manual download/audit. Combusted CO2 is biogenic (tracked separately); Scope 1 fossil total includes only non-CO2 tailpipe CH4 and N2O.",
  },
  {
    factor_id: "SIMPLIFIED_MSW_LANDFILL_SCREENING",
    version: "SCREENING-MASS-BALANCE-1.0",
    activity_key: "solid_waste_landfill_simplified",
    label: "Simplified Municipal Solid Waste Landfill Screening Factor",
    applicable_year: 2025,
    unit: "tCO2e/metric_ton",
    fossil_value: 1.18,
    biogenic_co2_value: 0,
    gas_coverage: "CH4 (expressed as CO2e; biogenic CO2 excluded per IPCC)",
    gwp_basis: "IPCC AR5 (CH4 GWP100 = 28)",
    geography: "Brazil (generic MSW screening approximation)",
    source_name:
      "Simplified IPCC / SEEG MSW screening approximation (not full FOD cohort model)",
    source_url:
      "https://www.ipcc-nggip.iges.or.jp/public/2019rf/vol5.html",
    verification_status: "UNVERIFIED",
    assumptions_and_limitations:
      "UNVERIFIED / SIMPLIFIED SCREENING METHOD: Applies a flat steady-state methane potential (1.18 tCO2e/t) and optional 55% default capture reduction instead of a multi-year IPCC First-Order Decay (FOD) cohort model calibrated to local waste composition, DOC, and landfill MCF.",
  },
] as const;

export interface FactorLookupResult {
  found: boolean;
  exact_year_match: boolean;
  factor: EmissionFactorEntry | null;
  reason: string;
}

/**
 * Select an emission factor strictly by activity key and reporting year.
 * Never silently substitutes a different year's factor.
 */
export function selectEmissionFactor(
  activityKey: FactorActivityKey,
  reportingYear: number
): FactorLookupResult {
  const exact = EMISSION_FACTOR_REGISTRY.find(
    (f) => f.activity_key === activityKey && f.applicable_year === reportingYear
  );

  if (exact) {
    return {
      found: true,
      exact_year_match: true,
      factor: exact,
      reason:
        exact.verification_status === "VERIFIED"
          ? `Verified factor ${exact.factor_id} for ${reportingYear}.`
          : `Unverified factor ${exact.factor_id} for ${reportingYear}: ${exact.assumptions_and_limitations}`,
    };
  }

  return {
    found: false,
    exact_year_match: false,
    factor: null,
    reason: `No registered emission factor for activity "${activityKey}" in reporting year ${reportingYear}. Silent cross-year substitution is disabled.`,
  };
}
