import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-ibm-sans",
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-mono",
  weight: ["400", "500", "600"],
});

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
    <html
      lang="en"
      className={`${newsreader.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-screen bg-[#f5f2eb] font-sans text-[#171717] antialiased selection:bg-[#1b4332]/15 selection:text-[#1b4332]">
        {children}
      </body>
    </html>
  );
}
