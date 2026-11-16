import type { NextConfig } from "next";

const isStaticExport = process.env.NEXT_OUTPUT_EXPORT === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(isStaticExport ? { output: "export" } : {}),
  ...(basePath ? { basePath } : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
