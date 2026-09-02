export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BRIDGE = `(() => {
  const script = document.currentScript || document.querySelector('script[data-openocti-hostucts]');
  const config = {
    apiBase: (script?.dataset.apiBase || 'https://openocti.local').replace(/\\/$/, ''),
    product: script?.dataset.product || '',
    target: script?.dataset.target || '[data-openocti-hostucts]',
    checkoutTarget: script?.dataset.checkoutTarget || '',
    stripePk: script?.dataset.stripePk || '',
  };

  const money = (value) => '$' + Math.round(Number(value || 0) / 1000) + 'K';
  const esc = (value) => String(value || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const moduleName = (product, id) => (product.modules || []).find(mod => mod.id === id)?.name || id;

  async function fetchCatalog() {
    const path = config.product ? '/api/products/' + encodeURIComponent(config.product) : '/api/products';
    const res = await fetch(config.apiBase + path, { cache: 'no-store' });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Product catalog unavailable');
    return json.product ? [json.product] : (json.products || []);
  }

  function renderProduct(product) {
    const packages = product.packages || [];
    return '<section class="openocti-hostuct" data-product="' + esc(product.slug || product.id) + '">' +
      '<header class="openocti-hostuct-head">' +
        '<p class="fcc-eyebrow">' + esc(product.eyebrow || product.category || 'Product') + '</p>' +
        '<h2>' + esc(product.name) + '</h2>' +
        '<p>' + esc(product.summary) + '</p>' +
      '</header>' +
      '<div class="fcc-package-grid">' + packages.map(pkg =>
        '<article class="fcc-package" data-package="' + esc(pkg.id) + '">' +
          '<p class="fcc-package-label">' + esc(pkg.label) + '</p>' +
          '<h3>' + esc(pkg.short || pkg.name) + '</h3>' +
          '<strong>' + money(pkg.setupPrice) + ' implementation package</strong>' +
          '<span>' + money(pkg.retainer) + ' build-slot retainer due today</span>' +
          '<p>' + esc(pkg.copy) + '</p>' +
          '<p class="fcc-scope-note">Included scope in this package:</p>' +
          '<ul class="fcc-module-list">' + (pkg.modules || []).map(id => '<li>' + esc(moduleName(product, id)) + '</li>').join('') + '</ul>' +
          '<p class="fcc-price-note">Optional work outside this scope is quoted separately. Selecting a package does not add hidden add-on charges.</p>' +
          '<button type="button" data-fcc-checkout="' + esc(product.id) + '" data-package="' + esc(pkg.id) + '">Reserve build slot</button>' +
        '</article>'
      ).join('') + '</div>' +
    '</section>';
  }

  function defaultStyles() {
    if (document.getElementById('openocti-hostucts-style')) return;
    const style = document.createElement('style');
    style.id = 'openocti-hostucts-style';
    style.textContent = '.openocti-hostuct{font-family:system-ui,sans-serif;color:inherit}.fcc-eyebrow,.fcc-package-label{font-size:11px;text-transform:uppercase;letter-spacing:.12em;opacity:.7}.fcc-package-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.fcc-package{border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:18px;background:rgba(127,127,127,.08)}.fcc-package h3{margin:8px 0}.fcc-package strong,.fcc-package span{display:block}.fcc-scope-note,.fcc-price-note{font-size:13px;opacity:.78}.fcc-module-list{margin:8px 0 12px;padding-left:18px;font-size:13px}.fcc-module-list li{margin:3px 0}.fcc-package button{margin-top:14px;min-height:44px;border:0;border-radius:8px;padding:0 16px;cursor:pointer}';
    document.head.appendChild(style);
  }

  async function startCheckout(productId, packageId) {
    const detail = { productId, packageId, apiBase: config.apiBase };
    window.dispatchEvent(new CustomEvent('openocti-hostucts:checkout', { detail }));
    if (!config.stripePk) return;
    const buyer = window.fccProductBuyer || {};
    const response = await fetch(config.apiBase + '/api/products/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, packageId, buyer, paymentOption: 'stripe-retainer' }),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Checkout unavailable');
    if (!window.Stripe) throw new Error('Stripe.js is not loaded');
    const mount = document.querySelector(config.checkoutTarget || '#fcc-checkout-mount');
    if (!mount) throw new Error('Checkout mount not found');
    const stripe = window.Stripe(config.stripePk);
    const checkout = await stripe.initEmbeddedCheckout({ clientSecret: data.clientSecret });
    checkout.mount(mount);
  }

  async function boot() {
    const target = document.querySelector(config.target);
    if (!target) return;
    defaultStyles();
    target.setAttribute('aria-busy', 'true');
    try {
      const products = await fetchCatalog();
      target.innerHTML = products.map(renderProduct).join('');
      target.querySelectorAll('[data-fcc-checkout]').forEach(btn => {
        btn.addEventListener('click', () => startCheckout(btn.dataset.fccCheckout, btn.dataset.package).catch(err => alert(err.message)));
      });
      window.dispatchEvent(new CustomEvent('openocti-hostucts:loaded', { detail: { products } }));
    } catch (error) {
      target.innerHTML = '<p>Product catalog is temporarily unavailable.</p>';
      window.dispatchEvent(new CustomEvent('openocti-hostucts:error', { detail: { error: error.message } }));
    } finally {
      target.removeAttribute('aria-busy');
    }
  }

  window.FarringtonProductBridge = { fetchCatalog, startCheckout, config };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();`

export async function GET() {
  return new Response(BRIDGE, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
