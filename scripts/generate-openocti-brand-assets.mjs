import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'openocti', 'docs', 'brand', 'octopus-mark.png')
const outputDir = path.join(root, 'public', 'openocti')
const brandDir = path.join(root, 'openocti', 'docs', 'brand')

const BRAND_DARK = '#001040'
const BRAND_BLUE = '#0070d0'
const BRAND_CYAN = '#30c0f0'
const FONT_STACK = "'Space Grotesk', 'Bahnschrift', 'Arial Narrow', Arial, sans-serif"

await mkdir(outputDir, { recursive: true })
await mkdir(brandDir, { recursive: true })
const octopus = await readFile(sourcePath)
const embeddedOctopus = `data:image/png;base64,${octopus.toString('base64')}`

function wordmark({ centerX = 600, commandY, commandSize, commandSpacing, centerY, centerSize, centerSpacing }) {
  return `
    <g text-anchor="middle" font-family="${FONT_STACK}" paint-order="stroke fill" stroke="${BRAND_DARK}" stroke-opacity="0.32" stroke-width="3">
      <text x="${centerX}" y="${commandY}" fill="url(#openocti-blue)" font-size="${commandSize}" font-weight="700" letter-spacing="${commandSpacing}">COMMAND</text>
      <text x="${centerX}" y="${centerY}" fill="url(#openocti-blue)" font-size="${centerSize}" font-weight="600" letter-spacing="${centerSpacing}">CENTER</text>
    </g>`
}

function defs() {
  return `
    <defs>
      <linearGradient id="openocti-blue" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${BRAND_BLUE}" />
        <stop offset="1" stop-color="${BRAND_CYAN}" />
      </linearGradient>
    </defs>`
}

const verticalSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="960" viewBox="0 0 1200 960" role="img" aria-labelledby="openocti-title openocti-description">
  <title id="openocti-title">OpenOcti Command Center</title>
  <desc id="openocti-description">A blue octopus above the words Command Center.</desc>
  ${defs()}
  <image x="229" y="36" width="742" height="480" preserveAspectRatio="xMidYMid meet" href="${embeddedOctopus}" xlink:href="${embeddedOctopus}" />
  ${wordmark({ commandY: 718, commandSize: 178, commandSpacing: 13, centerY: 860, centerSize: 92, centerSpacing: 35 })}
</svg>
`

const horizontalSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="360" viewBox="0 0 1200 360" role="img" aria-labelledby="openocti-horizontal-title openocti-horizontal-description">
  <title id="openocti-horizontal-title">OpenOcti Command Center</title>
  <desc id="openocti-horizontal-description">A blue octopus beside the words Command Center.</desc>
  ${defs()}
  <image x="24" y="41" width="430" height="278" preserveAspectRatio="xMidYMid meet" href="${embeddedOctopus}" xlink:href="${embeddedOctopus}" />
  ${wordmark({ centerX: 820, commandY: 164, commandSize: 104, commandSpacing: 7, centerY: 270, centerSize: 64, centerSpacing: 25 })}
</svg>
`

const bannerSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1280" height="360" viewBox="0 0 1280 360" role="img" aria-labelledby="openocti-banner-title openocti-banner-description">
  <title id="openocti-banner-title">OpenOcti — the open-source Command Center</title>
  <desc id="openocti-banner-description">A dark navy OpenOcti banner with the official blue octopus mark.</desc>
  <defs>
    <linearGradient id="banner-bg" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#001040" />
      <stop offset="1" stop-color="#000010" />
    </linearGradient>
    <radialGradient id="banner-glow">
      <stop stop-color="#30c0f0" stop-opacity=".28" />
      <stop offset="1" stop-color="#30c0f0" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1280" height="360" rx="28" fill="url(#banner-bg)" />
  <path d="M0 334h1280" stroke="#0070d0" stroke-width="6" />
  <circle cx="1050" cy="170" r="260" fill="url(#banner-glow)" />
  <image x="62" y="50" width="386" height="250" preserveAspectRatio="xMidYMid meet" href="${embeddedOctopus}" xlink:href="${embeddedOctopus}" />
  <text x="470" y="154" fill="#fff" font-family="Space Grotesk,Segoe UI,sans-serif" font-size="76" font-weight="700" letter-spacing="2">OPENOCTI</text>
  <text x="474" y="215" fill="#30c0f0" font-family="Space Grotesk,Segoe UI,sans-serif" font-size="31" font-weight="600">the open-source Command Center</text>
  <text x="475" y="265" fill="#8ba0c4" font-family="Segoe UI,sans-serif" font-size="20">CRM · AI staff · voice · documents · e-sign · your server</text>
</svg>
`

const faviconSizes = [16, 32, 48, 64, 128, 256]

async function faviconPng(size) {
  const markWidth = Math.max(1, Math.round(size * 0.92))
  const markHeight = Math.max(1, Math.round(markWidth * 519 / 802))
  const left = Math.round((size - markWidth) / 2)
  const top = Math.round((size - markHeight) / 2)
  const mark = await sharp(octopus).resize(markWidth, markHeight, { fit: 'fill' }).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, left, top }])
    .png()
    .toBuffer()
}

function makeIco(images) {
  const headerSize = 6 + images.length * 16
  let offset = headerSize
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16
    header.writeUInt8(size === 256 ? 0 : size, entry)
    header.writeUInt8(size === 256 ? 0 : size, entry + 1)
    header.writeUInt8(0, entry + 2)
    header.writeUInt8(0, entry + 3)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })

  return Buffer.concat([header, ...images.map(image => image.data)])
}

await writeFile(path.join(outputDir, 'logo.svg'), verticalSvg)
await sharp(Buffer.from(verticalSvg)).png().toFile(path.join(outputDir, 'logo.png'))
await sharp(Buffer.from(horizontalSvg)).png().toFile(path.join(outputDir, 'logo-horizontal.png'))
await writeFile(path.join(brandDir, 'banner.svg'), bannerSvg)
await sharp(Buffer.from(bannerSvg)).png().toFile(path.join(brandDir, 'banner.png'))

const faviconImages = []
for (const size of faviconSizes) faviconImages.push({ size, data: await faviconPng(size) })
const favicon512 = await faviconPng(512)
await writeFile(path.join(outputDir, 'favicon.png'), favicon512)
await writeFile(path.join(outputDir, 'favicon.ico'), makeIco(faviconImages))

console.log('Generated OpenOcti brand assets in public/openocti and openocti/docs/brand')
