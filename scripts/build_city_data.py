"""
Deterministic municipal climate data ingestion pipeline (`scripts/build_city_data.py`, Schema v2.0.0).

Reads raw datasets in `data/raw/`:
- `data/raw/seeg_pr.csv` (SEEG Municípios Collection 14.0, filtered to CO2e GWP-AR5)
- `data/raw/adaptabrasil_pr.json` (AdaptaBrasil MCTI municipal risk indices)
- `data/raw/ibge_pr_2022.json` (IBGE Censo 2022 population & territorial area)

Produces validated per-city JSON records at `public/data/{ibge_code}.json` and
updates `public/data/index.json` conforming strictly to `data/schema/city_schema.py` (v2.0.0).
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from data.schema.city_schema import (  # noqa: E402
    CURRENT_SCHEMA_VERSION,
    GPC_SECTOR_CODES,
    validate_city_climate_record,
)

DEFAULT_SEEG_CSV = Path("data/raw/seeg_pr.csv")
DEFAULT_ADAPTABRASIL_JSON = Path("data/raw/adaptabrasil_pr.json")
DEFAULT_IBGE_JSON = Path("data/raw/ibge_pr_2022.json")
DEFAULT_OUT_DIR = Path("public/data")
DEFAULT_REFERENCE_YEAR = 2025
DEFAULT_GENERATED_AT = "2026-11-13T00:00:00Z"

RANGELABEL_TO_RISK_CLASS: Dict[str, str] = {
    "Muito baixo": "VERY_LOW",
    "Baixo": "LOW",
    "Médio": "MEDIUM",
    "Alto": "HIGH",
    "Muito alto": "VERY_HIGH",
}

RISK_GAP_NOTES: Dict[str, str] = {
    "GEO_HYDROLOGICAL_DISASTERS": (
        "Integrate municipal Defesa Civil georeferenced flood/landslide occurrence logs "
        "and municipal stormwater drainage master plan (Plano Diretor de Drenagem) to provide local evidence."
    ),
    "WATER_RESOURCES": (
        "Integrate local water utility (Sanepar / municipal SAAE) watershed intake flow gauges "
        "and drought contingency storage capacity records to provide local evidence."
    ),
    "HEALTH": (
        "Integrate Secretaria Municipal de Saúde neighborhood-level LIRAa vector infestation "
        "series and climate-sensitive morbidity logs to provide local evidence."
    ),
    "ENERGY": (
        "Integrate electricity distributor (Copel) feeder-level weather-attributed DEC/FEC "
        "outage logs and municipal grid resilience audits to provide local evidence."
    ),
    "FOOD_SECURITY": (
        "Integrate municipal agricultural extension (IDR-Paraná) crop loss records and "
        "local food supply/school-feeding vulnerability registries to provide local evidence."
    ),
}


def _round2(val: float) -> float:
    return round(float(val), 2)


def _round4(val: float) -> float:
    return round(float(val), 4)


def classify_seeg_row(setor: str, categoria: str, subcategoria: str) -> Tuple[str, str]:
    """Deterministically map a SEEG Municípios row into (GPCSectorCode, GPCSubsectorKey)."""
    if setor == "Energia":
        if categoria == "Transportes":
            if subcategoria == "Rodoviário":
                return ("TRANSPORTATION", "on_road_transportation")
            return ("TRANSPORTATION", "off_road_and_aviation")
        return ("STATIONARY_ENERGY", "stationary_fuel_combustion")

    if setor == "Resíduos":
        if categoria in ("Efluentes domésticos", "Efluentes líquidos industriais"):
            return ("WASTE", "wastewater_treatment")
        return ("WASTE", "solid_waste_disposal")

    if setor == "Processos Industriais":
        return ("IPPU", "industrial_processes")

    if setor == "Agropecuária":
        return ("AFOLU", "agriculture_and_livestock")

    if setor == "Mudança de Uso da Terra e Floresta":
        return ("AFOLU", "land_use_and_forestry")

    raise ValueError(f"Unrecognized SEEG Setor de emissão: {setor!r}")


def _build_provenance_label(
    local_share: float,
    modeled_share: float,
    proxy_share: float,
    missing_count: int,
) -> Tuple[bool, str]:
    parts: List[str] = []
    if local_share > 0.0005:
        parts.append(f"{local_share * 100:.1f}% Local")
    if modeled_share > 0.0005:
        parts.append(f"{modeled_share * 100:.1f}% Modeled")
    if proxy_share > 0.0005:
        parts.append(f"{proxy_share * 100:.1f}% Proxy")
    is_mixed = len(parts) > 1
    prefix = "Mixed: " if is_mixed else ""
    suffix = (
        f" — Partial coverage ({missing_count} component{'s' if missing_count > 1 else ''} unavailable)"
        if missing_count > 0
        else ""
    )
    if not parts:
        return False, f"No available emissions{suffix}"
    return is_mixed, f"{prefix}{' / '.join(parts)}{suffix}"


def _subsector_metric(
    sub_totals: Dict[str, Optional[float]],
    key: str,
    reference_year: int,
    *,
    include_value_in_reason: bool = False,
) -> Tuple[Optional[float], str, str]:
    """Return (emissions_tco2e, availability_status, availability_reason) without coercing missing to 0.0."""
    raw = sub_totals.get(key)
    if raw is None:
        return (
            None,
            "UNAVAILABLE",
            f"Subsector '{key}' was absent or missing in SEEG Coleção 14.0 ({reference_year}); marked UNAVAILABLE (null) rather than 0.0.",
        )
    val = float(raw)
    if math.isnan(val):
        return (
            None,
            "UNAVAILABLE",
            f"Subsector '{key}' had no numeric observations in SEEG Coleção 14.0 ({reference_year}); marked UNAVAILABLE (null) rather than 0.0.",
        )
    rounded = _round2(val)
    reason = (
        f"Reported in SEEG Coleção 14.0 GWP-AR5 ({reference_year}) as {rounded:.2f} tCO2e."
        if include_value_in_reason
        else f"Reported in SEEG Coleção 14.0 GWP-AR5 ({reference_year})."
    )
    return rounded, "AVAILABLE", reason


def build_sectors_from_subsector_totals(
    sub_totals: Dict[str, Optional[float]],
    reference_year: int,
    city_name: str,
    ibge_code: str,
) -> Dict[str, Any]:
    """
    Construct the 5 GPC sectors and subsectors with explicit availability status,
    data origin (separate from IPCC tiers), verification status, and limitations.
    """
    stat_fuel, stat_fuel_status, stat_fuel_reason = _subsector_metric(
        sub_totals, "stationary_fuel_combustion", reference_year
    )
    on_road, on_road_status, on_road_reason = _subsector_metric(
        sub_totals, "on_road_transportation", reference_year
    )
    off_road, off_road_status, off_road_reason = _subsector_metric(
        sub_totals, "off_road_and_aviation", reference_year
    )
    solid_waste, solid_waste_status, solid_waste_reason = _subsector_metric(
        sub_totals, "solid_waste_disposal", reference_year
    )
    wastewater, wastewater_status, wastewater_reason = _subsector_metric(
        sub_totals, "wastewater_treatment", reference_year
    )
    ippu_val, ippu_status, ippu_reason = _subsector_metric(
        sub_totals,
        "industrial_processes",
        reference_year,
        include_value_in_reason=True,
    )
    agro_val, agro_status, agro_reason = _subsector_metric(
        sub_totals, "agriculture_and_livestock", reference_year
    )
    lulucf_val, lulucf_status, lulucf_reason = _subsector_metric(
        sub_totals, "land_use_and_forestry", reference_year
    )

    seeg_ref = f"SEEG Municípios Coleção 14.0 (GWP-AR5, {reference_year}) — https://seeg.eco.br/dados/"
    geo_cov = f"Municipality-wide ({city_name}, IBGE {ibge_code})"
    period_str = str(reference_year)

    stationary_subs = [
        {
            "subsector_key": "grid_electricity",
            "subsector_name": "Grid Electricity Consumption (Scope 2)",
            "emissions_tco2e": None,
            "availability_status": "UNAVAILABLE",
            "availability_reason": (
                "SEEG Municípios reports Scope 1 fuel combustion at power-generation plants; "
                "municipal Scope 2 purchased electricity consumption is not reported."
            ),
            "data_origin": "PROXY",
            "verification_status": "UNVERIFIED",
            "data_source": "Not reported in SEEG Municípios Coleção 14.0",
            "source_reference": seeg_ref,
            "reference_year": reference_year,
            "reporting_period": period_str,
            "geographic_coverage": geo_cov,
            "operational_coverage": "Scope 2 purchased grid electricity (missing in SEEG)",
            "methodology_note": (
                "Explicitly marked UNAVAILABLE (null) rather than 0.0 tCO2e so unmeasured "
                "electricity consumption is never mistaken for zero emissions."
            ),
            "factor_id": None,
            "limitations": "Scope 2 electricity is excluded from the public SEEG municipal baseline.",
            "gap_note": (
                f"Obtain annual municipality-wide electricity consumption (MWh) for {city_name} "
                "from Copel Distribuição / ANEEL SINDAT for a year with a verified MCTI SIN grid factor."
            ),
        },
        {
            "subsector_key": "stationary_fuel_combustion",
            "subsector_name": "Stationary Fuel Combustion (Residential, Commercial, Industrial & Public)",
            "emissions_tco2e": stat_fuel,
            "availability_status": stat_fuel_status,
            "availability_reason": stat_fuel_reason,
            "data_origin": "PROXY",
            "verification_status": "DOCUMENTED",
            "data_source": f"SEEG Municípios Coleção 14.0 — Energia (non-transport)",
            "source_reference": seeg_ref,
            "reference_year": reference_year,
            "reporting_period": period_str,
            "geographic_coverage": geo_cov,
            "operational_coverage": "Scope 1 stationary fuel combustion (GLP, diesel, fuel oil)",
            "methodology_note": (
                "State-level ANP/EPE fuel balances disaggregated to municipalities via IBGE "
                "population and industrial/commercial value-added proxies."
            ),
            "factor_id": "SEEG_C14_GWP_AR5",
            "limitations": "Top-down state disaggregation; does not reflect local industrial boiler audits.",
            "gap_note": (
                f"Obtain ANP municipal LPG (GLP) sales and local industrial boiler fuel logs in {city_name}."
            ),
        },
    ]

    transport_subs = [
        {
            "subsector_key": "on_road_transportation",
            "subsector_name": "On-Road Transportation (Urban Fleet, Freight & Public Transit)",
            "emissions_tco2e": on_road,
            "availability_status": on_road_status,
            "availability_reason": on_road_reason,
            "data_origin": "PROXY",
            "verification_status": "DOCUMENTED",
            "data_source": "SEEG Municípios Coleção 14.0 — Energia / Transportes / Rodoviário",
            "source_reference": seeg_ref,
            "reference_year": reference_year,
            "reporting_period": period_str,
            "geographic_coverage": geo_cov,
            "operational_coverage": "Scope 1 on-road fossil fuel combustion",
            "methodology_note": (
                "State/regional ANP fuel distribution allocated to municipalities using "
                "SENATRAN fleet shares and highway VKT modeling."
            ),
            "factor_id": "SEEG_C14_GWP_AR5",
            "limitations": "Includes top-down highway fuel allocation proxies; retail pump sales may differ.",
            "gap_note": (
                f"Obtain municipality-wide ANP SIMP retail fuel sales (diesel, gasoline, ethanol) for {city_name}."
            ),
        },
        {
            "subsector_key": "off_road_and_aviation",
            "subsector_name": "Aviation, Rail & Off-Road Transportation",
            "emissions_tco2e": off_road,
            "availability_status": off_road_status,
            "availability_reason": off_road_reason,
            "data_origin": "PROXY",
            "verification_status": "DOCUMENTED",
            "data_source": "SEEG Municípios Coleção 14.0 — Energia / Transportes (Aéreo, Ferroviário)",
            "source_reference": seeg_ref,
            "reference_year": reference_year,
            "reporting_period": period_str,
            "geographic_coverage": geo_cov,
            "operational_coverage": "Aviation LTO/uplift and rail/off-road mobile combustion",
            "methodology_note": (
                "Regional aviation kerosene (QAV) and rail/waterway diesel allocated by ANAC "
                "airport LTO cycles and transport network proxies."
            ),
            "factor_id": "SEEG_C14_GWP_AR5",
            "limitations": "National/regional allocation proxy where local airport uplift logs are absent.",
            "gap_note": (
                f"Obtain local airport QAV fuel uplift records (if applicable) and off-road diesel logs for {city_name}."
            ),
        },
    ]

    waste_subs = [
        {
            "subsector_key": "solid_waste_disposal",
            "subsector_name": "Municipal Solid Waste Disposal & Incineration",
            "emissions_tco2e": solid_waste,
            "availability_status": solid_waste_status,
            "availability_reason": solid_waste_reason,
            "data_origin": "PROXY",
            "verification_status": "DOCUMENTED",
            "data_source": "SEEG Municípios Coleção 14.0 — Resíduos (Disposição final, Incineração)",
            "source_reference": seeg_ref,
            "reference_year": reference_year,
            "reporting_period": period_str,
            "geographic_coverage": geo_cov,
            "operational_coverage": "Solid waste landfill disposal, open burning, and biological treatment",
            "methodology_note": (
                "IPCC First-Order Decay (FOD) model driven by SNIS / IBGE per-capita waste "
                "generation and regional landfill/dumpsite shares."
            ),
            "factor_id": "SEEG_C14_GWP_AR5",
            "limitations": "Relies on regional SNIS waste composition and landfill gas capture assumptions.",
            "gap_note": (
                f"Obtain certified municipal landfill weighbridge tonnage and biogas flaring logs for {city_name}."
            ),
        },
        {
            "subsector_key": "wastewater_treatment",
            "subsector_name": "Domestic & Industrial Wastewater Treatment",
            "emissions_tco2e": wastewater,
            "availability_status": wastewater_status,
            "availability_reason": wastewater_reason,
            "data_origin": "PROXY",
            "verification_status": "DOCUMENTED",
            "data_source": "SEEG Municípios Coleção 14.0 — Resíduos (Efluentes)",
            "source_reference": seeg_ref,
            "reference_year": reference_year,
            "reporting_period": period_str,
            "geographic_coverage": geo_cov,
            "operational_coverage": "Domestic and industrial wastewater CH4/N2O",
            "methodology_note": (
                "Estimated from municipal population, SNIS sewage coverage rates, and industrial BOD "
                "proxies using IPCC CH4/N2O effluent emission factors."
            ),
            "factor_id": "SEEG_C14_GWP_AR5",
            "limitations": "Uses regional BOD and treatment-type shares rather than ETE plant monitoring.",
            "gap_note": (
                f"Obtain Sanepar / municipal ETE plant-level BOD inflow/outflow and biogas flaring logs for {city_name}."
            ),
        },
    ]

    ippu_subs = [
        {
            "subsector_key": "industrial_processes",
            "subsector_name": "Industrial Processes & Product Use (IPPU)",
            "emissions_tco2e": ippu_val,
            "availability_status": ippu_status,
            "availability_reason": ippu_reason,
            "data_origin": "PROXY",
            "verification_status": "DOCUMENTED",
            "data_source": "SEEG Municípios Coleção 14.0 — Processos Industriais",
            "source_reference": seeg_ref,
            "reference_year": reference_year,
            "reporting_period": period_str,
            "geographic_coverage": geo_cov,
            "operational_coverage": "Non-energy industrial processes and product use",
            "methodology_note": (
                "Point-source cement/lime/metallurgy allocation and national HFC/solvent proxies "
                "downscaled by municipal industrial registry."
            ),
            "factor_id": "SEEG_C14_GWP_AR5",
            "limitations": "Commercial HFC refrigeration leakage is often not captured at municipal level (may read 0.0).",
            "gap_note": (
                f"Obtain municipal environmental licensing (IAT) industrial process inventory and HFC audit for {city_name}."
            ),
        }
    ]

    afolu_subs = [
        {
            "subsector_key": "agriculture_and_livestock",
            "subsector_name": "Agriculture, Livestock & Managed Soils",
            "emissions_tco2e": agro_val,
            "availability_status": agro_status,
            "availability_reason": agro_reason,
            "data_origin": "MODELED",
            "verification_status": "DOCUMENTED",
            "data_source": "SEEG Municípios Coleção 14.0 — Agropecuária (IBGE PPM/PAM)",
            "source_reference": seeg_ref,
            "reference_year": reference_year,
            "reporting_period": period_str,
            "geographic_coverage": geo_cov,
            "operational_coverage": "Enteric fermentation, manure management, and agricultural soils",
            "methodology_note": (
                "Modeled from IBGE Pesquisa da Pecuária Municipal (PPM) herd counts, PAM crop areas, "
                "and IPCC Tier 2 enteric fermentation & soil N2O factors."
            ),
            "factor_id": "SEEG_C14_GWP_AR5",
            "limitations": "Census-based modeling; does not capture farm-level manure biodigesters or precision N practices.",
            "gap_note": (
                f"Verify local cooperative fertilizer sales and manure management practices within {city_name}."
            ),
        },
        {
            "subsector_key": "land_use_and_forestry",
            "subsector_name": "Land-Use Change & Forestry (Net Emissions/Removals)",
            "emissions_tco2e": lulucf_val,
            "availability_status": lulucf_status,
            "availability_reason": lulucf_reason,
            "data_origin": "MODELED",
            "verification_status": "DOCUMENTED",
            "data_source": "SEEG Municípios Coleção 14.0 — Mudança de Uso da Terra e Floresta (MapBiomas)",
            "source_reference": seeg_ref,
            "reference_year": reference_year,
            "reporting_period": period_str,
            "geographic_coverage": geo_cov,
            "operational_coverage": "Land-use transitions and forest carbon removals",
            "methodology_note": (
                "Spatially modeled at 30m resolution from MapBiomas annual land-cover transition matrices "
                "(gross deforestation/soil carbon emissions net of secondary forest removals)."
            ),
            "factor_id": "SEEG_C14_GWP_AR5",
            "limitations": "Satellite 30m pixel classification uncertainty and biome-average carbon stocks.",
            "gap_note": (
                f"Integrate municipal CAR field-verified forest biomass and urban arborization inventory for {city_name}."
            ),
        },
    ]

    sectors_spec = [
        ("STATIONARY_ENERGY", "Stationary Energy", stationary_subs),
        ("TRANSPORTATION", "Transportation", transport_subs),
        ("WASTE", "Waste (Solid Waste & Effluents)", waste_subs),
        ("IPPU", "Industrial Processes and Product Use", ippu_subs),
        ("AFOLU", "Agriculture, Forestry and Other Land Use", afolu_subs),
    ]

    sectors: Dict[str, Any] = {}
    for code, name, subs in sectors_spec:
        avail_subs = [s for s in subs if s["availability_status"] == "AVAILABLE"]
        missing_keys = [s["subsector_key"] for s in subs if s["availability_status"] != "AVAILABLE"]

        cov_status = (
            "UNAVAILABLE"
            if not avail_subs
            else ("PARTIAL" if missing_keys else "COMPLETE")
        )
        sec_total = (
            None
            if not avail_subs
            else _round2(sum(float(s["emissions_tco2e"]) for s in avail_subs))
        )

        origins = {s["data_origin"] for s in subs}
        sec_origin = next(iter(origins)) if len(origins) == 1 else "MIXED"
        ver_status = "DOCUMENTED" if avail_subs else "UNVERIFIED"

        sectors[code] = {
            "sector_code": code,
            "sector_name": name,
            "emissions_tco2e": sec_total,
            "coverage_status": cov_status,
            "missing_subsectors": missing_keys,
            "data_origin": sec_origin,
            "verification_status": ver_status,
            "data_source": f"SEEG Municípios Coleção 14.0 ({name})",
            "source_reference": seeg_ref,
            "reference_year": reference_year,
            "reporting_period": period_str,
            "geographic_coverage": geo_cov,
            "operational_coverage": f"GPC {name} sector",
            "methodology_note": (
                f"Aggregated from {len(avail_subs)}/{len(subs)} available subsectors in SEEG Coleção 14.0 (GWP-AR5)."
            ),
            "limitations": (
                f"Incomplete coverage: {', '.join(missing_keys)} unavailable."
                if missing_keys
                else "Subject to subsector top-down proxy or spatial modeling uncertainties."
            ),
            "gap_note": " | ".join(f"{s['subsector_name']}: {s['gap_note']}" for s in subs),
            "subsectors": subs,
        }

    return sectors


def map_adaptabrasil_risks(
    ab_entry: Optional[Dict[str, Any]],
    city_name: str,
    ibge_code: str,
) -> List[Dict[str, Any]]:
    """
    Map AdaptaBrasil MCTI raw indicators into ClimateRiskIndicator records (v2.0.0).
    Unavailable indicators are strictly represented as `risk_index: None` and `risk_class: None`,
    while genuine `0.0` values are preserved as `AVAILABLE` + `VERY_LOW`.
    """
    risks_dict = (ab_entry or {}).get("risks", {})
    indicators: List[Dict[str, Any]] = []
    ab_url = "https://sistema.adaptabrasil.mcti.gov.br/api/hierarquia/adaptabrasil"

    for _, raw in risks_dict.items():
        val = raw.get("value")
        rangelabel = raw.get("rangelabel") or ""
        sector_code = raw["sector_code"]
        sector_name = raw["sector_name"]
        ind_name = raw["indicator_name"]
        year = int(raw.get("year") or 2020)
        ind_id = raw.get("indicator_id")

        if val is None or isinstance(val, bool) or not isinstance(val, (int, float)):
            indicators.append(
                {
                    "sector_code": sector_code,
                    "sector_name": sector_name,
                    "indicator_name": ind_name,
                    "hazard_description": (
                        f"Data unavailable in AdaptaBrasil MCTI API for {city_name} "
                        f"(indicator #{ind_id})."
                    ),
                    "risk_index": None,
                    "risk_class": None,
                    "availability_status": "UNAVAILABLE",
                    "availability_reason": (
                        f"AdaptaBrasil MCTI API returned null/unavailable value for indicator #{ind_id} ({year})."
                    ),
                    "reference_scenario": "HISTORICAL_BASELINE",
                    "reference_year": year,
                    "reporting_period": str(year),
                    "data_origin": "MODELED",
                    "verification_status": "UNVERIFIED",
                    "data_source": f"AdaptaBrasil MCTI API (Indicator #{ind_id}, {year})",
                    "source_reference": ab_url,
                    "methodology_note": "No numeric index returned by AdaptaBrasil API; preserved as null and excluded from rankings.",
                    "limitations": "Missing municipal observation in upstream AdaptaBrasil endpoint.",
                    "gap_note": RISK_GAP_NOTES.get(
                        sector_code,
                        f"Obtain local municipal hazard data for {ind_name} in {city_name}.",
                    ),
                }
            )
            continue

        risk_val = round(max(0.0, min(1.0, float(val))), 4)
        risk_class = RANGELABEL_TO_RISK_CLASS.get(rangelabel, "VERY_LOW" if risk_val == 0.0 else "MEDIUM")

        indicators.append(
            {
                "sector_code": sector_code,
                "sector_name": sector_name,
                "indicator_name": f"{ind_name} ({rangelabel})" if rangelabel else ind_name,
                "hazard_description": (
                    f"AdaptaBrasil MCTI municipal climate risk index for {ind_name.lower()} "
                    f"in {city_name} (classification: {rangelabel or risk_class}, {risk_val:.2f}/1.00)."
                ),
                "risk_index": risk_val,
                "risk_class": risk_class,
                "availability_status": "AVAILABLE",
                "availability_reason": f"Published in AdaptaBrasil MCTI API ({year}).",
                "reference_scenario": "HISTORICAL_BASELINE",
                "reference_year": year,
                "reporting_period": str(year),
                "data_origin": "MODELED",
                "verification_status": "DOCUMENTED",
                "data_source": f"AdaptaBrasil MCTI API (Indicator #{ind_id}, {year})",
                "source_reference": ab_url,
                "methodology_note": (
                    "Composite IPCC climate risk index combining climate hazard, exposure, and "
                    "socio-environmental vulnerability modeled at municipal scale by MCTI/INPE."
                ),
                "limitations": "National modeled composite index; does not incorporate recent municipal drainage or civil defense logs.",
                "gap_note": RISK_GAP_NOTES.get(
                    sector_code,
                    f"Validate {ind_name} against municipal civil defense records.",
                ),
            }
        )

    if not indicators:
        indicators.append(
            {
                "sector_code": "GEO_HYDROLOGICAL_DISASTERS",
                "sector_name": "Geo-hydrological Disasters",
                "indicator_name": "AdaptaBrasil Municipal Risk Data Unavailable",
                "hazard_description": f"No AdaptaBrasil MCTI records matched IBGE {ibge_code} ({city_name}).",
                "risk_index": None,
                "risk_class": None,
                "availability_status": "UNAVAILABLE",
                "availability_reason": f"IBGE code {ibge_code} not matched in AdaptaBrasil payload.",
                "reference_scenario": "HISTORICAL_BASELINE",
                "reference_year": 2020,
                "reporting_period": "2020",
                "data_origin": "MODELED",
                "verification_status": "UNVERIFIED",
                "data_source": "AdaptaBrasil MCTI (Not Matched)",
                "source_reference": ab_url,
                "methodology_note": "Municipality IBGE code not matched in AdaptaBrasil payload.",
                "limitations": "No upstream AdaptaBrasil indicators available for this municipality.",
                "gap_note": f"Verify 7-digit IBGE code and integrate local Defesa Civil records for {city_name}.",
            }
        )

    return indicators


def build_city_record(
    ibge_code: str,
    city_name: str,
    state: str,
    population: Optional[int],
    population_year: int,
    area_km2: Optional[float],
    biome: Optional[str],
    sub_totals: Dict[str, Optional[float]],
    ab_entry: Optional[Dict[str, Any]],
    reference_year: int = DEFAULT_REFERENCE_YEAR,
    last_updated: str = DEFAULT_GENERATED_AT,
) -> Dict[str, Any]:
    """Assemble and validate a complete CityClimateRecord (v2.0.0)."""
    sectors = build_sectors_from_subsector_totals(
        sub_totals, reference_year, city_name, ibge_code
    )

    avail_sector_vals = [
        sec["emissions_tco2e"]
        for sec in sectors.values()
        if sec["emissions_tco2e"] is not None
    ]
    total_emissions = _round2(sum(avail_sector_vals)) if avail_sector_vals else None
    per_capita = (
        _round4(total_emissions / population)
        if total_emissions is not None and population is not None and population > 0
        else None
    )

    missing_components = [
        f"{code}.{mkey}"
        for code in GPC_SECTOR_CODES
        for mkey in sectors[code]["missing_subsectors"]
    ]
    coverage_status = (
        "UNAVAILABLE"
        if not avail_sector_vals
        else ("PARTIAL" if missing_components else "COMPLETE")
    )

    avail_sector_codes = [
        code for code in GPC_SECTOR_CODES if sectors[code]["emissions_tco2e"] is not None
    ]
    dominant_sector = (
        max(avail_sector_codes, key=lambda c: sectors[c]["emissions_tco2e"])
        if avail_sector_codes
        else None
    )

    avail_subs = [
        sub
        for sec in sectors.values()
        for sub in sec["subsectors"]
        if sub["availability_status"] == "AVAILABLE" and sub["emissions_tco2e"] is not None
    ]
    total_abs = sum(abs(float(s["emissions_tco2e"])) for s in avail_subs)
    if total_abs > 0:
        local_share = _round4(
            sum(abs(float(s["emissions_tco2e"])) for s in avail_subs if s["data_origin"] == "LOCAL")
            / total_abs
        )
        modeled_share = _round4(
            sum(abs(float(s["emissions_tco2e"])) for s in avail_subs if s["data_origin"] == "MODELED")
            / total_abs
        )
        proxy_share = _round4(max(0.0, 1.0 - local_share - modeled_share))
    else:
        local_share, modeled_share, proxy_share = 0.0, 0.0, 0.0

    is_mixed, summary_label = _build_provenance_label(
        local_share, modeled_share, proxy_share, len(missing_components)
    )

    climate_risks = map_adaptabrasil_risks(ab_entry, city_name, ibge_code)

    metadata: Dict[str, Any] = {
        "ibge_code": ibge_code,
        "name": city_name,
        "state": state,
        "population": int(population) if population is not None else None,
        "population_year": int(population_year),
    }
    if area_km2 is not None and area_km2 > 0:
        metadata["area_km2"] = round(float(area_km2), 2)
    if biome:
        metadata["biome"] = biome

    record = {
        "schema_version": CURRENT_SCHEMA_VERSION,
        "metadata": metadata,
        "emissions_summary": {
            "total_emissions_tco2e": total_emissions,
            "per_capita_tco2e": per_capita,
            "coverage_status": coverage_status,
            "missing_components": missing_components,
            "reference_year": reference_year,
            "dominant_sector": dominant_sector,
            "provenance_mix": {
                "local_share": local_share,
                "modeled_share": modeled_share,
                "proxy_share": proxy_share,
                "is_mixed": is_mixed,
                "summary_label": summary_label,
            },
        },
        "sectors": sectors,
        "climate_risks": climate_risks,
        "last_updated": last_updated,
    }

    errors = validate_city_climate_record(record)
    if errors:
        raise ValueError(
            f"Generated invalid CityClimateRecord for {ibge_code} ({city_name}): {errors}"
        )

    return record


def parse_seeg_year_column(series: pd.Series, year_col: str) -> pd.Series:
    """
    Parse SEEG emissions values without coercing missing or malformed cells to 0.0.
    - Genuine numeric values (including 0.0) are preserved.
    - Empty/NaN cells remain NaN so all-missing subsectors become UNAVAILABLE (null).
    - Non-empty, non-numeric cells raise ValueError instead of silently becoming 0.0.
    """
    parsed = pd.to_numeric(series, errors="coerce")
    non_empty = series.notna() & (series.astype(str).str.strip() != "")
    malformed = non_empty & parsed.isna()
    if malformed.any():
        samples = series[malformed].astype(str).head(5).tolist()
        raise ValueError(
            f"Malformed non-numeric values in SEEG column '{year_col}': {samples}"
        )
    return parsed


def build_all_cities(
    seeg_csv: Path = DEFAULT_SEEG_CSV,
    adaptabrasil_json: Path = DEFAULT_ADAPTABRASIL_JSON,
    ibge_json: Path = DEFAULT_IBGE_JSON,
    out_dir: Path = DEFAULT_OUT_DIR,
    reference_year: int = DEFAULT_REFERENCE_YEAR,
) -> Dict[str, Any]:
    """Run full ingestion pipeline for all Paraná municipalities."""
    year_col = str(reference_year)
    usecols = [
        "Setor de emissão",
        "Categoria emissora",
        "Sub-categoria emissora",
        "Bioma",
        "Gás",
        "Cidade",
        "IBGE",
        year_col,
    ]
    print(f"[Build] Reading SEEG CSV {seeg_csv} (year={year_col})...")
    df = pd.read_csv(seeg_csv, usecols=usecols, low_memory=False)
    df = df[df["Gás"] == "CO2e (t) GWP-AR5"].copy()
    df["ibge_str"] = df["IBGE"].astype(str).str.strip().str.replace(r"\.0$", "", regex=True)
    df = df[df["ibge_str"].str.match(r"^41\d{5}$") & (df["ibge_str"] != "4100000")].copy()
    df[year_col] = parse_seeg_year_column(df[year_col], year_col)

    df["gpc_subsector"] = [
        classify_seeg_row(s, c, sc)[1]
        for s, c, sc in zip(
            df["Setor de emissão"],
            df["Categoria emissora"],
            df["Sub-categoria emissora"],
        )
    ]

    grouped = df.groupby(["ibge_str", "gpc_subsector"])[year_col].sum(min_count=1)
    city_biomes = (
        df.dropna(subset=["Bioma"])
        .groupby("ibge_str")["Bioma"]
        .agg(lambda s: s.mode().iloc[0] if not s.mode().empty else None)
        .to_dict()
    )
    seeg_city_names = (
        df.groupby("ibge_str")["Cidade"]
        .first()
        .apply(lambda c: re.sub(r"\s*\([A-Z]{2}\)$", "", str(c)).strip())
        .to_dict()
    )

    with open(adaptabrasil_json, "r", encoding="utf-8") as f:
        ab_data = json.load(f).get("municipalities", {})

    with open(ibge_json, "r", encoding="utf-8") as f:
        ibge_data = json.load(f).get("municipalities", {})

    all_ibge_codes = sorted(set(seeg_city_names.keys()) | set(ibge_data.keys()))
    out_dir.mkdir(parents=True, exist_ok=True)

    index_entries: List[Dict[str, Any]] = []
    for ibge_code in all_ibge_codes:
        ibge_meta = ibge_data.get(ibge_code, {})
        city_name = ibge_meta.get("name") or seeg_city_names.get(ibge_code, ibge_code)
        raw_pop = ibge_meta.get("population")
        population = int(raw_pop) if raw_pop is not None and int(raw_pop) > 0 else None
        population_year = int(ibge_meta.get("population_year") or 2022)
        area_km2 = ibge_meta.get("area_km2")
        biome = city_biomes.get(ibge_code)

        sub_totals: Dict[str, Optional[float]] = {}
        if ibge_code in grouped.index.get_level_values(0):
            city_series = grouped.loc[ibge_code]
            sub_totals = {
                k: float(v) for k, v in city_series.items() if pd.notna(v)
            }

        record = build_city_record(
            ibge_code=ibge_code,
            city_name=city_name,
            state="PR",
            population=population,
            population_year=population_year,
            area_km2=area_km2,
            biome=biome,
            sub_totals=sub_totals,
            ab_entry=ab_data.get(ibge_code),
            reference_year=reference_year,
        )

        out_file = out_dir / f"{ibge_code}.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)

        summary = record["emissions_summary"]
        pmix = summary["provenance_mix"]
        available_risks = [
            r
            for r in record["climate_risks"]
            if r["availability_status"] == "AVAILABLE" and r["risk_index"] is not None
        ]
        top_risk = (
            max(available_risks, key=lambda r: float(r["risk_index"]))
            if available_risks
            else None
        )

        index_entries.append(
            {
                "ibge_code": ibge_code,
                "name": city_name,
                "state": "PR",
                "population": population,
                "population_year": population_year,
                "total_emissions_tco2e": summary["total_emissions_tco2e"],
                "total_tco2e": summary["total_emissions_tco2e"],
                "per_capita_tco2e": summary["per_capita_tco2e"],
                "coverage_status": summary["coverage_status"],
                "missing_components_count": len(summary["missing_components"]),
                "dominant_sector": summary["dominant_sector"],
                "provenance_label": pmix["summary_label"],
                "local_share_pct": round(pmix["local_share"] * 100, 2),
                "modeled_share_pct": round(pmix["modeled_share"] * 100, 2),
                "proxy_share_pct": round(pmix["proxy_share"] * 100, 2),
                "sector_totals": {
                    code: record["sectors"][code]["emissions_tco2e"]
                    for code in GPC_SECTOR_CODES
                },
                "top_climate_risk": (
                    {
                        "sector_code": top_risk["sector_code"],
                        "indicator_name": top_risk["indicator_name"],
                        "risk_index": top_risk["risk_index"],
                        "risk_class": top_risk["risk_class"],
                        "availability_status": "AVAILABLE",
                    }
                    if top_risk
                    else None
                ),
            }
        )

    index_manifest = {
        "schema_version": CURRENT_SCHEMA_VERSION,
        "generated_at": DEFAULT_GENERATED_AT,
        "municipalities": index_entries,
    }
    index_path = out_dir / "index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_manifest, f, ensure_ascii=False, indent=2)

    print(f"[Build] Generated {len(index_entries)} city JSON files + {index_path}")
    return index_manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build municipal climate JSONs for Paraná")
    parser.add_argument("--seeg-csv", type=Path, default=DEFAULT_SEEG_CSV)
    parser.add_argument("--adaptabrasil-json", type=Path, default=DEFAULT_ADAPTABRASIL_JSON)
    parser.add_argument("--ibge-json", type=Path, default=DEFAULT_IBGE_JSON)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--year", type=int, default=DEFAULT_REFERENCE_YEAR)
    args = parser.parse_args()

    build_all_cities(
        seeg_csv=args.seeg_csv,
        adaptabrasil_json=args.adaptabrasil_json,
        ibge_json=args.ibge_json,
        out_dir=args.out_dir,
        reference_year=args.year,
    )


if __name__ == "__main__":
    main()
