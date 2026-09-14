import "server-only";

// The app's door to the single storage path builder — 07-content-pipeline.md §3,
// 03-permissions-rls.md §6.
//
// The builder itself is the workspace package `@kareem/storage-paths`, shared
// with the worker image so that "one builder" is a fact rather than a parity
// test (DEC-047; the wave-2 port under worker/src/content/paths.ts is gone).
// App code imports from HERE, never from the package: this module adds
// `server-only`, so a storage path can never be assembled in a client bundle.
// Every shape is covered by tests/unit/storage-paths.test.ts.
export * from "@kareem/storage-paths";
