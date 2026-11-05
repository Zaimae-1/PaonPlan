import type { NextConfig } from "next";

const nextConfig: NextConfig = { devIndicators: false, serverExternalPackages: ["pg", "pdfkit"], outputFileTracingIncludes: { "/api/usaha/laporan": ["./public/fonts/*"] } };
export default nextConfig;
