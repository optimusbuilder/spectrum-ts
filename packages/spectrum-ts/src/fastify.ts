// Re-export of the runtime's Fastify webhook handler so the
// `spectrum-ts/fastify` import path works through the metapackage.
// biome-ignore lint/performance/noBarrelFile: clean entrypoint for the fastify adapter
export * from "@spectrum-ts/core/fastify";
