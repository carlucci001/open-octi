export function clearCatalogStripeIds(value, clearStorefronts = false) {
  if (Array.isArray(value)) return value.map(item => clearCatalogStripeIds(item, clearStorefronts))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /^stripe.*price.*id$/i.test(key) ? '' : key === 'storefronts' && clearStorefronts ? [] : clearCatalogStripeIds(item, clearStorefronts),
  ]))
}
function uniqueId(base, items, field = 'id') {
  let id = base
  for (let suffix = 2; items.some(item => item[field] === id); suffix++) id = `${base}-${suffix}`
  return id
}
export function duplicateCatalogProduct(product, name, products) {
  const base = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65) || `${product.id}-copy`
  return {
    ...clearCatalogStripeIds(product, true), id: uniqueId(base, products), slug: uniqueId(base, products, 'slug'),
    name: name.trim(), shortName: name.trim(), status: 'draft', featured: false, storefronts: [],
  }
}
export function copyCatalogItem(source, target, kind, itemId) {
  if (!['packages', 'modules', 'addOns'].includes(kind) || source.id === target.id) throw new Error('Choose another product and a valid item type')
  const original = source[kind].find(item => item.id === itemId)
  if (!original) throw new Error('Item not found')
  const next = structuredClone(target)
  const item = clearCatalogStripeIds(original)
  item.id = uniqueId(item.id, next[kind])
  next[kind].push(item)
  if (kind === 'packages') {
    for (const mod of source.modules.filter(mod => item.modules.includes(mod.id))) {
      if (!next.modules.some(existing => existing.id === mod.id)) next.modules.push(clearCatalogStripeIds(mod))
    }
    const hosting = source.addOns.find(addOn => addOn.id === item.hostingAddOnId)
    if (hosting) {
      const copiedHosting = clearCatalogStripeIds(hosting)
      copiedHosting.id = uniqueId(copiedHosting.id, next.addOns)
      copiedHosting.appliesToPackages = [item.id]
      next.addOns.push(copiedHosting)
      item.hostingAddOnId = copiedHosting.id
    }
  }
  return next
}
