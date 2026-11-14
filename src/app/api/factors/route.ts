import { NextRequest, NextResponse } from "next/server";
import {
  EMISSION_FACTOR_REGISTRY,
  FACTOR_REGISTRY_VERSION,
} from "@/lib/emissionFactors";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const activityParam = searchParams.get("activity_key");

  let factors = [...EMISSION_FACTOR_REGISTRY];

  if (yearParam !== null) {
    const year = Number(yearParam);
    if (!Number.isInteger(year)) {
      return NextResponse.json(
        { error: "year must be an integer" },
        { status: 400 }
      );
    }
    factors = factors.filter((f) => f.applicable_year === year);
  }

  if (activityParam) {
    factors = factors.filter((f) => f.activity_key === activityParam);
  }

  return NextResponse.json({
    factor_registry_version: FACTOR_REGISTRY_VERSION,
    count: factors.length,
    factors,
  });
}
