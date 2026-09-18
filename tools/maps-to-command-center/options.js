'use strict';

var DEFAULT_BASE_URL = 'http://localhost:3000';
var KNOWN_URLS = ['http://localhost:3000'];

var baseUrlSelect = document.getElementById('baseUrlSelect');
var customUrlWrap = document.getElementById('customUrlWrap');
var customUrlInput = document.getElementById('customUrl');
var tokenInput = document.getElementById('token');
var saveBtn = document.getElementById('saveBtn');
var testBtn = document.getElementById('testBtn');
var statusEl = document.getElementById('status');

function setStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#f87171' : '#86efac';
}

function updateCustomVisibility() {
  customUrlWrap.style.display = baseUrlSelect.value === 'custom' ? 'block' : 'none';
}

function currentBaseUrl() {
  if (baseUrlSelect.value === 'custom') {
    return (customUrlInput.value || '').trim().replace(/\/+$/, '');
  }
  return baseUrlSelect.value;
}

function load() {
  chrome.storage.sync.get({ baseUrl: DEFAULT_BASE_URL, token: '' }, function (items) {
    if (KNOWN_URLS.indexOf(items.baseUrl) !== -1) {
      baseUrlSelect.value = items.baseUrl;
    } else {
      baseUrlSelect.value = 'custom';
      customUrlInput.value = items.baseUrl || '';
    }
    tokenInput.value = items.token || '';
    updateCustomVisibility();
  });
}

// Chrome only lets an extension fetch() a host it has been granted
// permission for. https://www.google.com is declared in host_permissions
// (required, for reading the Maps page); every CRM origin is optional and
// must be requested at runtime, so this asks for whatever origin the user
// just entered. Must run synchronously inside the Save click handler --
// chrome.permissions.request() only works within a user gesture.
function requestOriginPermission(baseUrl, callback) {
  var origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch (e) {
    setStatus('That does not look like a valid URL.', true);
    return;
  }
  chrome.permissions.request({ origins: [origin + '/*'] }, function (granted) {
    if (chrome.runtime.lastError) {
      setStatus('Permission request failed: ' + chrome.runtime.lastError.message, true);
      return;
    }
    if (!granted) {
      setStatus('Permission denied -- the extension needs access to ' + origin + ' to send leads there. Nothing was saved.', true);
      return;
    }
    callback();
  });
}

function save(callback) {
  var baseUrl = currentBaseUrl();
  if (!baseUrl) {
    setStatus('Please enter a base URL.', true);
    return;
  }
  requestOriginPermission(baseUrl, function () {
    chrome.storage.sync.set({ baseUrl: baseUrl, token: tokenInput.value.trim() }, function () {
      setStatus('Saved.');
      if (callback) callback(baseUrl);
    });
  });
}

function testConnection() {
  setStatus('Testing…');
  save(function (baseUrl) {
    chrome.storage.sync.get({ token: '' }, function (items) {
      var url = baseUrl.replace(/\/+$/, '') + '/api/leads/maps-intake';
      var headers = { 'Content-Type': 'application/json' };
      if (items.token) headers['Authorization'] = 'Bearer ' + items.token;

      fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify({ leads: [], meta: {} })
      })
        .then(function (resp) {
          if (resp.status === 401) {
            setStatus('Not logged in — please log into the CRM at ' + baseUrl + ' first.', true);
            return null;
          }
          return resp.json().catch(function () {
            return null;
          });
        })
        .then(function (json) {
          if (json === null) return;
          if (json && json.ok) {
            setStatus('Connected. Server responded ok (created: ' + (json.created || 0) + ').');
          } else {
            setStatus('Unexpected response from server: ' + JSON.stringify(json), true);
          }
        })
        .catch(function (err) {
          setStatus('Could not reach ' + baseUrl + ' — ' + err.message, true);
        });
    });
  });
}

baseUrlSelect.addEventListener('change', updateCustomVisibility);
saveBtn.addEventListener('click', function () {
  save();
});
testBtn.addEventListener('click', testConnection);

load();
