import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as getHealth } from "../app/api/health/route";
import { GET as getCities } from "../app/api/cities/route";
import { GET as getCity } from "../app/api/cities/[ibge_code]/route";
import { POST as recalculateCity } from "../app/api/cities/[ibge_code]/recalculate/route";
import { GET as getFactors } from "../app/api/factors/route";

describe("Next.js Live API Routes", () => {
  it("GET /api/health returns schema & factor registry metadata", async () => {
    const res = await getHealth();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.schema_version).toBe("2.0.0");
    expect(data.factor_registry_version).toBe("2026.11.1");
    expect(data.municipalities_count).toBe(399);
  });

  it("GET /api/cities filters by query, risk, and limit", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/cities?q=maring%C3%A1&limit=5"
    );
    const res = await getCities(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(1);
    expect(data.municipalities[0].ibge_code).toBe("4115200");

    const badReq = new NextRequest(
      "http://localhost:3000/api/cities?limit=0"
    );
    const badRes = await getCities(badReq);
    expect(badRes.status).toBe(400);
  });

  it("GET /api/cities/[ibge_code] returns 200, 400, or 404 appropriately", async () => {
    const res = await getCity(
      new NextRequest("http://localhost:3000/api/cities/4115200"),
      { params: Promise.resolve({ ibge_code: "4115200" }) }
    );
    expect(res.status).toBe(200);
    const city = await res.json();
    expect(city.metadata.name).toBe("Maringá");

    const badRes = await getCity(
      new NextRequest("http://localhost:3000/api/cities/abc"),
      { params: Promise.resolve({ ibge_code: "abc" }) }
    );
    expect(badRes.status).toBe(400);

    const notFoundRes = await getCity(
      new NextRequest("http://localhost:3000/api/cities/9999999"),
      { params: Promise.resolve({ ibge_code: "9999999" }) }
    );
    expect(notFoundRes.status).toBe(404);
  });

  it("POST /api/cities/[ibge_code]/recalculate keeps partial boundaries unmerged and validates input", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/cities/4115200/recalculate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          override_schema_version: "2.0.0",
          fleet_fuels: {
            diesel_liters: 50000,
            gasoline_liters: 0,
            ethanol_liters: 0,
            reporting_year: 2024,
            coverage_boundary: "MUNICIPAL_GOVERNMENT_FLEET",
            source_reference: "Frota Municipal 2024",
          },
        }),
      }
    );
    const res = await recalculateCity(req, {
      params: Promise.resolve({ ibge_code: "4115200" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.merged_components).toEqual([]);
    expect(data.partial_or_unmerged_estimates).toHaveLength(1);
    expect(data.partial_or_unmerged_estimates[0].calculated_tco2e).toBe(114.6);

    const invalidReq = new NextRequest(
      "http://localhost:3000/api/cities/4115200/recalculate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          override_schema_version: "2.0.0",
          electricity: {
            mwh_per_year: -5,
            reporting_year: 2024,
            coverage_boundary: "MUNICIPALITY_WIDE",
            source_reference: "Copel",
          },
        }),
      }
    );
    const invalidRes = await recalculateCity(invalidReq, {
      params: Promise.resolve({ ibge_code: "4115200" }),
    });
    expect(invalidRes.status).toBe(400);
  });

  it("GET /api/factors returns versioned emission factor registry", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/factors?year=2024&activity_key=grid_electricity_sin"
    );
    const res = await getFactors(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.factor_registry_version).toBe("2026.11.1");
    expect(data.count).toBe(1);
    expect(data.factors[0].factor_id).toBe("MCTI_SIN_GRID_2024");
  });
});
