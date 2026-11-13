"""
Canonical Python Schema, JSON Schema definition, and deterministic validator
for Municipal Climate Lens (`data/schema/city_schema.py`).

Matches `data/schema/city.ts` 1-to-1 for Brazilian municipal climate baseline
records (`public/data/<ibge_code>.json`) and client-side `LocalOverride` payloads.
Supports both Pydantic v2 (when installed) and zero-dependency standard-library
validation + JSON Schema export.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional

ConfidenceTier = Literal["T1_LOCAL", "T2_MODELED", "T3_PROXY"]

GPCSectorCode = Literal[
    "STATIONARY_ENERGY",
    "TRANSPORTATION",
    "WASTE",
    "IPPU",
    "AFOLU",
]

AdaptaBrasilSectorCode = Literal[
    "GEO_HYDROLOGICAL_DISASTERS",
    "WATER_RESOURCES",
    "HEALTH",
    "ENERGY",
    "FOOD_SECURITY",
]

ClimateRiskClass = Literal[
    "VERY_LOW",
    "LOW",
    "MEDIUM",
    "HIGH",
    "VERY_HIGH",
]

ClimateScenario = Literal[
    "HISTORICAL_BASELINE",
    "RCP4_5_2030",
    "RCP4_5_2050",
    "RCP8_5_2030",
    "RCP8_5_2050",
    "SSP2_4_5_2030",
    "SSP5_8_5_2050",
]

CONFIDENCE_TIERS = ("T1_LOCAL", "T2_MODELED", "T3_PROXY")
GPC_SECTOR_CODES = (
    "STATIONARY_ENERGY",
    "TRANSPORTATION",
    "WASTE",
    "IPPU",
    "AFOLU",
)
ADAPTABRASIL_SECTORS = (
    "GEO_HYDROLOGICAL_DISASTERS",
    "WATER_RESOURCES",
    "HEALTH",
    "ENERGY",
    "FOOD_SECURITY",
)
RISK_CLASSES = ("VERY_LOW", "LOW", "MEDIUM", "HIGH", "VERY_HIGH")
CLIMATE_SCENARIOS = (
    "HISTORICAL_BASELINE",
    "RCP4_5_2030",
    "RCP4_5_2050",
    "RCP8_5_2030",
    "RCP8_5_2050",
    "SSP2_4_5_2030",
    "SSP5_8_5_2050",
)

CITY_CLIMATE_JSON_SCHEMA: Dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "CityClimateRecord",
    "type": "object",
    "required": [
        "schema_version",
        "metadata",
        "emissions_summary",
        "sectors",
        "climate_risks",
        "last_updated",
    ],
    "properties": {
        "schema_version": {"const": "1.0.0"},
        "metadata": {
            "type": "object",
            "required": ["ibge_code", "name", "state", "population", "population_year"],
            "properties": {
                "ibge_code": {"type": "string", "pattern": "^\\d{7}$"},
                "name": {"type": "string", "minLength": 1},
                "state": {"type": "string", "pattern": "^[A-Z]{2}$"},
                "population": {"type": "integer", "minimum": 1},
                "population_year": {"type": "integer", "minimum": 1990, "maximum": 2100},
                "area_km2": {"type": "number", "exclusiveMinimum": 0},
                "biome": {"type": "string"},
            },
        },
        "emissions_summary": {
            "type": "object",
            "required": [
                "total_emissions_tco2e",
                "per_capita_tco2e",
                "reference_year",
                "dominant_sector",
                "tier_breakdown",
            ],
            "properties": {
                "total_emissions_tco2e": {"type": "number"},
                "per_capita_tco2e": {"type": "number"},
                "reference_year": {"type": "integer", "minimum": 1990, "maximum": 2100},
                "dominant_sector": {"type": "string", "enum": list(GPC_SECTOR_CODES)},
                "tier_breakdown": {
                    "type": "object",
                    "required": ["T1_LOCAL_share", "T2_MODELED_share", "T3_PROXY_share"],
                    "properties": {
                        "T1_LOCAL_share": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                        "T2_MODELED_share": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                        "T3_PROXY_share": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                    },
                },
            },
        },
        "sectors": {
            "type": "object",
            "required": list(GPC_SECTOR_CODES),
            "properties": {
                code: {"$ref": "#/$defs/SectorEmissionRecord"} for code in GPC_SECTOR_CODES
            },
        },
        "climate_risks": {
            "type": "array",
            "minItems": 1,
            "items": {"$ref": "#/$defs/ClimateRiskIndicator"},
        },
        "last_updated": {"type": "string", "minLength": 1},
    },
    "$defs": {
        "SubsectorEmissionRecord": {
            "type": "object",
            "required": [
                "subsector_key",
                "subsector_name",
                "emissions_tco2e",
                "confidence_tier",
                "data_source",
                "reference_year",
                "methodology_note",
                "gap_note",
            ],
            "properties": {
                "subsector_key": {"type": "string", "minLength": 1},
                "subsector_name": {"type": "string", "minLength": 1},
                "emissions_tco2e": {"type": "number"},
                "confidence_tier": {"type": "string", "enum": list(CONFIDENCE_TIERS)},
                "data_source": {"type": "string", "minLength": 1},
                "reference_year": {"type": "integer", "minimum": 1990, "maximum": 2100},
                "methodology_note": {"type": "string", "minLength": 1},
                "gap_note": {"type": "string", "minLength": 1},
            },
        },
        "SectorEmissionRecord": {
            "type": "object",
            "required": [
                "sector_code",
                "sector_name",
                "emissions_tco2e",
                "confidence_tier",
                "data_source",
                "reference_year",
                "methodology_note",
                "gap_note",
                "subsectors",
            ],
            "properties": {
                "sector_code": {"type": "string", "enum": list(GPC_SECTOR_CODES)},
                "sector_name": {"type": "string", "minLength": 1},
                "emissions_tco2e": {"type": "number"},
                "confidence_tier": {"type": "string", "enum": list(CONFIDENCE_TIERS)},
                "data_source": {"type": "string", "minLength": 1},
                "reference_year": {"type": "integer", "minimum": 1990, "maximum": 2100},
                "methodology_note": {"type": "string", "minLength": 1},
                "gap_note": {"type": "string", "minLength": 1},
                "subsectors": {
                    "type": "array",
                    "minItems": 1,
                    "items": {"$ref": "#/$defs/SubsectorEmissionRecord"},
                },
            },
        },
        "ClimateRiskIndicator": {
            "type": "object",
            "required": [
                "sector_code",
                "sector_name",
                "indicator_name",
                "hazard_description",
                "risk_index",
                "risk_class",
                "reference_scenario",
                "reference_year",
                "confidence_tier",
                "data_source",
                "methodology_note",
                "gap_note",
            ],
            "properties": {
                "sector_code": {"type": "string", "enum": list(ADAPTABRASIL_SECTORS)},
                "sector_name": {"type": "string", "minLength": 1},
                "indicator_name": {"type": "string", "minLength": 1},
                "hazard_description": {"type": "string", "minLength": 1},
                "risk_index": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                "risk_class": {"type": "string", "enum": list(RISK_CLASSES)},
                "reference_scenario": {"type": "string", "enum": list(CLIMATE_SCENARIOS)},
                "reference_year": {"type": "integer", "minimum": 1990, "maximum": 2100},
                "confidence_tier": {"type": "string", "enum": list(CONFIDENCE_TIERS)},
                "data_source": {"type": "string", "minLength": 1},
                "methodology_note": {"type": "string", "minLength": 1},
                "gap_note": {"type": "string", "minLength": 1},
            },
        },
        "LocalOverride": {
            "type": "object",
            "properties": {
                "reference_year": {"type": "integer", "minimum": 1990, "maximum": 2100},
                "electricity": {
                    "type": "object",
                    "required": ["mwh_per_year"],
                    "properties": {
                        "mwh_per_year": {"type": "number", "minimum": 0},
                        "source_note": {"type": "string"},
                    },
                },
                "fleet_fuels": {
                    "type": "object",
                    "required": ["diesel_liters", "gasoline_liters", "ethanol_liters"],
                    "properties": {
                        "diesel_liters": {"type": "number", "minimum": 0},
                        "gasoline_liters": {"type": "number", "minimum": 0},
                        "ethanol_liters": {"type": "number", "minimum": 0},
                        "source_note": {"type": "string"},
                    },
                },
                "solid_waste": {
                    "type": "object",
                    "required": ["tons_per_year", "has_methane_capture"],
                    "properties": {
                        "tons_per_year": {"type": "number", "minimum": 0},
                        "has_methane_capture": {"type": "boolean"},
                        "methane_capture_efficiency": {
                            "type": "number",
                            "minimum": 0.0,
                            "maximum": 1.0,
                        },
                        "source_note": {"type": "string"},
                    },
                },
            },
        },
    },
}


def _is_non_empty_str(val: Any) -> bool:
    return isinstance(val, str) and len(val.strip()) > 0


def _is_number(val: Any) -> bool:
    return isinstance(val, (int, float)) and not isinstance(val, bool)


def validate_city_climate_record(payload: Dict[str, Any]) -> List[str]:
    """Deterministic validator matching `validateCityClimateRecord` in `data/schema/city.ts`."""
    errors: List[str] = []
    if not isinstance(payload, dict):
        return ["Root value must be a JSON object"]

    if payload.get("schema_version") != "1.0.0":
        errors.append("schema_version: must equal '1.0.0'")

    meta = payload.get("metadata")
    if not isinstance(meta, dict):
        errors.append("metadata: must be an object")
    else:
        ibge = meta.get("ibge_code")
        if not isinstance(ibge, str) or not re.match(r"^\d{7}$", ibge):
            errors.append("metadata.ibge_code: must be a 7-digit string")
        if not _is_non_empty_str(meta.get("name")):
            errors.append("metadata.name: must be a non-empty string")
        state = meta.get("state")
        if not isinstance(state, str) or not re.match(r"^[A-Z]{2}$", state):
            errors.append("metadata.state: must be a 2-letter uppercase UF code")
        pop = meta.get("population")
        if not isinstance(pop, int) or isinstance(pop, bool) or pop <= 0:
            errors.append("metadata.population: must be a positive integer")
        pop_yr = meta.get("population_year")
        if not isinstance(pop_yr, int) or isinstance(pop_yr, bool) or not (1990 <= pop_yr <= 2100):
            errors.append("metadata.population_year: must be an integer year")

    sectors = payload.get("sectors")
    if not isinstance(sectors, dict):
        errors.append("sectors: must be an object")
    else:
        for code in GPC_SECTOR_CODES:
            sec = sectors.get(code)
            prefix = f"sectors.{code}"
            if not isinstance(sec, dict):
                errors.append(f"{prefix}: missing required GPC sector")
                continue
            if sec.get("sector_code") != code:
                errors.append(f"{prefix}.sector_code: must equal '{code}'")
            if not _is_non_empty_str(sec.get("sector_name")):
                errors.append(f"{prefix}.sector_name: must be a non-empty string")
            if not _is_number(sec.get("emissions_tco2e")):
                errors.append(f"{prefix}.emissions_tco2e: must be a number")
            if sec.get("confidence_tier") not in CONFIDENCE_TIERS:
                errors.append(f"{prefix}.confidence_tier: invalid tier")
            if not _is_non_empty_str(sec.get("data_source")):
                errors.append(f"{prefix}.data_source: must be a non-empty string")
            if not _is_non_empty_str(sec.get("methodology_note")):
                errors.append(f"{prefix}.methodology_note: must be a non-empty string")
            if not _is_non_empty_str(sec.get("gap_note")):
                errors.append(f"{prefix}.gap_note: must be a non-empty string")

            subs = sec.get("subsectors")
            if not isinstance(subs, list) or len(subs) == 0:
                errors.append(f"{prefix}.subsectors: must be a non-empty list")
            else:
                sub_sum = 0.0
                for idx, sub in enumerate(subs):
                    sp = f"{prefix}.subsectors[{idx}]"
                    if not isinstance(sub, dict):
                        errors.append(f"{sp}: must be an object")
                        continue
                    for req_str in (
                        "subsector_key",
                        "subsector_name",
                        "data_source",
                        "methodology_note",
                        "gap_note",
                    ):
                        if not _is_non_empty_str(sub.get(req_str)):
                            errors.append(f"{sp}.{req_str}: must be a non-empty string")
                    if not _is_number(sub.get("emissions_tco2e")):
                        errors.append(f"{sp}.emissions_tco2e: must be a number")
                    else:
                        sub_sum += float(sub["emissions_tco2e"])
                    if sub.get("confidence_tier") not in CONFIDENCE_TIERS:
                        errors.append(f"{sp}.confidence_tier: invalid tier")
                if _is_number(sec.get("emissions_tco2e")) and abs(float(sec["emissions_tco2e"]) - sub_sum) > 0.01:
                    errors.append(
                        f"{prefix}.emissions_tco2e ({sec['emissions_tco2e']}) does not match sum of subsectors ({sub_sum:.2f})"
                    )

    risks = payload.get("climate_risks")
    if not isinstance(risks, list) or len(risks) == 0:
        errors.append("climate_risks: must be a non-empty list")
    else:
        for idx, r in enumerate(risks):
            rp = f"climate_risks[{idx}]"
            if not isinstance(r, dict):
                errors.append(f"{rp}: must be an object")
                continue
            if r.get("sector_code") not in ADAPTABRASIL_SECTORS:
                errors.append(f"{rp}.sector_code: invalid AdaptaBrasil sector code")
            ri = r.get("risk_index")
            if not _is_number(ri) or not (0.0 <= float(ri) <= 1.0):
                errors.append(f"{rp}.risk_index: must be between 0.0 and 1.0")
            if r.get("confidence_tier") not in CONFIDENCE_TIERS:
                errors.append(f"{rp}.confidence_tier: invalid tier")
            for req_str in (
                "sector_name",
                "indicator_name",
                "hazard_description",
                "risk_class",
                "reference_scenario",
                "data_source",
                "methodology_note",
                "gap_note",
            ):
                if not _is_non_empty_str(r.get(req_str)):
                    errors.append(f"{rp}.{req_str}: must be a non-empty string")

    return errors


def export_json_schema() -> Dict[str, Any]:
    """Return the canonical JSON Schema for CityClimateRecord."""
    return CITY_CLIMATE_JSON_SCHEMA


if __name__ == "__main__":
    if len(sys.argv) > 1:
        with open(sys.argv[1], "r", encoding="utf-8") as f:
            data = json.load(f)
        validation_errors = validate_city_climate_record(data)
        if validation_errors:
            print("Validation failed:", file=sys.stderr)
            for err in validation_errors:
                print(f"  - {err}", file=sys.stderr)
            sys.exit(1)
        print(
            f"OK: {data['metadata']['name']} ({data['metadata']['ibge_code']}) "
            f"is valid against CityClimateRecord schema v{data['schema_version']}."
        )
    else:
        print(json.dumps(export_json_schema(), indent=2))
