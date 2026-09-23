import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowDownToLine, ArrowLeft, ChevronDown, ChevronRight, Copy, Download, Eraser, FileImage, FilePlus2, FileText, FolderOpen, GripVertical, Hand, Highlighter, ImagePlus, Layers3, LayoutGrid, Maximize2, Menu, Minus, Monitor, Moon, MousePointer2, PenLine, Plus, Redo2, Save, Search, Settings2, Smartphone, Sun, Trash2, Undo2, UploadCloud, X } from 'lucide-react'
import PageView from './PageView'
import MobileViewport from './components/MobileViewport'
import { openFile } from './adapters'
import { downloadOriginal, exportDocument, getExportChoices, type ExportFormat } from './export'
import { blankPage, uid, type EditorDocument, type EditorElement, type Tool } from './model'
import { deleteDocument, getDocuments, saveDocument } from './storage'

type SidebarTab = 'pages' | 'layers' | 'files'
type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'failed'
const toolbar: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2 }, { id: 'hand', label: 'Pan', icon: Hand },
  { id: 'text', label: 'Add text', icon: FileText }, { id: 'pen', label: 'Draw', icon: PenLine },
  { id: 'highlight', label: 'Highlight', icon: Highlighter }, { id: 'eraser', label: 'Erase object', icon: Eraser }
]
const kindIcon = { pdf: FileText, document: FileText, image: FileImage, text: FileText, unsupported: FileText }
const kindColor = { pdf: 'orange', document: 'blue', image: 'purple', text: 'green', unsupported: 'gray' }

export default function App() {
  const [doc, setDoc] = useState<EditorDocument | null>(null)
  const docRef = useRef<EditorDocument | null>(null)
  const past = useRef<EditorDocument[]>([])
  const future = useRef<EditorDocument[]>([])
  const lastChange = useRef<{ key: string; at: number } | null>(null)
  const [, historyRefresh] = useState(0)
  const [recent, setRecent] = useState<EditorDocument[]>([])
  const [selectedPage, setSelectedPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState('#516be8')
  const [brushSize, setBrushSize] = useState(4)
  const [zoom, setZoom] = useState(.74)
  const [sidebar, setSidebar] = useState<SidebarTab>('pages')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('forma-theme') as 'light' | 'dark') || 'light')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [textDraft, setTextDraft] = useState<{ pageIndex: number; x: number; y: number } | null>(null)
  const [textValue, setTextValue] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [viewportMode, setViewportMode] = useState<'desktop' | 'mobile'>('desktop')
  const [mobileDrawer, setMobileDrawer] = useState<'none' | 'sidebar' | 'inspector'>('none')
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  useEffect(() => { getDocuments().then(setRecent).catch(() => showToast('Local projects could not be loaded')) }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('forma-theme', theme) }, [theme])
  useEffect(() => {
    if (!doc || saveStatus !== 'unsaved') return
    const timer = setTimeout(async () => {
      setSaveStatus('saving')
      try { await saveDocument(doc); setSaveStatus(docRef.current === doc ? 'saved' : 'unsaved'); setRecent(items => [doc, ...items.filter(item => item.id !== doc.id)]) }
      catch { setSaveStatus('failed'); showToast('Local save failed. Export a copy of your work.') }
    }, 750)
    return () => clearTimeout(timer)
  }, [doc, saveStatus])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3500); return () => clearTimeout(timer) }, [toast])
  const showToast = (message: string) => setToast(message)

  function openProject(project: EditorDocument) {
    docRef.current = project; setDoc(project); setSelectedPage(0); setSelectedId(null); setTool('select'); setShowExportMenu(false); setTextDraft(null); past.current = []; future.current = []; historyRefresh(n => n + 1); setSaveStatus('saved')
    if (window.matchMedia('(max-width: 767px)').matches) {
      const widestPage = Math.max(...project.pages.map(page => page.width))
      setZoom(Math.max(.28, Math.min(.5, (window.innerWidth - 88) / widestPage)))
    }
  }
  async function importFile(file: File) {
    setBusy(true); setDragging(false)
    try { const project = await openFile(file); openProject(project); setSaveStatus('unsaved'); showToast(`${file.name} is ready to edit`) }
    catch (error) { showToast(error instanceof Error ? error.message : 'Could not open the file') }
    finally { setBusy(false) }
  }
  function newDocument() {
    const project: EditorDocument = { id: uid(), name: 'Untitled document.txt', kind: 'text', format: 'txt', pages: [{ ...blankPage(), content: '' }], updatedAt: Date.now() }
    openProject(project); setSaveStatus('unsaved')
  }
  function commit(change: (value: EditorDocument) => void, key = '') {
    if (!docRef.current) return
    const previous = docRef.current
    const next = structuredClone(previous)
    change(next); next.updatedAt = Date.now()
    const now = Date.now()
    if (!key || lastChange.current?.key !== key || now - lastChange.current.at > 600) past.current.push(previous)
    if (past.current.length > 80) past.current.shift()
    lastChange.current = key ? { key, at: now } : null
    future.current = []; docRef.current = next; setDoc(next); setSaveStatus('unsaved'); historyRefresh(n => n + 1)
  }
  function undo() {
    const previous = past.current.pop(); if (!previous || !docRef.current) return
    future.current.push(docRef.current); docRef.current = previous; setDoc(previous); setSaveStatus('unsaved'); setSelectedId(null); historyRefresh(n => n + 1)
  }
  function redo() {
    const next = future.current.pop(); if (!next || !docRef.current) return
    past.current.push(docRef.current); docRef.current = next; setDoc(next); setSaveStatus('unsaved'); setSelectedId(null); historyRefresh(n => n + 1)
  }
  async function saveNow() {
    if (!docRef.current) return
    const current = docRef.current
    setSaveStatus('saving')
    try { await saveDocument(current); setSaveStatus(docRef.current === current ? 'saved' : 'unsaved'); setRecent(items => [current, ...items.filter(item => item.id !== current.id)]); showToast('Project saved locally') }
    catch { setSaveStatus('failed'); showToast('Local save failed') }
  }
  async function exportNow(format?: ExportFormat) {
    if (!docRef.current) return
    if (!format) { setShowExportMenu(true); return }
    setBusy(true)
    try { showToast(await exportDocument(docRef.current, format)) }
    catch (error) { showToast(error instanceof Error ? error.message : 'Export failed') }
    finally { setBusy(false) }
  }
  function requestText(position: { x: number; y: number }) {
    setTextValue('')
    setTextDraft({ pageIndex: selectedPage, ...position })
  }
  function insertText() {
    const value = textValue.trim()
    if (!value || !textDraft) { setTextDraft(null); return }
    const draft = textDraft
    commit(document => document.pages[draft.pageIndex].elements.push({ id: uid(), type: 'text', x: draft.x, y: draft.y, width: 280, height: Math.max(42, value.split('\n').length * 32), text: value, color: '#111827', fontFamily: 'Inter', fontSize: 24, opacity: 1 }))
    setTextDraft(null)
    setTool('select')
  }
  function updateElement(id: string, patch: Partial<EditorElement>) { commit(value => { const el = value.pages[selectedPage]?.elements.find(item => item.id === id); if (el) Object.assign(el, patch) }, `element-${id}`) }
  function deleteElement(id: string) { commit(value => { value.pages[selectedPage].elements = value.pages[selectedPage].elements.filter(el => el.id !== id) }); setSelectedId(null) }
  function addPage() { if (!doc || doc.kind === 'image') return; commit(value => value.pages.splice(selectedPage + 1, 0, blankPage())); setSelectedPage(selectedPage + 1) }
  function duplicatePage(index: number) { if (!doc) return; commit(value => { const page = structuredClone(value.pages[index]); page.id = uid(); page.elements.forEach(el => el.id = uid()); value.pages.splice(index + 1, 0, page) }); setSelectedPage(index + 1) }
  function removePage(index: number) { if (!doc || doc.pages.length <= 1) { showToast('Keep at least one page'); return }; commit(value => value.pages.splice(index, 1)); setSelectedPage(Math.max(0, Math.min(selectedPage, doc.pages.length - 2))) }
  function movePage(from: number, to: number) { if (from === to) return; commit(value => { const [page] = value.pages.splice(from, 1); value.pages.splice(to, 0, page) }); setSelectedPage(to) }
  async function addImage(file: File) {
    if (!doc) return
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(file.type)) { showToast('Choose a PNG, JPEG, WebP, GIF, or BMP image'); return }
    const src = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) })
    commit(value => value.pages[selectedPage].elements.push({ id: uid(), type: 'image', x: 80, y: 80, width: 240, height: 180, src, opacity: 1 }))
    setTool('select')
  }
  function replaceAll() {
    if (!doc || !query) return
    const replacement = window.prompt(`Replace every “${query}” with:`)
    if (replacement === null) return
    commit(value => value.pages.forEach(page => {
      if (page.content !== undefined) page.content = page.content.split(query).join(replacement)
      if (page.richHtml !== undefined) {
        const parsed = new DOMParser().parseFromString(page.richHtml, 'text/html')
        const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) walker.currentNode.textContent = (walker.currentNode.textContent || '').split(query).join(replacement)
        page.richHtml = parsed.body.innerHTML
      }
      page.elements.forEach(el => { if (el.text) el.text = el.text.split(query).join(replacement) })
    }))
    showToast('Editable text matches replaced')
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey
      const target = event.target as HTMLElement
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName)
      if (meta && event.key.toLowerCase() === 's') { event.preventDefault(); void saveNow() }
      else if (meta && event.key.toLowerCase() === 'z' && !typing) { event.preventDefault(); event.shiftKey ? redo() : undo() }
      else if (meta && event.key.toLowerCase() === 'y' && !typing) { event.preventDefault(); redo() }
      else if (meta && event.key.toLowerCase() === 'f') { event.preventDefault(); setShowSearch(true) }
      else if (meta && event.shiftKey && event.key.toLowerCase() === 'e') { event.preventDefault(); void exportNow() }
      else if (!typing && (event.key === 'Delete' || event.key === 'Backspace') && selectedId) { event.preventDefault(); deleteElement(selectedId) }
      else if (!typing && event.key === '+') setZoom(v => Math.min(2, +(v + .1).toFixed(2)))
      else if (!typing && event.key === '-') setZoom(v => Math.max(.25, +(v - .1).toFixed(2)))
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  })

  const selected = doc?.pages[selectedPage]?.elements.find(el => el.id === selectedId)
  const filtered = recent.filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
  const matchCount = doc && query ? doc.pages.reduce((count, page) => {
    const body = page.richHtml ? new DOMParser().parseFromString(page.richHtml, 'text/html').body.textContent || '' : page.content || ''
    return count + body.split(query).length - 1 + page.elements.reduce((n, el) => n + ((el.text || '').split(query).length - 1), 0)
  }, 0) : 0
  const onDrop = (event: DragEvent) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (doc && file.type.startsWith('image/') && event.target instanceof Element && event.target.closest('.canvas-stage')) void addImage(file); else void importFile(file) }
  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => { if (tool !== 'hand' || !scrollRef.current || (event.target as Element).closest('.floating-toolbar')) return; panRef.current = { x: event.clientX, y: event.clientY, left: scrollRef.current.scrollLeft, top: scrollRef.current.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId) }
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => { if (!panRef.current || !scrollRef.current) return; scrollRef.current.scrollLeft = panRef.current.left - (event.clientX - panRef.current.x); scrollRef.current.scrollTop = panRef.current.top - (event.clientY - panRef.current.y) }

  return <div className="app" onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }} onDrop={onDrop}>
    <input ref={fileInput} type="file" hidden onChange={(e: ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) void importFile(e.target.files[0]); e.target.value = '' }} />
    <input ref={imageInput} type="file" accept="image/*" hidden onChange={e => { if (e.target.files?.[0]) void addImage(e.target.files[0]); e.target.value = '' }} />
    {dragging && <div className="drop-overlay"><UploadCloud size={48} /><h2>Drop to open your file</h2><p>Images dropped on the canvas are inserted as layers</p></div>}
    {busy && <div className="busy-overlay"><div className="spinner"/><span>Working on your file…</span></div>}
    <header className="topbar">
      <button className="brand" onClick={() => setDoc(null)} title="Home"><span className="brand-mark"><span /></span><span>forma<span className="brand-dot">.</span></span></button>
      <span className="top-divider" />
      {doc ? <><button className="icon-button home-back" onClick={() => { setDoc(null); setSelectedId(null) }} title="Back to files"><ArrowLeft size={18}/></button><div className="file-identity"><input value={doc.name} aria-label="File name" onChange={e => commit(value => { value.name = e.target.value }, 'rename')} /><span className={`save-state ${saveStatus}`}><span className="status-dot"/>{saveStatus === 'saved' ? 'Saved locally' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'failed' ? 'Save failed' : 'Unsaved changes'}</span></div><div className="top-actions left-actions"><button className="icon-button" onClick={undo} disabled={!past.current.length} title="Undo (Ctrl+Z)"><Undo2 size={18}/></button><button className="icon-button" onClick={redo} disabled={!future.current.length} title="Redo (Ctrl+Y)"><Redo2 size={18}/></button><span className="top-divider"/><button className="icon-button" onClick={() => setShowSearch(v => !v)} title="Find (Ctrl+F)"><Search size={18}/></button></div><div className="viewport-toggle-group"><button className={`viewport-tab-btn ${viewportMode === 'desktop' ? 'active' : ''}`} onClick={() => setViewportMode('desktop')} title="Desktop Viewport (Full Canvas)"><Monitor size={15}/><span className="hide-on-mobile">Desktop</span></button><button className={`viewport-tab-btn ${viewportMode === 'mobile' ? 'active' : ''}`} onClick={() => setViewportMode('mobile')} title="Mobile Viewport (Responsive Device Frame)"><Smartphone size={15}/><span>Mobile Viewport</span></button></div><div className="top-spacer"/><div className="top-actions"><div className="mobile-header-tools"><button className="icon-button" onClick={() => setMobileDrawer(d => d === 'sidebar' ? 'none' : 'sidebar')} title="Pages & Layers"><Layers3 size={18}/></button><button className="icon-button" onClick={() => setMobileDrawer(d => d === 'inspector' ? 'none' : 'inspector')} title="Inspector"><Settings2 size={18}/></button><button className="icon-button" onClick={() => setShowMobileMenu(v => !v)} title="File Menu"><Menu size={18}/></button></div><button className="icon-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Toggle theme">{theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</button><button className="top-text-button" onClick={() => fileInput.current?.click()}><FolderOpen size={17}/> Open</button><button className="top-text-button" onClick={() => { try { downloadOriginal(doc) } catch (error) { showToast((error as Error).message) } }} disabled={!doc.originalBytes} title="Download unchanged original"><Download size={17}/> Original</button><button className="top-text-button" onClick={() => void saveNow()}><Save size={17}/> Save</button><button className="primary-button" onClick={() => void exportNow()}><ArrowDownToLine size={17}/> Export <ChevronDown size={14}/></button></div></> : <><span className="workspace-label">Your creative workspace</span><div className="top-spacer"/><button className="icon-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Toggle theme">{theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</button><span className="avatar">A</span></>}
    </header>
    {!doc ? <main className="home"><section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="eyebrow-line"/> UNIVERSAL FILE EDITOR</span><h1>Make every file<br/><em>feel editable.</em></h1><p>One focused canvas for documents, images, PDFs, and the ideas that need a final pass.</p><div className="hero-buttons"><button className="primary-button large" onClick={() => fileInput.current?.click()}><UploadCloud size={20}/> Open a file</button><button className="secondary-button large" onClick={newDocument}><Plus size={20}/> New document</button></div><div className="format-row"><span>WORKS WITH</span><b>PDF</b><b>DOCX</b><b>PNG</b><b>JPG</b><b>TXT</b><b>MD</b><small>+ more</small></div></div><div className="hero-art" aria-hidden="true"><div className="art-dots"/><div className="art-card art-card-back"><span className="art-pdf">PDF</span><div className="art-line long"/><div className="art-line"/><div className="art-line medium"/><div className="art-image"/></div><div className="art-card art-card-front"><div className="art-toolbar"><span/><span/><span/><span/></div><div className="art-title"/><div className="art-line long"/><div className="art-line medium"/><div className="art-line long"/><div className="art-highlight"/><div className="art-line medium"/><div className="art-signature">forma.</div></div><div className="art-floating"><PenLine size={20}/><span>Make it yours</span></div></div></section><section className="recent-section"><div className="section-heading"><div><span className="section-kicker">PICK UP WHERE YOU LEFT OFF</span><h2>Recent files</h2></div><div className="recent-controls"><div className="search-box"><Search size={16}/><input placeholder="Search files" value={query} onChange={e => setQuery(e.target.value)} /></div><button className={`icon-button ${view === 'grid' ? 'on' : ''}`} onClick={() => setView(view === 'grid' ? 'list' : 'grid')} title="Toggle view"><LayoutGrid size={17}/></button></div></div>{filtered.length ? <div className={`recent-files ${view}`}>{filtered.map(item => { const Icon = kindIcon[item.kind]; return <div key={item.id} className="file-card" onClick={() => openProject(item)}><div className={`file-card-icon ${kindColor[item.kind]}`}><Icon size={28}/></div><div className="file-card-details"><strong>{item.name}</strong><span>{item.kind.toUpperCase()} · {new Date(item.updatedAt).toLocaleDateString()}</span></div><button className="icon-button card-delete" title="Delete local project" onClick={async e => { e.stopPropagation(); await deleteDocument(item.id); setRecent(values => values.filter(value => value.id !== item.id)); showToast('Project removed from this device') }}><Trash2 size={16}/></button></div> })}</div> : <div className="empty-files"><div className="empty-files-icon"><FolderOpen size={27}/></div><h3>{query ? 'No matching files' : 'A fresh canvas awaits'}</h3><p>{query ? 'Try a different file name.' : 'Open your first file or start from a blank document.'}</p></div>}</section><footer className="home-footer"><span>Made for the details that matter.</span><span>Local-first editing · Your files stay on this device</span></footer></main> : <div className="workspace">
      <aside className="sidebar"><div className="sidebar-tabs"><button className={sidebar === 'pages' ? 'active' : ''} onClick={() => setSidebar('pages')} title="Pages"><FileText size={19}/><span>Pages</span></button><button className={sidebar === 'layers' ? 'active' : ''} onClick={() => setSidebar('layers')} title="Layers"><Layers3 size={19}/><span>Layers</span></button><button className={sidebar === 'files' ? 'active' : ''} onClick={() => setSidebar('files')} title="Files"><FolderOpen size={19}/><span>Files</span></button></div><div className="sidebar-content">
        {sidebar === 'pages' && <><div className="panel-header"><div><span className="panel-kicker">YOUR DOCUMENT</span><h3>Pages <span>{doc.pages.length}</span></h3></div>{doc.kind !== 'image' && <button className="small-icon" onClick={addPage} title="Add blank page"><Plus size={18}/></button>}</div><div className="page-list">{doc.pages.map((page, index) => <div key={page.id} className={`page-item ${selectedPage === index ? 'current' : ''}`} draggable={doc.kind !== 'image'} onDragStart={e => e.dataTransfer.setData('text/page-index', String(index))} onDragOver={e => e.preventDefault()} onDrop={e => { e.stopPropagation(); const from = Number(e.dataTransfer.getData('text/page-index')); if (Number.isInteger(from)) movePage(from, index) }}><button className="page-thumb" onClick={() => { setSelectedPage(index); document.getElementById(`page-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}><span className="mini-page" style={{ backgroundImage: page.background ? `url(${page.background})` : undefined }}>{!page.background && (page.content || page.richHtml) && <span className="mini-text-lines"/>}</span></button><div className="page-item-bottom"><GripVertical size={13}/><span>Page {index + 1}</span>{doc.kind !== 'image' && <div className="page-item-actions"><button title="Duplicate" onClick={() => duplicatePage(index)}><Copy size={13}/></button><button title="Delete" onClick={() => removePage(index)}><Trash2 size={13}/></button></div>}</div></div>)}</div>{doc.kind !== 'image' && <button className="add-page-button" onClick={addPage}><Plus size={17}/> Add page</button>}</>}
        {sidebar === 'layers' && <><div className="panel-header"><div><span className="panel-kicker">PAGE {selectedPage + 1}</span><h3>Layers <span>{doc.pages[selectedPage]?.elements.length || 0}</span></h3></div></div><div className="layers-list"><button className="layer-item base-layer"><span className="layer-symbol"><FileText size={15}/></span><span>Original content</span><span className="locked">Locked</span></button>{[...(doc.pages[selectedPage]?.elements || [])].reverse().map(el => <button key={el.id} className={`layer-item ${selectedId === el.id ? 'selected-layer' : ''}`} onClick={() => { setSelectedId(el.id); setTool('select') }}><span className="layer-symbol">{el.type === 'text' ? <FileText size={15}/> : el.type === 'image' ? <FileImage size={15}/> : <Layers3 size={15}/>}</span><span>{el.type === 'text' ? (el.text || 'Text').slice(0, 18) : el.type === 'stroke' ? 'Drawing' : el.type === 'cover' ? 'Visual cover' : el.type === 'shape' ? 'Shape' : 'Image'}</span></button>)}</div></>}
        {sidebar === 'files' && <><div className="panel-header"><div><span className="panel-kicker">ON THIS DEVICE</span><h3>Files</h3></div></div><button className="sidebar-open" onClick={() => fileInput.current?.click()}><UploadCloud size={17}/> Open another file</button><button className="sidebar-open" onClick={newDocument}><FilePlus2 size={17}/> Blank document</button><div className="file-list-small">{recent.slice(0, 10).map(item => <button key={item.id} onClick={() => openProject(item)}><FileText size={16}/><span>{item.name}</span></button>)}</div></>}
      </div><div className="sidebar-footer"><span className="local-indicator"/> Your work saves locally</div></aside>
      <div className="editor-main"><div className="editor-heading"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={15}/><strong>{doc.name}</strong></div><div className="editor-heading-actions"><span>{doc.kind === 'document' ? 'DOCX imported as editable HTML' : doc.kind === 'pdf' ? 'PDF with editable overlay' : `${doc.format.toUpperCase()} editor`}</span><button onClick={() => scrollRef.current?.requestFullscreen?.()} title="Fullscreen"><Maximize2 size={17}/></button></div></div>
      {viewportMode === 'mobile' ? (
        <MobileViewport
          doc={doc}
          selectedPage={selectedPage}
          tool={tool}
          color={color}
          brushSize={brushSize}
          selectedId={selectedId}
          onActivatePage={setSelectedPage}
          onSelect={setSelectedId}
          onAddElement={(pageIndex, element) => commit(value => value.pages[pageIndex].elements.push(element))}
          onUpdateElement={(pageIndex, id, patch) => {
            if (pageIndex === selectedPage) updateElement(id, patch)
            else commit(value => Object.assign(value.pages[pageIndex].elements.find(el => el.id === id)!, patch), `element-${id}`)
          }}
          onDeleteElement={(pageIndex, id) => {
            commit(value => { value.pages[pageIndex].elements = value.pages[pageIndex].elements.filter(el => el.id !== id) })
            setSelectedId(null)
          }}
          onUpdateContent={(pageIndex, content, rich) => {
            const page = doc.pages[pageIndex]
            if ((rich ? page.richHtml : page.content) !== content) {
              commit(value => {
                if (rich) value.pages[pageIndex].richHtml = content
                else value.pages[pageIndex].content = content
              })
            }
          }}
          onRequestText={requestText}
          onExitMobileViewport={() => setViewportMode('desktop')}
        />
      ) : (
        <div className={`canvas-stage ${tool === 'hand' ? 'panning' : ''}`} ref={scrollRef} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={() => { panRef.current = null }}><div className="floating-toolbar">{toolbar.map(({ id, label, icon: Icon }) => <button key={id} className={tool === id ? 'active' : ''} onClick={() => { setTool(id); setSelectedId(null) }} title={id === 'eraser' ? 'Erase or whiteout content' : label}><Icon size={19}/></button>)}<span className="toolbar-rule"/><button onClick={() => imageInput.current?.click()} title="Insert image"><ImagePlus size={19}/></button></div><div className="page-stack">{doc.pages.map((page, index) => <div id={`page-${index}`} key={page.id} className="page-stack-item"><div className="page-topline"><span>PAGE {index + 1} OF {doc.pages.length}</span><span>{Math.round(page.width)} × {Math.round(page.height)}</span></div><PageView page={page} zoom={zoom} active={selectedPage === index} tool={tool} color={color} brushSize={brushSize} selectedId={selectedPage === index ? selectedId : null} onActivate={() => setSelectedPage(index)} onSelect={setSelectedId} onAdd={element => commit(value => value.pages[index].elements.push(element))} onUpdate={(id, patch) => { if (index === selectedPage) updateElement(id, patch); else commit(value => Object.assign(value.pages[index].elements.find(el => el.id === id)!, patch), `element-${id}`) }} onDelete={id => { commit(value => { value.pages[index].elements = value.pages[index].elements.filter(el => el.id !== id) }); setSelectedId(null) }} onContent={(content, rich) => { if ((rich ? page.richHtml : page.content) !== content) commit(value => { if (rich) value.pages[index].richHtml = content; else value.pages[index].content = content }) }} onRequestText={requestText} /></div>)}</div></div>
      )}
      <div className="editor-bottom"><span><span className="green-dot"/> All changes stay on this device</span><div className="zoom-controls"><button onClick={() => setZoom(v => Math.max(.25, +(v - .1).toFixed(2)))} title="Zoom out"><Minus size={16}/></button><input type="range" min="25" max="200" value={Math.round(zoom * 100)} onChange={e => setZoom(Number(e.target.value) / 100)} aria-label="Zoom"/><button onClick={() => setZoom(1)} title="Reset to 100%" className="zoom-value">{Math.round(zoom * 100)}%</button><button onClick={() => setZoom(v => Math.min(2, +(v + .1).toFixed(2)))} title="Zoom in"><Plus size={16}/></button><button className="fit-button" onClick={() => setZoom(Math.min(1, (scrollRef.current?.clientWidth || 900) / (doc.pages[selectedPage].width + 180)))}>Fit</button></div></div></div>
      <aside className="properties"><div className="properties-head"><div><span className="panel-kicker">INSPECTOR</span><h3>{selected ? selected.type === 'shape' ? 'Shape' : selected.type === 'text' ? 'Text' : selected.type === 'image' ? 'Image' : selected.type === 'cover' ? 'Visual cover' : 'Drawing' : 'Canvas'}</h3></div><Settings2 size={18}/></div>{selected ? <div className="properties-body"><div className="property-section"><span className="property-title">POSITION & SIZE</span><div className="property-grid"><label>X<input type="number" value={Math.round(selected.x)} onChange={e => updateElement(selected.id, { x: Number(e.target.value) })}/></label><label>Y<input type="number" value={Math.round(selected.y)} onChange={e => updateElement(selected.id, { y: Number(e.target.value) })}/></label><label>W<input type="number" value={Math.round(selected.width)} onChange={e => updateElement(selected.id, { width: Number(e.target.value) })}/></label><label>H<input type="number" value={Math.round(selected.height)} onChange={e => updateElement(selected.id, { height: Number(e.target.value) })}/></label></div></div>{selected.type === 'text' && <div className="property-section"><span className="property-title">TYPOGRAPHY</span><label className="full-label">Font family<select value={selected.fontFamily || 'Inter'} onChange={e => updateElement(selected.id, { fontFamily: e.target.value })}><option>Inter</option><option>Plus Jakarta Sans</option><option>Manrope</option><option>DM Sans</option><option>Fraunces</option><option>Playfair Display</option><option>Arial</option><option>Georgia</option><option>Times New Roman</option><option>Courier New</option></select></label><div className="property-grid"><label>Size<input type="number" min={8} max={150} value={selected.fontSize || 24} onChange={e => updateElement(selected.id, { fontSize: Number(e.target.value) })}/></label><label>Color<input type="color" value={selected.color || '#172235'} onChange={e => updateElement(selected.id, { color: e.target.value })}/></label></div><div className="style-buttons"><button className={selected.fontWeight === 'bold' ? 'chosen' : ''} onClick={() => updateElement(selected.id, { fontWeight: selected.fontWeight === 'bold' ? 'normal' : 'bold' })}><b>B</b></button><button className={selected.fontStyle === 'italic' ? 'chosen' : ''} onClick={() => updateElement(selected.id, { fontStyle: selected.fontStyle === 'italic' ? 'normal' : 'italic' })}><i>I</i></button><button onClick={() => updateElement(selected.id, { textAlign: selected.textAlign === 'center' ? 'left' : 'center' })}>≡</button></div><p className="property-hint">Double click text on the page to edit it.</p></div>}{(selected.type === 'shape' || selected.type === 'stroke') && <div className="property-section"><span className="property-title">APPEARANCE</span><div className="property-grid"><label>Color<input type="color" value={selected.color || '#516be8'} onChange={e => updateElement(selected.id, { color: e.target.value })}/></label><label>Weight<input type="number" min="1" max="50" value={selected.size || 2} onChange={e => updateElement(selected.id, { size: Number(e.target.value) })}/></label></div></div>}<div className="property-section"><span className="property-title">OPACITY</span><input className="full-range" type="range" min="0" max="100" value={Math.round((selected.opacity ?? 1) * 100)} onChange={e => updateElement(selected.id, { opacity: Number(e.target.value) / 100 })}/><div className="range-ends"><span>0%</span><span>{Math.round((selected.opacity ?? 1) * 100)}%</span></div></div><div className="property-section"><button className="danger-button" onClick={() => deleteElement(selected.id)}><Trash2 size={16}/> Delete element</button></div></div> : <div className="properties-body"><div className="inspector-empty"><div><MousePointer2 size={24}/></div><h4>Nothing selected</h4><p>Select an element on your page to edit its details here.</p></div><div className="property-section tool-options"><span className="property-title">QUICK CONTROLS</span><label className="full-label">Drawing color<input type="color" value={color} onChange={e => setColor(e.target.value)}/></label><label className="full-label">Brush size <span>{brushSize}px</span><input type="range" min="1" max="28" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))}/></label><p className="property-hint">Eraser removes editable layers or paints a whiteout stroke over imported page content.</p></div></div>}</aside>
    </div>}
    <AnimatePresence>{showSearch && doc && <motion.div className="find-panel" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><Search size={17}/><input autoFocus placeholder="Find in editable text" value={query} onChange={e => setQuery(e.target.value)}/><span>{matchCount} matches</span><button onClick={replaceAll} disabled={!query}>Replace all</button><button className="icon-button" onClick={() => setShowSearch(false)}><X size={16}/></button></motion.div>}</AnimatePresence>
    <AnimatePresence>{doc && showExportMenu && <motion.div className="export-menu export-menu-floating" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><div className="export-menu-title">EXPORT OR CONVERT</div>{getExportChoices(doc).map(choice => <button key={choice.format} className="export-choice" disabled={!choice.available} onClick={() => { setShowExportMenu(false); void exportNow(choice.format) }}><span className="export-choice-icon">{choice.extension}</span><span><strong>{choice.label}</strong><small>{choice.detail}</small></span><b>{choice.available ? `.${choice.extension.toLowerCase()}` : 'Unavailable'}</b></button>)}<div className="export-menu-note">DOCX, XLSX, and PPTX export adapters are not installed in this release.</div></motion.div>}</AnimatePresence>
    <AnimatePresence>{showMobileMenu && doc && <motion.div className="mobile-menu-dropdown" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      <button onClick={() => { setShowMobileMenu(false); fileInput.current?.click() }}><FolderOpen size={17}/> Open file</button>
      <button onClick={() => { setShowMobileMenu(false); void saveNow() }}><Save size={17}/> Save locally</button>
      <button onClick={() => { setShowMobileMenu(false); void exportNow() }}><ArrowDownToLine size={17}/> Export</button>
      <button onClick={() => { setShowMobileMenu(false); try { downloadOriginal(doc) } catch (err) { showToast((err as Error).message) } }} disabled={!doc.originalBytes}><Download size={17}/> Download original</button>
      <button onClick={() => { setShowMobileMenu(false); setShowSearch(true) }}><Search size={17}/> Find & replace</button>
      <button onClick={() => { setShowMobileMenu(false); setViewportMode(v => v === 'desktop' ? 'mobile' : 'desktop') }}>
        {viewportMode === 'desktop' ? <Smartphone size={17}/> : <Monitor size={17}/>}
        {viewportMode === 'desktop' ? 'Open Mobile Viewport' : 'Exit to Desktop View'}
      </button>
      <button onClick={() => { setShowMobileMenu(false); setTheme(theme === 'light' ? 'dark' : 'light') }}>
        {theme === 'light' ? <Moon size={17}/> : <Sun size={17}/>}
        {theme === 'light' ? 'Dark theme' : 'Light theme'}
      </button>
    </motion.div>}</AnimatePresence>
    <AnimatePresence>{mobileDrawer !== 'none' && doc && <motion.div className="mobile-drawer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileDrawer('none')}>
      <motion.div className="mobile-drawer-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 220 }} onClick={e => e.stopPropagation()}>
        <div className="mobile-drawer-head">
          <div className="mobile-drawer-drag-bar" />
          <div className="mobile-drawer-title-row">
            <h3>{mobileDrawer === 'sidebar' ? 'Pages & Layers' : 'Element Inspector'}</h3>
            <button className="icon-button" onClick={() => setMobileDrawer('none')}><X size={18}/></button>
          </div>
        </div>
        <div className="mobile-drawer-body">
          {mobileDrawer === 'sidebar' ? (
            <div className="mobile-drawer-sidebar">
              <div className="sidebar-tabs">
                <button className={sidebar === 'pages' ? 'active' : ''} onClick={() => setSidebar('pages')}><FileText size={18}/><span>Pages ({doc.pages.length})</span></button>
                <button className={sidebar === 'layers' ? 'active' : ''} onClick={() => setSidebar('layers')}><Layers3 size={18}/><span>Layers</span></button>
                <button className={sidebar === 'files' ? 'active' : ''} onClick={() => setSidebar('files')}><FolderOpen size={18}/><span>Files</span></button>
              </div>
              <div className="sidebar-content">
                {sidebar === 'pages' && <>
                  <div className="panel-header">
                    <div><span className="panel-kicker">DOCUMENT PAGES</span><h3>Pages</h3></div>
                    {doc.kind !== 'image' && <button className="small-icon" onClick={addPage} title="Add page"><Plus size={18}/></button>}
                  </div>
                  <div className="page-list">
                    {doc.pages.map((p, idx) => (
                      <div key={p.id} className={`page-item ${selectedPage === idx ? 'current' : ''}`} onClick={() => { setSelectedPage(idx); setMobileDrawer('none') }}>
                        <button className="page-thumb">
                          <span className="mini-page" style={{ backgroundImage: p.background ? `url(${p.background})` : undefined }}>
                            {!p.background && (p.content || p.richHtml) && <span className="mini-text-lines"/>}
                          </span>
                        </button>
                        <div className="page-item-bottom">
                          <span>Page {idx + 1}</span>
                          {doc.kind !== 'image' && <div className="page-item-actions">
                            <button title="Duplicate" onClick={e => { e.stopPropagation(); duplicatePage(idx) }}><Copy size={13}/></button>
                            <button title="Delete" onClick={e => { e.stopPropagation(); removePage(idx) }}><Trash2 size={13}/></button>
                          </div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>}
                {sidebar === 'layers' && <>
                  <div className="panel-header"><div><span className="panel-kicker">PAGE {selectedPage + 1}</span><h3>Layers ({doc.pages[selectedPage]?.elements.length || 0})</h3></div></div>
                  <div className="layers-list">
                    <button className="layer-item base-layer"><FileText size={15}/><span>Original content</span><span className="locked">Locked</span></button>
                    {[...(doc.pages[selectedPage]?.elements || [])].reverse().map(el => (
                      <button key={el.id} className={`layer-item ${selectedId === el.id ? 'selected-layer' : ''}`} onClick={() => { setSelectedId(el.id); setTool('select'); setMobileDrawer('inspector') }}>
                        <span>{el.type === 'text' ? (el.text || 'Text').slice(0, 18) : el.type === 'stroke' ? 'Drawing' : el.type === 'cover' ? 'Visual cover' : el.type === 'shape' ? 'Shape' : 'Image'}</span>
                      </button>
                    ))}
                  </div>
                </>}
                {sidebar === 'files' && <>
                  <button className="sidebar-open" onClick={() => { setMobileDrawer('none'); fileInput.current?.click() }}><UploadCloud size={17}/> Open another file</button>
                  <button className="sidebar-open" onClick={() => { setMobileDrawer('none'); newDocument() }}><FilePlus2 size={17}/> Blank document</button>
                </>}
              </div>
            </div>
          ) : (
            <div className="mobile-drawer-inspector">
              {selected ? (
                <div className="properties-body">
                  <div className="property-section">
                    <span className="property-title">POSITION & SIZE</span>
                    <div className="property-grid">
                      <label>X<input type="number" value={Math.round(selected.x)} onChange={e => updateElement(selected.id, { x: Number(e.target.value) })}/></label>
                      <label>Y<input type="number" value={Math.round(selected.y)} onChange={e => updateElement(selected.id, { y: Number(e.target.value) })}/></label>
                      <label>W<input type="number" value={Math.round(selected.width)} onChange={e => updateElement(selected.id, { width: Number(e.target.value) })}/></label>
                      <label>H<input type="number" value={Math.round(selected.height)} onChange={e => updateElement(selected.id, { height: Number(e.target.value) })}/></label>
                    </div>
                  </div>
                  {selected.type === 'text' && (
                    <div className="property-section">
                      <span className="property-title">TYPOGRAPHY</span>
                      <div className="property-grid">
                        <label>Size<input type="number" min={8} max={150} value={selected.fontSize || 24} onChange={e => updateElement(selected.id, { fontSize: Number(e.target.value) })}/></label>
                        <label>Color<input type="color" value={selected.color || '#172235'} onChange={e => updateElement(selected.id, { color: e.target.value })}/></label>
                      </div>
                    </div>
                  )}
                  {(selected.type === 'shape' || selected.type === 'stroke') && (
                    <div className="property-section">
                      <span className="property-title">APPEARANCE</span>
                      <div className="property-grid">
                        <label>Color<input type="color" value={selected.color || '#516be8'} onChange={e => updateElement(selected.id, { color: e.target.value })}/></label>
                        <label>Weight<input type="number" min={1} max={50} value={selected.size || 2} onChange={e => updateElement(selected.id, { size: Number(e.target.value) })}/></label>
                      </div>
                    </div>
                  )}
                  <div className="property-section">
                    <button className="danger-button" onClick={() => { deleteElement(selected.id); setMobileDrawer('none') }}><Trash2 size={16}/> Delete element</button>
                  </div>
                </div>
              ) : (
                <div className="properties-body">
                  <div className="inspector-empty"><div><MousePointer2 size={24}/></div><h4>Nothing selected</h4><p>Tap an element on the canvas to inspect it.</p></div>
                  <div className="property-section tool-options">
                    <span className="property-title">DRAWING CONTROLS</span>
                    <label className="full-label">Color<input type="color" value={color} onChange={e => setColor(e.target.value)}/></label>
                    <label className="full-label">Brush size: {brushSize}px<input type="range" min={1} max={28} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))}/></label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>}</AnimatePresence>
    <AnimatePresence>{textDraft && <motion.div className="text-input-modal" initial={{ opacity: 0, scale: .97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97, y: 8 }}><div className="text-input-card"><div className="text-input-head"><div><span className="panel-kicker">ADD TO PAGE {textDraft.pageIndex + 1}</span><h3>Write your text</h3></div><button className="icon-button" onClick={() => setTextDraft(null)}><X size={17}/></button></div><textarea autoFocus value={textValue} onChange={event => setTextValue(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setTextDraft(null); if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) insertText() }} placeholder="Type something…" rows={4}/><div className="text-input-actions"><span>Ctrl / ⌘ + Enter to place</span><button className="secondary-button" onClick={() => setTextDraft(null)}>Cancel</button><button className="primary-button" disabled={!textValue.trim()} onClick={insertText}>Insert text</button></div></div></motion.div>}</AnimatePresence>
    <AnimatePresence>{toast && <motion.div className="toast" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}><span className="toast-check">✓</span>{toast}<button onClick={() => setToast(null)}><X size={15}/></button></motion.div>}</AnimatePresence>
  </div>
}
