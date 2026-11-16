# Municipal Climate Lens (Paraná)

Municipal climate baseline and data-gap explorer for all **399 municipalities of Paraná (PR), Brazil**, combining **SEEG Municípios Coleção 14.0**, **AdaptaBrasil MCTI**, and **IBGE Censo 2022** with pre-rendered municipal pages, explicit provenance and verification fields, and deterministic recalculation.

## Purpose and intended users

Climate Lens helps municipal teams inspect their climate baseline, understand how its estimates were produced and supported, and identify the next local evidence to collect. It is intended for municipal environment and climate staff, technical-assistance teams, and researchers.

The current experience supports:

- Exploring municipal emissions, selected risk indicators, reference years, and missing components.
- Distinguishing local, modeled, and proxy origins from evidence-verification status.
- Reading gap guidance for records such as electricity consumption, fuel sales, and landfill tonnage.
- Recalculating supported local activity inputs while retaining partial or incompatible estimates separately.
- Exporting the baseline, overrides, factors, and recalculated record as Audit JSON.

These user needs and benefits are **research hypotheses**, not validated adoption or impact findings. See [Research agenda and product positioning](docs/research-and-positioning.md) for candidate users, research questions, a proposed study, success measures, and current limitations.

## Scope and interpretation

The current focus is baseline interpretation and evidence improvement. Shared inventory management, action prioritization, climate-finance preparation, and independent verification are outside the implemented scope.

Provenance shares describe the composition of available emissions estimates; they are **not accuracy scores or uncertainty intervals**. Emissions, population, and risk indicators can have different reference years. A five-sector mapping and an Audit JSON export do not establish a complete, independently verified GPC inventory.

The schema and calculator implement important safeguards, but ingestion still has missing-to-zero defaults and a missing-population fallback that need correction. Evidence labels also require substantive review beyond the current source-reference checks. See the [limitations and priorities](docs/research-and-positioning.md#8-current-limitations-and-work-priorities) before relying on the records for consequential decisions.

## Key Reliability Principles (Schema `v2.0.0`)

1. **Explicit Missing Data (`null` vs. Genuine `0.0`)**:
   - Unavailable climate risk indices and unmeasured emission components (notably Scope 2 `STATIONARY_ENERGY.grid_electricity`, which is not reported in SEEG Municípios) are represented explicitly as `null` with `availability_status: "UNAVAILABLE"` and an `availability_reason`.
   - Genuine zero emissions (e.g., `IPPU = 0.0` where no industrial process emissions are recorded) remain `0.0` with `availability_status: "AVAILABLE"`.
   - City and sector totals with missing subsectors are labeled **Partial Estimate** (`coverage_status: "PARTIAL"`) and list `missing_components`.
2. **Data Origin vs. Evidence Verification vs. IPCC Tiers**:
   - **Data Origin** (`LOCAL`, `MODELED`, `PROXY`, or `MIXED`) records how the number was produced and is **not** an IPCC Tier 1/2/3 classification.
   - **Verification Status** (`UNVERIFIED`, `DOCUMENTED`, `REVIEW_REQUIRED`, `INDEPENDENTLY_VERIFIED`) tracks evidence quality separately. Entering local numbers does not establish independent verification; the current checks do not authenticate the supplied evidence.
3. **Inventory Boundary & Reporting Period Enforcement**:
   - Local inputs require `reporting_year`, `coverage_boundary` (`MUNICIPALITY_WIDE`, `MUNICIPAL_GOVERNMENT_FLEET`, `PUBLIC_TRANSIT_OPERATOR`, `PARTIAL_FACILITY_OR_SECTOR`, or `UNKNOWN`), and `source_reference`.
   - Partial-boundary, mismatched-year, or unverified-factor inputs are calculated deterministically and preserved in `partial_or_unmerged_estimates` (and Audit JSON exports) **without** overwriting the citywide baseline.
4. **Versioned Emission Factor Registry (`src/lib/emissionFactors.ts`, `2026.11.1`)**:
   - **Verified**: MCTI / SIRENE Brazilian SIN grid average factors for `2023` (`0.0385 tCO2/MWh`) and `2024` (`0.0599 tCO2/MWh`).
   - **Unverified / Provisional**: `2025` SIN grid placeholder, PBGHG mobile fuel factors (which report fossil tCO2e and biogenic CO2 separately), and the simplified municipal solid waste landfill screening factor (`1.18 tCO2e/t`).
   - Factors are matched strictly by `applicable_year` (no silent cross-year substitution), and unverified factors cannot produce validated/merged citywide replacements.
5. **Legacy `localStorage` Migration**:
   - Saved `v1.0.0` `LocalOverride` payloads are migrated via `migrateLegacyOverride()` in `data/schema/city.ts` with `coverage_boundary: "UNKNOWN"` and `needs_review: true` so legacy partial entries are never silently merged into `v2.0.0` citywide totals.

## Setup & Verification Commands

### Python Ingestion & Schema Validation

Regenerating records and running source-reconciliation tests requires the raw SEEG, AdaptaBrasil, and IBGE inputs in `data/raw/`. See [raw-data retrieval](scripts/fetch_raw_data.py); these inputs are not bundled with the repository. The web app reads the committed municipal JSON files.

```bash
pip install -r requirements.txt
python3 scripts/build_city_data.py
python3 data/schema/city_schema.py public/data/4115200.json
python3 -m unittest scripts/test_build_city_data.py -v
```

### Web App, Typecheck, Tests & Build
```bash
npm ci
npm run typecheck
npm test
npm run build
```

[CI](.github/workflows/ci.yml) is configured to run sample schema validation, Python tests, TypeScript checking, web tests, and the Next.js build. It does not regenerate all records or provision the raw inputs required by the source-reconciliation test.

## Live Next.js API Routes

`next.config.ts` supports serverless Next.js Route Handlers (`src/app/api/...`) alongside the 399 pre-rendered municipality pages (requiring a deployment that supports the API route handlers):

- `GET /api/health` — Schema version (`2.0.0`), factor registry version, and municipality count.
- `GET /api/cities?q=&risk=&sector=&limit=` — Filter Paraná municipalities from `public/data/index.json`.
- `GET /api/cities/[ibge_code]` — Full `CityClimateRecord` (`2.0.0`) for a 7-digit IBGE municipality.
- `POST /api/cities/[ibge_code]/recalculate` — Stateless deterministic recalculation for a `LocalOverride` payload (enforcing boundary, year, and factor checks; no database persistence).
- `GET /api/factors?year=&activity_key=` — Versioned emission factor registry (`src/lib/emissionFactors.ts`).

## Licensing Status

No `LICENSE` file is currently present in this repository. All rights and licensing terms remain unspecified until the repository owner selects and adds a license.
