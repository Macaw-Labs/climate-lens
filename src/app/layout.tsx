import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Municipal Climate Lens | Paraná Baseline & Data-Gap Explorer",
  description:
    "Open-source municipal GHG baseline and climate risk explorer combining SEEG Coleção 14.0, AdaptaBrasil MCTI, and IBGE Censo 2022 with explicit provenance tiers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
