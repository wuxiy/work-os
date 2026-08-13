// Single entrypoint for the plugin SDK. Imported by main, preload, renderer,
// and every built-in / third-party plugin. Keeping the manifest schema + API
// types in one module is what stops the contract from drifting (skill ref 04).
export * from './manifest'
export * from './api'
export * from './marketplace'
export { wb } from './sdk'
