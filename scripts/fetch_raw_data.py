"""
Deterministic raw data fetcher for Municipal Climate Lens (Paraná - PR).

Populates `data/raw/` from official Brazilian open climate & demographic APIs:
1. AdaptaBrasil MCTI (`sistema.adaptabrasil.mcti.gov.br/api`) -> `data/raw/adaptabrasil_pr.json`
2. IBGE SIDRA Censo 2022 (`servicodados.ibge.gov.br/api/v3`) -> `data/raw/ibge_pr_2022.json`
3. Verifies presence of SEEG Municípios Collection 14.0 (`data/raw/seeg_pr.csv`),
   with optional download from the official SEEG Paraná Google Drive export URL.

Strictly zero fabricated or mocked numbers: any failed endpoint logs its exact
HTTP status and exits non-zero.
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

RAW_DIR = Path("data/raw")
SEEG_PR_CSV = RAW_DIR / "seeg_pr.csv"
SEEG_PR_DRIVE_URL = (
    "https://drive.usercontent.google.com/download"
    "?id=1azQSs3powvRzxu3Ystbka56h8URf_AMM&export=download&confirm=t"
)
ADAPTABRASIL_OUT = RAW_DIR / "adaptabrasil_pr.json"
IBGE_PR_OUT = RAW_DIR / "ibge_pr_2022.json"

ADAPTABRASIL_INDICATORS: List[Dict[str, Any]] = [
    {
        "id": 60041,
        "key": "inundacoes_enxurradas_alagamentos",
        "sector_code": "GEO_HYDROLOGICAL_DISASTERS",
        "sector_name": "Geo-hydrological Disasters",
        "indicator_name": "Inundações, enxurradas e alagamentos",
        "year": 2015,
        "scenario": "null",
    },
    {
        "id": 60001,
        "key": "deslizamento_de_terra",
        "sector_code": "GEO_HYDROLOGICAL_DISASTERS",
        "sector_name": "Geo-hydrological Disasters",
        "indicator_name": "Deslizamento de terra",
        "year": 2015,
        "scenario": "null",
    },
    {
        "id": 2,
        "key": "estresse_hidrico",
        "sector_code": "WATER_RESOURCES",
        "sector_name": "Water Resources",
        "indicator_name": "Risco de estresse hídrico",
        "year": 2020,
        "scenario": "null",
    },
    {
        "id": 50076,
        "key": "arboviroses_dengue_zika_chikungunya",
        "sector_code": "HEALTH",
        "sector_name": "Health",
        "indicator_name": "Arboviroses dengue, zika e chikungunya",
        "year": 2020,
        "scenario": "null",
    },
    {
        "id": 10024,
        "key": "seguranca_energetica_disponibilidade",
        "sector_code": "ENERGY",
        "sector_name": "Energy",
        "indicator_name": "Segurança energética — Disponibilidade",
        "year": 2019,
        "scenario": "null",
    },
    {
        "id": 5001,
        "key": "alimentos_disponibilidade",
        "sector_code": "FOOD_SECURITY",
        "sector_name": "Food Security",
        "indicator_name": "Disponibilidade de alimentos",
        "year": 2017,
        "scenario": "null",
    },
    {
        "id": 5048,
        "key": "alimentos_acesso_consumo",
        "sector_code": "FOOD_SECURITY",
        "sector_name": "Food Security",
        "indicator_name": "Acesso e consumo de alimentos",
        "year": 2017,
        "scenario": "null",
    },
]

IBGE_SIDRA_PR_URL = (
    "https://servicodados.ibge.gov.br/api/v3/agregados/4714"
    "/periodos/2022/variaveis/93|6318?localidades=N6[N3[41]]"
)


def _fetch_json(url: str, timeout: int = 30) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "climate-lens/1.0",
            "Accept-Encoding": "gzip, identity",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                raise RuntimeError(f"HTTP {resp.status} for {url}")
            raw_bytes = resp.read()
            if resp.headers.get("Content-Encoding") == "gzip" or raw_bytes[:2] == b"\x1f\x8b":
                raw_bytes = gzip.decompress(raw_bytes)
            return json.loads(raw_bytes.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code} {exc.reason} for {url}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error for {url}: {exc.reason}") from exc


def fetch_adaptabrasil_pr() -> Dict[str, Any]:
    """Fetch AdaptaBrasil MCTI municipal risk indices for all Paraná municipalities."""
    municipalities: Dict[str, Dict[str, Any]] = {}
    fetch_log: List[Dict[str, Any]] = []

    for ind in ADAPTABRASIL_INDICATORS:
        url = (
            f"https://sistema.adaptabrasil.mcti.gov.br/api/mapa-dados/"
            f"PR/municipio/{ind['id']}/{ind['year']}/{ind['scenario']}/adaptabrasil"
        )
        print(f"[AdaptaBrasil] Fetching indicator {ind['id']} ({ind['indicator_name']})...")
        try:
            rows = _fetch_json(url)
        except RuntimeError as err:
            print(f"[AdaptaBrasil] ERROR: {err}", file=sys.stderr)
            fetch_log.append(
                {
                    "indicator_id": ind["id"],
                    "key": ind["key"],
                    "status": "ERROR",
                    "error": str(err),
                }
            )
            continue

        if not isinstance(rows, list):
            print(
                f"[AdaptaBrasil] Unexpected payload type for {ind['id']}: {type(rows)}",
                file=sys.stderr,
            )
            continue

        for item in rows:
            ibge = str(item.get("geocod_ibge", "")).strip()
            if not ibge:
                continue
            if ibge not in municipalities:
                municipalities[ibge] = {
                    "ibge_code": ibge,
                    "name": item.get("name", ""),
                    "risks": {},
                }
            municipalities[ibge]["risks"][ind["key"]] = {
                "indicator_id": ind["id"],
                "sector_code": ind["sector_code"],
                "sector_name": ind["sector_name"],
                "indicator_name": ind["indicator_name"],
                "year": item.get("year", ind["year"]),
                "value": item.get("value"),
                "rangelabel": item.get("rangelabel"),
                "valuecolor": item.get("valuecolor"),
                "scenario": ind["scenario"],
            }

        fetch_log.append(
            {
                "indicator_id": ind["id"],
                "key": ind["key"],
                "status": "OK",
                "count": len(rows),
            }
        )

    payload = {
        "source": "AdaptaBrasil MCTI (https://sistema.adaptabrasil.mcti.gov.br)",
        "state": "PR",
        "indicators": ADAPTABRASIL_INDICATORS,
        "fetch_log": fetch_log,
        "municipalities": municipalities,
    }
    ADAPTABRASIL_OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(ADAPTABRASIL_OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[AdaptaBrasil] Saved {len(municipalities)} municipalities to {ADAPTABRASIL_OUT}")
    return payload


def fetch_ibge_pr_2022() -> Dict[str, Any]:
    """Fetch IBGE Censo 2022 population and territorial area for all 399 Paraná municipalities."""
    print("[IBGE] Fetching Censo 2022 population and area for PR (state 41)...")
    data = _fetch_json(IBGE_SIDRA_PR_URL)
    municipalities: Dict[str, Dict[str, Any]] = {}

    for var_block in data:
        var_id = str(var_block.get("id"))
        series = var_block.get("resultados", [{}])[0].get("series", [])
        for entry in series:
            loc = entry.get("localidade", {})
            ibge = str(loc.get("id", "")).strip()
            raw_name = str(loc.get("nome", "")).replace(" - PR", "").strip()
            val_str = entry.get("serie", {}).get("2022")
            if not ibge or val_str is None:
                continue
            if ibge not in municipalities:
                municipalities[ibge] = {
                    "ibge_code": ibge,
                    "name": raw_name,
                    "state": "PR",
                    "population_year": 2022,
                }
            if var_id == "93":
                municipalities[ibge]["population"] = int(float(val_str))
            elif var_id == "6318":
                municipalities[ibge]["area_km2"] = round(float(val_str), 2)

    payload = {
        "source": "IBGE SIDRA Tabela 4714 (Censo Demográfico 2022)",
        "state": "PR",
        "population_year": 2022,
        "municipalities": municipalities,
    }
    IBGE_PR_OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(IBGE_PR_OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[IBGE] Saved {len(municipalities)} municipalities to {IBGE_PR_OUT}")
    return payload


def ensure_seeg_pr(download_if_missing: bool = False) -> None:
    """Verify SEEG Paraná CSV exists in data/raw/seeg_pr.csv."""
    if SEEG_PR_CSV.exists() and SEEG_PR_CSV.stat().st_size > 1_000_000:
        size_mb = SEEG_PR_CSV.stat().st_size / (1024 * 1024)
        print(f"[SEEG] Found {SEEG_PR_CSV} ({size_mb:.1f} MB)")
        return

    if not download_if_missing:
        raise FileNotFoundError(
            f"{SEEG_PR_CSV} not found. Download SEEG Municípios Collection 14.0 (PR ar5.csv) "
            f"from https://seeg.eco.br/dados/ or run with --download-seeg."
        )

    print(f"[SEEG] Downloading Paraná ar5.csv to {SEEG_PR_CSV}...")
    req = urllib.request.Request(SEEG_PR_DRIVE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status} downloading SEEG PR CSV")
        SEEG_PR_CSV.parent.mkdir(parents=True, exist_ok=True)
        with open(SEEG_PR_CSV, "wb") as out_f:
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                out_f.write(chunk)
    print(f"[SEEG] Downloaded {SEEG_PR_CSV} ({SEEG_PR_CSV.stat().st_size} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch raw climate data for Paraná (PR)")
    parser.add_argument(
        "--download-seeg",
        action="store_true",
        help="Download SEEG PR ar5.csv if missing from data/raw/seeg_pr.csv",
    )
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    ensure_seeg_pr(download_if_missing=args.download_seeg)
    fetch_adaptabrasil_pr()
    fetch_ibge_pr_2022()


if __name__ == "__main__":
    main()
