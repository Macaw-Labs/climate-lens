"""
Unit and integration tests for `scripts/build_city_data.py` (Schema v2.0.0).
Compatible with both `pytest` and `python3 -m unittest`.
"""

from __future__ import annotations

import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from data.schema.city_schema import (  # noqa: E402
    CURRENT_SCHEMA_VERSION,
    GPC_SECTOR_CODES,
    validate_city_climate_record,
)
from scripts.build_city_data import (  # noqa: E402
    build_all_cities,
    build_city_record,
    build_sectors_from_subsector_totals,
    classify_seeg_row,
    map_adaptabrasil_risks,
    parse_seeg_year_column,
)


class TestBuildCityData(unittest.TestCase):
    def test_classify_seeg_row_mappings(self) -> None:
        self.assertEqual(
            classify_seeg_row("Energia", "Residencial", "Residencial"),
            ("STATIONARY_ENERGY", "stationary_fuel_combustion"),
        )
        self.assertEqual(
            classify_seeg_row("Energia", "Transportes", "Rodoviário"),
            ("TRANSPORTATION", "on_road_transportation"),
        )
        self.assertEqual(
            classify_seeg_row("Energia", "Transportes", "Aéreo"),
            ("TRANSPORTATION", "off_road_and_aviation"),
        )
        self.assertEqual(
            classify_seeg_row(
                "Resíduos",
                "Disposição final",
                "Disposição final em aterros sanitários",
            ),
            ("WASTE", "solid_waste_disposal"),
        )
        self.assertEqual(
            classify_seeg_row(
                "Resíduos",
                "Efluentes domésticos",
                "Tratamento e despejo de efluentes domésticos",
            ),
            ("WASTE", "wastewater_treatment"),
        )
        self.assertEqual(
            classify_seeg_row("Processos Industriais", "Uso de HFCs", "Refrigeração"),
            ("IPPU", "industrial_processes"),
        )
        self.assertEqual(
            classify_seeg_row("Agropecuária", "Fermentação Entérica", "Bovino"),
            ("AFOLU", "agriculture_and_livestock"),
        )
        self.assertEqual(
            classify_seeg_row(
                "Mudança de Uso da Terra e Floresta",
                "Desmatamento",
                "Floresta primária",
            ),
            ("AFOLU", "land_use_and_forestry"),
        )

    def test_missing_scope2_and_genuine_zero_ippu(self) -> None:
        sub_totals = {
            "stationary_fuel_combustion": 100.0,
            "on_road_transportation": 200.0,
            "solid_waste_disposal": 50.0,
            "industrial_processes": 0.0,
            "agriculture_and_livestock": 300.0,
        }
        sectors = build_sectors_from_subsector_totals(
            sub_totals=sub_totals,
            reference_year=2025,
            city_name="Município Teste",
            ibge_code="4199999",
        )

        # Scope 2 grid_electricity is not in SEEG -> explicitly UNAVAILABLE (None)
        grid_sub = next(
            s
            for s in sectors["STATIONARY_ENERGY"]["subsectors"]
            if s["subsector_key"] == "grid_electricity"
        )
        self.assertIsNone(grid_sub["emissions_tco2e"])
        self.assertEqual(grid_sub["availability_status"], "UNAVAILABLE")
        self.assertEqual(sectors["STATIONARY_ENERGY"]["coverage_status"], "PARTIAL")
        self.assertEqual(
            sectors["STATIONARY_ENERGY"]["missing_subsectors"],
            ["grid_electricity"],
        )

        # Genuine 0.0 IPPU must remain AVAILABLE and 0.0
        ippu_sub = sectors["IPPU"]["subsectors"][0]
        self.assertEqual(ippu_sub["emissions_tco2e"], 0.0)
        self.assertEqual(ippu_sub["availability_status"], "AVAILABLE")
        self.assertEqual(sectors["IPPU"]["coverage_status"], "COMPLETE")

        # Data origin assignment: AFOLU -> MODELED, others -> PROXY
        self.assertEqual(sectors["AFOLU"]["data_origin"], "MODELED")
        self.assertEqual(sectors["STATIONARY_ENERGY"]["data_origin"], "PROXY")
        self.assertEqual(sectors["TRANSPORTATION"]["data_origin"], "PROXY")
        self.assertEqual(sectors["WASTE"]["data_origin"], "PROXY")
        self.assertEqual(sectors["IPPU"]["data_origin"], "PROXY")

    def test_adaptabrasil_missing_vs_genuine_zero_risk(self) -> None:
        ab_entry = {
            "ibge_code": "4199999",
            "name": "Município Teste/PR",
            "risks": {
                "estresse_hidrico": {
                    "indicator_id": 2,
                    "sector_code": "WATER_RESOURCES",
                    "sector_name": "Water Resources",
                    "indicator_name": "Risco de estresse hídrico",
                    "year": 2020,
                    "value": None,
                    "rangelabel": "Dado indisponível",
                },
                "inundacoes": {
                    "indicator_id": 1,
                    "sector_code": "GEO_HYDROLOGICAL_DISASTERS",
                    "sector_name": "Geo-hydrological Disasters",
                    "indicator_name": "Inundações",
                    "year": 2020,
                    "value": 0.0,
                    "rangelabel": "Muito baixo",
                },
            },
        }
        risks = map_adaptabrasil_risks(ab_entry, "Município Teste", "4199999")
        self.assertEqual(len(risks), 2)

        missing_risk = next(
            r for r in risks if r["sector_code"] == "WATER_RESOURCES"
        )
        self.assertIsNone(missing_risk["risk_index"])
        self.assertIsNone(missing_risk["risk_class"])
        self.assertEqual(missing_risk["availability_status"], "UNAVAILABLE")
        self.assertIn("unavailable", missing_risk["availability_reason"].lower())
        self.assertTrue(len(missing_risk["gap_note"]) > 10)

        zero_risk = next(
            r for r in risks if r["sector_code"] == "GEO_HYDROLOGICAL_DISASTERS"
        )
        self.assertEqual(zero_risk["risk_index"], 0.0)
        self.assertEqual(zero_risk["risk_class"], "VERY_LOW")
        self.assertEqual(zero_risk["availability_status"], "AVAILABLE")

    def test_generated_index_and_all_399_parana_cities_v2(self) -> None:
        index_path = ROOT_DIR / "public/data/index.json"
        self.assertTrue(index_path.exists(), "public/data/index.json must exist")

        with open(index_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self.assertEqual(manifest["schema_version"], CURRENT_SCHEMA_VERSION)
        municipalities = manifest["municipalities"]
        self.assertEqual(len(municipalities), 399)

        for entry in municipalities:
            self.assertRegex(entry["ibge_code"], r"^41\d{5}$")
            self.assertEqual(entry["state"], "PR")
            self.assertIn("total_tco2e", entry)
            self.assertIn("proxy_share_pct", entry)
            self.assertIn("coverage_status", entry)
            city_file = ROOT_DIR / "public/data" / f"{entry['ibge_code']}.json"
            self.assertTrue(city_file.exists(), f"Missing {city_file}")

            with open(city_file, "r", encoding="utf-8") as cf:
                city_data = json.load(cf)
            errors = validate_city_climate_record(city_data)
            self.assertEqual(
                errors,
                [],
                f"Validation failed for {entry['ibge_code']}: {errors}",
            )

    def test_maringa_4115200_matches_raw_seeg_and_adaptabrasil(self) -> None:
        maringa_path = ROOT_DIR / "public/data/4115200.json"
        with open(maringa_path, "r", encoding="utf-8") as f:
            maringa = json.load(f)

        self.assertEqual(validate_city_climate_record(maringa), [])
        self.assertEqual(maringa["schema_version"], CURRENT_SCHEMA_VERSION)
        self.assertEqual(maringa["metadata"]["ibge_code"], "4115200")
        self.assertEqual(maringa["metadata"]["name"], "Maringá")
        self.assertEqual(maringa["metadata"]["population"], 409657)

        # Cross-check against raw SEEG CSV for 2025 GWP-AR5
        seeg_df = pd.read_csv(
            ROOT_DIR / "data/raw/seeg_pr.csv",
            usecols=["Setor de emissão", "Gás", "IBGE", "2025"],
            low_memory=False,
        )
        m_raw = seeg_df[
            (seeg_df["IBGE"] == 4115200) & (seeg_df["Gás"] == "CO2e (t) GWP-AR5")
        ]
        raw_total = float(m_raw["2025"].sum())
        generated_total = maringa["emissions_summary"]["total_emissions_tco2e"]
        self.assertAlmostEqual(generated_total, raw_total, delta=0.1)

        # Verify sum parity across AVAILABLE sectors
        sector_sum = sum(
            maringa["sectors"][code]["emissions_tco2e"]
            for code in GPC_SECTOR_CODES
            if maringa["sectors"][code]["emissions_tco2e"] is not None
        )
        self.assertAlmostEqual(generated_total, sector_sum, delta=0.1)

        # Verify partial coverage & missing Scope 2 electricity
        self.assertEqual(maringa["emissions_summary"]["coverage_status"], "PARTIAL")
        self.assertIn(
            "STATIONARY_ENERGY.grid_electricity",
            maringa["emissions_summary"]["missing_components"],
        )

        # Verify data_origin: AFOLU is MODELED, others PROXY
        self.assertEqual(maringa["sectors"]["AFOLU"]["data_origin"], "MODELED")
        self.assertEqual(
            maringa["sectors"]["STATIONARY_ENERGY"]["data_origin"], "PROXY"
        )
        self.assertEqual(maringa["sectors"]["TRANSPORTATION"]["data_origin"], "PROXY")
        self.assertEqual(maringa["sectors"]["WASTE"]["data_origin"], "PROXY")
        self.assertEqual(maringa["sectors"]["IPPU"]["data_origin"], "PROXY")

        # Verify AdaptaBrasil risk scores merged cleanly
        risk_by_name = {
            r["indicator_name"]: r["risk_index"] for r in maringa["climate_risks"]
        }
        self.assertAlmostEqual(
            risk_by_name["Risco de estresse hídrico (Médio)"], 0.50, places=2
        )
        self.assertAlmostEqual(
            risk_by_name["Inundações, enxurradas e alagamentos (Alto)"],
            0.61,
            places=2,
        )
        self.assertAlmostEqual(
            risk_by_name["Arboviroses dengue, zika e chikungunya (Alto)"],
            0.66,
            places=2,
        )

    def test_absent_subsectors_are_unavailable_not_zero(self) -> None:
        sectors = build_sectors_from_subsector_totals(
            sub_totals={
                "stationary_fuel_combustion": 100.0,
                "industrial_processes": 0.0,
            },
            reference_year=2025,
            city_name="Município Teste",
            ibge_code="4199999",
        )
        # Absent subsectors must be None + UNAVAILABLE, never coerced to 0.0
        on_road = next(
            s
            for s in sectors["TRANSPORTATION"]["subsectors"]
            if s["subsector_key"] == "on_road_transportation"
        )
        self.assertIsNone(on_road["emissions_tco2e"])
        self.assertEqual(on_road["availability_status"], "UNAVAILABLE")
        self.assertEqual(sectors["TRANSPORTATION"]["coverage_status"], "UNAVAILABLE")
        self.assertIsNone(sectors["TRANSPORTATION"]["emissions_tco2e"])

        # Genuine 0.0 remains AVAILABLE
        ippu = sectors["IPPU"]["subsectors"][0]
        self.assertEqual(ippu["emissions_tco2e"], 0.0)
        self.assertEqual(ippu["availability_status"], "AVAILABLE")

    def test_parse_seeg_year_column_distinguishes_zero_missing_and_malformed(
        self,
    ) -> None:
        parsed = parse_seeg_year_column(pd.Series(["0.0", "12.5", "", None]), "2025")
        self.assertEqual(parsed.iloc[0], 0.0)
        self.assertEqual(parsed.iloc[1], 12.5)
        self.assertTrue(math.isnan(parsed.iloc[2]))
        self.assertTrue(math.isnan(parsed.iloc[3]))

        with self.assertRaises(ValueError):
            parse_seeg_year_column(pd.Series(["10.0", "N/A"]), "2025")

    def test_missing_population_produces_null_instead_of_one(self) -> None:
        record = build_city_record(
            ibge_code="4199999",
            city_name="Município Teste",
            state="PR",
            population=None,
            population_year=2022,
            area_km2=None,
            biome="Mata Atlântica",
            sub_totals={"stationary_fuel_combustion": 100.0},
            ab_entry=None,
            reference_year=2025,
        )
        self.assertIsNone(record["metadata"]["population"])
        self.assertIsNone(record["emissions_summary"]["per_capita_tco2e"])
        self.assertEqual(validate_city_climate_record(record), [])

    def test_build_all_cities_synthetic_fixture(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            seeg_csv = tmp / "seeg.csv"
            ab_json = tmp / "ab.json"
            ibge_json = tmp / "ibge.json"
            out_dir = tmp / "out"

            pd.DataFrame(
                [
                    {
                        "Setor de emissão": "Energia",
                        "Categoria emissora": "Residencial",
                        "Sub-categoria emissora": "Residencial",
                        "Bioma": "Mata Atlântica",
                        "Gás": "CO2e (t) GWP-AR5",
                        "Cidade": "Cidade Teste (PR)",
                        "IBGE": 4199998,
                        "2025": 42.5,
                    },
                    {
                        "Setor de emissão": "Processos Industriais",
                        "Categoria emissora": "Uso de HFCs",
                        "Sub-categoria emissora": "Refrigeração",
                        "Bioma": "Mata Atlântica",
                        "Gás": "CO2e (t) GWP-AR5",
                        "Cidade": "Cidade Teste (PR)",
                        "IBGE": 4199998,
                        "2025": 0.0,
                    },
                    {
                        "Setor de emissão": "Resíduos",
                        "Categoria emissora": "Disposição final",
                        "Sub-categoria emissora": "Aterro",
                        "Bioma": "Mata Atlântica",
                        "Gás": "CO2e (t) GWP-AR5",
                        "Cidade": "Cidade Teste (PR)",
                        "IBGE": 4199998,
                        "2025": None,
                    },
                ]
            ).to_csv(seeg_csv, index=False)

            ab_json.write_text(json.dumps({"municipalities": {}}), encoding="utf-8")
            ibge_json.write_text(
                json.dumps(
                    {
                        "municipalities": {
                            "4199998": {
                                "name": "Cidade Teste",
                                "population": None,
                                "population_year": 2022,
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            build_all_cities(
                seeg_csv=seeg_csv,
                adaptabrasil_json=ab_json,
                ibge_json=ibge_json,
                out_dir=out_dir,
                reference_year=2025,
            )

            city_record = json.loads(
                (out_dir / "4199998.json").read_text(encoding="utf-8")
            )
            self.assertEqual(validate_city_climate_record(city_record), [])
            self.assertIsNone(city_record["metadata"]["population"])
            self.assertIsNone(city_record["emissions_summary"]["per_capita_tco2e"])
            self.assertEqual(
                city_record["sectors"]["IPPU"]["subsectors"][0]["emissions_tco2e"], 0.0
            )
            self.assertEqual(
                city_record["sectors"]["IPPU"]["subsectors"][0]["availability_status"],
                "AVAILABLE",
            )
            self.assertIsNone(city_record["sectors"]["WASTE"]["emissions_tco2e"])
            self.assertEqual(
                city_record["sectors"]["WASTE"]["coverage_status"], "UNAVAILABLE"
            )


if __name__ == "__main__":
    unittest.main()
