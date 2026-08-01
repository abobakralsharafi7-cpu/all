/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,

  // ===== تشويش وتصغير كود الجافاسكربت =====
  productionBrowserSourceMaps: false, // منع كشف الكود الأصلي
  reactStrictMode: true,
  poweredByHeader: false,

  compiler: {
    // إزالة كل console.* من نسخة الإنتاج (منع تسريب البيانات في السجلات)
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },

  generateBuildId: async () => "proof-daftar",
};

export default nextConfig;
