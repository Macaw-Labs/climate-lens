"""
Deterministic municipal climate data ingestion pipeline (`scripts/build_city_data.py`).

Reads raw datasets in `data/raw/`:
- `data/raw/seeg_pr.csv` (SEEG Municípios Collection 14.0, filtered to CO2e GWP-AR5)
- `data/raw/adaptabrasil_pr.json` (AdaptaBrasil MCTI municipal risk indices)
- `data/raw/ibge_pr_2022.json` (IBGE Censo 2022 population & territorial area)

Produces validated per-city JSON records at `public/data/{ibge_code}.json` and
updates `public/data/index.json` conforming strictly to `data/schema/city_schema.py`
and `AGENTS.md`.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from data.schema.city_schema import validate_city_climate_record  # noqa: E402

DEFAULT_SEEG_CSV = Path("data/raw/seeg_pr.csv")
DEFAULT_ADAPTABRASIL_JSON = Path("data/raw/adaptabrasil_pr.json")
DEFAULT_IBGE_JSON = Path("data/raw/ibge_pr_2022.json")
DEFAULT_OUT_DIR = Path("public/data")
DEFAULT_REFERENCE_YEAR = 2025
DEFAULT_GENERATED_AT = "2026-11-12T00:00:00Z"

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
        "and municipal stormwater drainage master plan (Plano Diretor de Drenagem) to upgrade to T1_LOCAL."
    ),
    "WATER_RESOURCES": (
        "Integrate local water utility (Sanepar / municipal SAAE) watershed intake flow gauges "
        "and drought contingency storage capacity records to upgrade to T1_LOCAL."
    ),
    "HEALTH": (
        "Integrate Secretaria Municipal de Saúde neighborhood-level LIRAa vector infestation "
        "series and climate-sensitive morbidity logs to upgrade to T1_LOCAL."
    ),
    "ENERGY": (
        "Integrate electricity distributor (Copel) feeder-level weather-attributed DEC/FEC "
        "outage logs and municipal grid resilience audits to upgrade to T1_LOCAL."
    ),
    "FOOD_SECURITY": (
        "Integrate municipal agricultural extension (IDR-Paraná) crop loss records and "
        "local food supply/school-feeding vulnerability registries to upgrade to T1_LOCAL."
    ),
}


def _round2(val: float) -> float:
    return round(float(val), 2)


def _round4(val: float) -> float:
    return round(float(val), 4)


def classify_seeg_row(setor: str, categoria: str, subcategoria: str) -> Tuple[str, str]:
    """
    Deterministically map a SEEG Municípios row into (GPCSectorCode, GPCSubsectorKey).
    """
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


def compute_sector_tier(subsectors: List[Dict[str, Any]]) -> str:
    """
    Compute aggregate sector confidence tier weighted by absolute subsector emissions.
    """
    if not subsectors:
        return "T3_PROXY"
    if all(s["confidence_tier"] == "T1_LOCAL" for s in subsectors):
        return "T1_LOCAL"

    total_abs = sum(abs(s["emissions_tco2e"]) for s in subsectors)
    if total_abs == 0:
        tiers = {s["confidence_tier"] for s in subsectors}
        if "T1_LOCAL" in tiers:
            return "T1_LOCAL"
        if "T2_MODELED" in tiers:
            return "T2_MODELED"
        return "T3_PROXY"

    t1_abs = sum(abs(s["emissions_tco2e"]) for s in subsectors if s["confidence_tier"] == "T1_LOCAL")
    t2_abs = sum(abs(s["emissions_tco2e"]) for s in subsectors if s["confidence_tier"] == "T2_MODELED")

    if t1_abs / total_abs >= 0.6:
        return "T1_LOCAL"
    if (t1_abs + t2_abs) / total_abs >= 0.6:
        return "T2_MODELED"
    return "T3_PROXY"


def build_sectors_from_subsector_totals(
    sub_totals: Dict[str, float],
    reference_year: int,
    city_name: str,
) -> Dict[str, Any]:
    """
    Construct the 5 GPC sectors and subsectors with explicit provenance & gap notes.
    """
    grid_elec = _round2(sub_totals.get("grid_electricity", 0.0))
    stat_fuel = _round2(sub_totals.get("stationary_fuel_combustion", 0.0))
    on_road = _round2(sub_totals.get("on_road_transportation", 0.0))
    off_road = _round2(sub_totals.get("off_road_and_aviation", 0.0))
    solid_waste = _round2(sub_totals.get("solid_waste_disposal", 0.0))
    wastewater = _round2(sub_totals.get("wastewater_treatment", 0.0))
    ippu_val = _round2(sub_totals.get("industrial_processes", 0.0))
    agro_val = _round2(sub_totals.get("agriculture_and_livestock", 0.0))
    lulucf_val = _round2(sub_totals.get("land_use_and_forestry", 0.0))

    seeg_src = f"SEEG Municípios Coleção 14.0 (GWP-AR5, {reference_year})"

    stationary_subs = [
        {
            "subsector_key": "grid_electricity",
            "subsector_name": "Grid Electricity Consumption (Scope 2)",
            "emissions_tco2e": grid_elec,
            "confidence_tier": "T3_PROXY",
            "data_source": f"{seeg_src} — Scope 2 electricity not disaggregated in SEEG Municípios",
            "reference_year": reference_year,
            "methodology_note": (
                "SEEG Municípios allocates power-plant Scope 1 emissions at generation sites rather than "
                "municipal end-use Scope 2 electricity. Baseline is 0.0 tCO2e until local MWh consumption is supplied."
            ),
            "gap_note": (
                f"Obtain annual municipal electricity consumption (MWh) by tariff class for {city_name} "
                "from Copel Distribuição / ANEEL SINDAT and apply Brazil SIN grid factor via Local Override to upgrade to T1_LOCAL."
            ),
        },
        {
            "subsector_key": "stationary_fuel_combustion",
            "subsector_name": "Stationary Fuel Combustion (Residential, Commercial, Industrial & Public)",
            "emissions_tco2e": stat_fuel,
            "confidence_tier": "T3_PROXY",
            "data_source": f"{seeg_src} — Energia (Residencial, Comercial, Público, Agropecuária, Industrial)",
            "reference_year": reference_year,
            "methodology_note": (
                "State-level ANP/EPE fuel balances (GLP, diesel, fuel oil) disaggregated to municipalities "
                "via IBGE population and industrial/commercial value-added proxies."
            ),
            "gap_note": (
                f"Obtain ANP municipal LPG (GLP) sales and local industrial boiler fuel logs in {city_name} "
                "to replace state-disaggregated proxy and upgrade to T1_LOCAL."
            ),
        },
    ]

    transport_subs = [
        {
            "subsector_key": "on_road_transportation",
            "subsector_name": "On-Road Transportation (Urban Fleet, Freight & Public Transit)",
            "emissions_tco2e": on_road,
            "confidence_tier": "T3_PROXY",
            "data_source": f"{seeg_src} — Energia / Transportes / Rodoviário",
            "reference_year": reference_year,
            "methodology_note": (
                "State/regional ANP fuel distribution (Diesel B14, Gasoline C, Hydrated Ethanol) allocated "
                "to municipalities using SENATRAN fleet shares and highway VKT modeling."
            ),
            "gap_note": (
                f"Obtain audited ANP SIMP municipal retail fuel sales (diesel, gasoline, ethanol liters) "
                f"and {city_name} public transit fleet fuel logs to upgrade to T1_LOCAL."
            ),
        },
        {
            "subsector_key": "off_road_and_aviation",
            "subsector_name": "Aviation, Rail & Off-Road Transportation",
            "emissions_tco2e": off_road,
            "confidence_tier": "T3_PROXY",
            "data_source": f"{seeg_src} — Energia / Transportes (Aéreo, Ferroviário, Hidroviário)",
            "reference_year": reference_year,
            "methodology_note": (
                "Regional aviation kerosene (QAV), aviation gasoline, and rail/waterway diesel allocated "
                "by ANAC airport LTO cycles and transport network proxies."
            ),
            "gap_note": (
                f"Obtain local airport QAV fuel uplift records (if applicable) and municipal off-road "
                f"machinery diesel logs for {city_name} to upgrade to T1_LOCAL."
            ),
        },
    ]

    waste_subs = [
        {
            "subsector_key": "solid_waste_disposal",
            "subsector_name": "Municipal Solid Waste Disposal & Incineration",
            "emissions_tco2e": solid_waste,
            "confidence_tier": "T3_PROXY",
            "data_source": f"{seeg_src} — Resíduos (Disposição final, Incineração, Tratamento biológico)",
            "reference_year": reference_year,
            "methodology_note": (
                "IPCC First-Order Decay (FOD) model driven by SNIS / IBGE per-capita waste generation "
                "and regional landfill/dumpsite shares."
            ),
            "gap_note": (
                f"Obtain certified municipal landfill weighbridge tonnage (t/year) and active methane "
                f"capture/flaring logs for {city_name} to upgrade to T1_LOCAL."
            ),
        },
        {
            "subsector_key": "wastewater_treatment",
            "subsector_name": "Domestic & Industrial Wastewater Treatment",
            "emissions_tco2e": wastewater,
            "confidence_tier": "T3_PROXY",
            "data_source": f"{seeg_src} — Resíduos (Efluentes domésticos e industriais)",
            "reference_year": reference_year,
            "methodology_note": (
                "Estimated from municipal population, SNIS sewage coverage rates, and industrial BOD "
                "proxies using IPCC CH4/N2O effluent emission factors."
            ),
            "gap_note": (
                f"Obtain Sanepar / municipal ETE plant-level BOD inflow/outflow and biogas flaring "
                f"logs for {city_name} to upgrade to T1_LOCAL."
            ),
        },
    ]

    ippu_subs = [
        {
            "subsector_key": "industrial_processes",
            "subsector_name": "Industrial Processes & Product Use (IPPU)",
            "emissions_tco2e": ippu_val,
            "confidence_tier": "T3_PROXY",
            "data_source": f"{seeg_src} — Processos Industriais",
            "reference_year": reference_year,
            "methodology_note": (
                "Point-source cement/lime/metallurgy allocation and national HFC/solvent proxies "
                "downscaled by municipal industrial registry."
            ),
            "gap_note": (
                f"Obtain municipal environmental licensing (IAT / Secretaria de Meio Ambiente) industrial "
                f"process inventory and commercial HFC refrigerant audit for {city_name} to upgrade to T1_LOCAL."
            ),
        }
    ]

    afolu_subs = [
        {
            "subsector_key": "agriculture_and_livestock",
            "subsector_name": "Agriculture, Livestock & Managed Soils",
            "emissions_tco2e": agro_val,
            "confidence_tier": "T2_MODELED",
            "data_source": f"{seeg_src} — Agropecuária (IBGE PPM/PAM Municipal Modeling)",
            "reference_year": reference_year,
            "methodology_note": (
                "Spatially/census-modeled from IBGE Pesquisa da Pecuária Municipal (PPM) herd counts, "
                "PAM crop areas, and Tier 2 IPCC enteric fermentation & soil N2O factors."
            ),
            "gap_note": (
                f"Verify local agricultural cooperative fertilizer sales and manure management practices "
                f"within {city_name} to upgrade to T1_LOCAL."
            ),
        },
        {
            "subsector_key": "land_use_and_forestry",
            "subsector_name": "Land-Use Change & Forestry (Net Emissions/Removals)",
            "emissions_tco2e": lulucf_val,
            "confidence_tier": "T2_MODELED",
            "data_source": f"{seeg_src} — Mudança de Uso da Terra e Floresta (MapBiomas Spatial Modeling)",
            "reference_year": reference_year,
            "methodology_note": (
                "Spatially modeled at 30m resolution from MapBiomas annual land-cover transition matrices "
                "(gross deforestation/soil carbon emissions net of secondary forest & protected-area removals)."
            ),
            "gap_note": (
                f"Integrate municipal CAR (Cadastro Ambiental Rural) field-verified forest biomass and "
                f"urban arborization carbon inventory for {city_name} to upgrade to T1_LOCAL."
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
        sec_total = _round2(sum(s["emissions_tco2e"] for s in subs))
        sec_tier = compute_sector_tier(subs)
        sectors[code] = {
            "sector_code": code,
            "sector_name": name,
            "emissions_tco2e": sec_total,
            "confidence_tier": sec_tier,
            "data_source": f"{seeg_src} ({name})",
            "reference_year": reference_year,
            "methodology_note": subs[0]["methodology_note"]
            if len(subs) == 1
            else f"Aggregated from {len(subs)} GPC subsectors in SEEG Coleção 14.0 (GWP-AR5).",
            "gap_note": " | ".join(f"{s['subsector_name']}: {s['gap_note']}" for s in subs),
            "subsectors": subs,
        }

    return sectors


def map_adaptabrasil_risks(
    ab_entry: Optional[Dict[str, Any]],
    city_name: str,
) -> List[Dict[str, Any]]:
    """
    Map AdaptaBrasil MCTI raw indicators into ClimateRiskIndicator records.
    If an indicator is missing or unavailable, record an explicit gap rather than
    fabricating a number.
    """
    risks_dict = (ab_entry or {}).get("risks", {})
    indicators: List[Dict[str, Any]] = []

    for key, raw in risks_dict.items():
        val = raw.get("value")
        rangelabel = raw.get("rangelabel") or ""
        sector_code = raw["sector_code"]
        sector_name = raw["sector_name"]
        ind_name = raw["indicator_name"]
        year = int(raw.get("year") or 2020)

        if val is None or not isinstance(val, (int, float)):
            # Explicit gap record without fabricating a score
            indicators.append(
                {
                    "sector_code": sector_code,
                    "sector_name": sector_name,
                    "indicator_name": ind_name,
                    "hazard_description": (
                        f"Data unavailable in AdaptaBrasil MCTI API for {city_name} "
                        f"(indicator {raw.get('indicator_id')})."
                    ),
                    "risk_index": 0.0,
                    "risk_class": "VERY_LOW",
                    "reference_scenario": "HISTORICAL_BASELINE",
                    "reference_year": year,
                    "confidence_tier": "T3_PROXY",
                    "data_source": "AdaptaBrasil MCTI (Missing / Unavailable Indicator)",
                    "methodology_note": "No numeric index returned by AdaptaBrasil API; set to 0.0 placeholder with explicit gap.",
                    "gap_note": RISK_GAP_NOTES.get(
                        sector_code,
                        f"Obtain local municipal hazard data for {ind_name} in {city_name}.",
                    ),
                }
            )
            continue

        risk_val = round(max(0.0, min(1.0, float(val))), 4)
        risk_class = RANGELABEL_TO_RISK_CLASS.get(rangelabel, "MEDIUM")

        indicators.append(
            {
                "sector_code": sector_code,
                "sector_name": sector_name,
                "indicator_name": f"{ind_name} ({rangelabel})",
                "hazard_description": (
                    f"AdaptaBrasil MCTI municipal climate risk index for {ind_name.lower()} "
                    f"in {city_name} (classification: {rangelabel}, {risk_val:.2f}/1.00)."
                ),
                "risk_index": risk_val,
                "risk_class": risk_class,
                "reference_scenario": "HISTORICAL_BASELINE",
                "reference_year": year,
                "confidence_tier": "T2_MODELED",
                "data_source": f"AdaptaBrasil MCTI API (Indicator #{raw.get('indicator_id')}, {year})",
                "methodology_note": (
                    "Composite IPCC climate risk index combining climate hazard, exposure, and "
                    "socio-environmental vulnerability modeled at municipal scale by MCTI/INPE."
                ),
                "gap_note": RISK_GAP_NOTES.get(
                    sector_code,
                    f"Validate {ind_name} against municipal civil defense and sector records.",
                ),
            }
        )

    if not indicators:
        indicators.append(
            {
                "sector_code": "GEO_HYDROLOGICAL_DISASTERS",
                "sector_name": "Geo-hydrological Disasters",
                "indicator_name": "AdaptaBrasil Municipal Risk Data Missing",
                "hazard_description": f"No AdaptaBrasil MCTI records found for {city_name}.",
                "risk_index": 0.0,
                "risk_class": "VERY_LOW",
                "reference_scenario": "HISTORICAL_BASELINE",
                "reference_year": 2020,
                "confidence_tier": "T3_PROXY",
                "data_source": "AdaptaBrasil MCTI (Not Matched)",
                "methodology_note": "Municipality IBGE code not matched in AdaptaBrasil payload.",
                "gap_note": f"Verify 7-digit IBGE code and integrate local Defesa Civil records for {city_name}.",
            }
        )

    return indicators


def build_city_record(
    ibge_code: str,
    city_name: str,
    state: str,
    population: int,
    population_year: int,
    area_km2: Optional[float],
    biome: Optional[str],
    sub_totals: Dict[str, float],
    ab_entry: Optional[Dict[str, Any]],
    reference_year: int = DEFAULT_REFERENCE_YEAR,
    last_updated: str = DEFAULT_GENERATED_AT,
) -> Dict[str, Any]:
    """Assemble and validate a complete CityClimateRecord dictionary."""
    sectors = build_sectors_from_subsector_totals(sub_totals, reference_year, city_name)

    total_emissions = _round2(sum(sec["emissions_tco2e"] for sec in sectors.values()))
    per_capita = _round4(total_emissions / population) if population > 0 else 0.0

    dominant_sector = max(
        sectors.keys(), key=lambda code: sectors[code]["emissions_tco2e"]
    )

    all_subs = [sub for sec in sectors.values() for sub in sec["subsectors"]]
    total_abs = sum(abs(s["emissions_tco2e"]) for s in all_subs)
    if total_abs > 0:
        t1_share = _round4(
            sum(abs(s["emissions_tco2e"]) for s in all_subs if s["confidence_tier"] == "T1_LOCAL")
            / total_abs
        )
        t2_share = _round4(
            sum(abs(s["emissions_tco2e"]) for s in all_subs if s["confidence_tier"] == "T2_MODELED")
            / total_abs
        )
        t3_share = _round4(max(0.0, 1.0 - t1_share - t2_share))
    else:
        t1_share, t2_share, t3_share = 0.0, 0.0, 1.0

    climate_risks = map_adaptabrasil_risks(ab_entry, city_name)

    metadata: Dict[str, Any] = {
        "ibge_code": ibge_code,
        "name": city_name,
        "state": state,
        "population": int(population),
        "population_year": int(population_year),
    }
    if area_km2 is not None and area_km2 > 0:
        metadata["area_km2"] = round(float(area_km2), 2)
    if biome:
        metadata["biome"] = biome

    record = {
        "schema_version": "1.0.0",
        "metadata": metadata,
        "emissions_summary": {
            "total_emissions_tco2e": total_emissions,
            "per_capita_tco2e": per_capita,
            "reference_year": reference_year,
            "dominant_sector": dominant_sector,
            "tier_breakdown": {
                "T1_LOCAL_share": t1_share,
                "T2_MODELED_share": t2_share,
                "T3_PROXY_share": t3_share,
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
    # Keep only valid 7-digit Paraná municipality codes (exclude 4100000 NA/unallocated)
    df = df[df["ibge_str"].str.match(r"^41\d{5}$") & (df["ibge_str"] != "4100000")].copy()
    df[year_col] = pd.to_numeric(df[year_col], errors="coerce").fillna(0.0)

    # Classify each row into GPC subsector
    df["gpc_subsector"] = [
        classify_seeg_row(s, c, sc)[1]
        for s, c, sc in zip(
            df["Setor de emissão"],
            df["Categoria emissora"],
            df["Sub-categoria emissora"],
        )
    ]

    # Aggregate emissions by (ibge_str, gpc_subsector)
    grouped = df.groupby(["ibge_str", "gpc_subsector"])[year_col].sum()
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
        population = int(ibge_meta.get("population") or 1)
        population_year = int(ibge_meta.get("population_year") or 2022)
        area_km2 = ibge_meta.get("area_km2")
        biome = city_biomes.get(ibge_code)

        sub_totals: Dict[str, float] = {}
        if ibge_code in grouped.index.get_level_values(0):
            city_series = grouped.loc[ibge_code]
            sub_totals = {k: float(v) for k, v in city_series.items()}

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
        tiers = summary["tier_breakdown"]
        primary_tier = (
            "T2_MODELED" if tiers["T2_MODELED_share"] >= tiers["T3_PROXY_share"] else "T3_PROXY"
        )
        top_risk = max(record["climate_risks"], key=lambda r: r["risk_index"])

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
                "dominant_sector": summary["dominant_sector"],
                "primary_confidence_tier": primary_tier,
                "proxy_share_pct": round(tiers["T3_PROXY_share"] * 100, 2),
                "modeled_share_pct": round(tiers["T2_MODELED_share"] * 100, 2),
                "sector_totals": {
                    code: record["sectors"][code]["emissions_tco2e"]
                    for code in (
                        "STATIONARY_ENERGY",
                        "TRANSPORTATION",
                        "WASTE",
                        "IPPU",
                        "AFOLU",
                    )
                },
                "top_climate_risk": {
                    "sector_code": top_risk["sector_code"],
                    "indicator_name": top_risk["indicator_name"],
                    "risk_index": top_risk["risk_index"],
                    "risk_class": top_risk["risk_class"],
                },
            }
        )

    index_manifest = {
        "schema_version": "1.0.0",
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
