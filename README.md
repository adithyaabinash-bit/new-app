# Forma — Universal File Editor

Forma is a local-first browser editor for common document, PDF, image, and text files. It keeps the uploaded original unchanged and saves editable projects in IndexedDB.

## Run

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`. Build with `pnpm build`.

## Supported in this release

| Input | Editing | Export |
| --- | --- | --- |
| PDF | Page reorder, duplicate, delete, add blank page; text, image, shape, drawing, highlight, visual cover overlays | PDF with original pages and flattened overlay |
| DOCX | Editable imported text and basic document structure; visual layers | HTML containing edits and layers |
| PNG, JPEG, WebP, BMP, GIF | Visual layers on the image | PNG |
| TXT, Markdown, JSON, XML, YAML, CSV, HTML, CSS, JS, TS, Python, Java, C/C++, SQL, RTF | Plain text plus optional visual layers | Original text format without layers, HTML when visual layers are used |

The Export menu offers Original, PDF, HTML, PNG, Plain text, and Forma project JSON. PDF, HTML, PNG, and project JSON are available for every opened file; Plain text is available for non-image files. Options that require an adapter not present in this release are shown as unavailable.

The eraser deletes editable layers and paints a whiteout stroke directly over imported page content, so it works on opened PDF, image, and text pages. Whiteout is visual rather than cryptographic redaction: the original upload remains unchanged and underlying source text can still exist in the project model. DOCX import converts to HTML and does not guarantee exact Word layout. DOC, ODT, XLS/XLSX, ODS, PPT/PPTX, ODP, SVG, TIFF, OCR, collaboration, and cloud sync are outside this first release; unsupported uploads report that clearly.

## Project structure

- `src/adapters/`: file detection and import adapters. Add an adapter to the registry to support another format.
- `src/model.ts`: editable document and element types.
- `src/PageView.tsx`: interactive page canvas and overlay tools.
- `src/export.ts`: format-aware exports.
- `src/storage.ts`: local project persistence.
- `src/App.tsx`: workspace, file manager, state, and command history.

The editor has no server and sends no files to a cloud service. Projects are stored only in the current browser profile. Use **Save** to preserve a working copy and **Export** to download an edited file.
