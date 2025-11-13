import { Font } from '@react-pdf/renderer'
import path from 'path'
import fs from 'fs'

let fontRegistered = false
let cachedFontDataUri: string | null = null

export function registerPDFFont() {
  if (fontRegistered) {
    return
  }

  try {
    // キャッシュされたフォントData URIを使用
    if (cachedFontDataUri) {
      Font.register({
        family: 'NotoSansJP',
        src: cachedFontDataUri,
        fontStyle: 'normal',
        fontWeight: 400,
      })
      fontRegistered = true
      return
    }

    // フォントファイルのパスを取得
    // @fontsource/noto-sans-jp のフォントファイルを読み込む
    const fontPath = path.join(
      process.cwd(),
      'node_modules',
      '@fontsource',
      'noto-sans-jp',
      'files',
      'noto-sans-jp-japanese-400-normal.woff'
    )

    if (!fs.existsSync(fontPath)) {
      console.warn('[PDF Font] Font file not found:', fontPath)
      // フォールバック: システムフォントを使用
      Font.register({
        family: 'NotoSansJP',
        src: 'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf',
      })
    } else {
      // フォントファイルをBase64エンコードしてData URIとして渡す（キャッシュ）
      const fontBuffer = fs.readFileSync(fontPath)
      const fontBase64 = fontBuffer.toString('base64')
      cachedFontDataUri = `data:font/woff;base64,${fontBase64}`
      
      Font.register({
        family: 'NotoSansJP',
        src: cachedFontDataUri,
        fontStyle: 'normal',
        fontWeight: 400,
      })
    }
    fontRegistered = true
    console.log('[PDF Font] Font registered successfully')
  } catch (error) {
    console.error('[PDF Font] Failed to register font:', error)
    // フォールバック: システムフォントを使用
    try {
      Font.register({
        family: 'NotoSansJP',
        src: 'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf',
      })
      fontRegistered = true
    } catch (fallbackError) {
      console.error('[PDF Font] Fallback font registration also failed:', fallbackError)
    }
  }
}

