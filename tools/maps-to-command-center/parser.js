/**
 * parser.js — pure DOM parsing helpers for Google Maps.
 * No side effects. Every selector is defensively wrapped so a miss
 * yields empty strings / null instead of throwing.
 *
 * Exposes window.__mapsToCC = { parseResultCards, parsePlacePanel, parseQueryContext }
 */
(function () {
  'use strict';

  function norm(s) {
    if (!s) return '';
    return String(s).replace(/\s+/g, ' ').trim();
  }

  function safe(fn, fallback) {
    try {
      var v = fn();
      return v === undefined || v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  var PHONE_RE = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

  function parsePhoneFromText(text) {
    if (!text) return '';
    var m = text.match(PHONE_RE);
    return m ? norm(m[0]) : '';
  }

  function parseRatingFromAriaLabel(label) {
    // e.g. "4.6 stars 128 Reviews" or "4.6 stars" (panel omits the count)
    var out = { rating: '', reviewCount: '' };
    if (!label) return out;
    var ratingMatch = label.match(/([\d.]+)\s*stars?/i);
    if (ratingMatch) out.rating = ratingMatch[1];
    var reviewMatch = label.match(/([\d,]+)\s*Reviews?/i);
    if (reviewMatch) out.reviewCount = reviewMatch[1].replace(/,/g, '');
    return out;
  }

  function findStarSpan(root) {
    return safe(function () {
      return root.querySelector('span[role="img"][aria-label*="star"]');
    }, null);
  }

  function extractPlaceIdFromUrl(url) {
    if (!url) return '';
    // pattern: !1s0x...(:0x...)?  (hex place id embedded in the maps URL)
    var m1 = url.match(/!1s(0x[0-9a-fA-F]+(?::0x[0-9a-fA-F]+)?)/);
    if (m1) return m1[1];
    var m2 = url.match(/[?&]place_id=([^&]+)/);
    if (m2) return decodeURIComponent(m2[1]);
    var m3 = url.match(/[?&]ftid=([^&]+)/);
    if (m3) return decodeURIComponent(m3[1]);
    return '';
  }

  // ---- Result feed cards ------------------------------------------------
  //
  // card.textContent is useless: spans get concatenated with no separator.
  // Instead we look for `div`s whose immediate children are ALL `span`s —
  // those are Maps' "line" rows. Spans with aria-hidden="true" are the
  // literal "·" dot separators; content spans are what we want, joined
  // with " · " to rebuild a readable line while keeping segment identity.

  function getCardLines(card) {
    var lines = [];
    var divs = safe(function () { return Array.prototype.slice.call(card.querySelectorAll('div')); }, []);
    divs.forEach(function (div) {
      var children = safe(function () { return Array.prototype.slice.call(div.children || []); }, []);
      if (!children.length) return;
      var allSpans = children.every(function (c) { return c.tagName === 'SPAN'; });
      if (!allSpans) return;
      var contentSpans = children.filter(function (s) {
        return safe(function () { return s.getAttribute('aria-hidden'); }, null) !== 'true';
      });
      if (!contentSpans.length) return;
      // Some content spans carry their own leading "·" (seen live:
      // "· 1200 Woodruff Rd") — strip stray dots at either end.
      var segments = contentSpans.map(function (s) {
        return norm(s.textContent).replace(/^[·\s]+|[·\s]+$/g, '');
      });
      lines.push(segments);
    });
    return lines;
  }

  function isSponsoredCard(card) {
    var leaves = safe(function () { return Array.prototype.slice.call(card.querySelectorAll('*')); }, []);
    for (var i = 0; i < leaves.length; i++) {
      var el = leaves[i];
      var hasElementChildren = safe(function () { return el.children && el.children.length > 0; }, false);
      if (hasElementChildren) continue;
      if (norm(safe(function () { return el.textContent; }, '')) === 'Sponsored') return true;
    }
    return false;
  }

  function parseResultCards(doc) {
    doc = doc || document;
    var results = [];
    var feed = safe(function () {
      return doc.querySelector('div[role="feed"]');
    }, null);
    if (!feed) return results;

    var cardNodes = safe(function () {
      return Array.prototype.slice.call(feed.children);
    }, []);

    cardNodes.forEach(function (card) {
      try {
        var item = parseOneCard(card);
        if (item && item.name) results.push(item);
      } catch (e) {
        // skip malformed card
      }
    });

    return results;
  }

  function parseOneCard(card) {
    var anchor = safe(function () {
      return card.querySelector('a[href*="/maps/place/"]');
    }, null);
    if (!anchor) return null;

    var name = norm(safe(function () { return anchor.getAttribute('aria-label'); }, ''))
      .replace(/\s*·\s*Visited link\s*$/i, ''); // Maps appends this to visited places
    if (!name) return null;

    var mapsUrl = norm(safe(function () { return anchor.href; }, ''));
    var placeId = extractPlaceIdFromUrl(mapsUrl);

    var starSpan = findStarSpan(card);
    var ratingInfo = parseRatingFromAriaLabel(
      safe(function () { return starSpan.getAttribute('aria-label'); }, '')
    );

    var lines = getCardLines(card);

    // First line whose first segment has no digits and has >= 2 segments:
    // category = segment[0], address = last non-empty segment.
    var category = '';
    var address = '';
    for (var i = 0; i < lines.length; i++) {
      var segs = lines[i];
      if (segs.length >= 2 && segs[0] && !/\d/.test(segs[0])) {
        category = segs[0];
        var nonEmpty = segs.filter(Boolean);
        address = nonEmpty.length ? nonEmpty[nonEmpty.length - 1] : '';
        break;
      }
    }

    // Line containing a phone match: phone = that segment, hours = the rest.
    var phone = '';
    var hours = '';
    for (var j = 0; j < lines.length; j++) {
      var segs2 = lines[j];
      var phoneIdx = -1;
      for (var k = 0; k < segs2.length; k++) {
        if (PHONE_RE.test(segs2[k])) {
          phoneIdx = k;
          break;
        }
      }
      if (phoneIdx !== -1) {
        var m = segs2[phoneIdx].match(PHONE_RE);
        phone = norm(m[0]);
        var rest = segs2.filter(function (_, idx) { return idx !== phoneIdx; }).filter(Boolean);
        hours = rest.join(' · ');
        break;
      }
    }

    // Website is never present in the card DOM in practice; keep the
    // data-value="Website" attempt (usually returns nothing) and stop there.
    var website = '';
    var websiteAnchor = safe(function () {
      return card.querySelector('a[data-value="Website"]');
    }, null);
    if (websiteAnchor) {
      website = norm(safe(function () { return websiteAnchor.href; }, ''));
    }

    var sponsored = isSponsoredCard(card);

    var item = {
      name: name,
      phone: phone,
      website: website,
      address: address,
      category: category,
      rating: ratingInfo.rating,
      reviewCount: ratingInfo.reviewCount,
      hours: hours,
      mapsUrl: mapsUrl,
      placeId: placeId
    };
    if (sponsored) item.sponsored = true; // extra field; server ignores it
    return item;
  }

  // ---- Single place panel -------------------------------------------------
  //
  // While the results list is showing, the only [role="main"] is the
  // Results list itself, whose h1 text is "Results". We must treat that
  // as "no panel open".

  function findPanelMain(doc) {
    var h1 = safe(function () { return doc.querySelector('[role="main"] h1') || doc.querySelector('h1'); }, null);
    if (!h1) return null;
    var name = norm(safe(function () { return h1.textContent; }, ''));
    if (!name || name === 'Results') return null;
    var main = safe(function () { return h1.closest('[role="main"]'); }, null);
    if (!main) main = safe(function () { return doc.querySelector('div[role="main"]'); }, null);
    if (!main) return null;
    return { main: main, name: name };
  }

  function parsePanelPhone(main) {
    var phoneBtn = safe(function () { return main.querySelector('button[data-item-id^="phone:tel:"]'); }, null);
    if (!phoneBtn) phoneBtn = safe(function () { return main.querySelector('button[data-item-id^="phone"]'); }, null);
    if (!phoneBtn) return '';

    var itemId = norm(safe(function () { return phoneBtn.getAttribute('data-item-id'); }, ''));
    var e164 = itemId.match(/phone:tel:(\+?\d+)/);
    if (e164) return e164[1];

    var label = norm(safe(function () { return (phoneBtn.getAttribute('aria-label') || '').replace(/^Phone:\s*/i, ''); }, ''));
    return label;
  }

  function parsePanelReviewCount(main, starSpan) {
    // The panel's star aria-label ("4.4 stars ") omits the count; find it
    // in any descendant whose aria-label or text matches "<n> reviews".
    // Only trust aria-labels of the exact form "18 reviews" — scanning
    // textContent produced "418" from "4.4(18 reviews)" on a live page.
    var nodes = safe(function () { return Array.prototype.slice.call(main.querySelectorAll('[aria-label]')); }, []);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el === starSpan) continue;
      var label = safe(function () { return el.getAttribute('aria-label'); }, '') || '';
      var m = norm(label).match(/^([\d,]+)\s+reviews?$/i);
      if (m) return m[1].replace(/,/g, '');
    }
    return '';
  }

  function parsePanelHours(main) {
    // The panel can hold several tables (rating histogram too); pick the
    // one that mentions a weekday.
    var table = safe(function () {
      var tables = Array.prototype.slice.call(main.querySelectorAll('table'));
      for (var t = 0; t < tables.length; t++) {
        if (/monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(tables[t].textContent)) return tables[t];
      }
      return null;
    }, null);
    if (table) {
      var rows = safe(function () { return Array.prototype.slice.call(table.querySelectorAll('tr')); }, []);
      var rowTexts = rows
        .map(function (tr) {
          var cells = safe(function () { return Array.prototype.slice.call(tr.querySelectorAll('td,th')); }, []);
          return norm(cells.map(function (c) { return norm(c.textContent); }).join(' '));
        })
        .filter(Boolean);
      if (rowTexts.length) return rowTexts.join('; ');
    }

    // Fallback: aria-label / text based hours element.
    var hoursEl = safe(function () {
      return main.querySelector('div[aria-label*="Hours"]') || main.querySelector('[data-item-id="oh"]');
    }, null);
    if (hoursEl) {
      return norm(
        safe(function () { return hoursEl.getAttribute('aria-label') || hoursEl.textContent; }, '')
      ).replace(/^Hours:\s*/i, '');
    }
    return '';
  }

  function parsePlacePanel(doc) {
    doc = doc || document;
    var found = findPanelMain(doc);
    if (!found) return null;
    var main = found.main;
    var name = found.name;

    var starSpan = findStarSpan(main);
    var ratingInfo = parseRatingFromAriaLabel(
      safe(function () { return starSpan.getAttribute('aria-label'); }, '')
    );
    var reviewCount = ratingInfo.reviewCount || parsePanelReviewCount(main, starSpan);

    var addressBtn = safe(function () { return main.querySelector('button[data-item-id="address"]'); }, null);
    var address = norm(
      safe(function () {
        return (addressBtn.getAttribute('aria-label') || '').replace(/^Address:\s*/i, '');
      }, '')
    );

    var phone = parsePanelPhone(main);
    if (!phone) phone = parsePhoneFromText(norm(safe(function () { return main.textContent; }, '')));

    var websiteAnchor = safe(function () { return main.querySelector('a[data-item-id="authority"]'); }, null);
    var website = norm(safe(function () { return websiteAnchor.href; }, ''));

    var hours = parsePanelHours(main);

    var category = '';
    var categoryBtn = safe(function () { return main.querySelector('button[jsaction*="category"]'); }, null);
    if (categoryBtn) {
      category = norm(safe(function () { return categoryBtn.textContent; }, ''));
    }

    var mapsUrl = norm(
      safe(function () {
        return doc.defaultView ? doc.defaultView.location.href : (typeof location !== 'undefined' ? location.href : '');
      }, '')
    );
    var placeId = extractPlaceIdFromUrl(mapsUrl);

    return {
      name: name,
      phone: phone,
      website: website,
      address: address,
      category: category,
      rating: ratingInfo.rating,
      reviewCount: reviewCount,
      hours: hours,
      mapsUrl: mapsUrl,
      placeId: placeId
    };
  }

  // ---- Google local finder (google.com/search?...&udm=1, "More places") ---
  //
  // No maps.google.com navigation happens here: the results list is
  // `div.rllt__details` cards with no anchors/data-cid, and clicking a
  // card's heading opens an in-page detail panel (`div.TZausf`) instead of
  // navigating. Output shape matches the Maps parsers so downstream code
  // (content.js, the CRM intake endpoint) doesn't need to know the source.

  function parseReviewCountToken(tok) {
    if (!tok) return '';
    var cleaned = String(tok).replace(/,/g, '');
    var km = cleaned.match(/^([\d.]+)\s*K$/i);
    if (km) {
      var n = Math.round(parseFloat(km[1]) * 1000);
      return isNaN(n) ? '' : String(n);
    }
    var plain = parseInt(cleaned, 10);
    return isNaN(plain) ? '' : String(plain);
  }

  // Walk TEXT nodes (not "leaf elements"): live cards put the category in a
  // div that also holds an icon child, so an element-leaf walk skipped it.
  // Stop at the first quoted review snippet — everything after is review text.
  function getLocalFinderLeafTexts(root, excludeEls) {
    var texts = [];
    var doc = root.ownerDocument || document;
    var walker = safe(function () { return doc.createTreeWalker(root, 4 /* SHOW_TEXT */); }, null);
    if (!walker) return texts;
    var node;
    while ((node = walker.nextNode())) {
      var el = node.parentElement;
      var skip = false;
      for (var i = 0; i < excludeEls.length; i++) {
        var ex = excludeEls[i];
        if (ex && (ex === el || (ex.contains && ex.contains(el)))) { skip = true; break; }
      }
      if (skip) continue;
      var text = norm(node.textContent);
      if (!text) continue;
      if (/^["“]/.test(text)) break; // review snippet starts; nothing useful after
      texts.push(text);
    }
    return texts;
  }

  function parseOneLocalFinderCard(details) {
    var headingEl = safe(function () { return details.querySelector('[role="heading"]'); }, null);
    var name = norm(safe(function () { return headingEl.textContent; }, ''));
    if (!name) return null;

    var starSpan = safe(function () { return details.querySelector('span[role="img"]'); }, null);
    var ratingLabel = safe(function () { return starSpan.getAttribute('aria-label'); }, '');
    var rating = '';
    var reviewCount = '';
    if (ratingLabel) {
      var rm = ratingLabel.match(/Rated\s+([\d.]+)\s+out of 5/i);
      if (rm) rating = rm[1];
      var cm = ratingLabel.match(/([\d.,]+K?)\s+user reviews?/i);
      if (cm) reviewCount = parseReviewCountToken(cm[1]);
    }

    var leaves = getLocalFinderLeafTexts(details, [headingEl, starSpan].filter(Boolean));

    var segments = [];
    leaves.forEach(function (text) {
      text
        .split('·')
        .map(function (s) { return norm(s); })
        .filter(Boolean)
        .forEach(function (seg) { segments.push(seg); });
    });

    var phone = '';
    var hoursParts = [];
    var address = '';
    var category = '';
    segments.forEach(function (seg) {
      if (!phone && PHONE_RE.test(seg)) {
        var m = seg.match(PHONE_RE);
        phone = norm(m[0]);
        return;
      }
      if (/in business/i.test(seg)) return;
      if (/^["“].*["”]$/.test(seg)) return; // quoted review snippet
      if (/open|closed|closes|opens/i.test(seg)) {
        hoursParts.push(seg);
        return;
      }
      if (/,\s*[A-Z]{2}$/.test(seg)) {
        if (!address) address = seg;
        return;
      }
      if (!category && seg && !/^\d/.test(seg)) category = seg;
    });

    var hours = hoursParts.join(' · ');
    var mapsUrl = 'https://www.google.com/maps/search/' + encodeURIComponent(norm(name + ' ' + address));

    return {
      name: name,
      phone: phone,
      website: '',
      address: address,
      category: category,
      rating: rating,
      reviewCount: reviewCount,
      hours: hours,
      mapsUrl: mapsUrl,
      placeId: ''
    };
  }

  function parseLocalFinderCards(doc) {
    doc = doc || document;
    var results = [];
    var detailsList = safe(function () { return Array.prototype.slice.call(doc.querySelectorAll('div.rllt__details')); }, []);
    detailsList.forEach(function (details) {
      try {
        var item = parseOneLocalFinderCard(details);
        if (item && item.name) results.push(item);
      } catch (e) {
        // skip malformed card
      }
    });
    return results;
  }

  var LOCAL_PANEL_LABELS = {
    name: 'Place name',
    category: 'Place category',
    address: 'Place location',
    hours: 'Place opening hours',
    phone: 'Place phone number',
    website: 'Place website'
  };

  function stripIsolates(s) {
    return String(s || '').replace(/[⁦⁧⁨⁩]/g, '');
  }

  function findLocalFinderPanel(doc, expectedName) {
    var panels = safe(function () { return Array.prototype.slice.call(doc.querySelectorAll('div.TZausf')); }, []);
    var wantName = norm(expectedName || '');
    var fallback = null;
    for (var i = 0; i < panels.length; i++) {
      var h2 = safe(function () { return panels[i].querySelector('h2'); }, null);
      var text = norm(safe(function () { return h2.textContent; }, ''));
      if (!text) continue;
      if (!fallback) fallback = panels[i];
      if (!wantName || text === wantName) return panels[i];
    }
    return fallback;
  }

  function parseLocalFinderLabeledField(panel, label) {
    var nodes = safe(function () { return Array.prototype.slice.call(panel.querySelectorAll('*')); }, []);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var hasElementChildren = safe(function () { return el.children && el.children.length > 0; }, false);
      if (hasElementChildren) continue;
      var text = norm(stripIsolates(safe(function () { return el.textContent; }, '')));
      if (text !== label) continue;
      var prev = safe(function () { return el.previousElementSibling; }, null);
      if (prev) return norm(stripIsolates(safe(function () { return prev.textContent; }, '')));
    }
    return '';
  }

  function parseLocalFinderPanel(doc, expectedName) {
    doc = doc || document;
    var panel = findLocalFinderPanel(doc, expectedName);
    if (!panel) return null;

    var h2 = safe(function () { return panel.querySelector('h2'); }, null);
    var name = norm(safe(function () { return h2.textContent; }, '')) ||
      parseLocalFinderLabeledField(panel, LOCAL_PANEL_LABELS.name);
    if (!name) return null;

    var category = parseLocalFinderLabeledField(panel, LOCAL_PANEL_LABELS.category);
    var address = parseLocalFinderLabeledField(panel, LOCAL_PANEL_LABELS.address);
    var hours = parseLocalFinderLabeledField(panel, LOCAL_PANEL_LABELS.hours);
    var phone = parseLocalFinderLabeledField(panel, LOCAL_PANEL_LABELS.phone);
    var website = parseLocalFinderLabeledField(panel, LOCAL_PANEL_LABELS.website);

    if (!website) {
      var websiteAnchor = safe(function () {
        var anchors = Array.prototype.slice.call(panel.querySelectorAll('a'));
        for (var i = 0; i < anchors.length; i++) {
          var label = norm(anchors[i].getAttribute('aria-label') || anchors[i].textContent);
          if (label === 'Website') return anchors[i];
        }
        return null;
      }, null);
      if (websiteAnchor) website = norm(safe(function () { return websiteAnchor.href; }, ''));
    }

    var mapsUrl = 'https://www.google.com/maps/search/' + encodeURIComponent(norm(name + ' ' + address));

    return {
      name: name,
      phone: phone,
      website: website,
      address: address,
      category: category,
      rating: '',
      reviewCount: '',
      hours: hours,
      mapsUrl: mapsUrl,
      placeId: ''
    };
  }

  // ---- Query / location context -------------------------------------------

  function parseQueryContext(doc, locationHint) {
    doc = doc || document;
    var input = safe(function () {
      return doc.querySelector('input#searchboxinput') || doc.querySelector('input[name="q"]');
    }, null);
    var raw = norm(safe(function () { return input.value; }, ''));

    var query = raw;
    var location = norm(locationHint || '');

    if (raw) {
      var m = raw.match(/^(.*)\bin\b\s+(.+)$/i);
      if (m) {
        query = norm(m[1]);
        if (!location) location = norm(m[2]);
      }
    }

    return { query: query, location: location };
  }

  var api = {
    parseResultCards: parseResultCards,
    parsePlacePanel: parsePlacePanel,
    parseQueryContext: parseQueryContext,
    parseLocalFinderCards: parseLocalFinderCards,
    parseLocalFinderCard: parseOneLocalFinderCard,
    parseLocalFinderPanel: parseLocalFinderPanel
  };

  if (typeof window !== 'undefined') {
    window.__mapsToCC = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
