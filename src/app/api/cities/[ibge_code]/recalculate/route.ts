import { NextRequest, NextResponse } from "next/server";
import {
  LocalOverride,
  migrateLegacyOverride,
  validateLocalOverride,
} from "../../../../../../data/schema/city";
import { isValidIbgeCode, loadCityRecordByCode } from "@/lib/cityDataLoader";
import { FACTOR_REGISTRY_VERSION } from "@/lib/emissionFactors";
import { applyLocalOverrides } from "@/lib/emissionsCalculator";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ibge_code: string }> }
) {
  const { ibge_code } = await context.params;

  if (!isValidIbgeCode(ibge_code)) {
    return NextResponse.json(
      { error: "ibge_code must be a 7-digit string" },
      { status: 400 }
    );
  }

  const baseCity = loadCityRecordByCode(ibge_code);
  if (!baseCity) {
    return NextResponse.json(
      { error: `Municipality ${ibge_code} not found` },
      { status: 404 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 }
    );
  }

  let override: LocalOverride | null = null;
  if (validateLocalOverride(body).valid) {
    override = body as LocalOverride;
  } else {
    const migrated = migrateLegacyOverride(
      body,
      baseCity.emissions_summary.reference_year
    );
    if (migrated && validateLocalOverride(migrated).valid) {
      override = migrated;
    } else {
      const validation = validateLocalOverride(body);
      return NextResponse.json(
        {
          error: "Invalid LocalOverride payload",
          details: validation.errors,
        },
        { status: 400 }
      );
    }
  }

  try {
    const result = applyLocalOverrides(baseCity, override);
    return NextResponse.json({
      schema_version: result.city.schema_version,
      factor_registry_version: FACTOR_REGISTRY_VERSION,
      merged_components: result.merged_components,
      partial_or_unmerged_estimates: result.partial_or_unmerged_estimates,
      city: result.city,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to apply local override",
      },
      { status: 400 }
    );
  }
}
