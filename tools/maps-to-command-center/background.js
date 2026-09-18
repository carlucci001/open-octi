'use strict';

var DEFAULT_BASE_URL = 'http://localhost:3000';
var HARVEST_TIMEOUT_MS = 8000;
var HARVEST_POLL_MS = 500;

function getSettings() {
  return new Promise(function (resolve) {
    chrome.storage.sync.get({ baseUrl: DEFAULT_BASE_URL, token: '' }, function (items) {
      resolve(items);
    });
  });
}

function postLeads(baseUrl, token, leads, meta) {
  var url = baseUrl.replace(/\/+$/, '') + '/api/leads/maps-intake';
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: headers,
    body: JSON.stringify({ leads: leads || [], meta: meta || {} })
  })
    .then(function (resp) {
      if (resp.status === 401) {
        return {
          ok: false,
          error: 'not_authenticated',
          message: 'Not logged into the CRM. Please log into ' + baseUrl + ' and try again.'
        };
      }
      return resp
        .json()
        .catch(function () {
          return { ok: false, error: 'bad_response', message: 'CRM returned an unreadable response (status ' + resp.status + ').' };
        })
        .then(function (json) {
          if (!resp.ok && json && json.ok === undefined) {
            json.ok = false;
          }
          return json;
        });
    })
    .catch(function (err) {
      return {
        ok: false,
        error: 'network_error',
        message: 'Could not reach the CRM at ' + baseUrl + ' (' + (err && err.message ? err.message : 'network error') + ').'
      };
    });
}

// ---- Bulk harvest via background tabs -------------------------------------
//
// Clicking a result card via JS does not reliably open the place panel, so
// bulk sends open each business's own maps URL in a background (inactive)
// tab, ask that tab's content script to harvest parsePlacePanel(), merge it
// over the card data, then close the tab.

function waitForTabComplete(tabId) {
  return new Promise(function (resolve) {
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') finish();
    }
    chrome.tabs.onUpdated.addListener(listener);
    // Safety net in case 'complete' never fires for this tab.
    setTimeout(finish, HARVEST_TIMEOUT_MS);
  });
}

function harvestPanel(tabId) {
  return new Promise(function (resolve) {
    var elapsed = 0;
    function attempt() {
      try {
        chrome.tabs.sendMessage(tabId, { type: 'MAPS_TO_CC_HARVEST' }, function (response) {
          var err = chrome.runtime.lastError; // e.g. "no receiver" while the page is still loading
          if (!err && response && response.name && response.name !== 'Results') {
            resolve(response);
            return;
          }
          elapsed += HARVEST_POLL_MS;
          if (elapsed >= HARVEST_TIMEOUT_MS) {
            resolve(null);
            return;
          }
          setTimeout(attempt, HARVEST_POLL_MS);
        });
      } catch (e) {
        resolve(null);
      }
    }
    attempt();
  });
}

function mergeCardWithPanel(card, panel) {
  if (!panel) return card;
  var merged = {};
  Object.keys(card).forEach(function (k) { merged[k] = card[k]; });
  // Panel wins for these fields when it has a value.
  ['address', 'website', 'hours', 'category', 'phone'].forEach(function (field) {
    if (panel[field]) merged[field] = panel[field];
  });
  // Keep card rating/reviewCount if the panel's are empty.
  if (panel.rating) merged.rating = panel.rating;
  else if (!merged.rating) merged.rating = card.rating || '';
  if (panel.reviewCount) merged.reviewCount = panel.reviewCount;
  else if (!merged.reviewCount) merged.reviewCount = card.reviewCount || '';
  if (panel.placeId) merged.placeId = panel.placeId;
  if (panel.name) merged.name = panel.name;
  return merged;
}

function harvestCard(card, originTabId, doneIdx, total) {
  return new Promise(function (resolve) {
    chrome.tabs.create({ url: card.mapsUrl, active: false }, function (tab) {
      if (!tab || tab.id == null) {
        resolve(card);
        return;
      }
      var tabId = tab.id;
      waitForTabComplete(tabId)
        .then(function () { return harvestPanel(tabId); })
        .then(function (panel) {
          var merged = mergeCardWithPanel(card, panel);
          try { chrome.tabs.remove(tabId); } catch (e) {}
          if (originTabId != null) {
            try {
              chrome.tabs.sendMessage(originTabId, {
                type: 'MAPS_TO_CC_PROGRESS',
                done: doneIdx,
                total: total,
                current: card.name
              });
            } catch (e) {}
          }
          resolve(merged);
        })
        .catch(function () {
          try { chrome.tabs.remove(tabId); } catch (e) {}
          resolve(card); // fallback to card data on any failure/timeout
        });
    });
  });
}

function harvestAll(cards, originTabId) {
  var total = cards.length;
  var results = [];
  var chain = Promise.resolve();
  cards.forEach(function (card, idx) {
    chain = chain.then(function () {
      return harvestCard(card, originTabId, idx + 1, total).then(function (merged) {
        results.push(merged);
      });
    });
  });
  return chain.then(function () { return results; });
}

// ---- Message handling -------------------------------------------------

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message) return false;

  if (message.type === 'MAPS_TO_CC_SEND') {
    // Single-business send: leads already fully built by the content
    // script from the currently open place panel.
    getSettings()
      .then(function (settings) {
        return postLeads(settings.baseUrl || DEFAULT_BASE_URL, settings.token, message.leads, message.meta);
      })
      .then(function (result) { sendResponse(result); })
      .catch(function (err) { sendResponse({ ok: false, error: 'unexpected_error', message: String(err) }); });
    return true; // keep sendResponse channel open for async work
  }

  if (message.type === 'MAPS_TO_CC_SEND_BULK') {
    var originTabId = sender && sender.tab ? sender.tab.id : null;
    var cards = message.cards || [];

    harvestAll(cards, originTabId)
      .then(function (mergedLeads) {
        return getSettings().then(function (settings) {
          return postLeads(settings.baseUrl || DEFAULT_BASE_URL, settings.token, mergedLeads, message.meta);
        });
      })
      .then(function (result) { sendResponse(result); })
      .catch(function (err) { sendResponse({ ok: false, error: 'unexpected_error', message: String(err) }); });
    return true;
  }

  return false;
});

chrome.action.onClicked.addListener(function () {
  chrome.runtime.openOptionsPage();
});
