#!/usr/bin/env node
// Undo TCVN3 patches: restore VS Code's original files from backups.
"use strict"
var fs = require("fs")
var path = require("path")
var os = require("os")

var args = process.argv.slice(2)
function readArg (name) {
  var i = args.indexOf(name)
  return (i !== -1 && args[i + 1]) ? args[i + 1] : null
}
var explicit = readArg("--vscode")

function log (msg) { console.log("[tcvn3] " + msg) }
function warn (msg) { console.warn("[tcvn3] WARN: " + msg) }
function fail (msg) { console.error("[tcvn3] ERROR: " + msg); process.exit(1) }

function isApp (dir) {
  return fs.existsSync(path.join(dir, "package.json")) &&
         fs.existsSync(path.join(dir, "node_modules", "@vscode", "iconv-lite-umd"))
}

function findAppDirs (root) {
  var found = []
  var direct = path.join(root, "resources", "app")
  if (isApp(direct)) found.push(direct)
  if (isApp(root)) found.push(root)
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

var candidates = []
if (explicit) {
  candidates.push(explicit)
} else {
  var home = os.homedir()
  candidates.push(path.join(home, "AppData", "Local", "Programs", "Microsoft VS Code"))
  candidates.push("C:\\Program Files\\Microsoft VS Code")
  candidates.push("C:\\Program Files (x86)\\Microsoft VS Code")
  candidates.push("/usr/share/code")
  candidates.push("/snap/code/current/usr/share/code")
  candidates.push("/Applications/Visual Studio Code.app/Contents/Resources/app")
}

var appDirs = []
candidates.forEach(function (c) {
  findAppDirs(c).forEach(function (d) {
    if (appDirs.indexOf(d) === -1) appDirs.push(d)
  })
})
if (appDirs.length === 0) fail("No VS Code installation found.")

appDirs.forEach(function (appDir) {
  log("--- Restoring: " + appDir + " ---")
  restoreIconvLiteUmd(appDir)
  restoreSearch(appDir)
  restoreWorkbench(appDir)
})
log("Done. Restart VS Code.")

function restoreIconvLiteUmd (appDir) {
  var libDir   = path.join(appDir, "node_modules", "@vscode", "iconv-lite-umd", "lib")
  var target   = path.join(libDir, "iconv-lite-umd.js")
  var original = path.join(libDir, "iconv-lite-umd.original.js")
  if (!fs.existsSync(original)) {
    log("No iconv-lite-umd backup - skipping (already pristine?)")
    return
  }
  try {
    fs.copyFileSync(original, target)
    fs.unlinkSync(original)
  } catch (e) {
    fail("Cannot restore " + target + " - quit VS Code first. (" + e.message + ")")
  }
  log("iconv-lite-umd.js restored.")
}

function restoreSearch (appDir) {
  var target = path.join(appDir, "out", "vs", "workbench", "api", "node",
                         "extensionHostProcess.js")
  var backup = target + ".tcvn3-backup"
  if (!fs.existsSync(backup)) {
    log("No search backup - skipping.")
    return
  }
  try {
    fs.copyFileSync(backup, target)
    fs.unlinkSync(backup)
  } catch (e) {
    fail("Cannot restore " + target + " - quit VS Code first. (" + e.message + ")")
  }
  log("extensionHostProcess.js restored.")
}

function restoreWorkbench (appDir) {
  var target = path.join(appDir, "out", "vs", "workbench", "workbench.desktop.main.js")
  var backup = target + ".tcvn3-backup"
  if (!fs.existsSync(backup)) {
    log("No workbench backup - skipping.")
    return
  }
  try {
    fs.copyFileSync(backup, target)
    fs.unlinkSync(backup)
  } catch (e) {
    fail("Cannot restore " + target + " - quit VS Code first. (" + e.message + ")")
  }
  log("workbench.desktop.main.js restored.")
}
