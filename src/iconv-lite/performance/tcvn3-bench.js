// Standalone TCVN3 throughput benchmark.
// Run: node performance/tcvn3-bench.js
// Optional flag: --huge   adds the 1 GB stress case (slow, ~30s+).
"use strict"
var iconv = require("../lib")

var SAMPLE = "Báo cáo tài chính năm 2024 của công ty cổ phần phát triển công nghệ Việt Nam. " +
             "Hợp đồng số 456/2024-HĐKT được ký kết giữa các bên. " +
             "THÔNG BÁO QUAN TRỌNG: Đề án phát triển bền vững. " +
             "Tài liệu kỹ thuật hướng dẫn sử dụng phần mềm. "

function repeat (s, bytes) {
  // Repeat sample until we exceed `bytes` bytes when UTF-8 encoded.
  var buf = Buffer.from(s, "utf8")
  var times = Math.ceil(bytes / buf.length)
  return s.repeat(times)
}

function fmtBytes (n) {
  if (n >= 1 << 30) return (n / (1 << 30)).toFixed(2) + " GB"
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(2) + " MB"
  if (n >= 1 << 10) return (n / (1 << 10)).toFixed(2) + " KB"
  return n + " B"
}

function bench (label, sizeBytes, iters, fn) {
  // Warm-up.
  for (var w = 0; w < 3; w++) fn()
  if (global.gc) global.gc()
  var t0 = process.hrtime.bigint()
  for (var i = 0; i < iters; i++) fn()
  var t1 = process.hrtime.bigint()
  var seconds = Number(t1 - t0) / 1e9
  var totalBytes = sizeBytes * iters
  var mbps = totalBytes / (1 << 20) / seconds
  console.log(
    label.padEnd(34) +
    " size=" + fmtBytes(sizeBytes).padStart(8) +
    "  iters=" + String(iters).padStart(5) +
    "  time=" + seconds.toFixed(3).padStart(7) + "s" +
    "  throughput=" + mbps.toFixed(1).padStart(7) + " MB/s"
  )
}

var sizes = [
  { label: "1 KB",    bytes: 1 << 10,  iters: 10000 },
  { label: "100 KB",  bytes: 100 << 10, iters: 1000 },
  { label: "1 MB",    bytes: 1 << 20,  iters: 200 },
  { label: "10 MB",   bytes: 10 << 20, iters: 20 },
  { label: "100 MB",  bytes: 100 << 20, iters: 3 },
]

console.log("TCVN3 throughput benchmark — Node " + process.versions.node)
console.log("=".repeat(96))
for (var s = 0; s < sizes.length; s++) {
  var size = sizes[s]
  var unicodeStr = repeat(SAMPLE, size.bytes)
  var encoded = iconv.encode(unicodeStr, "tcvn3")
  console.log("\n[" + size.label + "]  unicode chars=" + unicodeStr.length +
              "  encoded bytes=" + fmtBytes(encoded.length))

  bench("  encode (Unicode→TCVN3)", size.bytes, size.iters, function () {
    iconv.encode(unicodeStr, "tcvn3")
  })
  bench("  decode (TCVN3→Unicode)", encoded.length, size.iters, function () {
    iconv.decode(encoded, "tcvn3")
  })
}

// Streaming bench — simulates reading a large file in chunks.
// V8 caps individual JS strings at ~512 MB, so 1 GB workloads MUST stream
// through getEncoder/getDecoder (which is what fs.createReadStream + iconv
// stream wrapper do anyway).
if (process.argv.includes("--huge")) {
  console.log("\n[Streaming 1 GB through 16 MB chunks]")
  var chunkBytes = 16 << 20
  var totalBytes = 1 << 30
  var chunks = totalBytes / chunkBytes
  var unicodeChunk = repeat(SAMPLE, chunkBytes)
  var encodedChunk = iconv.encode(unicodeChunk, "tcvn3")
  console.log("  chunk size=" + fmtBytes(chunkBytes) +
              "  chunks=" + chunks +
              "  total=" + fmtBytes(totalBytes))

  // Encoder streaming
  var t0 = process.hrtime.bigint()
  var encoder = iconv.getEncoder("tcvn3")
  var encOut = 0
  for (var c = 0; c < chunks; c++) encOut += encoder.write(unicodeChunk).length
  var encTrail = encoder.end()
  if (encTrail) encOut += encTrail.length
  var t1 = process.hrtime.bigint()
  var encSec = Number(t1 - t0) / 1e9
  console.log("  encoder streaming  time=" + encSec.toFixed(2) + "s" +
              "  output=" + fmtBytes(encOut) +
              "  throughput=" + (totalBytes / (1 << 20) / encSec).toFixed(1) + " MB/s")

  // Decoder streaming
  t0 = process.hrtime.bigint()
  var decoder = iconv.getDecoder("tcvn3")
  var decChars = 0
  for (var d = 0; d < chunks; d++) decChars += decoder.write(encodedChunk).length
  var decTrail = decoder.end()
  if (decTrail) decChars += decTrail.length
  t1 = process.hrtime.bigint()
  var decSec = Number(t1 - t0) / 1e9
  var decBytes = encodedChunk.length * chunks
  console.log("  decoder streaming  time=" + decSec.toFixed(2) + "s" +
              "  output=" + decChars + " chars" +
              "  throughput=" + (decBytes / (1 << 20) / decSec).toFixed(1) + " MB/s")
}
