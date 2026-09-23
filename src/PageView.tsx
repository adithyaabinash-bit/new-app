import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { EditorElement, EditorPage, Tool } from './model'
import { uid } from './model'
import { escapeHtml, sanitizeHtml } from './sanitize'

interface Props {
  page: EditorPage
  zoom: number
  active: boolean
  tool: Tool
  color: string
  brushSize: number
  selectedId: string | null
  onActivate: () => void
  onSelect: (id: string | null) => void
  onAdd: (element: EditorElement) => void
  onUpdate: (id: string, patch: Partial<EditorElement>) => void
  onDelete: (id: string) => void
  onContent: (value: string, rich: boolean) => void
  onRequestText: (position: { x: number; y: number }) => void
}

export default function PageView({ page, zoom, active, tool, color, brushSize, selectedId, onActivate, onSelect, onAdd, onUpdate, onDelete, onContent, onRequestText }: Props) {
  void onRequestText
  const [draft, setDraft] = useState<EditorElement | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const gesture = useRef<{ id: string; x: number; y: number; startX: number; startY: number; width: number; height: number; resize: boolean } | null>(null)
  const draftOrigin = useRef<{ x: number; y: number } | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const backgroundPixels = useRef<CanvasRenderingContext2D | null>(null)
  useEffect(() => {
    backgroundPixels.current = null
    if (!page.background) return
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(page.width))
      canvas.height = Math.max(1, Math.round(page.height))
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      backgroundPixels.current = context
    }
    image.src = page.background
    return () => { image.onload = null }
  }, [page.background, page.width, page.height])
  useEffect(() => {
    if (!editing) return
    const editor = pageRef.current?.querySelector<HTMLElement>(`[data-element-id="${editing}"] .element-text`)
    if (!editor) return
    const frame = window.requestAnimationFrame(() => editor.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [editing, page.elements])
  const sampledBackground = (x: number, y: number, radius: number) => {
    const context = backgroundPixels.current
    if (!context) return '#fff'
    const buckets = new Map<string, { r: number; g: number; b: number; count: number }>()
    const outerRadius = Math.max(14, radius * 2.5)
    for (let angle = 0; angle < 360; angle += 30) {
      for (const distance of [outerRadius, outerRadius * 1.55]) {
        const sampleX = Math.max(0, Math.min(page.width - 1, Math.round(x + Math.cos(angle * Math.PI / 180) * distance)))
        const sampleY = Math.max(0, Math.min(page.height - 1, Math.round(y + Math.sin(angle * Math.PI / 180) * distance)))
        const pixel = context.getImageData(sampleX, sampleY, 1, 1).data
        if (pixel[3] < 30) continue
        const key = `${Math.round(pixel[0] / 24)}-${Math.round(pixel[1] / 24)}-${Math.round(pixel[2] / 24)}`
        const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 }
        bucket.r += pixel[0]; bucket.g += pixel[1]; bucket.b += pixel[2]; bucket.count += 1
        buckets.set(key, bucket)
      }
    }
    const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0]
    return best ? `rgb(${Math.round(best.r / best.count)}, ${Math.round(best.g / best.count)}, ${Math.round(best.b / best.count)})` : '#fff'
  }
  const point = (event: ReactPointerEvent) => {
    const rect = pageRef.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(page.width, (event.clientX - rect.left) / zoom)), y: Math.max(0, Math.min(page.height, (event.clientY - rect.top) / zoom)) }
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== pageRef.current && !(event.target as HTMLElement).closest('.base-content')) return
    onActivate(); onSelect(null)
    const p = point(event)
    if (tool === 'text') {
      const id = uid()
      onAdd({ id, type: 'text', x: p.x, y: p.y, width: 280, height: 42, text: '', color: '#111827', fontFamily: 'Inter', fontSize: 24, opacity: 1 })
      onSelect(id)
      setEditing(id)
    } else if (tool === 'eraser') {
      const size = Math.max(8, brushSize * 4)
      const backgroundColor = sampledBackground(p.x, p.y, size)
      setDraft({ id: uid(), type: 'stroke', x: 0, y: 0, width: page.width, height: page.height, color: backgroundColor, pointColors: [backgroundColor], size, opacity: 1, points: [p] })
      event.currentTarget.setPointerCapture(event.pointerId)
    } else if (tool === 'pen' || tool === 'highlight') {
      setDraft({ id: uid(), type: 'stroke', x: 0, y: 0, width: page.width, height: page.height, color, size: tool === 'highlight' ? brushSize * 3 : brushSize, opacity: tool === 'highlight' ? .32 : 1, points: [p] })
      event.currentTarget.setPointerCapture(event.pointerId)
    } else if (tool === 'rectangle' || tool === 'ellipse' || tool === 'cover') {
      draftOrigin.current = p
      setDraft({ id: uid(), type: tool === 'cover' ? 'cover' : 'shape', x: p.x, y: p.y, width: 1, height: 1, shape: tool === 'ellipse' ? 'ellipse' : 'rectangle', color, fill: tool === 'cover' ? '#fff' : `${color}33`, size: 2, opacity: 1 })
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const p = point(event)
    if (gesture.current) {
      const g = gesture.current
      if (g.resize) onUpdate(g.id, { width: Math.max(30, g.width + p.x - g.x), height: Math.max(24, g.height + p.y - g.y) })
      else onUpdate(g.id, { x: Math.max(0, g.startX + p.x - g.x), y: Math.max(0, g.startY + p.y - g.y) })
      return
    }
    if (!draft) return
    if (draft.type === 'stroke') {
      const nextColor = tool === 'eraser' ? sampledBackground(p.x, p.y, draft.size || brushSize) : draft.color || color
      setDraft({ ...draft, points: [...(draft.points || []), p], pointColors: tool === 'eraser' ? [...(draft.pointColors || []), nextColor] : draft.pointColors })
    }
    else { const start = draftOrigin.current || p; setDraft({ ...draft, x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y) }) }
  }
  const onPointerUp = () => {
    if (gesture.current) { gesture.current = null; return }
    if (draft) {
      if (draft.type === 'stroke' || (draft.width > 4 && draft.height > 4)) onAdd(draft)
      setDraft(null)
      draftOrigin.current = null
    }
  }
  const startElement = (event: ReactPointerEvent, element: EditorElement, resize = false) => {
    if (tool === 'eraser') { event.stopPropagation(); onDelete(element.id); return }
    if (tool !== 'select') return
    event.stopPropagation(); onActivate(); onSelect(element.id)
    const p = point(event)
    gesture.current = { id: element.id, x: p.x, y: p.y, startX: element.x, startY: element.y, width: element.width, height: element.height, resize }
    pageRef.current?.setPointerCapture(event.pointerId)
  }
  const renderElement = (element: EditorElement, temporary = false) => {
    const selected = element.id === selectedId && !temporary
    if (element.type === 'stroke') {
      const points = element.points || []
      const colors = element.pointColors
      return <svg key={element.id} className="stroke-layer" width={page.width} height={page.height} style={{ pointerEvents: 'none' }} onPointerDown={e => startElement(e, element)}>{colors && colors.length > 1 ? points.slice(1).map((point, index) => <line key={index} x1={points[index].x} y1={points[index].y} x2={point.x} y2={point.y} stroke={colors[index + 1] || element.color || '#4267ee'} strokeWidth={element.size || 4} strokeOpacity={element.opacity ?? 1} strokeLinecap="round" style={{ pointerEvents: tool === 'eraser' ? 'stroke' : 'none' }} />) : <polyline style={{ pointerEvents: tool === 'eraser' ? 'stroke' : 'none' }} points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={element.color || '#4267ee'} strokeWidth={element.size || 4} strokeOpacity={element.opacity ?? 1} strokeLinecap="round" strokeLinejoin="round" />}</svg>
    }
    const style: React.CSSProperties = { left: element.x, top: element.y, width: element.width, height: element.height, opacity: element.opacity ?? 1 }
    return <div key={element.id} data-element-id={element.id} className={`canvas-element ${selected ? 'selected' : ''} ${element.type}`} style={style} onPointerDown={e => startElement(e, element)} onDoubleClick={e => { if (element.type === 'text') { e.stopPropagation(); setEditing(element.id) } }}>
      {element.type === 'text' && <div className="element-text" contentEditable={editing === element.id} suppressContentEditableWarning style={{ color: element.color || '#111827', fontFamily: element.fontFamily || 'Inter', fontSize: element.fontSize || 24, fontWeight: element.fontWeight, fontStyle: element.fontStyle, textAlign: element.textAlign || 'left' }} onBlur={e => { if (editing === element.id) onUpdate(element.id, { text: e.currentTarget.innerText }); setEditing(null) }}>{element.text}</div>}
      {element.type === 'shape' && <div className={`element-shape ${element.shape || 'rectangle'}`} style={{ background: element.fill || '#dae5ff', borderColor: element.color || '#5470ec', borderWidth: element.size || 2 }} />}
      {element.type === 'cover' && <div className="element-cover" />}
      {element.type === 'image' && <img src={element.src} draggable={false} alt="Inserted" />}
      {selected && <span className="resize-handle" onPointerDown={e => startElement(e, element, true)} />}
    </div>
  }
  return <div className="page-shell" style={{ width: page.width * zoom, height: page.height * zoom }}>
    <div ref={pageRef} className={`document-page ${active ? 'active-page' : ''} ${tool !== 'select' ? `tool-${tool}` : ''}`} style={{ width: page.width, height: page.height, transform: `scale(${zoom})`, backgroundImage: page.background ? `url(${page.background})` : undefined }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      {(page.content !== undefined || page.richHtml !== undefined) && <div ref={contentRef} data-surface="true" className={`base-content ${page.content !== undefined ? 'plain-content' : 'rich-content'}`} contentEditable={tool === 'select'} suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: page.richHtml !== undefined ? page.richHtml : escapeHtml(page.content || '').replace(/\n/g, '<br>') }} onBlur={e => onContent(page.richHtml !== undefined ? sanitizeHtml(e.currentTarget.innerHTML) : e.currentTarget.innerText, page.richHtml !== undefined)} />}
      {page.elements.map(element => renderElement(element))}
      {draft && renderElement(draft, true)}
    </div>
  </div>
}
