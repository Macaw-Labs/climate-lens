"use client";

import React from "react";
import { ClimateRiskClass, ConfidenceTier } from "../../data/schema/city";

const TIER_CONFIG: Record<
  ConfidenceTier,
  { label: string; shortLabel: string; classes: string; dotClass: string }
> = {
  T1_LOCAL: {
    label: "T1 Local Verified",
    shortLabel: "T1_LOCAL",
    classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  T2_MODELED: {
    label: "T2 Spatially Modeled",
    shortLabel: "T2_MODELED",
    classes: "bg-sky-50 text-sky-800 border-sky-200",
    dotClass: "bg-sky-500",
  },
  T3_PROXY: {
    label: "T3 National Proxy",
    shortLabel: "T3_PROXY",
    classes: "bg-amber-50 text-amber-800 border-amber-200",
    dotClass: "bg-amber-500",
  },
};

export function ConfidenceBadge({
  tier,
  compact = false,
}: {
  tier: ConfidenceTier;
  compact?: boolean;
}) {
  const cfg = TIER_CONFIG[tier];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight ${cfg.classes}`}
      title={cfg.label}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
      {compact ? cfg.shortLabel : cfg.label}
    </span>
  );
}

const RISK_CONFIG: Record<
  ClimateRiskClass,
  { label: string; classes: string; barClass: string }
> = {
  VERY_LOW: {
    label: "Very Low",
    classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
    barClass: "bg-emerald-500",
  },
  LOW: {
    label: "Low",
    classes: "bg-lime-50 text-lime-800 border-lime-200",
    barClass: "bg-lime-500",
  },
  MEDIUM: {
    label: "Medium",
    classes: "bg-amber-50 text-amber-800 border-amber-200",
    barClass: "bg-amber-500",
  },
  HIGH: {
    label: "High",
    classes: "bg-orange-50 text-orange-800 border-orange-200",
    barClass: "bg-orange-500",
  },
  VERY_HIGH: {
    label: "Very High",
    classes: "bg-rose-50 text-rose-800 border-rose-200",
    barClass: "bg-rose-600",
  },
};

export function RiskClassBadge({ riskClass }: { riskClass: ClimateRiskClass }) {
  const cfg = RISK_CONFIG[riskClass] ?? RISK_CONFIG.MEDIUM;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${cfg.classes}`}
    >
      {cfg.label} ({riskClass})
    </span>
  );
}

export function getRiskBarClass(riskClass: ClimateRiskClass): string {
  return (RISK_CONFIG[riskClass] ?? RISK_CONFIG.MEDIUM).barClass;
}
