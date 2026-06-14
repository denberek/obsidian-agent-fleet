# PPTX Tools

## Scripts

All scripts are located in the `scripts/` directory relative to the skill.

### thumbnail.py

Creates a visual grid of slide thumbnails for template analysis.

**Usage:**
```bash
python scripts/thumbnail.py <input.pptx> [output_prefix] [--cols N]
```

**Output:** Creates `thumbnails.jpg` with slide filenames as labels. Default 3 columns, max 12 per grid.

**Dependencies:** `pip install Pillow`

**Note:** Use for template analysis only (choosing layouts). For visual QA, use `soffice` + `pdftoppm` for full-resolution individual slide images.

---

### office/unpack.py

Extracts and pretty-prints PPTX contents for editing.

**Usage:**
```bash
python scripts/office/unpack.py <input.pptx> <unpacked_dir/>
```

Extracts the PPTX archive, pretty-prints XML files, and escapes smart quotes for safe editing.

---

### add_slide.py

Duplicates a slide or creates a new slide from a layout.

**Usage:**
```bash
python scripts/add_slide.py <unpacked_dir/> <slide2.xml>       # Duplicate slide
python scripts/add_slide.py <unpacked_dir/> <slideLayout2.xml>  # From layout
```

**Output:** Prints the `<p:sldId>` XML element to add to `<p:sldIdLst>` at the desired position. Handles notes references, Content_Types.xml, and relationship IDs automatically.

**Important:** Never manually copy slide files -- always use this script.

---

### clean.py

Removes orphaned files after slide operations.

**Usage:**
```bash
python scripts/clean.py <unpacked_dir/>
```

Removes slides not referenced in `<p:sldIdLst>`, unreferenced media files, and orphaned relationship entries.

---

### office/pack.py

Repacks an unpacked directory into a PPTX file with validation.

**Usage:**
```bash
python scripts/office/pack.py <unpacked_dir/> <output.pptx> --original <input.pptx>
```

Validates XML structure, repairs common issues, condenses XML whitespace, and re-encodes smart quotes.

---

### office/soffice.py

Wrapper for LibreOffice's `soffice` command, auto-configured for sandboxed environments.

**Usage:**
```bash
python scripts/office/soffice.py --headless --convert-to pdf <output.pptx>
```

Used to convert PPTX to PDF for slide image generation. Handles sandboxed environment configuration automatically.

---

### office/validate.py

Validates PPTX XML structure against Office Open XML schemas.

**Usage:**
```bash
python scripts/office/validate.py <unpacked_dir/>
```

---

### office/helpers/merge_runs.py

Merges adjacent text runs in PPTX XML for cleaner output.

---

### office/helpers/simplify_redlines.py

Simplifies redline (tracked changes) markup in Office XML documents.

---

## Dependencies

| Package | Purpose | Install |
|---------|---------|---------|
| `markitdown[pptx]` | Text extraction from PPTX | `pip install "markitdown[pptx]"` |
| `Pillow` | Thumbnail grid generation | `pip install Pillow` |
| `pptxgenjs` | Creating presentations from scratch | `npm install -g pptxgenjs` |
| LibreOffice | PPTX to PDF conversion | System package (`soffice`) |
| Poppler | PDF to images | System package (`pdftoppm`) |
| `react-icons` | Icon generation for slides | `npm install -g react-icons react react-dom sharp` |
