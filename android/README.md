# Forma Android

Forma for Android is a native Android application. It does not include or display the browser editor. File selection, page rendering, annotation drawing, and exports run locally on the device.

## Feature parity checklist

- Open PDFs, common images, DOCX, and text formats from device storage.
- Edit text documents and annotate rendered pages with text, drawing, highlighting, whiteout, and inserted images.
- Navigate PDF pages and adjust page zoom.
- Add, duplicate, delete, and reorder PDF pages, and undo or redo annotation edits.
- Save project copies locally or export the original, PDF page, PNG, plain text, HTML, and Forma JSON.

## Build

Open this folder in Android Studio and run the `app` configuration. The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

The web version remains in the repository root. Android code is in `app/src/main/java/com/forma/editor`.

The native DOCX import extracts editable text rather than preserving Word's rich layout. The browser-only search panel and detailed layer/property inspector are not part of the current native screen yet.
