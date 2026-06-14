# DOCX Skill — Available Scripts

## scripts/office/unpack.py

Unpack Office files (DOCX, PPTX, XLSX) for editing. Extracts the ZIP archive, pretty-prints XML files, merges adjacent runs with identical formatting (DOCX only), and simplifies adjacent tracked changes from the same author (DOCX only).

```bash
python scripts/office/unpack.py <office_file> <output_dir> [options]
```

**Arguments:**
- `office_file` — Input Office file (.docx, .pptx, .xlsx)
- `output_dir` — Directory to extract to

**Options:**
- `--merge-runs false` — Skip merging adjacent runs with identical formatting

**Examples:**
```bash
python scripts/office/unpack.py document.docx unpacked/
python scripts/office/unpack.py presentation.pptx unpacked/
python scripts/office/unpack.py document.docx unpacked/ --merge-runs false
```

---

## scripts/office/pack.py

Pack a directory back into a DOCX, PPTX, or XLSX file. Validates with auto-repair, condenses XML formatting, and creates the Office file.

```bash
python scripts/office/pack.py <input_directory> <output_file> [--original <file>] [--validate true|false]
```

**Arguments:**
- `input_directory` — Unpacked directory containing the Office document XML files
- `output_file` — Output Office file path

**Options:**
- `--original <file>` — Original Office file (for reference during packing)
- `--validate true|false` — Enable/disable validation (default: true)

**Auto-repair fixes:**
- `durableId` >= 0x7FFFFFFF (regenerates valid ID)
- Missing `xml:space="preserve"` on `<w:t>` with whitespace

**Examples:**
```bash
python scripts/office/pack.py unpacked/ output.docx --original input.docx
python scripts/office/pack.py unpacked/ output.pptx --validate false
```

---

## scripts/office/validate.py

Validate Office document XML files against XSD schemas and tracked changes.

```bash
python scripts/office/validate.py <path> [--original <original_file>] [--auto-repair] [--author NAME]
```

**Arguments:**
- `path` — Path to unpacked directory or packed Office file (.docx/.pptx/.xlsx)

**Options:**
- `--original <original_file>` — Original file for comparison
- `--auto-repair` — Attempt automatic fixes for common issues
- `--author NAME` — Author name for tracked change validation

---

## scripts/office/soffice.py

Helper for running LibreOffice (soffice) in environments where AF_UNIX sockets may be blocked (e.g., sandboxed VMs). Detects the restriction at runtime and applies an LD_PRELOAD shim if needed.

```bash
python scripts/office/soffice.py --headless --convert-to <format> <input_file>
```

**Programmatic usage:**
```python
from office.soffice import run_soffice, get_soffice_env

# Option 1 — run soffice directly
result = run_soffice(["--headless", "--convert-to", "pdf", "input.docx"])

# Option 2 — get env dict for your own subprocess calls
env = get_soffice_env()
subprocess.run(["soffice", ...], env=env)
```

---

## scripts/comment.py

Add comments to DOCX documents. Handles all the boilerplate across multiple XML files (comments.xml, commentsExtended.xml, commentsIds.xml, commentsExtensible.xml). Text must be pre-escaped XML.

```bash
python scripts/comment.py <unpacked_dir> <comment_id> "<text>" [options]
```

**Arguments:**
- `unpacked_dir` — Unpacked DOCX directory
- `comment_id` — Comment ID (must be unique integer)
- `text` — Comment text (pre-escaped XML, e.g., `&amp;` for `&`, `&#x2019;` for smart quotes)

**Options:**
- `--author <name>` — Author name (default: "Claude")
- `--initials <str>` — Author initials (default: "C")
- `--parent <id>` — Parent comment ID (for replies)

**Examples:**
```bash
python scripts/comment.py unpacked/ 0 "Comment text with &amp; and &#x2019;"
python scripts/comment.py unpacked/ 1 "Reply text" --parent 0
python scripts/comment.py unpacked/ 0 "Text" --author "Custom Author"
```

After running, add markers to document.xml:
```xml
<w:commentRangeStart w:id="0"/>
... commented content ...
<w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
```

---

## scripts/accept_changes.py

Accept all tracked changes in a DOCX file using LibreOffice. Requires LibreOffice (soffice) to be installed.

```bash
python scripts/accept_changes.py <input_file> <output_file>
```

**Arguments:**
- `input_file` — Input DOCX file with tracked changes
- `output_file` — Output DOCX file (clean, no tracked changes)

**Example:**
```bash
python scripts/accept_changes.py input.docx output.docx
```
