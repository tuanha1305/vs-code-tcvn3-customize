"use strict"
var Buffer = require("safer-buffer").Buffer

// TCVN3 (a.k.a. ABC) — legacy Vietnamese 8-bit encoding.
// Single-byte on the wire, but Unicode -> TCVN3 expands many precomposed
// Vietnamese letters to 2 bytes (base byte + tone-mark byte). Decoding
// therefore requires greedy longest-match over 1- or 2-byte sequences.
//
// Mapping table is a faithful port of:
//   tcvn3-encoding-c-sharp/src/Tcvn3MappingTables.cs (134 entries)
//
// Each tuple is [unicodeChar, tcvn3ByteSequence]. The byte sequence is given
// as a JS string where every character's codepoint < 0x100, so each char
// corresponds to exactly one TCVN3 byte.

var MAPPING = [
  ["\u00C0", "A\u00B5"], ["\u00C1", "A\u00B8"], ["\u00C2", "\u00A2"],
  ["\u00C3", "A\u00B7"], ["\u00C8", "E\u00CC"], ["\u00C9", "E\u00D0"],
  ["\u00CA", "\u00A3"],  ["\u00CC", "I\u00D7"], ["\u00CD", "I\u00DD"],
  ["\u00D2", "O\u00DF"], ["\u00D3", "O\u00E3"], ["\u00D4", "\u00A4"],
  ["\u00D5", "O\u00E2"], ["\u00D9", "U\u00EF"], ["\u00DA", "U\u00F3"],
  ["\u00DD", "Y\u00FD"],
  ["\u00E0", "\u00B5"],  ["\u00E1", "\u00B8"],  ["\u00E2", "\u00A9"],
  ["\u00E3", "\u00B7"],  ["\u00E8", "\u00CC"],  ["\u00E9", "\u00D0"],
  ["\u00EA", "\u00AA"],  ["\u00EC", "\u00D7"],  ["\u00ED", "\u00DD"],
  ["\u00F2", "\u00DF"],  ["\u00F3", "\u00E3"],  ["\u00F4", "\u00AB"],
  ["\u00F5", "\u00E2"],  ["\u00F9", "\u00EF"],  ["\u00FA", "\u00F3"],
  ["\u00FD", "\u00FD"],
  ["\u0102", "\u00A1"],  ["\u0103", "\u00A8"],
  ["\u0110", "\u00A7"],  ["\u0111", "\u00AE"],
  ["\u0128", "I\u00DC"], ["\u0129", "\u00DC"],
  ["\u0168", "U\u00F2"], ["\u0169", "\u00F2"],
  ["\u01A0", "\u00A5"],  ["\u01A1", "\u00AC"],
  ["\u01AF", "\u00A6"],  ["\u01B0", "\u00AD"],
  ["\u1EA0", "A\u00B9"], ["\u1EA1", "\u00B9"],
  ["\u1EA2", "A\u00B6"], ["\u1EA3", "\u00B6"],
  ["\u1EA4", "\u00A2\u00CA"], ["\u1EA5", "\u00CA"],
  ["\u1EA6", "\u00A2\u00C7"], ["\u1EA7", "\u00C7"],
  ["\u1EA8", "\u00A2\u00C8"], ["\u1EA9", "\u00C8"],
  ["\u1EAA", "\u00A2\u00C9"], ["\u1EAB", "\u00C9"],
  ["\u1EAC", "\u00A2\u00CB"], ["\u1EAD", "\u00CB"],
  ["\u1EAE", "\u00A1\u00BE"], ["\u1EAF", "\u00BE"],
  ["\u1EB0", "\u00A1\u00BB"], ["\u1EB1", "\u00BB"],
  ["\u1EB2", "\u00A1\u00BC"], ["\u1EB3", "\u00BC"],
  ["\u1EB4", "\u00A1\u00BD"], ["\u1EB5", "\u00BD"],
  ["\u1EB6", "\u00A1\u00C6"], ["\u1EB7", "\u00C6"],
  ["\u1EB8", "E\u00D1"], ["\u1EB9", "\u00D1"],
  ["\u1EBA", "E\u00CE"], ["\u1EBB", "\u00CE"],
  ["\u1EBC", "E\u00CF"], ["\u1EBD", "\u00CF"],
  ["\u1EBE", "\u00A3\u00D5"], ["\u1EBF", "\u00D5"],
  ["\u1EC0", "\u00A3\u00D2"], ["\u1EC1", "\u00D2"],
  ["\u1EC2", "\u00A3\u00D3"], ["\u1EC3", "\u00D3"],
  ["\u1EC4", "\u00A3\u00D4"], ["\u1EC5", "\u00D4"],
  ["\u1EC6", "\u00A3\u00D6"], ["\u1EC7", "\u00D6"],
  ["\u1EC8", "I\u00D8"], ["\u1EC9", "\u00D8"],
  ["\u1ECA", "I\u00DE"], ["\u1ECB", "\u00DE"],
  ["\u1ECC", "O\u00E4"], ["\u1ECD", "\u00E4"],
  ["\u1ECE", "O\u00E1"], ["\u1ECF", "\u00E1"],
  ["\u1ED0", "\u00A4\u00E8"], ["\u1ED1", "\u00E8"],
  ["\u1ED2", "\u00A4\u00E5"], ["\u1ED3", "\u00E5"],
  ["\u1ED4", "\u00A4\u00E6"], ["\u1ED5", "\u00E6"],
  ["\u1ED6", "\u00A4\u00E7"], ["\u1ED7", "\u00E7"],
  ["\u1ED8", "\u00A4\u00E9"], ["\u1ED9", "\u00E9"],
  ["\u1EDA", "\u00A5\u00ED"], ["\u1EDB", "\u00ED"],
  ["\u1EDC", "\u00A5\u00EA"], ["\u1EDD", "\u00EA"],
  ["\u1EDE", "\u00A5\u00EB"], ["\u1EDF", "\u00EB"],
  ["\u1EE0", "\u00A5\u00EC"], ["\u1EE1", "\u00EC"],
  ["\u1EE2", "\u00A5\u00EE"], ["\u1EE3", "\u00EE"],
  ["\u1EE4", "U\u00F4"], ["\u1EE5", "\u00F4"],
  ["\u1EE6", "U\u00F1"], ["\u1EE7", "\u00F1"],
  ["\u1EE8", "\u00A6\u00F8"], ["\u1EE9", "\u00F8"],
  ["\u1EEA", "\u00A6\u00F5"], ["\u1EEB", "\u00F5"],
  ["\u1EEC", "\u00A6\u00F6"], ["\u1EED", "\u00F6"],
  ["\u1EEE", "\u00A6\u00F7"], ["\u1EEF", "\u00F7"],
  ["\u1EF0", "\u00A6\u00F9"], ["\u1EF1", "\u00F9"],
  ["\u1EF2", "Y\u00FA"], ["\u1EF3", "\u00FA"],
  ["\u1EF4", "Y\u00FE"], ["\u1EF5", "\u00FE"],
  ["\u1EF6", "Y\u00FB"], ["\u1EF7", "\u00FB"],
  ["\u1EF8", "Y\u00FC"], ["\u1EF9", "\u00FC"],
]

exports.tcvn3 = Tcvn3Codec
// Aliases — iconv canonicalizes by lowercasing and stripping non-alphanumerics,
// so "TCVN-3", "tcvn3-1", "tcvn3:1993" etc. all collapse to one of these keys.
exports.tcvn31      = "tcvn3"
exports.vntcvn3     = "tcvn3"
exports.vietnamese3 = "tcvn3"

function Tcvn3Codec () {
  // Encoder lookup, indexed by Unicode codepoint (0..0xFFFF).
  // Packed Uint32 layout per slot (0 means "unmapped"):
  //   bits  0..7  : byte 0
  //   bits  8..15 : byte 1 (0 when length === 1)
  //   bits 16..17 : length (1 or 2)
  // Sentinel 0 cannot collide with a real entry because every real entry has
  // length >= 1, which puts a non-zero value in bits 16..17.
  var encodeTable = new Uint32Array(0x10000)

  // Decoder structures.
  // byte -> unicode codepoint.
  // ASCII (< 0x80) decodes to itself.
  // Bytes >= 0x80 default to a Private Use Area codepoint (0xE000 + byte) so
  // that unmapped bytes round-trip losslessly through the encoder. The earlier
  // Latin-1 passthrough (byte X -> U+00XX) collided with TCVN3's Vietnamese
  // letters: e.g. byte 0xC0 -> U+00C0 'À', then encoding 'À' produces "Aµ"
  // (2 bytes), so a single stray 0xC0 would silently expand on save and
  // corrupt mixed-encoding files (e.g. cape.txt where Chinese filenames are
  // stored as GBK alongside TCVN3 Vietnamese descriptions).
  var singleByteDecode = new Uint16Array(256)
  for (var i = 0; i < 256; i++) singleByteDecode[i] = i < 0x80 ? i : (0xE000 + i)
  // (lead<<8 | second) -> unicode codepoint, 0 if unmapped.
  var twoByteDecode = new Uint16Array(256 * 256)
  // Lead bytes for any 2-byte sequence (0 / 1).
  var isLeadByte = new Uint8Array(256)

  for (var k = 0; k < MAPPING.length; k++) {
    var unicodeCh = MAPPING[k][0]
    var seq = MAPPING[k][1]
    var b0 = seq.charCodeAt(0)
    var cp = unicodeCh.charCodeAt(0)

    if (seq.length === 1) {
      encodeTable[cp] = (1 << 16) | b0
      singleByteDecode[b0] = cp
    } else { // length === 2
      var b1 = seq.charCodeAt(1)
      encodeTable[cp] = (2 << 16) | (b1 << 8) | b0
      twoByteDecode[(b0 << 8) | b1] = cp
      isLeadByte[b0] = 1
    }
  }
  // Map the PUA passthrough range (U+E080..U+E0FF) back to bytes 0x80..0xFF
  // for round-trip safety.
  for (var b = 0x80; b < 0x100; b++) {
    if (encodeTable[0xE000 + b] === 0) encodeTable[0xE000 + b] = (1 << 16) | b
  }

  this.encodeTable = encodeTable
  this.singleByteDecode = singleByteDecode
  this.twoByteDecode = twoByteDecode
  this.isLeadByte = isLeadByte
}

Tcvn3Codec.prototype.encoder = Tcvn3Encoder
Tcvn3Codec.prototype.decoder = Tcvn3Decoder

// ---- Encoder (stateless) ----

function Tcvn3Encoder (options, codec) {
  this.encodeTable = codec.encodeTable
}

Tcvn3Encoder.prototype.write = function (str) {
  // Worst case: every input char expands to 2 bytes.
  var buf = Buffer.alloc(str.length * 2)
  var pos = 0
  var enc = this.encodeTable

  for (var i = 0; i < str.length; i++) {
    var cp = str.charCodeAt(i)
    var packed = enc[cp]
    if (packed !== 0) {
      buf[pos++] = packed & 0xFF
      if (packed >= (2 << 16)) buf[pos++] = (packed >> 8) & 0xFF
    } else if (cp < 0x100) {
      buf[pos++] = cp
    } else {
      buf[pos++] = 0x3F // '?'
    }
  }

  return buf.slice(0, pos)
}

Tcvn3Encoder.prototype.end = function () {}

// ---- Decoder (streaming, greedy longest-match) ----

function Tcvn3Decoder (options, codec) {
  this.singleByteDecode = codec.singleByteDecode
  this.twoByteDecode = codec.twoByteDecode
  this.isLeadByte = codec.isLeadByte
  this.pendingLead = -1
}

Tcvn3Decoder.prototype.write = function (buf) {
  if (buf.length === 0 && this.pendingLead === -1) return ""

  // Output codepoints into a UCS-2 buffer (2 bytes per char), then convert
  // to a JS string in one shot. Avoids O(n) cons-string concatenation,
  // which collapses to a few MB/s on 100 MB+ inputs.
  // Worst case: pendingLead emits 1 char, every subsequent byte 1 char.
  var out = Buffer.alloc((buf.length + 1) * 2)
  var p = 0
  var i = 0
  var single = this.singleByteDecode
  var pair = this.twoByteDecode
  var lead = this.isLeadByte

  // Resolve a lead byte deferred from the previous chunk.
  if (this.pendingLead !== -1) {
    if (buf.length === 0) return ""
    var combined = pair[(this.pendingLead << 8) | buf[0]]
    if (combined !== 0) {
      out[p] = combined & 0xFF
      out[p + 1] = (combined >> 8) & 0xFF
      p += 2
      i = 1
    } else {
      var one = single[this.pendingLead]
      out[p] = one & 0xFF
      out[p + 1] = (one >> 8) & 0xFF
      p += 2
    }
    this.pendingLead = -1
  }

  var len = buf.length
  var lastIdx = len - 1
  while (i < len) {
    var b = buf[i]
    if (lead[b]) {
      if (i < lastIdx) {
        var two = pair[(b << 8) | buf[i + 1]]
        if (two !== 0) {
          out[p] = two & 0xFF
          out[p + 1] = (two >> 8) & 0xFF
          p += 2
          i += 2
          continue
        }
        // Lead byte but no valid pair — emit single-byte interpretation.
        var sBoth = single[b]
        out[p] = sBoth & 0xFF
        out[p + 1] = (sBoth >> 8) & 0xFF
        p += 2
        i++
        continue
      }
      // Lead byte at the very end of the chunk — defer to next write/end.
      this.pendingLead = b
      break
    }
    var s = single[b]
    out[p] = s & 0xFF
    out[p + 1] = (s >> 8) & 0xFF
    p += 2
    i++
  }

  return out.toString("ucs2", 0, p)
}

Tcvn3Decoder.prototype.end = function () {
  if (this.pendingLead === -1) return ""
  var cp = this.singleByteDecode[this.pendingLead]
  this.pendingLead = -1
  return String.fromCharCode(cp)
}
