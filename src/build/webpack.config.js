// Bundle our customized iconv-lite (../iconv-lite/) into a UMD file with the
// same shape as @vscode/iconv-lite-umd. The output drop-in replaces
// node_modules/@vscode/iconv-lite-umd/lib/iconv-lite-umd.js inside a VS Code
// installation - no wrappers, no loaders, just one file.
"use strict"
var path = require("path")

module.exports = {
  mode: "production",
  // Target "web" to match upstream @vscode/iconv-lite-umd (sandboxed renderer).
  // Node-specific globals like Buffer get polyfilled below.
  target: "web",
  entry: path.resolve(__dirname, "../iconv-lite/lib/index.js"),
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "iconv-lite-umd.js",
    library: {
      type: "umd",
      // No `name` -> exports merged onto global (matches upstream output).
    },
    globalObject: "typeof self !== 'undefined' ? self : this",
  },
  resolve: {
    // iconv-lite imports `safer-buffer`, which in turn requires `buffer`.
    // In a web target webpack 5 doesn't auto-polyfill node core modules and
    // it resolves modules from the importing file's tree, so simply listing
    // the build dir's node_modules first lets it find the polyfill.
    modules: [
      path.resolve(__dirname, "node_modules"),
      "node_modules",
    ],
    fallback: {
      buffer: require.resolve("buffer"),
    },
  },
  // Keep output ASCII-safe and readable enough to spot-check.
  optimization: {
    minimize: true,
  },
  // Silence webpack's perf warnings; the bundle is naturally large because of
  // the DBCS code-page tables.
  performance: { hints: false },
}
