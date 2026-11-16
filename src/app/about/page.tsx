import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { CityIndexManifest } from "../../../data/schema/city";
import { Masthead } from "@/components/Masthead";

const REPO_URL = "https://github.com/Macaw-Labs/climate-lens";
const README_URL =
  "https://github.com/Macaw-Labs/climate-lens/blob/main/README.md";
const RESEARCH_DOC_URL =
  "https://github.com/Macaw-Labs/climate-lens/blob/main/docs/research-and-positioning.md";

function loadSchemaVersion(): string {
  const filePath = path.join(process.cwd(), "public", "data", "index.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const manifest = JSON.parse(raw) as CityIndexManifest;
  return manifest.schema_version;
}

export default function AboutPage() {
  const schemaVersion = loadSchemaVersion();

  return (
    <div className="min-h-screen bg-[#f5f2eb] text-[#171717]">
      <Masthead
        subtitle="About & Methodology"
        schemaVersion={schemaVersion}
        activePage="about"
      />

      <header className="border-b border-[#d6d0c4] bg-[#fcfaf5]">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#57534e] transition hover:text-[#1b4332]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to all municipalities
          </Link>
          <h1 className="font-serif text-3xl font-normal tracking-tight text-[#171717] sm:text-4xl">
            About Municipal Climate Lens
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#57534e] sm:text-base">
            An open municipal climate baseline and data-gap explorer for all 399
            municipalities of Paraná (PR), Brazil—combining{" "}
            <strong className="font-semibold text-[#171717]">
              SEEG Municípios Coleção 14.0
            </strong>
            ,{" "}
            <strong className="font-semibold text-[#171717]">
              AdaptaBrasil MCTI
            </strong>
            , and{" "}
            <strong className="font-semibold text-[#171717]">
              IBGE Censo 2022
            </strong>
            .
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5 font-mono text-[11px] uppercase tracking-wider">
            <a
              href={README_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 border border-[#1b4332] bg-[#1b4332] px-3 py-1.5 text-[#fcfaf5] transition hover:bg-[#143325]"
            >
              Read Repository README
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 border border-[#d6d0c4] bg-[#f5f2eb] px-3 py-1.5 text-[#171717] transition hover:border-[#1b4332] hover:text-[#1b4332]"
            >
              GitHub Repository
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <a
              href={RESEARCH_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 border border-[#d6d0c4] bg-[#f5f2eb] px-3 py-1.5 text-[#171717] transition hover:border-[#1b4332] hover:text-[#1b4332]"
            >
              Research &amp; Positioning
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="border border-[#d6d0c4] bg-[#fcfaf5] p-6">
          <h2 className="font-serif text-xl font-normal text-[#171717]">
            Purpose &amp; Intended Users
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#57534e]">
            Climate Lens helps municipal environment and climate staff,
            technical-assistance teams, and researchers inspect a municipality&apos;s
            climate baseline, understand how its estimates were produced and
            supported, and identify the next local evidence to collect (such as
            electricity consumption, fuel sales, and landfill tonnage).
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#78716c]">
            Note: These user needs and benefits are research hypotheses rather
            than validated adoption or impact findings.
          </p>
        </section>

        <section className="border border-[#d6d0c4] bg-[#fcfaf5] p-6">
          <h2 className="font-serif text-xl font-normal text-[#171717]">
            Key Reliability Principles (Schema v{schemaVersion})
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-[#57534e]">
            <div className="border-l-2 border-[#1b4332] pl-4">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#171717]">
                1. Explicit Missing Data (null vs. Genuine 0.0)
              </h3>
              <p className="mt-1">
                Unmeasured emission components (notably Scope 2{" "}
                <code className="bg-[#f5f2eb] px-1 py-0.5 font-mono text-xs text-[#171717]">
                  STATIONARY_ENERGY.grid_electricity
                </code>
                , which is not reported in SEEG Municípios) and unavailable
                AdaptaBrasil risk indices are represented explicitly as{" "}
                <code className="bg-[#f5f2eb] px-1 py-0.5 font-mono text-xs text-[#171717]">
                  null
                </code>{" "}
                with{" "}
                <code className="bg-[#f5f2eb] px-1 py-0.5 font-mono text-xs text-[#171717]">
                  availability_status: &quot;UNAVAILABLE&quot;
                </code>
                . Genuine zeros (such as{" "}
                <code className="bg-[#f5f2eb] px-1 py-0.5 font-mono text-xs text-[#171717]">
                  IPPU = 0.0
                </code>
                ) remain{" "}
                <code className="bg-[#f5f2eb] px-1 py-0.5 font-mono text-xs text-[#171717]">
                  0.0
                </code>{" "}
                with{" "}
                <code className="bg-[#f5f2eb] px-1 py-0.5 font-mono text-xs text-[#171717]">
                  availability_status: &quot;AVAILABLE&quot;
                </code>
                .
              </p>
            </div>

            <div className="border-l-2 border-[#1d4ed8] pl-4">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#171717]">
                2. Data Origin vs. Evidence Verification vs. IPCC Tiers
              </h3>
              <p className="mt-1">
                Data Origin (<strong className="text-[#171717]">LOCAL</strong>,{" "}
                <strong className="text-[#171717]">MODELED</strong>,{" "}
                <strong className="text-[#171717]">PROXY</strong>, or{" "}
                <strong className="text-[#171717]">MIXED</strong>) records how an
                estimate was produced and is distinct from IPCC methodological
                Tiers (1/2/3). Verification Status (
                <strong className="text-[#171717]">UNVERIFIED</strong>,{" "}
                <strong className="text-[#171717]">DOCUMENTED</strong>,{" "}
                <strong className="text-[#171717]">REVIEW_REQUIRED</strong>,{" "}
                <strong className="text-[#171717]">
                  INDEPENDENTLY_VERIFIED
                </strong>
                ) tracks evidence quality independently.
              </p>
            </div>

            <div className="border-l-2 border-[#b45309] pl-4">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#171717]">
                3. Inventory Boundary &amp; Reporting Period Enforcement
              </h3>
              <p className="mt-1">
                Only{" "}
                <code className="bg-[#f5f2eb] px-1 py-0.5 font-mono text-xs text-[#171717]">
                  MUNICIPALITY_WIDE
                </code>{" "}
                inputs matching the baseline{" "}
                <code className="bg-[#f5f2eb] px-1 py-0.5 font-mono text-xs text-[#171717]">
                  reference_year
                </code>{" "}
                and using{" "}
                <code className="bg-[#f5f2eb] px-1 py-0.5 font-mono text-xs text-[#171717]">
                  VERIFIED
                </code>{" "}
                emission factors replace citywide baseline subsectors. Partial
                boundaries, mismatched years, or unverified factors are
                calculated deterministically and kept separate in{" "}
                <code className="bg-[#f5f2eb] px-1 py-0.5 font-mono text-xs text-[#171717]">
                  partial_or_unmerged_estimates
                </code>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="border border-[#d6d0c4] bg-[#fcfaf5] p-6">
          <h2 className="font-serif text-xl font-normal text-[#171717]">
            Scope &amp; Interpretation
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#57534e]">
            The current focus is baseline interpretation and evidence
            improvement. Shared inventory management, action prioritization,
            climate-finance preparation, and independent verification are
            outside the implemented scope. Provenance shares describe the
            composition of available emissions estimates and are not accuracy
            scores or uncertainty intervals.
          </p>
        </section>
      </main>
    </div>
  );
}
