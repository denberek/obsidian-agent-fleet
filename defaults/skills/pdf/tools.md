# PDF Tools

## Scripts

All scripts are located in the `scripts/` directory relative to the skill.

### check_fillable_fields.py

Checks whether a PDF has fillable form fields.

**Usage:**
```bash
python scripts/check_fillable_fields.py <file.pdf>
```

**Output:** Prints either "This PDF has fillable form fields" or "This PDF does not have fillable form fields; you will need to visually determine where to enter data".

---

### extract_form_field_info.py

Extracts detailed information about fillable form fields from a PDF.

**Usage:**
```bash
python scripts/extract_form_field_info.py <input.pdf> <field_info.json>
```

**Output:** Creates a JSON file listing all form fields with their IDs, page numbers, bounding boxes, and types (text, checkbox, radio_group, choice). Includes checked/unchecked values for checkboxes, radio options for radio groups, and choice options for dropdowns.

---

### convert_pdf_to_images.py

Converts a PDF file to PNG images, one per page.

**Usage:**
```bash
python scripts/convert_pdf_to_images.py <file.pdf> <output_directory>
```

**Output:** Creates `page_1.png`, `page_2.png`, etc. in the output directory.

---

### extract_form_structure.py

Extracts text labels, lines, and checkboxes with exact PDF coordinates from a non-fillable PDF form.

**Usage:**
```bash
python scripts/extract_form_structure.py <input.pdf> <form_structure.json>
```

**Output:** JSON file containing:
- `labels`: Every text element with exact coordinates (x0, top, x1, bottom in PDF points)
- `lines`: Horizontal lines that define row boundaries
- `checkboxes`: Small square rectangles with center coordinates
- `row_boundaries`: Row top/bottom positions

---

### check_bounding_boxes.py

Validates bounding boxes in a fields.json file before filling a form.

**Usage:**
```bash
python scripts/check_bounding_boxes.py <fields.json>
```

**Checks for:**
- Intersecting bounding boxes (which would cause overlapping text)
- Entry boxes that are too small for the specified font size

---

### fill_fillable_fields.py

Fills fillable form fields in a PDF using specified values.

**Usage:**
```bash
python scripts/fill_fillable_fields.py <input.pdf> <field_values.json> <output.pdf>
```

**Input format (field_values.json):**
```json
[
  {"field_id": "last_name", "description": "...", "page": 1, "value": "Simpson"},
  {"field_id": "Checkbox12", "description": "...", "page": 1, "value": "/On"}
]
```

Validates field IDs and values; prints error messages if invalid.

---

### fill_pdf_form_with_annotations.py

Fills non-fillable PDF forms by adding text annotations at specified coordinates.

**Usage:**
```bash
python scripts/fill_pdf_form_with_annotations.py <input.pdf> <fields.json> <output.pdf>
```

Auto-detects coordinate system (PDF or image coordinates) from the `pages` array in fields.json (looks for `pdf_width`/`pdf_height` vs `image_width`/`image_height`).

---

### create_validation_image.py

Creates a validation image overlaying bounding boxes on a PDF page for visual verification.

**Usage:**
```bash
python scripts/create_validation_image.py <args>
```

Used to visually verify that field coordinates are correct before filling.
