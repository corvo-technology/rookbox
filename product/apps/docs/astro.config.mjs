import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

const docsPort = Number(process.env.DOCS_PORT ?? 4322);

/** A sidebar entry for a page. Its label comes from the page title in each language. */
const page = (slug) => ({ slug });

export default defineConfig({
  // Set PUBLIC_SITE_URL when building for a real deployment.
  site: process.env.PUBLIC_SITE_URL ?? "https://docs.rookbox.run",
  output: "static",
  integrations: [
    starlight({
      title: "Rookbox Docs",
      description: "Máquinas Linux na nuvem para agentes. Use com o SDK da E2B ou com a CLI.",
      favicon: "/favicon.svg",
      defaultLocale: "root",
      locales: {
        root: { label: "Português", lang: "pt-BR" },
        en: { label: "English", lang: "en" },
      },
      lastUpdated: false,
      pagination: true,
      customCss: ["./src/styles/fonts.css", "./src/styles/theme.css"],
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
        SocialIcons: "./src/components/SocialIcons.astro",
      },
      sidebar: [
        {
          label: "Começar",
          translations: { en: "Get started" },
          items: [page("quickstart"), page("cli")],
        },
        {
          label: "Conceitos",
          translations: { en: "Concepts" },
          items: [
            page("concepts/machines"),
            page("concepts/lifecycle"),
            page("concepts/templates"),
            page("concepts/desktop"),
            page("concepts/ports"),
            page("concepts/limits"),
          ],
        },
        {
          label: "Guias",
          translations: { en: "Guides" },
          items: [page("guides/ci"), page("guides/browser-agent"), page("guides/long-running")],
        },
        {
          label: "Segurança",
          translations: { en: "Security" },
          items: [page("security")],
        },
        {
          label: "Referência",
          translations: { en: "Reference" },
          items: [
            page("reference/env"),
            page("reference/errors"),
            page("reference/compat"),
            page("faq"),
          ],
        },
        {
          label: "Rookbox",
          items: [
            {
              label: "rookbox.run",
              link: "https://rookbox.run",
              attrs: { class: "only-mobile" },
            },
            {
              label: "Painel",
              translations: { en: "Dashboard" },
              link: "https://app.rookbox.run",
              attrs: { class: "only-mobile" },
            },
          ],
        },
      ],
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: docsPort,
    strictPort: true,
  },
});
