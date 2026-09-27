export const localAdapterKind = "local-only";
export { createLocalAuthentication } from "./authentication.js";
export { createLocalComposition } from "./composition.js";
export { readLocalConfig } from "./config.js";
export { createLocalNodeServer } from "./node-server.js";
export type { LocalComposition, LocalConfig } from "./composition.js";
