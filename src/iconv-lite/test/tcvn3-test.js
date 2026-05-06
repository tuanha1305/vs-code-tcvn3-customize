var assert = require("assert")
var Buffer = require("safer-buffer").Buffer
var join = require("path").join
var iconv = require(join(__dirname, "/../"))

// Reference vectors copied from the C# port's tests
// (tcvn3-encoding-c-sharp/tests/Tcvn3ConverterTests.cs).
var referenceVectors = [
  ["Xin ch\u00E0o",                "Xin ch\u00B5o"],
  ["Vi\u1EC7t Nam",                "Vi\u00D6t Nam"],
  ["B\u00E1o c\u00E1o",            "B\u00B8o c\u00B8o"],
  ["\u0110\u00E2y l\u00E0 v\u0103n b\u1EA3n",
                                   "\u00A7\u00A9y l\u00B5 v\u00A8n b\u00B6n"],
  ["H\u1EE3p \u0111\u1ED3ng s\u1ED1 123",
                                   "H\u00EEp \u00AE\u00E5ng s\u00E8 123"],
  // Note: the C# test file (Tcvn3ConverterTests.cs:17) claims "TH¤NG B¸O QUAN
  // TRÄNG" but that contradicts its own mapping table — 'Á' is mapped to "A¸"
  // (two bytes) and 'Ọ' to "Oä" (two bytes). The actual encoder output (and
  // ours) is "TH¤NG BA¸O QUAN TROäNG", which round-trips correctly.
  ["TH\u00D4NG B\u00C1O QUAN TR\u1ECCNG",
                                   "TH\u00A4NG BA\u00B8O QUAN TRO\u00E4NG"],
]

// Every Vietnamese character with TCVN3 mapping (from the codec table).
var vietnameseChars =
  "\u00C0\u00C1\u00C2\u00C3\u00C8\u00C9\u00CA\u00CC\u00CD" +
  "\u00D2\u00D3\u00D4\u00D5\u00D9\u00DA\u00DD" +
  "\u00E0\u00E1\u00E2\u00E3\u00E8\u00E9\u00EA\u00EC\u00ED" +
  "\u00F2\u00F3\u00F4\u00F5\u00F9\u00FA\u00FD" +
  "\u0102\u0103\u0110\u0111\u0128\u0129\u0168\u0169" +
  "\u01A0\u01A1\u01AF\u01B0" +
  "\u1EA0\u1EA1\u1EA2\u1EA3\u1EA4\u1EA5\u1EA6\u1EA7\u1EA8\u1EA9" +
  "\u1EAA\u1EAB\u1EAC\u1EAD\u1EAE\u1EAF\u1EB0\u1EB1\u1EB2\u1EB3" +
  "\u1EB4\u1EB5\u1EB6\u1EB7\u1EB8\u1EB9\u1EBA\u1EBB\u1EBC\u1EBD" +
  "\u1EBE\u1EBF\u1EC0\u1EC1\u1EC2\u1EC3\u1EC4\u1EC5\u1EC6\u1EC7" +
  "\u1EC8\u1EC9\u1ECA\u1ECB\u1ECC\u1ECD\u1ECE\u1ECF\u1ED0\u1ED1" +
  "\u1ED2\u1ED3\u1ED4\u1ED5\u1ED6\u1ED7\u1ED8\u1ED9\u1EDA\u1EDB" +
  "\u1EDC\u1EDD\u1EDE\u1EDF\u1EE0\u1EE1\u1EE2\u1EE3\u1EE4\u1EE5" +
  "\u1EE6\u1EE7\u1EE8\u1EE9\u1EEA\u1EEB\u1EEC\u1EED\u1EEE\u1EEF" +
  "\u1EF0\u1EF1\u1EF2\u1EF3\u1EF4\u1EF5\u1EF6\u1EF7\u1EF8\u1EF9"

describe("TCVN3 Encoding", function () {
  it("Encodes reference vectors from the C# port", function () {
    referenceVectors.forEach(function (pair) {
      var unicode = pair[0]
      var expected = Buffer.from(pair[1], "binary")
      var actual = iconv.encode(unicode, "tcvn3")
      assert.strictEqual(actual.toString("binary"), expected.toString("binary"),
        "encode(" + JSON.stringify(unicode) + ")")
    })
  })

  it("Decodes reference vectors from the C# port", function () {
    referenceVectors.forEach(function (pair) {
      var expected = pair[0]
      var bytes = Buffer.from(pair[1], "binary")
      assert.strictEqual(iconv.decode(bytes, "tcvn3"), expected,
        "decode(" + JSON.stringify(pair[1]) + ")")
    })
  })

  it("Round-trips every Vietnamese character", function () {
    for (var i = 0; i < vietnameseChars.length; i++) {
      var ch = vietnameseChars[i]
      var roundTripped = iconv.decode(iconv.encode(ch, "tcvn3"), "tcvn3")
      assert.strictEqual(roundTripped, ch,
        "round-trip failed for U+" + ch.charCodeAt(0).toString(16))
    }
  })

  it("Distinguishes lone lead bytes from 2-byte sequences", function () {
    // Lone 'A' must remain ASCII; "Aµ" must decode to 'À'.
    assert.strictEqual(iconv.decode(Buffer.from("A ", "binary"), "tcvn3"), "A ")
    assert.strictEqual(iconv.decode(Buffer.from("A\u00B5", "binary"), "tcvn3"), "\u00C0")
    // Same for the special-base lead bytes.
    assert.strictEqual(iconv.decode(Buffer.from("\u00A2", "binary"), "tcvn3"), "\u00C2")     // ¢ alone -> Â
    assert.strictEqual(iconv.decode(Buffer.from("\u00A2\u00CA", "binary"), "tcvn3"), "\u1EA4") // ¢Ê -> Ấ
    // Lead byte followed by an unmapped second byte: emit single-byte form,
    // then process the next byte as standalone.
    assert.strictEqual(iconv.decode(Buffer.from("\u00A2X", "binary"), "tcvn3"), "\u00C2X")
  })

  it("Passes ASCII through unchanged", function () {
    var ascii = "Hello, world!\nThe quick brown fox 0123456789."
    assert.strictEqual(iconv.encode(ascii, "tcvn3").toString("binary"), ascii)
    assert.strictEqual(iconv.decode(Buffer.from(ascii, "binary"), "tcvn3"), ascii)
  })

  it("Replaces unmapped non-Latin-1 chars with '?'", function () {
    // U+2603 (snowman) has no TCVN3 mapping and is > 0xFF.
    assert.strictEqual(iconv.encode("a\u2603b", "tcvn3").toString("binary"), "a?b")
  })

  it("Streams across chunk boundaries", function () {
    // Split "Aµ" between the lead byte and tone byte.
    var dec = iconv.getDecoder("tcvn3")
    var part1 = dec.write(Buffer.from([0x41]))         // 'A' is a lead byte -> deferred
    var part2 = dec.write(Buffer.from([0xB5]))         // combines with deferred -> 'À'
    var trail = dec.end()
    assert.strictEqual(part1 + part2 + trail, "\u00C0")
  })

  it("Flushes a trailing lead byte in end()", function () {
    var dec = iconv.getDecoder("tcvn3")
    // 'A' alone at end of stream must surface as ASCII 'A'.
    var part1 = dec.write(Buffer.from([0x41]))
    var trail = dec.end()
    assert.strictEqual(part1 + trail, "A")
  })

  it("Streams a deferred lead followed by a non-pairing byte", function () {
    var dec = iconv.getDecoder("tcvn3")
    var part1 = dec.write(Buffer.from([0x41]))         // 'A' deferred
    var part2 = dec.write(Buffer.from([0x20, 0x42]))   // ' ', 'B'
    var trail = dec.end()
    assert.strictEqual(part1 + part2 + trail, "A B")
  })

  it("Round-trips arbitrary non-TCVN3 bytes byte-identically (PUA passthrough)", function () {
    // Mixed files (e.g. game data with TCVN3 Vietnamese plus GBK Chinese
    // filenames) contain bytes that are NOT TCVN3-defined. These must
    // round-trip exactly so save doesn't corrupt the file.
    var raw = Buffer.from([
      0x54, 0xAA, 0x6E, // "Tên" in TCVN3
      0xC5, 0xFB, 0xB7, 0xE7, // "披风" in GBK — none TCVN3
      0xBB, 0xAA, 0xC0, 0xF6, // "华丽" in GBK
      0x09, 0x61, 0x31, // tab + "a1"
    ])
    var decoded = iconv.decode(raw, "tcvn3")
    var reencoded = iconv.encode(decoded, "tcvn3")
    assert.deepStrictEqual([].slice.call(reencoded), [].slice.call(raw),
      "round-trip must preserve every byte")
  })

  it("Decodes unmapped non-ASCII bytes into the Private Use Area", function () {
    // Byte 0xC0 is unmapped in TCVN3. With the fixed codec it must decode to
    // U+E0C0 (PUA) — NOT to U+00C0 'À', which would re-encode as "Aµ" and
    // corrupt the file.
    var decoded = iconv.decode(Buffer.from([0xC0]), "tcvn3")
    assert.strictEqual(decoded.charCodeAt(0), 0xE0C0)
    var reencoded = iconv.encode(decoded, "tcvn3")
    assert.strictEqual(reencoded.length, 1)
    assert.strictEqual(reencoded[0], 0xC0)
  })

  it("Resolves common encoding aliases", function () {
    assert.ok(iconv.encodingExists("tcvn3"))
    assert.ok(iconv.encodingExists("TCVN-3"))
    assert.ok(iconv.encodingExists("TCVN3-1"))
    assert.ok(iconv.encodingExists("vntcvn3"))
    var ref = iconv.encode("\u00E0", "tcvn3").toString("binary")
    assert.strictEqual(iconv.encode("\u00E0", "TCVN-3").toString("binary"), ref)
    assert.strictEqual(iconv.encode("\u00E0", "vntcvn3").toString("binary"), ref)
  })
})
