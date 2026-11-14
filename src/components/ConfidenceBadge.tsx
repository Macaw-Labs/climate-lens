"use client";

import React from "react";
import {
  AvailabilityStatus,
  ClimateRiskClass,
  CoverageStatus,
  DataOrigin,
  VerificationStatus,
} from "../../data/schema/city";

const ORIGIN_CONFIG: Record<
  DataOrigin | "MIXED",
  { label: string; shortLabel: string; classes: string; dotClass: string }
> = {
  LOCAL: {
    label: "Origin: Local",
    shortLabel: "LOCAL",
    classes: "bg-[#1b4332]/10 text-[#1b4332] border-[#1b4332]/30",
    dotClass: "bg-[#1b4332]",
  },
  MODELED: {
    label: "Origin: Modeled",
    shortLabel: "MODELED",
    classes: "bg-[#1d4ed8]/10 text-[#1d4ed8] border-[#1d4ed8]/30",
    dotClass: "bg-[#1d4ed8]",
  },
  PROXY: {
    label: "Origin: Proxy",
    shortLabel: "PROXY",
    classes: "bg-[#b45309]/10 text-[#b45309] border-[#b45309]/30",
    dotClass: "bg-[#b45309]",
  },
  MIXED: {
    label: "Origin: Mixed",
    shortLabel: "MIXED",
    classes: "bg-[#f5f2eb] text-[#57534e] border-[#d6d0c4]",
    dotClass: "bg-[#57534e]",
  },
};

export function OriginBadge({
  origin,
  compact = false,
}: {
  origin: DataOrigin | "MIXED";
  compact?: boolean;
}) {
  const cfg = ORIGIN_CONFIG[origin];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${cfg.classes}`}
      title={`${cfg.label} (Provenance origin category — distinct from IPCC methodological Tiers 1/2/3)`}
    >
      <span className={`h-1.5 w-1.5 ${cfg.dotClass}`} />
      {compact ? cfg.shortLabel : cfg.label}
    </span>
  );
}

const VERIFICATION_CONFIG: Record<
  VerificationStatus,
  { label: string; classes: string }
> = {
  DOCUMENTED: {
    label: "Documented",
    classes: "bg-[#1d4ed8]/10 text-[#1d4ed8] border-[#1d4ed8]/30",
  },
  REVIEW_REQUIRED: {
    label: "Review Required",
    classes: "bg-[#b45309]/10 text-[#b45309] border-[#b45309]/30",
  },
  UNVERIFIED: {
    label: "Unverified",
    classes: "bg-[#9a3412]/10 text-[#9a3412] border-[#9a3412]/30",
  },
  INDEPENDENTLY_VERIFIED: {
    label: "Independently Audited",
    classes: "bg-[#1b4332]/10 text-[#1b4332] border-[#1b4332]/30",
  },
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const cfg = VERIFICATION_CONFIG[status] ?? VERIFICATION_CONFIG.UNVERIFIED;
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${cfg.classes}`}
    >
      {cfg.label}
    </span>
  );
}

export function CoverageBadge({ status }: { status: CoverageStatus }) {
  const map: Record<CoverageStatus, { label: string; classes: string }> = {
    COMPLETE: {
      label: "Complete Coverage",
      classes: "bg-[#1b4332]/10 text-[#1b4332] border-[#1b4332]/30",
    },
    PARTIAL: {
      label: "Partial Estimate",
      classes: "bg-[#b45309]/10 text-[#b45309] border-[#b45309]/30",
    },
    UNAVAILABLE: {
      label: "Data Unavailable",
      classes: "bg-[#f5f2eb] text-[#57534e] border-[#d6d0c4]",
    },
  };
  const cfg = map[status];
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${cfg.classes}`}
    >
      {cfg.label}
    </span>
  );
}

const RISK_CONFIG: Record<
  ClimateRiskClass,
  { label: string; classes: string; barClass: string }
> = {
  VERY_LOW: {
    label: "Very Low",
    classes: "bg-[#1b4332]/10 text-[#1b4332] border-[#1b4332]/30",
    barClass: "bg-[#1b4332]",
  },
  LOW: {
    label: "Low",
    classes: "bg-[#1b4332]/10 text-[#1b4332] border-[#1b4332]/30",
    barClass: "bg-[#1b4332]/80",
  },
  MEDIUM: {
    label: "Medium",
    classes: "bg-[#eab308]/15 text-[#854d0e] border-[#eab308]/40",
    barClass: "bg-[#eab308]",
  },
  HIGH: {
    label: "High",
    classes: "bg-[#d97706]/15 text-[#b45309] border-[#d97706]/40",
    barClass: "bg-[#d97706]",
  },
  VERY_HIGH: {
    label: "Very High",
    classes: "bg-[#9a3412]/10 text-[#9a3412] border-[#9a3412]/35",
    barClass: "bg-[#9a3412]",
  },
};

export function RiskClassBadge({
  riskClass,
  availabilityStatus = "AVAILABLE",
}: {
  riskClass: ClimateRiskClass | null;
  availabilityStatus?: AvailabilityStatus;
}) {
  if (availabilityStatus !== "AVAILABLE" || riskClass === null) {
    return (
      <span className="inline-flex items-center border border-[#d6d0c4] bg-[#f5f2eb] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-[#57534e]">
        Data unavailable
      </span>
    );
  }
  const cfg = RISK_CONFIG[riskClass] ?? RISK_CONFIG.MEDIUM;
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${cfg.classes}`}
    >
      {cfg.label} ({riskClass})
    </span>
  );
}

export function getRiskBarClass(riskClass: ClimateRiskClass | null): string {
  if (!riskClass) return "bg-[#d6d0c4]";
  return (RISK_CONFIG[riskClass] ?? RISK_CONFIG.MEDIUM).barClass;
}
