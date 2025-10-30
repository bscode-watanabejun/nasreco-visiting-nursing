import { Font } from '@react-pdf/renderer'
// @ts-ignore - Vite handles this as URL import
import NotoSansJPFont from '@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff?url'

let fontRegistered = false

export function registerPDFFont() {
  if (fontRegistered) {
    return
  }

  try {
    Font.register({
      family: 'NotoSansJP',
      src: NotoSansJPFont,
      fontStyle: 'normal',
      fontWeight: 400,
    })
    fontRegistered = true
    console.log('[PDF Font] Font registered successfully')
  } catch (error) {
    console.error('[PDF Font] Failed to register font:', error)
  }
}

// Preload font on module load
registerPDFFont()
