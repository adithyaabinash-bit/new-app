export type FileKind = 'pdf' | 'document' | 'image' | 'text' | 'unsupported'
export type Tool = 'select' | 'hand' | 'text' | 'pen' | 'highlight' | 'eraser' | 'rectangle' | 'ellipse' | 'cover'
export type ElementType = 'text' | 'stroke' | 'shape' | 'image' | 'cover'

export interface EditorElement {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  text?: string
  color?: string
  fill?: string
  size?: number
  opacity?: number
  fontSize?: number
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  textAlign?: 'left' | 'center' | 'right'
  shape?: 'rectangle' | 'ellipse'
  points?: { x: number; y: number }[]
  pointColors?: string[]
  src?: string
}

export interface EditorPage {
  id: string
  width: number
  height: number
  background?: string
  content?: string
  richHtml?: string
  elements: EditorElement[]
  sourcePage?: number
  rotation: number
}

export interface EditorDocument {
  id: string
  name: string
  kind: FileKind
  format: string
  pages: EditorPage[]
  originalBytes?: Uint8Array
  originalName?: string
  updatedAt: number
}

export const uid = () => crypto.randomUUID()
export const blankPage = (): EditorPage => ({ id: uid(), width: 816, height: 1056, elements: [], rotation: 0 })
export const extension = (name: string) => name.split('.').pop()?.toLowerCase() || ''
export const replaceExtension = (name: string, ext: string) => `${name.replace(/\.[^.]+$/, '')}.${ext}`
