"""
Canonical Python Schema, JSON Schema definition, and deterministic validator
for Municipal Climate Lens (`data/schema/city_schema.py`, Schema v2.0.0).

Matches `data/schema/city.ts` 1-to-1 for Brazilian municipal climate baseline
records (`public/data/<ibge_code>.json`) and client-side `LocalOverride` payloads.
"""

from __future__ import annotations

import json
import math
import re
import sys
from typing import Any, Dict, List

CURRENT_SCHEMA_VERSION = "2.0.0"

AVAILABILITY_STATUSES = ("AVAILABLE", "UNAVAILABLE", "NOT_APPLICABLE")
COVERAGE_STATUSES = ("COMPLETE", "PARTIAL", "UNAVAILABLE")
DATA_ORIGINS = ("LOCAL", "MODELED", "PROXY")
VERIFICATION_STATUSES = (
    "UNVERIFIED",
    "DOCUMENTED",
    "REVIEW_REQUIRED",
    "INDEPENDENTLY_VERIFIED",
)
COVERAGE_BOUNDARIES = (
    "MUNICIPALITY_WIDE",
    "MUNICIPAL_GOVERNMENT_FLEET",
    "PUBLIC_TRANSIT_OPERATOR",
    "PARTIAL_FACILITY_OR_SECTOR",
    "UNKNOWN",
)

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
        "schema_version": {"const": CURRENT_SCHEMA_VERSION},
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
                "coverage_status",
                "missing_components",
                "reference_year",
                "dominant_sector",
                "provenance_mix",
            ],
            "properties": {
                "total_emissions_tco2e": {"type": ["number", "null"]},
                "per_capita_tco2e": {"type": ["number", "null"]},
                "coverage_status": {"type": "string", "enum": list(COVERAGE_STATUSES)},
                "missing_components": {"type": "array", "items": {"type": "string"}},
                "reference_year": {"type": "integer", "minimum": 1990, "maximum": 2100},
                "dominant_sector": {
                    "type": ["string", "null"],
                    "enum": [*GPC_SECTOR_CODES, None],
                },
                "provenance_mix": {
                    "type": "object",
                    "required": [
                        "local_share",
                        "modeled_share",
                        "proxy_share",
                        "is_mixed",
                        "summary_label",
                    ],
                },
            },
        },
        "sectors": {
            "type": "object",
            "required": list(GPC_SECTOR_CODES),
        },
        "climate_risks": {
            "type": "array",
            "minItems": 1,
        },
        "last_updated": {"type": "string", "minLength": 1},
    },
}


def _is_non_empty_str(val: Any) -> bool:
    return isinstance(val, str) and len(val.strip()) > 0


def _is_finite_number(val: Any) -> bool:
    return (
        isinstance(val, (int, float))
        and not isinstance(val, bool)
        and math.isfinite(float(val))
    )


def validate_city_climate_record(payload: Dict[str, Any]) -> List[str]:
    """Deterministic validator matching `validateCityClimateRecord` in `data/schema/city.ts`."""
    errors: List[str] = []
    if not isinstance(payload, dict):
        return ["Root value must be a JSON object"]

    if payload.get("schema_version") != CURRENT_SCHEMA_VERSION:
        errors.append(
            f"schema_version: expected '{CURRENT_SCHEMA_VERSION}', got {payload.get('schema_version')!r}"
        )

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
        if (
            not isinstance(pop_yr, int)
            or isinstance(pop_yr, bool)
            or not (1990 <= pop_yr <= 2100)
        ):
            errors.append("metadata.population_year: must be an integer year")

    sectors = payload.get("sectors")
    avail_sector_sum = 0.0
    avail_sector_count = 0

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
            if sec.get("coverage_status") not in COVERAGE_STATUSES:
                errors.append(f"{prefix}.coverage_status: invalid")
            if sec.get("data_origin") not in (*DATA_ORIGINS, "MIXED"):
                errors.append(f"{prefix}.data_origin: invalid")
            if sec.get("verification_status") not in VERIFICATION_STATUSES:
                errors.append(f"{prefix}.verification_status: invalid")

            for req_str in (
                "data_source",
                "source_reference",
                "reporting_period",
                "geographic_coverage",
                "operational_coverage",
                "methodology_note",
                "limitations",
                "gap_note",
            ):
                if not _is_non_empty_str(sec.get(req_str)):
                    errors.append(f"{prefix}.{req_str}: must be a non-empty string")

            subs = sec.get("subsectors")
            if not isinstance(subs, list) or len(subs) == 0:
                errors.append(f"{prefix}.subsectors: must be a non-empty list")
            else:
                sub_sum = 0.0
                avail_sub_count = 0
                for idx, sub in enumerate(subs):
                    sp = f"{prefix}.subsectors[{idx}]"
                    if not isinstance(sub, dict):
                        errors.append(f"{sp}: must be an object")
                        continue
                    avail_status = sub.get("availability_status")
                    if avail_status not in AVAILABILITY_STATUSES:
                        errors.append(f"{sp}.availability_status: invalid")
                    elif avail_status == "AVAILABLE":
                        if not _is_finite_number(sub.get("emissions_tco2e")):
                            errors.append(
                                f"{sp}.emissions_tco2e: must be finite number when AVAILABLE"
                            )
                        else:
                            sub_sum += float(sub["emissions_tco2e"])
                            avail_sub_count += 1
                    else:
                        if sub.get("emissions_tco2e") is not None:
                            errors.append(
                                f"{sp}.emissions_tco2e: must be null when {avail_status}"
                            )

                    if sub.get("data_origin") not in DATA_ORIGINS:
                        errors.append(f"{sp}.data_origin: invalid")
                    if sub.get("verification_status") not in VERIFICATION_STATUSES:
                        errors.append(f"{sp}.verification_status: invalid")
                    for req_str in (
                        "subsector_key",
                        "subsector_name",
                        "availability_reason",
                        "data_source",
                        "source_reference",
                        "reporting_period",
                        "geographic_coverage",
                        "operational_coverage",
                        "methodology_note",
                        "limitations",
                        "gap_note",
                    ):
                        if not _is_non_empty_str(sub.get(req_str)):
                            errors.append(f"{sp}.{req_str}: must be a non-empty string")

                if avail_sub_count == 0:
                    if sec.get("emissions_tco2e") is not None:
                        errors.append(
                            f"{prefix}.emissions_tco2e: must be null when no subsectors are AVAILABLE"
                        )
                else:
                    if not _is_finite_number(sec.get("emissions_tco2e")):
                        errors.append(f"{prefix}.emissions_tco2e: must be a finite number")
                    else:
                        sec_val = float(sec["emissions_tco2e"])
                        if abs(sec_val - sub_sum) > 0.02:
                            errors.append(
                                f"{prefix}.emissions_tco2e ({sec_val}) does not match sum of AVAILABLE subsectors ({sub_sum:.2f})"
                            )
                        avail_sector_sum += sec_val
                        avail_sector_count += 1

    summary = payload.get("emissions_summary")
    if not isinstance(summary, dict):
        errors.append("emissions_summary: must be an object")
    else:
        if avail_sector_count == 0:
            if summary.get("total_emissions_tco2e") is not None:
                errors.append(
                    "emissions_summary.total_emissions_tco2e: must be null when no sectors are AVAILABLE"
                )
        elif not _is_finite_number(summary.get("total_emissions_tco2e")):
            errors.append("emissions_summary.total_emissions_tco2e: must be a finite number")
        elif abs(float(summary["total_emissions_tco2e"]) - avail_sector_sum) > 0.05:
            errors.append(
                f"emissions_summary.total_emissions_tco2e ({summary['total_emissions_tco2e']}) "
                f"does not match sum of AVAILABLE sectors ({avail_sector_sum:.2f})"
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
            avail_status = r.get("availability_status")
            if avail_status not in AVAILABILITY_STATUSES:
                errors.append(f"{rp}.availability_status: invalid")
            elif avail_status == "AVAILABLE":
                ri = r.get("risk_index")
                if not _is_finite_number(ri) or not (0.0 <= float(ri) <= 1.0):
                    errors.append(f"{rp}.risk_index: must be between 0.0 and 1.0")
                if r.get("risk_class") not in RISK_CLASSES:
                    errors.append(f"{rp}.risk_class: invalid")
            else:
                if r.get("risk_index") is not None:
                    errors.append(f"{rp}.risk_index: must be null when {avail_status}")
                if r.get("risk_class") is not None:
                    errors.append(f"{rp}.risk_class: must be null when {avail_status}")

            if r.get("data_origin") not in DATA_ORIGINS:
                errors.append(f"{rp}.data_origin: invalid")
            if r.get("verification_status") not in VERIFICATION_STATUSES:
                errors.append(f"{rp}.verification_status: invalid")
            for req_str in (
                "sector_name",
                "indicator_name",
                "hazard_description",
                "availability_reason",
                "reference_scenario",
                "reporting_period",
                "data_source",
                "source_reference",
                "methodology_note",
                "limitations",
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
