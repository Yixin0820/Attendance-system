/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端地址，默认 http://127.0.0.1:8000 */
  readonly VITE_API_BASE?: string;
  /** 是否启用后端；false 表示纯前端演示模式 */
  readonly VITE_USE_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
