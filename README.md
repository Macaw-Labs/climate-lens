# Municipal Climate Lens (`climate-lens`)

Open-source municipal climate baseline & data-gap explorer for Brazilian municipalities with explicit provenance tiers (`T1_LOCAL`, `T2_MODELED`, `T3_PROXY`).

## Overview

Brazilian municipalities face a structural climate-planning bottleneck: national top-down datasets (SEEG Municípios, AdaptaBrasil MCTI, IBGE, SNIS, ANEEL, ANP) provide broad coverage, but local governments often lack a clear view of which numbers are coarse proxies vs. locally measured inventories—and exactly which municipal records are needed to close those gaps.

**Municipal Climate Lens** provides:
1. **GPC-Aligned GHG Baselines**: Stationary Energy, Transportation, Waste, IPPU, and AFOLU emissions indexed by 7-digit IBGE municipality code (`ibge_code`).
2. **Explicit Provenance & Data-Gap Tiers**: Every emission subsector and climate risk indicator carries a `confidence_tier` (`T1_LOCAL`, `T2_MODELED`, or `T3_PROXY`), `data_source`, `methodology_note`, and an actionable `gap_note` specifying the exact local municipal record needed to upgrade to `T1_LOCAL`.
3. **AdaptaBrasil MCTI Climate Risk Profile**: Multi-hazard risk indicators (0.0–1.0) across Geo-hydrological Disasters, Water Resources, Health, Energy, and Food Security.
4. **Deterministic Client-Side Local Overrides**: Pure calculation engine (`src/lib/emissionsCalculator.ts`) allowing municipal staff to input primary local activity data (grid electricity MWh, fleet fuel liters, landfill tonnage & methane capture), recalculate totals deterministically using official Brazilian MCTI/SIN/IPCC factors, and upgrade overridden subsectors to `T1_LOCAL`.

## Repository Structure

- `data/schema/city.ts` — Canonical TypeScript interfaces and runtime validators.
- `data/schema/city_schema.py` — Matching Pydantic v2 data contract and JSON Schema exporter.
- `src/lib/emissionsCalculator.ts` — Pure, deterministic emission factor calculator and `LocalOverride` engine.
- `public/data/index.json` — Municipality manifest index.
- `public/data/4115200.json` — Reference fixture for Maringá, PR (`ibge_code: 4115200`).
- `src/__tests__/emissionsCalculator.test.ts` — Vitest unit test suite covering schema validation, emission factor math, and tier upgrades.

## Running Tests

```bash
npm install
npm test
python3 data/schema/city_schema.py public/data/4115200.json
```
