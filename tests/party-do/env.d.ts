/// <reference types="@cloudflare/vitest-pool-workers" />

declare module "cloudflare:workers" {
  interface Env {
    CartRaveServer: DurableObjectNamespace;
    ERROR_LOG: DurableObjectNamespace;
    ANALYTICS_LOG: DurableObjectNamespace;
    CAPTURE_LOG: DurableObjectNamespace;
    ASSETS?: Fetcher;
  }
}
