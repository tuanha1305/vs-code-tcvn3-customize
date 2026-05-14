#!/usr/bin/env node
// Build the dist/ artifacts that get committed to the public repo.
// Inputs (committed under src/ in this repo):
//   src/iconv-lite/                  customized iconv-lite source
//   src/build/                       webpack config + build deps
//   src/search-patch.js              generator for the search-side patch
// Outputs (committed under dist/):
//   dist/iconv-lite-umd.js     UMD bundle (drop-in replace of @vscode/iconv-lite-umd)
//   dist/search-patch.js       { prepend, anchor, replacement } module
//   dist/workbench-patch.js    { anchor, injection } module
//   dist/version.json          { version, builtAt, sha256 }
//
// Run from repo root:
//   cd src/build && npm install && npm run build && cd ../..
//   node scripts/generate-dist.js
"use strict"
var fs = require("fs")
var path = require("path")
var crypto = require("crypto")
var child = require("child_process")

var here = __dirname
var repoRoot = path.dirname(here)         // vs-code-tcvn3-customize/
var srcDir = path.join(repoRoot, "src")
var distDir = path.join(repoRoot, "dist")
fs.mkdirSync(distDir, { recursive: true })

function log (msg) { console.log("[gen-dist] " + msg) }
function fail (msg) { console.error("[gen-dist] ERROR: " + msg); process.exit(1) }

// 0. Auto-build the bundle if missing or stale (developer convenience).
var bundleSrc = path.join(srcDir, "build", "dist", "iconv-lite-umd.js")
var codecSrc = path.join(srcDir, "iconv-lite", "encodings", "tcvn3.js")
var needBuild = !fs.existsSync(bundleSrc) ||
                fs.statSync(codecSrc).mtimeMs > fs.statSync(bundleSrc).mtimeMs
if (needBuild) {
  if (!fs.existsSync(path.join(srcDir, "build", "node_modules"))) {
    log("Installing build deps (one-time)...")
    child.execSync("npm install --silent --no-audit --no-fund",
      { cwd: path.join(srcDir, "build"), stdio: "inherit" })
  }
  log("Building UMD bundle...")
  child.execSync("npm run build --silent",
    { cwd: path.join(srcDir, "build"), stdio: "inherit" })
}

// 1. Copy the UMD bundle.
if (!fs.existsSync(bundleSrc)) {
  fail("Bundle missing at " + bundleSrc + " — webpack build did not produce output.")
}
var bundle = fs.readFileSync(bundleSrc)
fs.writeFileSync(path.join(distDir, "iconv-lite-umd.js"), bundle)
log("iconv-lite-umd.js   " + bundle.length + " bytes")

// 2. Generate search patch fragments as RAW TEXT FILES (one per piece).
//    This lets the bash/PowerShell installers operate on them directly with
//    cat / head -c / tail -c / Substring — no Node runtime required.
var buildSearchPatch = require(path.join(srcDir, "search-patch.js"))
var sp = buildSearchPatch()
fs.writeFileSync(path.join(distDir, "search-patch-prepend.js"), sp.prepend)
fs.writeFileSync(path.join(distDir, "search-patch-anchor.txt"), sp.anchor)
fs.writeFileSync(path.join(distDir, "search-patch-replacement.txt"), sp.replacement)
fs.writeFileSync(path.join(distDir, "uy-patch-anchor.txt"), sp.uyAnchor)
fs.writeFileSync(path.join(distDir, "uy-patch-replacement.txt"), sp.uyReplacement)
fs.writeFileSync(path.join(distDir, "replace-offset-anchor.txt"), sp.replaceOffsetAnchor)
fs.writeFileSync(path.join(distDir, "replace-offset-replacement.txt"), sp.replaceOffsetReplacement)
log("search-patch-prepend.js           " + sp.prepend.length + " bytes")
log("search-patch-anchor.txt           " + sp.anchor.length + " bytes")
log("search-patch-replacement.txt      " + sp.replacement.length + " bytes")
log("uy-patch-anchor.txt               " + sp.uyAnchor.length + " bytes")
log("uy-patch-replacement.txt          " + sp.uyReplacement.length + " bytes")
log("replace-offset-anchor.txt         " + sp.replaceOffsetAnchor.length + " bytes")
log("replace-offset-replacement.txt    " + sp.replaceOffsetReplacement.length + " bytes")

// Also keep the legacy JS-module form for `scripts/apply.js` (advanced users
// who still want the Node entry point). Bootstrap installers don't read this.
var spModule = "// Auto-generated. Do not edit by hand.\n" +
  'module.exports = {prepend: require("fs").readFileSync(__dirname + "/search-patch-prepend.js", "utf8"),' +
  ' anchor: require("fs").readFileSync(__dirname + "/search-patch-anchor.txt", "utf8"),' +
  ' replacement: require("fs").readFileSync(__dirname + "/search-patch-replacement.txt", "utf8")}\n'
fs.writeFileSync(path.join(distDir, "search-patch.js"), spModule)

// 3. Workbench (UI) patch fragments.
var workbenchAnchor = 'windows1258:{labelLong:"Vietnamese (Windows 1258)",labelShort:"Windows 1258",order:35}'
var workbenchInject = ',tcvn3:{labelLong:"Vietnamese (TCVN3)",labelShort:"TCVN3",order:35.5}'
fs.writeFileSync(path.join(distDir, "workbench-patch-anchor.txt"), workbenchAnchor)
fs.writeFileSync(path.join(distDir, "workbench-patch-injection.txt"), workbenchInject)
log("workbench-patch-anchor.txt    " + workbenchAnchor.length + " bytes")
log("workbench-patch-injection.txt " + workbenchInject.length + " bytes")

var wbModule = "// Auto-generated. Do not edit by hand.\n" +
  'module.exports = {anchor: require("fs").readFileSync(__dirname + "/workbench-patch-anchor.txt", "utf8"),' +
  ' injection: require("fs").readFileSync(__dirname + "/workbench-patch-injection.txt", "utf8")}\n'
fs.writeFileSync(path.join(distDir, "workbench-patch.js"), wbModule)

// 4. Version manifest. Deterministic — no timestamp, so a clean rebuild
//    produces a byte-identical version.json. CI relies on this to verify
//    that committed dist/ matches src/.
var version = "1.3.0" // bump on releases
var bundleSha = crypto.createHash("sha256").update(bundle).digest("hex")
var versionInfo = {
  version: version,
  bundleSha256: bundleSha,
}
fs.writeFileSync(path.join(distDir, "version.json"), JSON.stringify(versionInfo, null, 2) + "\n")
log("version.json         v" + version + " sha256=" + bundleSha.slice(0, 12) + "...")

log("Done.")
