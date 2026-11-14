# Agent Guidelines (`AGENTS.md`)

## Core Architecture & Principles

1. **Explicit Missing Data & Zero Hallucinated Numbers**:
   - Every GHG emission subsector and climate risk indicator MUST explicitly represent missing or unmeasured values as `null` paired with `availability_status` (`"AVAILABLE" | "UNAVAILABLE" | "NOT_APPLICABLE"`) and `availability_reason`. Never coerce unmeasured values (such as SEEG Scope 2 `grid_electricity` or unavailable AdaptaBrasil risk indicators) to `0.0`.
   - Preserve genuine `0.0` values (such as `IPPU` in municipalities with zero industrial process emissions) with `availability_status: "AVAILABLE"`.
   - Never use an LLM to invent, estimate, or recalculate emissions or risk numbers. All emission factor calculations and `LocalOverride` evaluations MUST be performed by pure, deterministic functions in `src/lib/emissionsCalculator.ts` using the versioned registry in `src/lib/emissionFactors.ts`.

2. **Separation of Data Origin, Evidence Verification, and IPCC Tiers**:
   - `data_origin` (`"LOCAL" | "MODELED" | "PROXY"`, or `"MIXED"` at sector/city aggregate level) describes where an estimate came from and is **distinct from IPCC methodological Tiers (Tier 1 / Tier 2 / Tier 3)**.
   - `verification_status` (`"UNVERIFIED" | "DOCUMENTED" | "REVIEW_REQUIRED" | "INDEPENDENTLY_VERIFIED"`) tracks evidence quality independently of `data_origin`. Local data entry alone MUST NEVER imply verification (`DOCUMENTED` requires a source reference, matching boundary/year, and verified emission factors; `INDEPENDENTLY_VERIFIED` requires external audit).

3. **Boundary, Period & Factor Compatibility**:
   - `LocalOverride` inputs MUST capture `reporting_year`, `coverage_boundary` (`"MUNICIPALITY_WIDE" | "MUNICIPAL_GOVERNMENT_FLEET" | "PUBLIC_TRANSIT_OPERATOR" | "PARTIAL_FACILITY_OR_SECTOR" | "UNKNOWN"`), and `source_reference`.
   - Only `MUNICIPALITY_WIDE` inputs matching the baseline `reference_year` and using `VERIFIED` emission factors may replace citywide baseline subsectors. Partial boundaries, mismatched years, or unverified factors MUST remain separate in `partial_or_unmerged_estimates`.
   - Emission factors in `src/lib/emissionFactors.ts` are selected strictly by activity and `applicable_year` without silent cross-year substitution, and track fossil CO2e and biogenic CO2 separately.

4. **Canonical Data Contract (`v2.0.0`)**:
   - `data/schema/city.ts` and `data/schema/city_schema.py` are the single source of truth (`CURRENT_SCHEMA_VERSION = "2.0.0"`) for municipal climate records (`public/data/<ibge_code>.json`) and `public/data/index.json`.
   - Any changes to the schema must keep TypeScript and Python contracts synchronized, support `migrateLegacyOverride()` for legacy `localStorage` payloads, and pass all Python and Vitest unit tests.

5. **GPC & AdaptaBrasil Alignment**:
   - GHG inventories follow the 5 GPC sectors: `STATIONARY_ENERGY`, `TRANSPORTATION`, `WASTE`, `IPPU`, and `AFOLU`.
   - Climate risk indicators align with AdaptaBrasil MCTI strategic sectors (`GEO_HYDROLOGICAL_DISASTERS`, `WATER_RESOURCES`, `HEALTH`, `ENERGY`, `FOOD_SECURITY`).
