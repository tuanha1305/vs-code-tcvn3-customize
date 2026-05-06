// Generates the prepend block + replacement string used to make ripgrep
// (VS Code's search backend) work with TCVN3-encoded files.
//
// Background:
//   VS Code's search service (in extensionHostProcess.js) builds rg args and
//   pushes `--encoding <name>` whenever files.encoding is set to anything
//   other than utf8. ripgrep's encoding crate (encoding_rs) doesn't know
//   "tcvn3" → process exits with "encoding tcvn3 is not supported".
//
// Strategy:
//   1. Don't pass `--encoding tcvn3` to rg. Let rg default to UTF-8 / raw bytes.
//   2. Translate the user's Unicode search pattern to TCVN3 bytes using the
//      same 134-entry mapping the codec uses.
//   3. Express any non-ASCII byte as `\xHH` regex escape so the bytes survive
//      the JS-string → command-line → rg-pattern round trip.
//   4. Force isRegExp = true so rg interprets `\xHH` as a byte-level escape.
//
//   Result: when the user searches "Tên", we hand rg the pattern `T\xAAn`,
//   rg performs binary regex over the file's raw bytes, finds the TCVN3 byte
//   sequence 0x54 0xAA 0x6E inside the file. Same workflow in any TCVN3-
//   encoded file in the workspace.
//
// Caveats:
//   - If the user *already* writes regex by hand, we do NOT touch their
//     metacharacters; we only translate non-ASCII Unicode chars to bytes.
//     A regex like `[áàã]` works correctly because each Vietnamese char in
//     the brackets is encoded individually.
//   - Searching across encodings other than tcvn3 is unaffected — the patch
//     only changes behavior when folderOptions.encoding === "tcvn3".
"use strict"
var fs = require("fs")
var path = require("path")

function buildMappingLiteral () {
  // Parse the canonical mapping from iconv-lite/encodings/tcvn3.js. We don't
  // want to duplicate the 134-entry table; reading the source file at build
  // time guarantees the search patch always agrees with the codec.
  // In this repo the source lives at src/iconv-lite/encodings/tcvn3.js and
  // this generator at src/search-patch.js, so a sibling lookup works.
  var src = fs.readFileSync(
    path.join(__dirname, "iconv-lite", "encodings", "tcvn3.js"),
    "utf8"
  )
  var m = src.match(/var MAPPING = \[([\s\S]*?)\]\s*\n/)
  if (!m) throw new Error("Could not locate MAPPING array in tcvn3.js")
  // Re-emit as a compact { codepoint: "byteString", ... } object. Storing the
  // bytes as a 1- or 2-char string keeps the literal small and side-steps any
  // typed-array initialization at runtime.
  var entryRe = /\["\\u([0-9A-Fa-f]{4})",\s*"((?:[^"\\]|\\u[0-9A-Fa-f]{4}|\\.)*)"\]/g
  var pairs = []
  var em
  while ((em = entryRe.exec(m[1])) !== null) {
    var codepoint = parseInt(em[1], 16)
    var raw = em[2]
    // Decode the byte-string literal as bytes (each char is one byte 0..255).
    var bytes = []
    for (var i = 0; i < raw.length; i++) {
      var ch = raw[i]
      if (ch === "\\" && raw[i + 1] === "u") {
        bytes.push(parseInt(raw.slice(i + 2, i + 6), 16))
        i += 5
      } else {
        bytes.push(ch.charCodeAt(0))
      }
    }
    // Emit the string literal directly using JS \uHHHH escapes so the parsed
    // runtime value is the byte sequence we want (each codepoint = byte
    // value). Going through JSON.stringify would double-escape the leading
    // backslash and turn the Unicode escapes into 6-char literals.
    var literal = bytes.map(function (b) {
      return "\\u" + ("0000" + b.toString(16).toUpperCase()).slice(-4)
    }).join("")
    pairs.push("0x" + codepoint.toString(16).toUpperCase() + ':"' + literal + '"')
  }
  return "{" + pairs.join(",") + "}"
}

module.exports = function buildSearchPatch () {
  var mapLiteral = buildMappingLiteral()

  // Prepend block: defines globalThis.__tcvn3SearchEncode.
  // Kept as a string to inject verbatim into extensionHostProcess.js.
  var prepend =
    '/* TCVN3 SEARCH PATCH v1 BEGIN */\n' +
    ';(function(){\n' +
    '  if (globalThis.__tcvn3SearchEncode) return;\n' +
    '  var MAP=' + mapLiteral + ';\n' +
    '  var REGEX_META="\\\\^$.*+?()[]{}|/-";\n' +
    '  function hex2(b){var s=b.toString(16).toUpperCase();return s.length<2?"0"+s:s;}\n' +
    '  function emitByte(b,inCharClass){\n' +
    '    if (b>=0x80) return "\\\\x"+hex2(b);\n' +
    '    var ch=String.fromCharCode(b);\n' +
    '    if (REGEX_META.indexOf(ch)!==-1) return "\\\\"+ch;\n' +
    '    return ch;\n' +
    '  }\n' +
    '  function encodeChar(cp){\n' +
    '    var bytes=MAP[cp];\n' +
    '    if (bytes){\n' +
    '      var out="";\n' +
    '      for (var i=0;i<bytes.length;i++) out+=emitByte(bytes.charCodeAt(i),false);\n' +
    '      return out;\n' +
    '    }\n' +
    '    if (cp<0x80){\n' +
    '      var ch=String.fromCharCode(cp);\n' +
    '      if (REGEX_META.indexOf(ch)!==-1) return "\\\\"+ch;\n' +
    '      return ch;\n' +
    '    }\n' +
    '    if (cp<0x100) return "\\\\x"+hex2(cp);\n' +
    '    return String.fromCharCode(cp);\n' +
    '  }\n' +
    '  globalThis.__tcvn3SearchEncode=function(pattern,isRegExp){\n' +
    '    if (typeof pattern!=="string"||pattern.length===0) return {pattern:pattern,isRegExp:isRegExp};\n' +
    '    if (isRegExp){\n' +
    '      // Preserve user regex syntax: only translate non-ASCII chars.\n' +
    '      var out="";\n' +
    '      for (var i=0;i<pattern.length;i++){\n' +
    '        var cp=pattern.charCodeAt(i);\n' +
    '        if (cp<0x80){ out+=pattern[i]; continue; }\n' +
    '        var bytes=MAP[cp];\n' +
    '        if (bytes){ for (var j=0;j<bytes.length;j++) out+="\\\\x"+hex2(bytes.charCodeAt(j)); }\n' +
    '        else if (cp<0x100) out+="\\\\x"+hex2(cp);\n' +
    '        else out+=pattern[i];\n' +
    '      }\n' +
    '      return {pattern:out,isRegExp:true};\n' +
    '    }\n' +
    '    // Literal-text mode: encode each char and escape regex metas.\n' +
    '    var out="";\n' +
    '    for (var i=0;i<pattern.length;i++){\n' +
    '      out+=encodeChar(pattern.charCodeAt(i));\n' +
    '    }\n' +
    '    return {pattern:out,isRegExp:true};\n' +
    '  };\n' +
    '})();\n' +
    '/* TCVN3 SEARCH PATCH v1 END */\n'

  // Replacement for the rg `--encoding` push line. Drops the flag when the
  // encoding is tcvn3 and rewrites the search pattern to byte-level form.
  var anchor = 't.folderOptions.encoding&&t.folderOptions.encoding!=="utf8"&&e.push("--encoding",t.folderOptions.encoding)'
  var replacement =
    '(t.folderOptions.encoding==="tcvn3"' +
      '?(function(){' +
        'try{var r=globalThis.__tcvn3SearchEncode(i.pattern,!!i.isRegExp);' +
        'i.pattern=r.pattern;i.isRegExp=r.isRegExp;}catch(_e){}' +
      '})()' +
      ':' + anchor +
    ')'

  return { prepend: prepend, anchor: anchor, replacement: replacement }
}
