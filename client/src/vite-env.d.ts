/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STREETS_TILE_URL?: string;
  readonly VITE_STREETS_ATTRIBUTION?: string;
  readonly VITE_SATELLITE_TILE_URL?: string;
  readonly VITE_SATELLITE_ATTRIBUTION?: string;
  readonly VITE_LABELS_TILE_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
