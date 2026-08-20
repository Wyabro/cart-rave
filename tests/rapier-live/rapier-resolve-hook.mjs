/** Node loader: Rapier's published ESM omits .js extensions. */
export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || "";
  if (
    parent.includes("@dimforge/rapier3d")
    && specifier.startsWith(".")
    && !specifier.startsWith("node:")
    && !specifier.endsWith(".js")
    && !specifier.endsWith(".wasm")
  ) {
    for (const candidate of [`${specifier}.js`, `${specifier}/index.js`]) {
      try {
        return await nextResolve(candidate, context);
      } catch {
        /* try next */
      }
    }
  }
  return nextResolve(specifier, context);
}
