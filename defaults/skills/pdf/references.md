# PDF Skill References

This file combines the forms guide and advanced reference documentation for the PDF skill.

## Table of Contents

- [Forms Guide](#forms-guide)
  - [Fillable Fields](#fillable-fields)
  - [Non-fillable Fields](#non-fillable-fields)
  - [Hybrid Approach](#hybrid-approach)
- [Advanced Reference](#advanced-reference)
  - [pypdfium2 Library](#pypdfium2-library)
  - [JavaScript Libraries](#javascript-libraries)
  - [Advanced Command-Line Operations](#advanced-command-line-operations)
  - [Advanced Python Techniques](#advanced-python-techniques)
  - [Complex Workflows](#complex-workflows)
  - [Performance Optimization Tips](#performance-optimization-tips)
  - [Troubleshooting Common Issues](#troubleshooting-common-issues)

---

# Forms Guide

**CRITICAL: You MUST complete these steps in order. Do not skip ahead to writing code.**

If you need to fill out a PDF form, first check to see if the PDF has fillable form fields. Run this script from this file's directory:
 `python scripts/check_fillable_fields <file.pdf>`, and depending on the result go to either the "Fillable fields" or "Non-fillable fields" and follow those instructions.

## Fillable Fields

If the PDF has fillable form fields:
- Run this script from this file's directory: `python scripts/extract_form_field_info.py <input.pdf> <field_info.json>`. It will create a JSON file with a list of fields in this format:
```
[
  {
    "field_id": (unique ID for the field),
    "page": (page number, 1-based),
    "rect": ([left, bottom, right, top] bounding box in PDF coordinates, y=0 is the bottom of the page),
    "type": ("text", "checkbox", "radio_group", or "choice"),
  },
  // Checkboxes have "checked_value" and "unchecked_value" properties:
  {
    "field_id": (unique ID for the field),
    "page": (page number, 1-based),
    "type": "checkbox",
    "checked_value": (Set the field to this value to check the checkbox),
    "unchecked_value": (Set the field to this value to uncheck the checkbox),
  },
  // Radio groups have a "radio_options" list with the possible choices.
  {
    "field_id": (unique ID for the field),
    "page": (page number, 1-based),
    "type": "radio_group",
    "radio_options": [
      {
        "value": (set the field to this value to select this radio option),
        "rect": (bounding box for the radio button for this option)
      },
    ]
  },
  // Multiple choice fields have a "choice_options" list with the possible choices:
  {
    "field_id": (unique ID for the field),
    "page": (page number, 1-based),
    "type": "choice",
    "choice_options": [
      {
        "value": (set the field to this value to select this option),
        "text": (display text of the option)
      },
    ],
  }
]
```
- Convert the PDF to PNGs (one image for each page) with this script (run from this file's directory):
`python scripts/convert_pdf_to_images.py <file.pdf> <output_directory>`
Then analyze the images to determine the purpose of each form field (make sure to convert the bounding box PDF coordinates to image coordinates).
- Create a `field_values.json` file in this format with the values to be entered for each field:
```
[
  {
    "field_id": "last_name",
    "description": "The user's last name",
    "page": 1,
    "value": "Simpson"
  },
  {
    "field_id": "Checkbox12",
    "description": "Checkbox to be checked if the user is 18 or over",
    "page": 1,
    "value": "/On"
  },
]
```
- Run the `fill_fillable_fields.py` script from this file's directory to create a filled-in PDF:
`python scripts/fill_fillable_fields.py <input pdf> <field_values.json> <output pdf>`
This script will verify that the field IDs and values you provide are valid; if it prints error messages, correct the appropriate fields and try again.

## Non-fillable Fields

If the PDF doesn't have fillable form fields, you'll add text annotations. First try to extract coordinates from the PDF structure (more accurate), then fall back to visual estimation if needed.

### Step 1: Try Structure Extraction First

Run this script to extract text labels, lines, and checkboxes with their exact PDF coordinates:
`python scripts/extract_form_structure.py <input.pdf> form_structure.json`

This creates a JSON file containing:
- **labels**: Every text element with exact coordinates (x0, top, x1, bottom in PDF points)
- **lines**: Horizontal lines that define row boundaries
- **checkboxes**: Small square rectangles that are checkboxes (with center coordinates)
- **row_boundaries**: Row top/bottom positions calculated from horizontal lines

**Check the results**: If `form_structure.json` has meaningful labels, use **Approach A: Structure-Based Coordinates**. If the PDF is scanned/image-based, use **Approach B: Visual Estimation**.

---

### Approach A: Structure-Based Coordinates (Preferred)

Use this when `extract_form_structure.py` found text labels in the PDF.

#### A.1: Analyze the Structure

Read form_structure.json and identify:
1. **Label groups**: Adjacent text elements that form a single label
2. **Row structure**: Labels with similar `top` values are in the same row
3. **Field columns**: Entry areas start after label ends
4. **Checkboxes**: Use the checkbox coordinates directly from the structure

**Coordinate system**: PDF coordinates where y=0 is at TOP of page, y increases downward.

#### A.2: Check for Missing Elements

The structure extraction may not detect all form elements (circular checkboxes, complex graphics, faded elements). Use visual analysis for those specific fields.

#### A.3: Create fields.json with PDF Coordinates

For each field, calculate entry coordinates from the extracted structure:

**Text fields:**
- entry x0 = label x1 + 5
- entry x1 = next label's x0, or row boundary
- entry top = same as label top
- entry bottom = row boundary line below

**Checkboxes:**
- Use the checkbox rectangle coordinates directly from form_structure.json

Create fields.json using `pdf_width` and `pdf_height`:
```json
{
  "pages": [
    {"page_number": 1, "pdf_width": 612, "pdf_height": 792}
  ],
  "form_fields": [
    {
      "page_number": 1,
      "description": "Last name entry field",
      "field_label": "Last Name",
      "label_bounding_box": [43, 63, 87, 73],
      "entry_bounding_box": [92, 63, 260, 79],
      "entry_text": {"text": "Smith", "font_size": 10}
    },
    {
      "page_number": 1,
      "description": "US Citizen Yes checkbox",
      "field_label": "Yes",
      "label_bounding_box": [260, 200, 280, 210],
      "entry_bounding_box": [285, 197, 292, 205],
      "entry_text": {"text": "X"}
    }
  ]
}
```

#### A.4: Validate Bounding Boxes

Before filling, check your bounding boxes for errors:
`python scripts/check_bounding_boxes.py fields.json`

---

### Approach B: Visual Estimation (Fallback)

Use this when the PDF is scanned/image-based and structure extraction found no usable text labels.

#### B.1: Convert PDF to Images

`python scripts/convert_pdf_to_images.py <input.pdf> <images_dir/>`

#### B.2: Initial Field Identification

Examine each page image to identify form sections and get rough estimates of field locations.

#### B.3: Zoom Refinement (CRITICAL for accuracy)

For each field, crop a region around the estimated position to refine coordinates precisely.

```bash
magick <page_image> -crop <width>x<height>+<x>+<y> +repage <crop_output.png>
```

Convert crop coordinates back to full image coordinates:
- full_x = crop_x + crop_offset_x
- full_y = crop_y + crop_offset_y

#### B.4: Create fields.json with Refined Coordinates

Create fields.json using `image_width` and `image_height`.

#### B.5: Validate Bounding Boxes

`python scripts/check_bounding_boxes.py fields.json`

---

## Hybrid Approach

Use this when structure extraction works for most fields but misses some elements.

1. **Use Approach A** for fields detected in form_structure.json
2. **Convert PDF to images** for visual analysis of missing fields
3. **Use zoom refinement** for the missing fields
4. **Combine coordinates**: Convert image coordinates to PDF coordinates:
   - pdf_x = image_x * (pdf_width / image_width)
   - pdf_y = image_y * (pdf_height / image_height)
5. **Use a single coordinate system** in fields.json

---

## Filling the Form

### Step 2: Validate Before Filling
`python scripts/check_bounding_boxes.py fields.json`

### Step 3: Fill the Form
`python scripts/fill_pdf_form_with_annotations.py <input.pdf> fields.json <output.pdf>`

### Step 4: Verify Output
`python scripts/convert_pdf_to_images.py <output.pdf> <verify_images/>`

---

# Advanced Reference

## pypdfium2 Library (Apache/BSD License)

### Overview
pypdfium2 is a Python binding for PDFium (Chromium's PDF library). Excellent for fast PDF rendering, image generation, and serves as a PyMuPDF replacement.

### Render PDF to Images
```python
import pypdfium2 as pdfium
from PIL import Image

pdf = pdfium.PdfDocument("document.pdf")
page = pdf[0]
bitmap = page.render(scale=2.0, rotation=0)
img = bitmap.to_pil()
img.save("page_1.png", "PNG")

for i, page in enumerate(pdf):
    bitmap = page.render(scale=1.5)
    img = bitmap.to_pil()
    img.save(f"page_{i+1}.jpg", "JPEG", quality=90)
```

### Extract Text with pypdfium2
```python
import pypdfium2 as pdfium

pdf = pdfium.PdfDocument("document.pdf")
for i, page in enumerate(pdf):
    text = page.get_text()
    print(f"Page {i+1} text length: {len(text)} chars")
```

## JavaScript Libraries

### pdf-lib (MIT License)

#### Load and Manipulate Existing PDF
```javascript
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function manipulatePDF() {
    const existingPdfBytes = fs.readFileSync('input.pdf');
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pageCount = pdfDoc.getPageCount();

    const newPage = pdfDoc.addPage([600, 400]);
    newPage.drawText('Added by pdf-lib', { x: 100, y: 300, size: 16 });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('modified.pdf', pdfBytes);
}
```

#### Create Complex PDFs from Scratch
```javascript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';

async function createPDF() {
    const pdfDoc = await PDFDocument.create();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();

    page.drawText('Invoice #12345', {
        x: 50, y: height - 50, size: 18,
        font: helveticaBold, color: rgb(0.2, 0.2, 0.8)
    });

    page.drawRectangle({
        x: 40, y: height - 100, width: width - 80, height: 30,
        color: rgb(0.9, 0.9, 0.9)
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('created.pdf', pdfBytes);
}
```

#### Advanced Merge and Split Operations
```javascript
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function mergePDFs() {
    const mergedPdf = await PDFDocument.create();
    const pdf1 = await PDFDocument.load(fs.readFileSync('doc1.pdf'));
    const pdf2 = await PDFDocument.load(fs.readFileSync('doc2.pdf'));

    const pdf1Pages = await mergedPdf.copyPages(pdf1, pdf1.getPageIndices());
    pdf1Pages.forEach(page => mergedPdf.addPage(page));

    const pdf2Pages = await mergedPdf.copyPages(pdf2, [0, 2, 4]);
    pdf2Pages.forEach(page => mergedPdf.addPage(page));

    fs.writeFileSync('merged.pdf', await mergedPdf.save());
}
```

### pdfjs-dist (Apache License)

#### Basic PDF Loading and Text Extraction
```javascript
import * as pdfjsLib from 'pdfjs-dist';

async function extractText() {
    const pdf = await pdfjsLib.getDocument('document.pdf').promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += `\n--- Page ${i} ---\n${pageText}`;
    }
    return fullText;
}
```

## Advanced Command-Line Operations

### poppler-utils Advanced Features

```bash
# Extract text with bounding box coordinates
pdftotext -bbox-layout document.pdf output.xml

# Convert to PNG images with specific resolution
pdftoppm -png -r 300 document.pdf output_prefix

# Convert specific page range with high resolution
pdftoppm -png -r 600 -f 1 -l 3 document.pdf high_res_pages

# Extract all embedded images with metadata
pdfimages -j -p document.pdf page_images

# List image info without extracting
pdfimages -list document.pdf
```

### qpdf Advanced Features

```bash
# Split PDF into groups of pages
qpdf --split-pages=3 input.pdf output_group_%02d.pdf

# Extract specific pages with complex ranges
qpdf input.pdf --pages input.pdf 1,3-5,8,10-end -- extracted.pdf

# Merge specific pages from multiple PDFs
qpdf --empty --pages doc1.pdf 1-3 doc2.pdf 5-7 doc3.pdf 2,4 -- combined.pdf

# Optimize PDF for web (linearize)
qpdf --linearize input.pdf optimized.pdf

# Attempt to repair corrupted PDF structure
qpdf --check input.pdf
qpdf --fix-qdf damaged.pdf repaired.pdf

# Add password protection with specific permissions
qpdf --encrypt user_pass owner_pass 256 --print=none --modify=none -- input.pdf encrypted.pdf
```

## Advanced Python Techniques

### pdfplumber Advanced Features

```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    page = pdf.pages[0]

    # Extract all text with coordinates
    chars = page.chars
    for char in chars[:10]:
        print(f"Char: '{char['text']}' at x:{char['x0']:.1f} y:{char['y0']:.1f}")

    # Extract text by bounding box
    bbox_text = page.within_bbox((100, 100, 400, 200)).extract_text()
```

### Advanced Table Extraction with Custom Settings
```python
import pdfplumber
import pandas as pd

with pdfplumber.open("complex_table.pdf") as pdf:
    page = pdf.pages[0]
    table_settings = {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 3,
        "intersection_tolerance": 15
    }
    tables = page.extract_tables(table_settings)
```

### reportlab Professional Reports with Tables
```python
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

data = [
    ['Product', 'Q1', 'Q2', 'Q3', 'Q4'],
    ['Widgets', '120', '135', '142', '158'],
    ['Gadgets', '85', '92', '98', '105']
]

doc = SimpleDocTemplate("report.pdf")
elements = []
styles = getSampleStyleSheet()
elements.append(Paragraph("Quarterly Sales Report", styles['Title']))

table = Table(data)
table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('GRID', (0, 0), (-1, -1), 1, colors.black)
]))
elements.append(table)
doc.build(elements)
```

## Complex Workflows

### Extract Figures/Images from PDF

```bash
# Method 1: Using pdfimages (fastest)
pdfimages -all document.pdf images/img
```

### Batch PDF Processing
```python
import os, glob
from pypdf import PdfReader, PdfWriter
import logging

def batch_process_pdfs(input_dir, operation='merge'):
    pdf_files = glob.glob(os.path.join(input_dir, "*.pdf"))

    if operation == 'merge':
        writer = PdfWriter()
        for pdf_file in pdf_files:
            try:
                reader = PdfReader(pdf_file)
                for page in reader.pages:
                    writer.add_page(page)
            except Exception as e:
                logging.error(f"Failed to process {pdf_file}: {e}")
        with open("batch_merged.pdf", "wb") as output:
            writer.write(output)
```

### Advanced PDF Cropping
```python
from pypdf import PdfWriter, PdfReader

reader = PdfReader("input.pdf")
writer = PdfWriter()
page = reader.pages[0]
page.mediabox.left = 50
page.mediabox.bottom = 50
page.mediabox.right = 550
page.mediabox.top = 750
writer.add_page(page)
with open("cropped.pdf", "wb") as output:
    writer.write(output)
```

## Performance Optimization Tips

1. **For Large PDFs**: Use streaming approaches; use `qpdf --split-pages` for splitting
2. **For Text Extraction**: `pdftotext -bbox-layout` is fastest for plain text
3. **For Image Extraction**: `pdfimages` is much faster than rendering pages
4. **For Form Filling**: pdf-lib maintains form structure better than most alternatives
5. **Memory Management**: Process PDFs in chunks for large files

## Troubleshooting Common Issues

### Encrypted PDFs
```python
from pypdf import PdfReader
reader = PdfReader("encrypted.pdf")
if reader.is_encrypted:
    reader.decrypt("password")
```

### Corrupted PDFs
```bash
qpdf --check corrupted.pdf
qpdf --replace-input corrupted.pdf
```

### Text Extraction Issues (Fallback to OCR)
```python
import pytesseract
from pdf2image import convert_from_path

def extract_text_with_ocr(pdf_path):
    images = convert_from_path(pdf_path)
    return "".join(pytesseract.image_to_string(img) for img in images)
```

## License Information

- **pypdf**: BSD License
- **pdfplumber**: MIT License
- **pypdfium2**: Apache/BSD License
- **reportlab**: BSD License
- **poppler-utils**: GPL-2 License
- **qpdf**: Apache License
- **pdf-lib**: MIT License
- **pdfjs-dist**: Apache License
