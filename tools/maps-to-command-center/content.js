'use strict';

(function () {
  if (window.__mapsToCCContentLoaded) return;

  var DEFAULT_BASE_URL = 'http://localhost:3000';
  var sentUrls = new Set(); // per-page-session dedupe
  var sentCount = 0;
  var lastFeedCount = 0;
  var mutationTimer = null;

  var panel, singleBtn, allBtn, statusEl, counterEl;

  function getParser() {
    return window.__mapsToCC || null;
  }

  function isMapsPage() {
    return location.pathname === '/maps' || location.pathname.indexOf('/maps') === 0;
  }

  function isLocalFinderPage() {
    return location.pathname === '/search';
  }

  function hasLocalFinderCards() {
    return !!document.querySelector('.rllt__details');
  }

  function pageType() {
    return isLocalFinderPage() ? 'local' : 'maps';
  }

  function baseUrlPromise() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.sync.get({ baseUrl: DEFAULT_BASE_URL }, function (items) {
          resolve((items && items.baseUrl) || DEFAULT_BASE_URL);
        });
      } catch (e) {
        resolve(DEFAULT_BASE_URL);
      }
    });
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'maps-to-cc-panel';
    panel.innerHTML =
      '<div class="mcc-header">' +
        '<span>Maps → Command Center <span class="mcc-badge">CC</span></span>' +
        '<span class="mcc-close" title="Hide">✕</span>' +
      '</div>' +
      '<button class="mcc-btn" id="mcc-send-single" disabled>Send this business</button>' +
      '<button class="mcc-btn mcc-secondary" id="mcc-send-all" disabled>Send all loaded (0)</button>' +
      '<div class="mcc-status" id="mcc-status"></div>' +
      '<div class="mcc-hint">Alt+S sends current, or all loaded if no listing is open. Scroll the list to load more results.</div>' +
      '<div class="mcc-counter"><span>Sent this session</span><span id="mcc-counter">0</span></div>';

    document.documentElement.appendChild(panel);

    singleBtn = panel.querySelector('#mcc-send-single');
    allBtn = panel.querySelector('#mcc-send-all');
    statusEl = panel.querySelector('#mcc-status');
    counterEl = panel.querySelector('#mcc-counter');

    panel.querySelector('.mcc-close').addEventListener('click', function () {
      panel.style.display = 'none';
    });

    singleBtn.addEventListener('click', function () {
      sendCurrentOrAll(true);
    });
    allBtn.addEventListener('click', function () {
      sendCurrentOrAll(false);
    });
  }

  function setStatus(html) {
    if (statusEl) statusEl.innerHTML = html;
  }

  function refreshButtons() {
    var parser = getParser();
    if (!parser) return;

    var panelData = safeParsePanel(parser);
    var hasSingle = !!(panelData && panelData.name);
    singleBtn.disabled = !hasSingle;

    if (hasSingle && sentUrls.has(panelData.mapsUrl)) {
      singleBtn.textContent = 'Already sent';
      singleBtn.disabled = true;
    } else {
      singleBtn.textContent = 'Send this business';
    }

    var cards = safeParseCards(parser);
    lastFeedCount = cards.length;
    allBtn.textContent = 'Send all loaded (' + lastFeedCount + ')';
    allBtn.disabled = lastFeedCount === 0;
  }

  function safeParsePanel(parser) {
    try {
      if (pageType() === 'local') return parser.parseLocalFinderPanel(document, null);
      return parser.parsePlacePanel(document);
    } catch (e) {
      return null;
    }
  }

  function safeParseCards(parser) {
    try {
      if (pageType() === 'local') return parser.parseLocalFinderCards(document) || [];
      return parser.parseResultCards(document) || [];
    } catch (e) {
      return [];
    }
  }

  function getLocalFinderCardElements() {
    try {
      return Array.prototype.slice.call(document.querySelectorAll('div.rllt__details'));
    } catch (e) {
      return [];
    }
  }

  function buildMeta(parser) {
    var loc = '';
    try {
      var ctx = parser.parseQueryContext(document, loc);
      return ctx || { query: '', location: '' };
    } catch (e) {
      return { query: '', location: '' };
    }
  }

  function sendCurrentOrAll(preferSingle) {
    var parser = getParser();
    if (!parser) {
      setStatus('Parser not available on this page.');
      return;
    }

    if (!preferSingle && pageType() === 'local') {
      sendLocalFinderBulkFlow(parser);
      return;
    }

    var leads = [];
    if (preferSingle) {
      var single = safeParsePanel(parser);
      if (single && single.name) {
        if (sentUrls.has(single.mapsUrl)) {
          setStatus('Already sent this business.');
          return;
        }
        leads = [single];
      } else {
        setStatus(pageType() === 'local' ? 'No business panel is open.' : 'No business listing is open.');
        return;
      }
    } else {
      leads = safeParseCards(parser).filter(function (l) {
        return !sentUrls.has(l.mapsUrl);
      });
      if (leads.length === 0) {
        setStatus('Nothing new to send.');
        return;
      }
    }

    var meta = buildMeta(parser);
    if (pageType() === 'local') meta.source = 'google-local-finder';
    singleBtn.disabled = true;
    allBtn.disabled = true;

    if (preferSingle) {
      setStatus('Sending…');
      chrome.runtime.sendMessage({ type: 'MAPS_TO_CC_SEND', leads: leads, meta: meta }, function (response) {
        refreshButtons();
        handleResult(response, leads);
      });
      return;
    }

    // Bulk on Maps: card data alone is missing website/full-address/hours, so
    // the background worker opens each business's page in a hidden tab to
    // harvest the place panel, then posts the merged batch in one request.
    setStatus('Harvesting 0/' + leads.length + '…');
    chrome.runtime.sendMessage({ type: 'MAPS_TO_CC_SEND_BULK', cards: leads, meta: meta }, function (response) {
      refreshButtons();
      handleResult(response, leads);
    });
  }

  // ---- Local finder bulk: in-page click + poll (no background tabs) -------

  function pollForLocalPanel(parser, expectedName, intervalMs, timeoutMs, callback) {
    var elapsed = 0;
    function attempt() {
      var data = null;
      try {
        data = parser.parseLocalFinderPanel(document, expectedName);
      } catch (e) {
        data = null;
      }
      if (data && data.name) {
        callback(data);
        return;
      }
      elapsed += intervalMs;
      if (elapsed >= timeoutMs) {
        callback(null);
        return;
      }
      setTimeout(attempt, intervalMs);
    }
    attempt();
  }

  function mergeLocalCardWithPanel(card, panelData) {
    if (!panelData) return card;
    var merged = {};
    Object.keys(card).forEach(function (k) { merged[k] = card[k]; });
    ['address', 'website', 'phone', 'category', 'hours'].forEach(function (field) {
      if (panelData[field]) merged[field] = panelData[field];
    });
    if (panelData.rating) merged.rating = panelData.rating;
    if (panelData.reviewCount) merged.reviewCount = panelData.reviewCount;
    if (panelData.mapsUrl) merged.mapsUrl = panelData.mapsUrl;
    if (panelData.name) merged.name = panelData.name;
    return merged;
  }

  function sendLocalFinderBulkFlow(parser) {
    var elements = getLocalFinderCardElements();
    var pairs = [];
    elements.forEach(function (el) {
      var data = null;
      try {
        data = parser.parseLocalFinderCard ? parser.parseLocalFinderCard(el) : null;
      } catch (e) {
        data = null;
      }
      if (data && data.name && !sentUrls.has(data.mapsUrl)) pairs.push({ el: el, data: data });
    });

    if (!pairs.length) {
      setStatus('Nothing new to send.');
      return;
    }

    singleBtn.disabled = true;
    allBtn.disabled = true;
    setStatus('Harvesting 0/' + pairs.length + '…');

    var merged = [];
    var idx = 0;

    function next() {
      if (idx >= pairs.length) {
        finish();
        return;
      }
      var pair = pairs[idx];
      idx++;
      try {
        var heading = pair.el.querySelector('[role="heading"]');
        if (heading) heading.click();
      } catch (e) {}
      pollForLocalPanel(parser, pair.data.name, 300, 6000, function (panelData) {
        merged.push(mergeLocalCardWithPanel(pair.data, panelData));
        setStatus('Harvesting ' + idx + '/' + pairs.length + ' – ' + escapeHtml(pair.data.name));
        next();
      });
    }

    function finish() {
      var meta = buildMeta(parser);
      meta.source = 'google-local-finder';
      chrome.runtime.sendMessage({ type: 'MAPS_TO_CC_SEND', leads: merged, meta: meta }, function (response) {
        refreshButtons();
        handleResult(response, merged);
      });
    }

    next();
  }

  function handleResult(response, sentLeads) {
    if (chrome.runtime.lastError) {
      setStatus('Extension error: ' + chrome.runtime.lastError.message);
      return;
    }
    if (!response) {
      setStatus('No response from background worker.');
      return;
    }
    if (response.ok === false) {
      if (response.error === 'not_authenticated') {
        setStatus(response.message || 'Please log into the CRM.');
      } else {
        setStatus(response.message || 'Failed to send leads.');
      }
      return;
    }

    var created = response.created || 0;
    var results = response.results || [];
    var duplicate = 0;
    var invalid = 0;

    baseUrlPromise().then(function (baseUrl) {
      var createdLinks = [];
      results.forEach(function (r) {
        if (r.status === 'created') {
          var lead = sentLeads.filter(function (l) { return l.name === r.name; })[0];
          if (lead) sentUrls.add(lead.mapsUrl);
          createdLinks.push(escapeHtml(r.name));
        } else if (r.status === 'duplicate') {
          duplicate++;
          var dupLead = sentLeads.filter(function (l) { return l.name === r.name; })[0];
          if (dupLead) sentUrls.add(dupLead.mapsUrl);
        } else if (r.status === 'invalid') {
          invalid++;
        }
      });

      sentCount += created;
      counterEl.textContent = String(sentCount);

      var parts = [];
      parts.push(created + ' added');
      if (duplicate) parts.push(duplicate + ' already in CRM');
      if (invalid) parts.push(invalid + ' invalid');

      var summary = parts.join(' · ');
      var leadsUrl = baseUrl.replace(/\/+$/, '') + '/leads';
      if (createdLinks.length) {
        summary +=
          '<br><a href="' + escapeHtml(leadsUrl) + '" target="_blank" rel="noopener">' +
          createdLinks.join(', ') +
          '</a>';
      }
      setStatus(summary);
      refreshButtons();
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function scheduleRefresh() {
    if (mutationTimer) return;
    mutationTimer = setTimeout(function () {
      mutationTimer = null;
      refreshButtons();
    }, 600);
  }

  function initObserver() {
    var observer = new MutationObserver(function () {
      scheduleRefresh();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function initKeyboardShortcut() {
    document.addEventListener('keydown', function (e) {
      if (e.altKey && (e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey) {
        var parser = getParser();
        if (!parser) return;
        var panelData = safeParsePanel(parser);
        var hasSingle = !!(panelData && panelData.name);
        e.preventDefault();
        sendCurrentOrAll(hasSingle);
      }
    });
  }

  function initRuntimeMessageListener() {
    // Two roles, both handled here:
    //  - on a background-harvest tab: answer MAPS_TO_CC_HARVEST with the
    //    parsed place panel for this page.
    //  - on the originating results tab: show MAPS_TO_CC_PROGRESS updates
    //    while a bulk send is harvesting other tabs.
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (!message) return false;

      if (message.type === 'MAPS_TO_CC_HARVEST') {
        var parser = getParser();
        var data = null;
        try {
          data = parser ? parser.parsePlacePanel(document) : null;
        } catch (e) {
          data = null;
        }
        sendResponse(data);
        return true;
      }

      if (message.type === 'MAPS_TO_CC_PROGRESS') {
        setStatus('Harvesting ' + message.done + '/' + message.total + ' – ' + escapeHtml(message.current || ''));
        return false;
      }

      return false;
    });
  }

  function init() {
    buildPanel();
    initObserver();
    initKeyboardShortcut();
    initRuntimeMessageListener();
    refreshButtons();
    // Maps content loads asynchronously; poll a few times early on.
    var tries = 0;
    var poll = setInterval(function () {
      tries++;
      refreshButtons();
      if (tries > 10) clearInterval(poll);
    }, 1000);
  }

  function shouldActivate() {
    if (isMapsPage()) return true;
    if (isLocalFinderPage() && hasLocalFinderCards()) return true;
    return false;
  }

  function tryActivate() {
    if (window.__mapsToCCContentLoaded) return true;
    if (!shouldActivate()) return false;
    window.__mapsToCCContentLoaded = true;
    init();
    return true;
  }

  function start() {
    if (tryActivate()) return;

    if (isLocalFinderPage()) {
      // Google renders local-finder results late; watch for the cards to
      // show up, then activate. Give up after a while on plain searches.
      var activateObserver = new MutationObserver(function () {
        if (tryActivate()) activateObserver.disconnect();
      });
      activateObserver.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { activateObserver.disconnect(); }, 15000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
