/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_DASHBOARD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
