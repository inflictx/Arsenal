/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "1" in web/.env.static (vite build --mode static) → client-only Pages build. */
  readonly VITE_STATIC?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
