import type { EditorDocument, EditorElement, EditorPage } from './model'
import { replaceExtension } from './model'
import { escapeHtml, sanitizeHtml } from './sanitize'

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = reject
  image.src = src
})

export async function paintElements(ctx: CanvasRenderingContext2D, elements: EditorElement[]) {
  for (const element of elements) {
    ctx.save()
    ctx.globalAlpha = element.opacity ?? 1
    if (element.type === 'text') {
      const size = element.fontSize ?? 24
      ctx.fillStyle = element.color ?? '#172235'
      ctx.font = `${element.fontStyle === 'italic' ? 'italic ' : ''}${element.fontWeight === 'bold' ? 'bold ' : ''}${size}px ${element.fontFamily || 'Arial'}`
      ctx.textBaseline = 'top'
      const lines = (element.text || '').split('\n')
      lines.forEach((line, index) => ctx.fillText(line, element.x, element.y + index * size * 1.25, element.width))
    } else if (element.type === 'shape' || element.type === 'cover') {
      ctx.fillStyle = element.type === 'cover' ? '#fff' : element.fill || '#bfd8ff'
      ctx.strokeStyle = element.color || '#486de8'
      ctx.lineWidth = element.size ?? 2
      ctx.beginPath()
      if (element.shape === 'ellipse') ctx.ellipse(element.x + element.width / 2, element.y + element.height / 2, Math.abs(element.width / 2), Math.abs(element.height / 2), 0, 0, Math.PI * 2)
      else ctx.rect(element.x, element.y, element.width, element.height)
      ctx.fill(); if (element.type !== 'cover') ctx.stroke()
    } else if (element.type === 'stroke' && element.points?.length) {
      ctx.lineWidth = element.size || 4
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      if (element.pointColors && element.pointColors.length > 1) {
        element.points.slice(1).forEach((point, index) => {
          ctx.strokeStyle = element.pointColors?.[index + 1] || element.color || '#4967d5'
          ctx.beginPath(); ctx.moveTo(element.points![index].x, element.points![index].y); ctx.lineTo(point.x, point.y); ctx.stroke()
        })
      } else {
        ctx.strokeStyle = element.color || '#4967d5'
        ctx.beginPath()
        ctx.moveTo(element.points[0].x, element.points[0].y)
        element.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
        ctx.stroke()
      }
    } else if (element.type === 'image' && element.src) {
      try { ctx.drawImage(await loadImage(element.src), element.x, element.y, element.width, element.height) } catch { /* broken embedded image */ }
    }
    ctx.restore()
  }
}

async function pageCanvas(page: EditorPage, withBackground: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(page.width * 2)
  canvas.height = Math.ceil(page.height * 2)
  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2)
  if (withBackground) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, page.width, page.height)
    if (page.background) ctx.drawImage(await loadImage(page.background), 0, 0, page.width, page.height)
    const sourceText = page.content !== undefined ? page.content : page.richHtml !== undefined ? new DOMParser().parseFromString(page.richHtml, 'text/html').body.textContent || '' : ''
    if (sourceText) {
      ctx.fillStyle = '#1e293b'
      ctx.font = page.content !== undefined ? '14px Consolas, monospace' : '16px Arial, sans-serif'
      ctx.textBaseline = 'top'
      sourceText.split(/\r?\n/).forEach((line, index) => {
        const chunks = line.match(new RegExp(`.{1,${Math.max(20, Math.floor(page.width / 9))}}`, 'g')) || ['']
        chunks.forEach((chunk, chunkIndex) => ctx.fillText(chunk, 75, 68 + (index + chunkIndex) * 24, page.width - 150))
      })
    }
  }
  await paintElements(ctx, page.elements)
  return canvas
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function downloadOriginal(doc: EditorDocument) {
  if (!doc.originalBytes) throw new Error('The original file is unavailable.')
  download(new Blob([new Uint8Array(doc.originalBytes)]), doc.originalName || doc.name)
}

export type ExportFormat = 'original' | 'pdf' | 'html' | 'png' | 'txt' | 'json'

export interface ExportChoice {
  format: ExportFormat
  label: string
  extension: string
  available: boolean
  detail: string
}

export function getExportChoices(doc: EditorDocument): ExportChoice[] {
  return [
    { format: 'original', label: 'Original file', extension: doc.format.toUpperCase(), available: !!doc.originalBytes, detail: 'Download the untouched upload' },
    { format: 'pdf', label: 'PDF', extension: 'PDF', available: true, detail: 'Flatten pages and visual edits' },
    { format: 'html', label: 'HTML', extension: 'HTML', available: true, detail: 'Keep text and editable visual layers' },
    { format: 'png', label: 'PNG', extension: 'PNG', available: true, detail: 'Export the first page as an image' },
    { format: 'txt', label: 'Plain text', extension: 'TXT', available: doc.kind !== 'image', detail: 'Export editable text content' },
    { format: 'json', label: 'Forma project', extension: 'JSON', available: true, detail: 'Save the editable project model' }
  ]
}

function overlayHtml(element: EditorElement, width: number, height: number) {
  const position = `position:absolute;left:${element.x}px;top:${element.y}px;width:${element.width}px;height:${element.height}px;opacity:${element.opacity ?? 1};`
  if (element.type === 'text') return `<div style="${position}white-space:pre-wrap;overflow:hidden;color:${element.color || '#172235'};font:${element.fontStyle === 'italic' ? 'italic ' : ''}${element.fontWeight === 'bold' ? 'bold ' : ''}${element.fontSize || 24}px ${element.fontFamily || 'Arial'};text-align:${element.textAlign || 'left'}">${escapeHtml(element.text || '')}</div>`
  if (element.type === 'image') return `<img alt="Inserted image" src="${element.src || ''}" style="${position}"/>`
  if (element.type === 'shape' || element.type === 'cover') return `<div style="${position}background:${element.type === 'cover' ? '#fff' : element.fill || '#bfd8ff'};${element.type === 'shape' ? `border:${element.size || 2}px solid ${element.color || '#516be8'};` : ''}border-radius:${element.shape === 'ellipse' ? '50%' : '0'}"></div>`
  if (element.type === 'stroke') {
    const points = element.points || []
    const lines = element.pointColors && element.pointColors.length > 1
      ? points.slice(1).map((point, index) => `<line x1="${points[index].x}" y1="${points[index].y}" x2="${point.x}" y2="${point.y}" stroke="${element.pointColors?.[index + 1] || element.color || '#516be8'}"/>`).join('')
      : `<polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}"/>`
    return `<svg width="${width}" height="${height}" style="position:absolute;inset:0;opacity:${element.opacity ?? 1};fill:none;stroke:${element.color || '#516be8'};stroke-width:${element.size || 4};stroke-linecap:round;stroke-linejoin:round">${lines}</svg>`
  }
  return ''
}

function editedHtml(doc: EditorDocument) {
  const pages = doc.pages.map(page => `<section class="page" style="position:relative;width:${page.width}px;min-height:${page.height}px;background:white;margin:0 auto 30px;box-shadow:0 2px 12px #0002;overflow:hidden">${page.richHtml !== undefined ? `<div class="content">${sanitizeHtml(page.richHtml)}</div>` : `<div class="content plain">${escapeHtml(page.content || '')}</div>`}${page.elements.map(el => overlayHtml(el, page.width, page.height)).join('')}</section>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(doc.name)}</title><style>body{margin:30px;background:#eef0f5;color:#202a40;font:16px/1.5 Arial,sans-serif}.content{padding:65px 75px}.content img{max-width:100%}.plain{white-space:pre-wrap;font:14px/1.6 Consolas,monospace}@media print{body{margin:0;background:white}.page{box-shadow:none!important;margin:0!important;page-break-after:always}}</style></head><body>${pages}</body></html>`
}

export async function exportDocument(doc: EditorDocument, format?: ExportFormat) {
  const selectedFormat = format || (doc.kind === 'image' ? 'png' : doc.kind === 'pdf' ? 'pdf' : doc.kind === 'document' ? 'html' : 'txt')
  if (selectedFormat === 'original') {
    downloadOriginal(doc)
    return 'Original file downloaded'
  }
  if (selectedFormat === 'json') {
    const project = { ...doc, originalBytes: undefined }
    download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json;charset=utf-8' }), replaceExtension(doc.name, 'forma.json'))
    return 'Forma project downloaded'
  }
  if (selectedFormat === 'html') {
    download(new Blob([editedHtml(doc)], { type: 'text/html;charset=utf-8' }), replaceExtension(doc.name, 'html'))
    return 'Edited HTML downloaded'
  }
  if (selectedFormat === 'txt') {
    const text = doc.pages.map(page => {
      if (page.content !== undefined) return page.content
      if (page.richHtml !== undefined) return new DOMParser().parseFromString(page.richHtml, 'text/html').body.textContent || ''
      return page.elements.filter(element => element.type === 'text').map(element => element.text || '').join('\n')
    }).join('\n\n')
    download(new Blob([text], { type: 'text/plain;charset=utf-8' }), replaceExtension(doc.name, 'txt'))
    return 'Plain text downloaded'
  }
  if (selectedFormat === 'png') {
    const canvas = await pageCanvas(doc.pages[0], true)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image export failed')), 'image/png'))
    download(blob, replaceExtension(doc.name, 'png'))
    return 'PNG downloaded'
  }
  if (selectedFormat === 'pdf') {
    const { PDFDocument, degrees } = await import('pdf-lib')
    const output = await PDFDocument.create()
    const original = doc.kind === 'pdf' && doc.originalBytes ? await PDFDocument.load(doc.originalBytes, { ignoreEncryption: false }) : null
    for (const page of doc.pages) {
      let outPage
      if (original && page.sourcePage !== undefined) {
        const [copied] = await output.copyPages(original, [page.sourcePage])
        outPage = output.addPage(copied)
      } else outPage = output.addPage([page.width * .75, page.height * .75])
      const shouldPaintPage = doc.kind !== 'pdf' || page.elements.length > 0
      if (shouldPaintPage) {
        const overlay = await pageCanvas(page, doc.kind !== 'pdf')
        const png = await output.embedPng(overlay.toDataURL('image/png'))
        const { width, height } = outPage.getSize()
        outPage.drawImage(png, { x: 0, y: 0, width, height })
      }
      if (page.rotation) outPage.setRotation(degrees(page.rotation))
    }
    download(new Blob([new Uint8Array(await output.save())], { type: 'application/pdf' }), replaceExtension(doc.name, 'pdf'))
    return 'PDF downloaded'
  }
  throw new Error('This format cannot be exported yet.')
}
