// Needed because Prisma v7's generated TypeScript files use .js extensions
// in their imports (ESM-style), but the actual files are .ts.
// extensionAlias tells webpack to also try .ts when resolving .js imports.

module.exports = (options, _webpack) => ({
  ...options,
  resolve: {
    ...options.resolve,
    extensionAlias: {
      '.js': ['.ts', '.js'],
      '.mjs': ['.mts', '.mjs'],
    },
  },
});
