import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const REPO_URL = "https://github.com/Macaw-Labs/climate-lens";
const README_URL = "https://github.com/Macaw-Labs/climate-lens/blob/main/README.md";

interface MastheadProps {
  subtitle: string;
  schemaVersion: string;
  noPrint?: boolean;
  activePage?: "home" | "about" | "city";
}

export function Masthead({
  subtitle,
  schemaVersion,
  noPrint = false,
  activePage,
}: MastheadProps) {
  return (
    <div
      className={`${noPrint ? "no-print " : ""}border-b border-[#d6d0c4] bg-[#fcfaf5]`}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[11px] font-mono uppercase tracking-widest text-[#57534e] sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <span className="inline-block h-2 w-2 bg-[#1b4332]" />
          <Link
            href="/"
            className="font-semibold text-[#171717] transition hover:text-[#1b4332]"
          >
            Municipal Climate Lens
          </Link>
          <span className="text-[#a8a29e]">/</span>
          <span>{subtitle}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px]">
          <span>SEEG Coleção 14.0</span>
          <span className="text-[#a8a29e]">·</span>
          <span>AdaptaBrasil MCTI</span>
          <span className="text-[#a8a29e]">·</span>
          <span>IBGE Censo 2022</span>
          <span className="border border-[#d6d0c4] bg-[#f5f2eb] px-1.5 py-0.5 text-[#171717]">
            v{schemaVersion}
          </span>
          <Link
            href="/about"
            className={`inline-flex items-center border px-1.5 py-0.5 transition ${
              activePage === "about"
                ? "border-[#1b4332] bg-[#1b4332] text-[#fcfaf5]"
                : "border-[#d6d0c4] bg-[#f5f2eb] text-[#171717] hover:border-[#1b4332] hover:text-[#1b4332]"
            }`}
          >
            About
          </Link>
          <a
            href={README_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 border border-[#d6d0c4] bg-[#f5f2eb] px-1.5 py-0.5 text-[#171717] transition hover:border-[#1b4332] hover:text-[#1b4332]"
          >
            README
            <ArrowUpRight className="h-3 w-3" />
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 border border-[#d6d0c4] bg-[#f5f2eb] px-1.5 py-0.5 text-[#171717] transition hover:border-[#1b4332] hover:text-[#1b4332]"
          >
            GitHub
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
