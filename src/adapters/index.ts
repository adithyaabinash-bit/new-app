import { blankPage, extension, uid, type EditorDocument, type EditorPage, type FileKind } from '../model'
import { sanitizeHtml } from '../sanitize'

export interface FileAdapter {
  id: string
  kind: FileKind
  extensions: string[]
  openFile(file: File): Promise<EditorDocument>
}

const makeDoc = (file: File, kind: FileKind, pages: EditorPage[], bytes?: Uint8Array): EditorDocument => ({
  id: uid(), name: file.name, originalName: file.name, format: extension(file.name), kind, pages, originalBytes: bytes, updatedAt: Date.now()
})

const loadImage = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(new Error('Could not read image'))
  reader.readAsDataURL(file)
})

const dimensions = (src: string): Promise<{width: number; height: number}> => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
  image.onerror = () => reject(new Error('Could not decode image'))
  image.src = src
})

export const PDFAdapter: FileAdapter = {
  id: 'pdf', kind: 'pdf', extensions: ['pdf'],
  async openFile(file) {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (new TextDecoder().decode(bytes.slice(0, 8)).indexOf('%PDF-') === -1) throw new Error('The file does not contain a valid PDF header')
    const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise
    const pages: EditorPage[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      const scale = 816 / viewport.width
      const renderView = page.getViewport({ scale: scale * Math.min(window.devicePixelRatio || 1, 2) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(renderView.width)
      canvas.height = Math.round(renderView.height)
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: renderView }).promise
      pages.push({ id: uid(), width: 816, height: Math.round(viewport.height * scale), background: canvas.toDataURL('image/jpeg', .88), elements: [], sourcePage: i - 1, rotation: 0 })
      page.cleanup()
    }
    return makeDoc(file, 'pdf', pages, bytes)
  }
}

export const DOCXAdapter: FileAdapter = {
  id: 'docx', kind: 'document', extensions: ['docx'],
  async openFile(file) {
    const mammoth = (await import('mammoth')).default
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('The file does not contain a valid DOCX package')
    const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer as ArrayBuffer })
    const page = blankPage()
    page.richHtml = sanitizeHtml(result.value)
    return makeDoc(file, 'document', [page], bytes)
  }
}

export const ImageAdapter: FileAdapter = {
  id: 'image', kind: 'image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'],
  async openFile(file) {
    const src = await loadImage(file)
    const size = await dimensions(src)
    const width = Math.min(size.width, 1200)
    const height = Math.round(size.height * width / size.width)
    return makeDoc(file, 'image', [{ id: uid(), width, height, background: src, elements: [], rotation: 0 }], new Uint8Array(await file.arrayBuffer()))
  }
}

export const TextAdapter: FileAdapter = {
  id: 'text', kind: 'text', extensions: ['txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml', 'csv', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'sql', 'rtf'],
  async openFile(file) {
    const page = blankPage()
    page.content = await file.text()
    if (page.content.includes('\0')) throw new Error('This appears to be a binary file, not text')
    return makeDoc(file, 'text', [page], new Uint8Array(await file.arrayBuffer()))
  }
}

export const adapters: FileAdapter[] = [PDFAdapter, DOCXAdapter, ImageAdapter, TextAdapter]
export const findAdapter = (file: File) => adapters.find(adapter => adapter.extensions.includes(extension(file.name)))
export const supportedExtensions = adapters.flatMap(adapter => adapter.extensions)
export async function openFile(file: File): Promise<EditorDocument> {
  if (file.size > 50 * 1024 * 1024) throw new Error('This file is over the 50 MB limit.')
  if (!file.size) throw new Error('This file is empty.')
  const adapter = findAdapter(file)
  if (!adapter) throw new Error(`.${extension(file.name)} files are not editable in this release.`)
  try { return await adapter.openFile(file) }
  catch (error) { throw new Error(error instanceof Error ? `Could not open file: ${error.message}` : 'Could not open this file.') }
}
