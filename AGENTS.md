# Agent Guidelines (`AGENTS.md`)

## Core Architecture & Principles

1. **Explicit Provenance & Zero Hallucinated Numbers**:
   - Every GHG emission record and climate risk indicator MUST include `confidence_tier` (`"T1_LOCAL" | "T2_MODELED" | "T3_PROXY"`), `data_source`, `reference_year`, `methodology_note`, and `gap_note`.
   - Never use an LLM to invent, estimate, or recalculate emissions or risk numbers. All emission factor calculations and `LocalOverride` recalculations must be performed by pure, deterministic functions in `src/lib/emissionsCalculator.ts`.

2. **Canonical Data Contract**:
   - `data/schema/city.ts` and `data/schema/city_schema.py` are the single source of truth for municipal climate records (`public/data/<ibge_code>.json`) and `public/data/index.json`.
   - Any changes to the schema must keep TypeScript and Python contracts synchronized and pass all unit tests.

3. **GPC & AdaptaBrasil Alignment**:
   - GHG inventories follow the 5 GPC sectors: `STATIONARY_ENERGY`, `TRANSPORTATION`, `WASTE`, `IPPU`, and `AFOLU`.
   - Climate risk indicators align with AdaptaBrasil MCTI strategic sectors (`GEO_HYDROLOGICAL_DISASTERS`, `WATER_RESOURCES`, `HEALTH`, `ENERGY`, `FOOD_SECURITY`).
