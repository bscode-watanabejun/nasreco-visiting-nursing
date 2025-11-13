import { Font } from '@react-pdf/renderer'

let fontRegistered = false
let fontUrl: string | null = null

// サーバー側で実行されているかどうかを判定
const isServerSide = typeof window === 'undefined'

// クライアント側のみフォントURLを動的にインポート
// サーバー側では実行されないように、関数内で動的インポートを行う

export function registerPDFFont() {
  // サーバー側では実行しない（サーバー側で別途フォント登録を行う）
  if (isServerSide) {
    return
  }

  if (fontRegistered) {
    return
  }

  // フォントURLがまだ読み込まれていない場合は、動的インポートで読み込む
  if (!fontUrl) {
    import('@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff?url')
      .then((module) => {
        fontUrl = module.default
        if (!fontRegistered) {
          registerPDFFont()
        }
      })
      .catch((error) => {
        console.error('[PDF Font] Failed to load font:', error)
      })
    return
  }

  try {
    Font.register({
      family: 'NotoSansJP',
      src: fontUrl,
      fontStyle: 'normal',
      fontWeight: 400,
    })
    fontRegistered = true
    console.log('[PDF Font] Font registered successfully')
  } catch (error) {
    console.error('[PDF Font] Failed to register font:', error)
  }
}

// Preload font on module load (クライアント側のみ、フォントURLが読み込まれた後に実行)
// 上記の動的インポート内で実行されるため、ここでは実行しない
