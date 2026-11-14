/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_DASHBOARD_URL?: string;
  readonly PUBLIC_SDK_DOMAIN?: string;
  readonly PUBLIC_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
