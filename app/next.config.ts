import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Las pruebas de navegador usan su propia carpeta para no chocar con el `next dev` que tenga abierto la persona.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
