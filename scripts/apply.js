#!/usr/bin/env node
// Apply pre-built TCVN3 patches to a VS Code installation.
//
// Usage:
//   node apply.js [--with-ui] [--vscode <path>] [--dist <dir>]
//
// Expects sibling artifacts (downloaded by the bootstrap installer or shipped
// by the repo):
//   <dist>/iconv-lite-umd.js     - drop-in replacement bundle (~309 KB)
//   <dist>/search-patch.js       - { prepend, anchor, replacement }
//   <dist>/workbench-patch.js    - { anchor, injection }
//   <dist>/version.json          - { version, builtAt, bundleSha256 }
//
// Default <dist> is `<this-script>/../dist/`.
"use strict"
var fs = require("fs")
var path = require("path")
var os = require("os")

var args = process.argv.slice(2)
var withUi = args.includes("--with-ui")
function readArg (name) {
  var i = args.indexOf(name)
  return (i !== -1 && args[i + 1]) ? args[i + 1] : null
}
var explicit = readArg("--vscode")
var distDir = readArg("--dist") || path.resolve(__dirname, "..", "dist")

function log (msg) { console.log("[tcvn3] " + msg) }
function warn (msg) { console.warn("[tcvn3] WARN: " + msg) }
function fail (msg) { console.error("[tcvn3] ERROR: " + msg); process.exit(1) }

// ---- Verify dist/ ----------------------------------------------------------

var bundlePath = path.join(distDir, "iconv-lite-umd.js")
var searchPatchPath = path.join(distDir, "search-patch.js")
var workbenchPatchPath = path.join(distDir, "workbench-patch.js")
var versionPath = path.join(distDir, "version.json")

;[bundlePath, searchPatchPath, workbenchPatchPath].forEach(function (p) {
  if (!fs.existsSync(p)) fail("Missing artifact: " + p)
})

var version = fs.existsSync(versionPath)
  ? JSON.parse(fs.readFileSync(versionPath, "utf8")) : { version: "unknown" }
log("Patch version: " + version.version)

var searchPatch = require(searchPatchPath)
var workbenchPatch = require(workbenchPatchPath)

// ---- Locate VS Code apps ---------------------------------------------------

var candidates = []
if (explicit) {
  candidates.push(explicit)
} else {
  var home = os.homedir()
  candidates.push(path.join(home, "AppData", "Local", "Programs", "Microsoft VS Code"))
  candidates.push("C:\\Program Files\\Microsoft VS Code")
  candidates.push("C:\\Program Files (x86)\\Microsoft VS Code")
  candidates.push("/usr/share/code")
  candidates.push("/usr/share/code-insiders")
  candidates.push("/snap/code/current/usr/share/code")
  candidates.push("/Applications/Visual Studio Code.app/Contents/Resources/app")
  candidates.push("/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app")
}

function isApp (dir) {
  return fs.existsSync(path.join(dir, "package.json")) &&
         fs.existsSync(path.join(dir, "node_modules", "@vscode", "iconv-lite-umd",
                                 "lib", "iconv-lite-umd.js"))
}

function findAppDirs (root) {
  var found = []
  var direct = path.join(root, "resources", "app")
  if (isApp(direct)) found.push(direct)
  if (isApp(root)) found.push(root)            // for macOS layout
  if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
    var entries
    try { entries = fs.readdirSync(root) } catch (_e) { return found }
    for (var i = 0; i < entries.length; i++) {
      var p = path.join(root, entries[i], "resources", "app")
      if (isApp(p) && found.indexOf(p) === -1) found.push(p)
    }
  }
  return found
}

var appDirs = []
candidates.forEach(function (c) {
  findAppDirs(c).forEach(function (d) {
    if (appDirs.indexOf(d) === -1) appDirs.push(d)
  })
})
if (appDirs.length === 0) {
  fail("No VS Code installation found.\n" +
       "       Pass --vscode \"<path-to-resources/app>\" explicitly.")
}

log("Found " + appDirs.length + " VS Code app dir(s):")
appDirs.forEach(function (d) { log("  " + d) })

// ---- Patch each ------------------------------------------------------------

var anyApplied = false

appDirs.forEach(function (appDir) {
  log("--- Patching: " + appDir + " ---")
  replaceIconvLiteUmd(appDir)
  patchSearch(appDir)
  if (withUi) patchWorkbench(appDir)
})

log("")
if (anyApplied) {
  log("Done. Quit VS Code completely (incl. background processes) and relaunch.")
  log("")
  log("To use TCVN3, set in your settings.json:")
  log('  "files.encoding": "tcvn3"')
  if (!withUi) log("Pass --with-ui to also expose TCVN3 in the encoding picker dropdown.")
} else {
  log("No changes applied (already patched?).")
}

// ---- Patch routines --------------------------------------------------------

function replaceIconvLiteUmd (appDir) {
  var libDir   = path.join(appDir, "node_modules", "@vscode", "iconv-lite-umd", "lib")
  var target   = path.join(libDir, "iconv-lite-umd.js")
  var original = path.join(libDir, "iconv-lite-umd.original.js")
  if (!fs.existsSync(target)) {
    warn("iconv-lite-umd.js missing at " + target + " — skipping")
    return
  }
  if (!fs.existsSync(original)) {
    log("Backing up original -> iconv-lite-umd.original.js")
    fs.copyFileSync(target, original)
  }
  try {
    fs.copyFileSync(bundlePath, target)
  } catch (e) {
    fail("Cannot write " + target + " — quit VS Code first. (" + e.message + ")")
  }
  log("iconv-lite-umd.js replaced (" + fs.statSync(target).size + " bytes).")
  anyApplied = true
}

function patchSearch (appDir) {
  var target = path.join(appDir, "out", "vs", "workbench", "api", "node",
                         "extensionHostProcess.js")
  if (!fs.existsSync(target)) {
    warn("extensionHostProcess.js missing at " + target + " — skipping search patch")
    return
  }
  var backup = target + ".tcvn3-backup"
  var content = fs.readFileSync(target, "utf8")
  if (content.indexOf("/* TCVN3 SEARCH PATCH v1 BEGIN */") !== -1) {
    log("Search patch already present, skipping.")
    return
  }
  var pos = content.indexOf(searchPatch.anchor)
  if (pos === -1) {
    warn("Could not locate ripgrep --encoding push site. " +
         "VS Code build may have changed; skipping search patch.")
    return
  }
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, content, "utf8")
  var patched = searchPatch.prepend +
                content.slice(0, pos) +
                searchPatch.replacement +
                content.slice(pos + searchPatch.anchor.length)
  fs.writeFileSync(target, patched, "utf8")
  log("extensionHostProcess.js patched (Unicode search auto-encoded to TCVN3).")
  anyApplied = true
}

function patchWorkbench (appDir) {
  var target = path.join(appDir, "out", "vs", "workbench", "workbench.desktop.main.js")
  if (!fs.existsSync(target)) {
    warn("workbench.desktop.main.js missing at " + target + " — skipping UI patch")
    return
  }
  var backup = target + ".tcvn3-backup"
  var content = fs.readFileSync(target, "utf8")
  if (content.indexOf("Vietnamese (TCVN3)") !== -1) {
    log("Workbench already has TCVN3 entry, skipping.")
    return
  }
  var pos = content.indexOf(workbenchPatch.anchor)
  if (pos === -1) {
    warn("Could not locate windows1258 anchor. Skipping UI patch.")
    return
  }
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, content, "utf8")
  var patched = content.slice(0, pos + workbenchPatch.anchor.length) +
                workbenchPatch.injection +
                content.slice(pos + workbenchPatch.anchor.length)
  fs.writeFileSync(target, patched, "utf8")
  log("workbench.desktop.main.js patched (TCVN3 visible in encoding picker).")
  anyApplied = true
}
