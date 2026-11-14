# Municipal Climate Lens (Paraná)

Static municipal climate baseline and data-gap explorer for all **399 municipalities of Paraná (PR), Brazil**, combining **SEEG Municípios Coleção 14.0**, **AdaptaBrasil MCTI**, and **IBGE Censo 2022** with explicit missing-data handling, provenance/verification separation, and deterministic client-side calculations.

## Key Reliability Principles (Schema `v2.0.0`)

1. **Explicit Missing Data (`null` vs. Genuine `0.0`)**:
   - Unavailable climate risk indices and unmeasured emission components (notably Scope 2 `STATIONARY_ENERGY.grid_electricity`, which is not reported in SEEG Municípios) are represented explicitly as `null` with `availability_status: "UNAVAILABLE"` and an `availability_reason`.
   - Genuine zero emissions (e.g., `IPPU = 0.0` where no industrial process emissions are recorded) remain `0.0` with `availability_status: "AVAILABLE"`.
   - City and sector totals with missing subsectors are labeled **Partial Estimate** (`coverage_status: "PARTIAL"`) and list `missing_components`.
2. **Data Origin vs. Evidence Verification vs. IPCC Tiers**:
   - **Data Origin** (`LOCAL`, `MODELED`, `PROXY`, or `MIXED`) records how the number was produced and is **not** an IPCC Tier 1/2/3 classification.
   - **Verification Status** (`UNVERIFIED`, `DOCUMENTED`, `REVIEW_REQUIRED`, `INDEPENDENTLY_VERIFIED`) tracks evidence quality separately. Entering local numbers in the browser never automatically marks a value as verified.
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
```bash
pip install -r requirements.txt
python3 scripts/build_city_data.py
python3 data/schema/city_schema.py public/data/4115200.json
python3 -m unittest scripts/test_build_city_data.py -v
```

### Web App, Typecheck, Tests & Static Export
```bash
npm ci
npm run typecheck
npm test
npm run build
```

CI runs all of the above checks via `.github/workflows/ci.yml`.

## Live Next.js API Routes

`next.config.ts` supports serverless Next.js Route Handlers (`src/app/api/...`) alongside the 399 pre-rendered municipality pages (deployable on free serverless tiers such as Vercel Hobby or Netlify Starter):

- `GET /api/health` — Schema version (`2.0.0`), factor registry version, and municipality count.
- `GET /api/cities?q=&risk=&sector=&limit=` — Filter Paraná municipalities from `public/data/index.json`.
- `GET /api/cities/[ibge_code]` — Full `CityClimateRecord` (`2.0.0`) for a 7-digit IBGE municipality.
- `POST /api/cities/[ibge_code]/recalculate` — Stateless deterministic recalculation for a `LocalOverride` payload (enforcing boundary, year, and factor checks; no database persistence).
- `GET /api/factors?year=&activity_key=` — Versioned emission factor registry (`src/lib/emissionFactors.ts`).

## Licensing Status

No `LICENSE` file is currently present in this repository. All rights and licensing terms remain unspecified until the repository owner selects and adds a license.
