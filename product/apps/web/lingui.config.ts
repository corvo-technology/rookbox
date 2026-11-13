import { defineConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "pt-BR", "es"],
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["src"],
      exclude: ["**/locales/**", "**/*.test.*"],
    },
  ],
  compileNamespace: "es",
  // Keep file paths in `#:` origins, but drop line numbers, so a shift in a file does not
  // rewrite every catalog.
  format: formatter({ lineNumbers: false }),
});
