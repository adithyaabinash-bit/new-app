import { useState, useMemo } from 'react'
import { RotateCw, Smartphone, Monitor, Check, Wifi, Battery, ChevronDown, Sparkles } from 'lucide-react'
import PageView from '../PageView'
import type { EditorDocument, EditorElement, Tool } from '../model'

export interface MobilePreset {
  id: string
  name: string
  width: number
  height: number
  platform: 'ios' | 'android' | 'tablet'
}

export const MOBILE_PRESETS: MobilePreset[] = [
  { id: 'iphone-15', name: 'iPhone 15 / 16', width: 390, height: 844, platform: 'ios' },
  { id: 'iphone-pro-max', name: 'iPhone Pro Max', width: 430, height: 932, platform: 'ios' },
  { id: 'android-pixel', name: 'Google Pixel / Android', width: 412, height: 915, platform: 'android' },
  { id: 'compact-phone', name: 'Compact Mobile', width: 360, height: 780, platform: 'android' },
  { id: 'tablet-mini', name: 'Tablet Mini', width: 768, height: 1024, platform: 'tablet' }
]

interface MobileViewportProps {
  doc: EditorDocument
  selectedPage: number
  tool: Tool
  color: string
  brushSize: number
  selectedId: string | null
  onActivatePage: (index: number) => void
  onSelect: (id: string | null) => void
  onAddElement: (pageIndex: number, element: EditorElement) => void
  onUpdateElement: (pageIndex: number, id: string, patch: Partial<EditorElement>) => void
  onDeleteElement: (pageIndex: number, id: string) => void
  onUpdateContent: (pageIndex: number, content: string, rich: boolean) => void
  onRequestText: (position: { x: number; y: number }) => void
  onExitMobileViewport: () => void
}

export default function MobileViewport({
  doc,
  selectedPage,
  tool,
  color,
  brushSize,
  selectedId,
  onActivatePage,
  onSelect,
  onAddElement,
  onUpdateElement,
  onDeleteElement,
  onUpdateContent,
  onRequestText,
  onExitMobileViewport
}: MobileViewportProps) {
  const [currentPreset, setCurrentPreset] = useState<MobilePreset>(MOBILE_PRESETS[0])
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [fitMode, setFitMode] = useState<'fit' | 'actual'>('fit')
  const [showPresetDropdown, setShowPresetDropdown] = useState(false)

  const activePage = doc.pages[selectedPage] || doc.pages[0]

  const screenWidth = orientation === 'portrait' ? currentPreset.width : currentPreset.height
  const screenHeight = orientation === 'portrait' ? currentPreset.height : currentPreset.width

  // Calculate zoom inside the mobile viewport
  const calculatedZoom = useMemo(() => {
    if (fitMode === 'actual') return 1
    // Fit page width inside mobile viewport with comfortable padding (16px)
    if (!activePage) return 0.5
    const targetWidth = screenWidth - 24
    return Math.min(1, +(targetWidth / activePage.width).toFixed(3))
  }, [fitMode, screenWidth, activePage])

  const toggleOrientation = () => {
    setOrientation(prev => (prev === 'portrait' ? 'landscape' : 'portrait'))
  }

  // Current time display for the mobile status bar
  const currentTime = useMemo(() => {
    const now = new Date()
    return `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
  }, [])

  return (
    <div className="mobile-viewport-container">
      {/* Viewport Control Bar */}
      <div className="mobile-viewport-bar">
        <div className="mobile-viewport-bar-left">
          <div className="viewport-badge">
            <Smartphone size={15} />
            <span>Mobile Viewport</span>
          </div>

          <div className="preset-selector-wrapper">
            <button
              className="preset-selector-btn"
              onClick={() => setShowPresetDropdown(v => !v)}
              title="Select mobile device preset"
            >
              <span>{currentPreset.name}</span>
              <span className="preset-dims">
                {screenWidth} × {screenHeight}
              </span>
              <ChevronDown size={14} />
            </button>

            {showPresetDropdown && (
              <div className="preset-dropdown-menu">
                <div className="preset-dropdown-header">DEVICE PRESETS</div>
                {MOBILE_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    className={`preset-dropdown-item ${currentPreset.id === preset.id ? 'active' : ''}`}
                    onClick={() => {
                      setCurrentPreset(preset)
                      setShowPresetDropdown(false)
                    }}
                  >
                    <div className="preset-item-info">
                      <strong>{preset.name}</strong>
                      <small>
                        {preset.width} × {preset.height} px
                      </small>
                    </div>
                    {currentPreset.id === preset.id && <Check size={14} className="preset-check" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="mobile-bar-btn"
            onClick={toggleOrientation}
            title={`Rotate to ${orientation === 'portrait' ? 'Landscape' : 'Portrait'}`}
          >
            <RotateCw size={15} />
            <span>{orientation === 'portrait' ? 'Portrait' : 'Landscape'}</span>
          </button>
        </div>

        <div className="mobile-viewport-bar-right">
          <div className="view-mode-toggle">
            <button
              className={`mode-btn ${fitMode === 'fit' ? 'active' : ''}`}
              onClick={() => setFitMode('fit')}
              title="Scale page to fit mobile device width"
            >
              Fit Width ({Math.round(calculatedZoom * 100)}%)
            </button>
            <button
              className={`mode-btn ${fitMode === 'actual' ? 'active' : ''}`}
              onClick={() => setFitMode('actual')}
              title="View at 100% scale (scrollable)"
            >
              100% Scale
            </button>
          </div>

          <button
            className="mobile-bar-btn exit-btn"
            onClick={onExitMobileViewport}
            title="Exit mobile viewport and return to full canvas"
          >
            <Monitor size={15} />
            <span>Desktop View</span>
          </button>
        </div>
      </div>

      {/* Device Frame Display Area */}
      <div className="mobile-stage-area">
        <div
          className={`mobile-device-frame ${orientation} ${currentPreset.platform}`}
          style={{
            width: screenWidth + 24,
            height: screenHeight + 24
          }}
        >
          {/* Hardware frame bezel */}
          <div
            className="mobile-device-screen"
            style={{
              width: screenWidth,
              height: screenHeight
            }}
          >
            {/* Status Bar */}
            <div className="mobile-status-bar">
              <span className="status-time">{currentTime}</span>
              <div className="dynamic-island-notch">
                <span className="sensor-camera" />
              </div>
              <div className="status-icons">
                <Wifi size={13} />
                <span className="network-tag">5G</span>
                <Battery size={15} />
              </div>
            </div>

            {/* Mobile Viewport Scroll Area */}
            <div className="mobile-screen-content">
              <div className="mobile-page-wrapper">
                {doc.pages.map((page, index) => (
                  <div
                    key={page.id}
                    id={`mobile-page-${index}`}
                    className={`mobile-page-card ${selectedPage === index ? 'current-page' : ''}`}
                    onClick={() => {
                      if (selectedPage !== index) onActivatePage(index)
                    }}
                  >
                    <div className="mobile-page-header">
                      <span>PAGE {index + 1} OF {doc.pages.length}</span>
                      <span>{Math.round(page.width)} × {Math.round(page.height)}</span>
                    </div>

                    <PageView
                      page={page}
                      zoom={calculatedZoom}
                      active={selectedPage === index}
                      tool={tool}
                      color={color}
                      brushSize={brushSize}
                      selectedId={selectedPage === index ? selectedId : null}
                      onActivate={() => onActivatePage(index)}
                      onSelect={onSelect}
                      onAdd={element => onAddElement(index, element)}
                      onUpdate={(id, patch) => onUpdateElement(index, id, patch)}
                      onDelete={id => onDeleteElement(index, id)}
                      onContent={(content, rich) => onUpdateContent(index, content, rich)}
                      onRequestText={onRequestText}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Home indicator bar at bottom */}
            <div className="mobile-home-indicator">
              <div className="home-bar" />
            </div>
          </div>
        </div>

        {/* Mobile Viewport Information Callout */}
        <div className="mobile-viewport-hint">
          <Sparkles size={14} />
          <span>
            Testing in <strong>{currentPreset.name}</strong> ({screenWidth} × {screenHeight}px).
            All annotations and edits sync in real-time.
          </span>
        </div>
      </div>
    </div>
  )
}
