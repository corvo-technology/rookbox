import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const wwwPort = Number(process.env.WWW_PORT ?? 4321);

export default defineConfig({
  // Set PUBLIC_SITE_URL when building for a real deployment; the default is a placeholder.
  site: process.env.PUBLIC_SITE_URL ?? "https://box.example.com",
  output: "static",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "pt", "es"],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    react(),
    sitemap({
      i18n: {
        defaultLocale: "en",
        locales: { en: "en-US", pt: "pt-BR", es: "es-ES" },
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    host: "127.0.0.1",
    port: wwwPort,
    strictPort: true,
  },
});
