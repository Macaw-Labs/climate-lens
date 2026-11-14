import { NextResponse } from "next/server";
import { CURRENT_SCHEMA_VERSION } from "../../../../data/schema/city";
import { loadIndexManifest } from "@/lib/cityDataLoader";
import { FACTOR_REGISTRY_VERSION } from "@/lib/emissionFactors";

export async function GET() {
  const manifest = loadIndexManifest();
  return NextResponse.json({
    status: "ok",
    schema_version: CURRENT_SCHEMA_VERSION,
    factor_registry_version: FACTOR_REGISTRY_VERSION,
    municipalities_count: manifest.municipalities.length,
    generated_at: manifest.generated_at,
  });
}
