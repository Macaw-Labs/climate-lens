import { NextRequest, NextResponse } from "next/server";
import { loadIndexManifest } from "@/lib/cityDataLoader";

export async function GET(request: NextRequest) {
  const manifest = loadIndexManifest();
  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const risk = searchParams.get("risk")?.trim().toUpperCase() ?? "";
  const sector = searchParams.get("sector")?.trim().toUpperCase() ?? "";
  const limitRaw = searchParams.get("limit");

  let results = manifest.municipalities;

  if (q) {
    results = results.filter(
      (m) => m.name.toLowerCase().includes(q) || m.ibge_code.includes(q)
    );
  }

  if (risk) {
    if (risk === "UNAVAILABLE") {
      results = results.filter(
        (m) =>
          !m.top_climate_risk ||
          m.top_climate_risk.availability_status !== "AVAILABLE" ||
          m.top_climate_risk.risk_class === null
      );
    } else {
      results = results.filter(
        (m) =>
          m.top_climate_risk?.availability_status === "AVAILABLE" &&
          m.top_climate_risk.risk_class === risk
      );
    }
  }

  if (sector) {
    results = results.filter((m) => m.dominant_sector === sector);
  }

  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return NextResponse.json(
        { error: "limit must be a positive integer" },
        { status: 400 }
      );
    }
    results = results.slice(0, Math.min(parsed, 399));
  }

  return NextResponse.json({
    schema_version: manifest.schema_version,
    generated_at: manifest.generated_at,
    count: results.length,
    municipalities: results,
  });
}
