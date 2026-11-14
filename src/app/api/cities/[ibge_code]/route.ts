import { NextRequest, NextResponse } from "next/server";
import { isValidIbgeCode, loadCityRecordByCode } from "@/lib/cityDataLoader";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ ibge_code: string }> }
) {
  const { ibge_code } = await context.params;

  if (!isValidIbgeCode(ibge_code)) {
    return NextResponse.json(
      { error: "ibge_code must be a 7-digit string" },
      { status: 400 }
    );
  }

  const city = loadCityRecordByCode(ibge_code);
  if (!city) {
    return NextResponse.json(
      { error: `Municipality ${ibge_code} not found` },
      { status: 404 }
    );
  }

  return NextResponse.json(city);
}
