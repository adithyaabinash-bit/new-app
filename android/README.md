# Forma Android

This folder is the Android handoff for Forma. The existing web editor remains the feature reference and the Android client should preserve the same local-first behavior.

## Feature parity checklist

- Open files from device storage and keep recent projects locally.
- Edit PDF, image, text, Markdown, HTML, and supported document content.
- Select, pan, add and move text, draw, highlight, erase or whiteout, and insert images.
- Keep undo and redo history, page and layer navigation, file metadata, zoom, fit, and fullscreen behavior.
- Export original files, flattened PDF, editable HTML, PNG, plain text, and Forma JSON projects.
- Support light and dark themes, compact phone layouts, touch targets, safe areas, and keyboard shortcuts when a hardware keyboard is present.

## Recommended implementation

Use a Kotlin Android shell with a single WebView loading the built Forma bundle. The bridge should expose Android's document picker and download APIs to the existing local-first adapters. Keep the editor UI in the shared web bundle so the Android build does not drift from the browser feature set.

The native build can later replace individual bridge pieces with Kotlin implementations without changing the editor model or export formats.

## APK size

The debug APK is about 1.1 MB. That is expected for a WebView app: Android provides the WebView engine, and Gradle compresses the roughly 3 MB web bundle (including the PDF worker) inside the APK.
