// Pure selection-state helpers for the Leads bulk-actions UI (WO-LB1).
// Kept dependency-free and React-free so they are directly unit-testable.
// All functions return a NEW Set (never mutate the input) so callers can use
// them directly as React state updaters, e.g. setSelectedIds(ids => toggleSelection(ids, leadId)).

/**
 * Toggle a single id in the selection set.
 * @param {Set<string>} selectedIds
 * @param {string} id
 * @returns {Set<string>}
 */
export function toggleSelection(selectedIds, id) {
  const next = new Set(selectedIds)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * Select every id between the last-clicked id and the current id (inclusive),
 * using their order in `orderedIds` (the currently visible, ordered list).
 * Falls back to a plain toggle when there is no anchor or either id is not
 * present in the visible list (e.g. filters changed between clicks).
 * @param {Set<string>} selectedIds
 * @param {string[]} orderedIds - ids in the order they are currently rendered
 * @param {string|null} anchorId - the last-clicked checkbox id
 * @param {string} currentId - the id being shift-clicked
 * @returns {Set<string>}
 */
export function selectRange(selectedIds, orderedIds, anchorId, currentId) {
  if (!anchorId || !orderedIds.includes(anchorId) || !orderedIds.includes(currentId)) {
    return toggleSelection(selectedIds, currentId)
  }
  const from = orderedIds.indexOf(anchorId)
  const to = orderedIds.indexOf(currentId)
  const [lo, hi] = from <= to ? [from, to] : [to, from]
  const next = new Set(selectedIds)
  for (let i = lo; i <= hi; i++) next.add(orderedIds[i])
  return next
}

/**
 * Select or deselect every id in `visibleIds` (a page, group, or column),
 * leaving selections outside that scope untouched.
 * @param {Set<string>} selectedIds
 * @param {string[]} visibleIds
 * @param {boolean} select - true selects all, false deselects all
 * @returns {Set<string>}
 */
export function selectAllVisible(selectedIds, visibleIds, select) {
  const next = new Set(selectedIds)
  for (const id of visibleIds) {
    if (select) next.add(id)
    else next.delete(id)
  }
  return next
}

/**
 * True when every id in `visibleIds` is selected (and there is at least one).
 * @param {Set<string>} selectedIds
 * @param {string[]} visibleIds
 * @returns {boolean}
 */
export function isAllVisibleSelected(selectedIds, visibleIds) {
  if (!visibleIds.length) return false
  return visibleIds.every(id => selectedIds.has(id))
}

/**
 * True when some but not all of `visibleIds` are selected - drives the
 * checkbox's indeterminate visual state.
 * @param {Set<string>} selectedIds
 * @param {string[]} visibleIds
 * @returns {boolean}
 */
export function isPartiallySelected(selectedIds, visibleIds) {
  if (!visibleIds.length) return false
  const selectedCount = visibleIds.filter(id => selectedIds.has(id)).length
  return selectedCount > 0 && selectedCount < visibleIds.length
}

/**
 * Returns an empty selection. Provided as a named helper so call sites read
 * clearly (setSelectedIds(clearSelection)) and so tests can assert intent.
 * @returns {Set<string>}
 */
export function clearSelection() {
  return new Set()
}
