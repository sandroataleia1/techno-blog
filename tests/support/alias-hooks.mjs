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
  return nextResolve(specifier, context);
}
