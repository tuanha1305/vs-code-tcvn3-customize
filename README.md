# vs-code-tcvn3-customize

Adds the legacy Vietnamese **TCVN3** (also called ABC) encoding to VS Code:

- **File open / save** in TCVN3 (drop-in replaces `@vscode/iconv-lite-umd`).
- **Search** (`Ctrl+Shift+F`) auto-encodes Unicode queries to TCVN3 bytes so ripgrep finds matches in TCVN3 files.
- **Encoding picker dropdown** entry "Vietnamese (TCVN3)" (with `--with-ui`).

Round-trip safe: every byte in the source file (including non-TCVN3 bytes such as GBK Chinese filenames in mixed-encoding game data files) survives `decode -> encode` byte-for-byte. Verified against 86 real-world files.

## Install — one-liner

Quit VS Code completely first (including background `Code.exe` processes).

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/tuanha1305/vs-code-tcvn3-customize/main/install.sh | bash
```

With UI dropdown:

```bash
curl -fsSL https://raw.githubusercontent.com/tuanha1305/vs-code-tcvn3-customize/main/install.sh | bash -s -- --with-ui
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/tuanha1305/vs-code-tcvn3-customize/main/install.ps1 | iex
```

With UI dropdown:

```powershell
$env:TCVN3_WITH_UI=1; irm https://raw.githubusercontent.com/tuanha1305/vs-code-tcvn3-customize/main/install.ps1 | iex
```

If you get an execution-policy error:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### After install

Add to your VS Code `settings.json` (User or Workspace):

```jsonc
{
  "files.encoding": "tcvn3",
  "files.autoGuessEncoding": false
}
```

Restart VS Code. Open any TCVN3 file — text shows correctly.

## Uninstall

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/tuanha1305/vs-code-tcvn3-customize/main/uninstall.sh | bash
```

```powershell
# Windows
irm https://raw.githubusercontent.com/tuanha1305/vs-code-tcvn3-customize/main/uninstall.ps1 | iex
```

## What gets patched

| File | Why |
|---|---|
| `node_modules/@vscode/iconv-lite-umd/lib/iconv-lite-umd.js` | Replaced with a webpack-built UMD bundle of customized iconv-lite. Adds the `tcvn3` codec. |
| `out/vs/workbench/api/node/extensionHostProcess.js` | Prepended with a small block that auto-encodes Unicode search patterns to TCVN3 byte form (`T\xAAn` etc.) so ripgrep matches in raw bytes. Skips the `--encoding tcvn3` flag (ripgrep doesn't know that encoding). |
| `out/vs/workbench/workbench.desktop.main.js` | (Only with `--with-ui`) Adds `tcvn3:{labelLong:"Vietnamese (TCVN3)",...}` next to `windows1258` so the dropdown shows it. |

Originals are backed up alongside as `*.original.js` / `*.tcvn3-backup`. `uninstall` restores them.

## Re-apply after VS Code updates

VS Code auto-update overwrites the patched files. Re-run the one-liner installer after each update.

## Repo layout

```
vs-code-tcvn3-customize/
|- install.sh / install.ps1         # bootstrap installers (download + apply)
|- uninstall.sh / uninstall.ps1
|- dist/                            # pre-built artifacts (committed)
|  |- iconv-lite-umd.js             # UMD bundle (~309 KB)
|  |- search-patch.js               # { prepend, anchor, replacement }
|  |- workbench-patch.js            # { anchor, injection }
|  \- version.json
|- scripts/
|  |- apply.js                      # the patcher (runs locally on the user's machine)
|  |- restore.js                    # the un-patcher
|  \- generate-dist.js              # builds dist/ from src/
|- src/                             # source for rebuilding
|  |- iconv-lite/                   # customized iconv-lite (with TCVN3 codec)
|  |- build/                        # webpack config
|  \- search-patch.js               # generator for the search-side patch
\- .github/workflows/build.yml      # CI verifies dist/ matches src/
```

## Build dist/ from source

```bash
cd src/build && npm install && npm run build && cd ../..
node scripts/generate-dist.js
```

`generate-dist.js` auto-runs the webpack build if `src/build/dist/iconv-lite-umd.js` is missing or older than the codec source.

## Tests

```bash
cd src/iconv-lite
npm install
npx mocha test/tcvn3-test.js
```

12 tests cover: reference vectors from the C# port, full round-trip of all 134 Vietnamese characters, lead/non-lead disambiguation, streaming, ASCII pass-through, unmapped chars, byte-identical round-trip on arbitrary non-TCVN3 bytes, and PUA passthrough.

## Performance

Measured on Node 22 (see `src/iconv-lite/performance/tcvn3-bench.js`):

| Workload | Encode | Decode |
|---|---|---|
| 1 MB | 925 MB/s | 416 MB/s |
| 100 MB | 730 MB/s | 390 MB/s |
| 1 GB streaming | 913 MB/s | 396 MB/s |

Opening a 1 GB TCVN3 file does not lag.

## License

iconv-lite portions: MIT (original Alexander Shtuchkin and contributors).
TCVN3 codec, build glue, installers: MIT.
