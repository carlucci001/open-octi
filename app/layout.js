import './globals.css'
import EmergencyHangup from './components/EmergencyHangup'
import MatildaEqualizer from './components/MatildaEqualizer'
import ModeBanner from './components/ModeBanner'
import ActiveVideoCall from './components/ActiveVideoCall'
import PWARegister from './components/PWARegister'
import ClientErrorReporter from './components/ClientErrorReporter'
import { brandAssetsFor, brandMetadataFor } from '@/lib/brand-assets'
const BRAND_ASSETS = brandAssetsFor()
export const metadata = brandMetadataFor()
export const viewport = { themeColor: '#020711' }
// Runs before any app code. localStorage filling up is a cache problem, never a
// user-facing crash: on QuotaExceededError, drop the disposable caches (all
// refetchable) and retry, then fall back to a no-op write plus a console warning.
const storageGuardScript = `
(() => {
  try {
    if (typeof Storage === 'undefined' || Storage.prototype.__fccQuotaGuard) return
    var proto = Storage.prototype
    var native = proto.setItem
    var DISPOSABLE = ['fcc:dataCache:v1']
    var isQuota = function (e) {
      return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014)
    }
    proto.setItem = function (key, value) {
      try {
        return native.call(this, key, value)
      } catch (err) {
        if (!isQuota(err)) throw err
        for (var i = 0; i < DISPOSABLE.length; i++) {
          if (DISPOSABLE[i] === key) continue
          try { this.removeItem(DISPOSABLE[i]) } catch (e) {}
        }
        try {
          return native.call(this, key, value)
        } catch (err2) {
          if (!isQuota(err2)) throw err2
          // Last resort: evict the single largest fcc:* key that is not this one.
          var biggest = null, biggestLen = 0
          for (var j = 0; j < this.length; j++) {
            var k = this.key(j)
            if (!k || k === key || k.indexOf('fcc') !== 0) continue
            var len = (this.getItem(k) || '').length
            if (len > biggestLen) { biggestLen = len; biggest = k }
          }
          if (biggest) {
            try { this.removeItem(biggest) } catch (e) {}
            try { return native.call(this, key, value) } catch (e) {}
          }
          console.warn('[fcc] localStorage full - skipped write for', key)
          return undefined
        }
      }
    }
    proto.__fccQuotaGuard = true
  } catch (e) {}
})()
`
const themeBootScript = `
(() => {
  try {
    const colors = {
      command: '#020711',
      codex: '#F4F1EA',
      anthropic: '#F4F1EA',
      'codex-blue': '#eef1f6',
      'codex-dark': '#0b0f17',
    }
    const saved = localStorage.getItem('fcc-theme')
    const theme = colors[saved] ? saved : 'command'
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = theme === 'command' || theme === 'codex-dark' ? 'dark' : 'light'
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', colors[theme])
  } catch {}
})()
`
export default function RootLayout({ children }) {
  return <html lang="en" data-theme="command" suppressHydrationWarning><head><link rel="preload" as="image" href={BRAND_ASSETS.loaderLogo} /><script dangerouslySetInnerHTML={{ __html: storageGuardScript }} /><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head><body className="antialiased"><ModeBanner />{children}<EmergencyHangup /><MatildaEqualizer /><ActiveVideoCall /><PWARegister /><ClientErrorReporter /></body></html>
}
