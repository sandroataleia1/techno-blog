// Node module-resolution hook, test-only: teaches plain `node --test` how to
// resolve the "@/" path alias that tsconfig.json / Next's bundler already
// understand, so tests can import server modules (lib/offers.ts etc.)
// directly instead of duplicating their logic or reading them as text.
//
// Loaded via `--experimental-loader` (see package.json's "test" script), not
// `--import` + `module.register()`: the register() handshake runs over an
// async MessageChannel per child process, and under node --test's default
// concurrency (many test-file child processes starting at once) that
// handshake can lose the race against the first dynamic import, so the hook
// silently isn't installed yet — observed as an intermittent
// "Cannot find package '@/lib'" failure that only reproduced when the full
// suite ran together, never for a single file in isolation.
// --experimental-loader registers synchronously at process startup instead,
// which doesn't have that race. Confirmed stable across repeated full-suite
// runs after switching.
const root = new URL("../../", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = new URL(`${specifier.slice(2)}.ts`, root).href;
    return nextResolve(target, context);
  }
  // Next.js subpath imports like "next/headers" resolve fine under Next's
  // own bundler (webpack/turbopack auto-append extensions when resolving),
  // but the `next` package declares no "exports" map, so plain Node's ESM
  // resolver — which never guesses an extension for a bare specifier —
  // fails with ERR_MODULE_NOT_FOUND and suggests the real file:
  // node_modules/next/headers.js. Retry with ".js" appended only when the
  // first attempt fails this specific way, so any "next/*" specifier that
  // already resolves on its own is left alone.
  if (specifier.startsWith("next/") && !specifier.endsWith(".js")) {
    try {
      return await nextResolve(specifier, context);
    } catch (e) {
      if (e?.code === "ERR_MODULE_NOT_FOUND") return nextResolve(`${specifier}.js`, context);
      throw e;
    }
  }
  return nextResolve(specifier, context);
}
