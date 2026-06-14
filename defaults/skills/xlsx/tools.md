# Scripts

## scripts/recalc.py

Excel Formula Recalculation Script. Recalculates all formulas in an Excel file using LibreOffice.

### Usage

```bash
python scripts/recalc.py <excel_file> [timeout_seconds]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `excel_file` | Path to the Excel file to recalculate |
| `timeout_seconds` | Optional timeout in seconds (default: 30) |

### What It Does

1. **Sets up LibreOffice macro** on first run (creates `RecalculateAndSave` macro in LibreOffice's Standard module)
2. **Runs LibreOffice headless** with the recalculation macro
3. **Scans all cells** for Excel errors (#VALUE!, #DIV/0!, #REF!, #NAME?, #NULL!, #NUM!, #N/A)
4. **Counts formulas** in the workbook
5. **Returns JSON** with detailed results

### Output Format

```json
{
  "status": "success",
  "total_errors": 0,
  "total_formulas": 42,
  "error_summary": {}
}
```

When errors are found:
```json
{
  "status": "errors_found",
  "total_errors": 2,
  "total_formulas": 42,
  "error_summary": {
    "#REF!": {
      "count": 2,
      "locations": ["Sheet1!B5", "Sheet1!C10"]
    }
  }
}
```

### Platform Support

- **Linux**: Uses `timeout` command for process timeout
- **macOS**: Uses `gtimeout` (from GNU coreutils) if available
- Handles sandboxed environments where AF_UNIX sockets are blocked (via `soffice.py` shim)

---

## scripts/office/soffice.py

Helper for running LibreOffice in environments where AF_UNIX sockets may be blocked (e.g., sandboxed VMs).

### Usage

```python
from office.soffice import run_soffice, get_soffice_env

# Option 1 - run soffice directly
result = run_soffice(["--headless", "--convert-to", "pdf", "input.docx"])

# Option 2 - get env dict for your own subprocess calls
env = get_soffice_env()
subprocess.run(["soffice", ...], env=env)
```

### What It Does

- Sets `SAL_USE_VCLPLUGIN=svp` for headless operation
- Detects if AF_UNIX sockets are blocked at runtime
- If blocked, compiles and applies an LD_PRELOAD C shim that intercepts socket/listen/accept/close calls
- The shim uses socketpair() as a fallback when socket(AF_UNIX) fails

---

## scripts/office/pack.py

Pack a directory into a DOCX, PPTX, or XLSX file. Validates with auto-repair, condenses XML formatting, and creates the Office file.

### Usage

```bash
python scripts/office/pack.py <input_directory> <output_file> [--original <file>] [--validate true|false]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `input_directory` | Unpacked Office document directory |
| `output_file` | Output Office file (.docx/.pptx/.xlsx) |
| `--original` | Original file for validation comparison |
| `--validate` | Run validation with auto-repair (default: true) |

### What It Does

1. Runs schema and redlining validators (if original file provided)
2. Auto-repairs common issues
3. Condenses XML formatting (removes whitespace-only text nodes and comments)
4. Creates ZIP archive as the output Office file

---

## scripts/office/unpack.py

Unpack Office files (DOCX, PPTX, XLSX) for editing. Extracts the ZIP archive and pretty-prints XML files.

### Usage

```bash
python scripts/office/unpack.py <office_file> <output_dir> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `office_file` | Office file to unpack |
| `output_directory` | Output directory for extracted content |
| `--merge-runs` | Merge adjacent runs with identical formatting (DOCX only, default: true) |
| `--simplify-redlines` | Merge adjacent tracked changes from same author (DOCX only, default: true) |

### What It Does

1. Extracts ZIP archive contents
2. Pretty-prints all XML and .rels files
3. For DOCX: optionally simplifies tracked changes and merges adjacent runs
4. Escapes smart quotes for safe XML handling

---

## scripts/office/validate.py

Validate Office document XML files against XSD schemas and tracked changes.

### Usage

```bash
python scripts/office/validate.py <path> [--original <original_file>] [--auto-repair] [--author NAME]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `path` | Path to unpacked directory or packed Office file (.docx/.pptx/.xlsx) |
| `--original` | Path to original file (if omitted, all XSD errors are reported and redlining validation is skipped) |
| `--auto-repair` | Automatically repair common issues (hex IDs, whitespace preservation) |
| `--author` | Author name for redlining validation (default: Claude) |
| `-v, --verbose` | Enable verbose output |

### Auto-repair Fixes

- `paraId`/`durableId` values that exceed OOXML limits
- Missing `xml:space="preserve"` on `w:t` elements with whitespace
