import { brandAssetsFor } from '@/lib/brand-assets'

export const runtime = 'nodejs'

export async function GET(request) {
  const brand = brandAssetsFor()
  if (brand.openOcti) return Response.redirect(new URL(brand.faviconIco, request.url), 307)

  return new Response(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#111827"/><path d="M17 14h33v9H28v8h18v9H28v18H17z" fill="#f59e0b"/></svg>',
    {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    },
  )
}
