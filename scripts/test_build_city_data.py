"""
Unit and integration tests for `scripts/build_city_data.py`.
Compatible with both `pytest` and `python3 -m unittest`.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from data.schema.city_schema import validate_city_climate_record  # noqa: E402
from scripts.build_city_data import (  # noqa: E402
    build_city_record,
    classify_seeg_row,
    compute_sector_tier,
    map_adaptabrasil_risks,
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
            classify_seeg_row("Resíduos", "Disposição final", "Disposição final em aterros sanitários"),
            ("WASTE", "solid_waste_disposal"),
        )
        self.assertEqual(
            classify_seeg_row("Resíduos", "Efluentes domésticos", "Tratamento e despejo de efluentes domésticos"),
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
            classify_seeg_row("Mudança de Uso da Terra e Floresta", "Desmatamento", "Floresta primária"),
            ("AFOLU", "land_use_and_forestry"),
        )

    def test_confidence_tier_assignment_rules(self) -> None:
        # Spatially modeled AFOLU subsectors -> T2_MODELED
        afolu_subs = [
            {"emissions_tco2e": 57976.36, "confidence_tier": "T2_MODELED"},
            {"emissions_tco2e": -5048.79, "confidence_tier": "T2_MODELED"},
        ]
        self.assertEqual(compute_sector_tier(afolu_subs), "T2_MODELED")

        # State/population disaggregated energy/transport/waste -> T3_PROXY
        energy_subs = [
            {"emissions_tco2e": 0.0, "confidence_tier": "T3_PROXY"},
            {"emissions_tco2e": 71084.96, "confidence_tier": "T3_PROXY"},
        ]
        self.assertEqual(compute_sector_tier(energy_subs), "T3_PROXY")

    def test_missing_adaptabrasil_indicator_records_explicit_gap(self) -> None:
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
                }
            },
        }
        risks = map_adaptabrasil_risks(ab_entry, "Município Teste")
        self.assertEqual(len(risks), 1)
        self.assertEqual(risks[0]["risk_index"], 0.0)
        self.assertIn("unavailable", risks[0]["hazard_description"].lower())
        self.assertTrue(len(risks[0]["gap_note"]) > 10)

    def test_generated_index_and_all_399_parana_cities(self) -> None:
        index_path = ROOT_DIR / "public/data/index.json"
        self.assertTrue(index_path.exists(), "public/data/index.json must exist")

        with open(index_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        municipalities = manifest["municipalities"]
        self.assertEqual(len(municipalities), 399)

        for entry in municipalities:
            self.assertRegex(entry["ibge_code"], r"^41\d{5}$")
            self.assertEqual(entry["state"], "PR")
            self.assertIn("total_tco2e", entry)
            self.assertIn("proxy_share_pct", entry)
            self.assertIsNotNone(entry["top_climate_risk"])
            city_file = ROOT_DIR / "public/data" / f"{entry['ibge_code']}.json"
            self.assertTrue(city_file.exists(), f"Missing {city_file}")

    def test_maringa_4115200_matches_raw_seeg_and_adaptabrasil(self) -> None:
        maringa_path = ROOT_DIR / "public/data/4115200.json"
        with open(maringa_path, "r", encoding="utf-8") as f:
            maringa = json.load(f)

        self.assertEqual(validate_city_climate_record(maringa), [])
        self.assertEqual(maringa["metadata"]["ibge_code"], "4115200")
        self.assertEqual(maringa["metadata"]["name"], "Maringá")
        self.assertEqual(maringa["metadata"]["population"], 409657)

        # Cross-check against raw SEEG CSV for 2025 GWP-AR5
        seeg_df = pd.read_csv(
            ROOT_DIR / "data/raw/seeg_pr.csv",
            usecols=["Setor de emissão", "Gás", "IBGE", "2025"],
            low_memory=False,
        )
        m_raw = seeg_df[(seeg_df["IBGE"] == 4115200) & (seeg_df["Gás"] == "CO2e (t) GWP-AR5")]
        raw_total = float(m_raw["2025"].sum())
        generated_total = maringa["emissions_summary"]["total_emissions_tco2e"]
        self.assertAlmostEqual(generated_total, raw_total, delta=0.1)

        # Verify confidence tiers: AFOLU is T2_MODELED, others T3_PROXY
        self.assertEqual(maringa["sectors"]["AFOLU"]["confidence_tier"], "T2_MODELED")
        self.assertEqual(maringa["sectors"]["STATIONARY_ENERGY"]["confidence_tier"], "T3_PROXY")
        self.assertEqual(maringa["sectors"]["TRANSPORTATION"]["confidence_tier"], "T3_PROXY")
        self.assertEqual(maringa["sectors"]["WASTE"]["confidence_tier"], "T3_PROXY")
        self.assertEqual(maringa["sectors"]["IPPU"]["confidence_tier"], "T3_PROXY")

        # Verify AdaptaBrasil risk scores merged cleanly
        risk_by_name = {r["indicator_name"]: r["risk_index"] for r in maringa["climate_risks"]}
        self.assertAlmostEqual(risk_by_name["Risco de estresse hídrico (Médio)"], 0.50, places=2)
        self.assertAlmostEqual(
            risk_by_name["Inundações, enxurradas e alagamentos (Alto)"], 0.61, places=2
        )
        self.assertAlmostEqual(
            risk_by_name["Arboviroses dengue, zika e chikungunya (Alto)"], 0.66, places=2
        )


if __name__ == "__main__":
    unittest.main()
