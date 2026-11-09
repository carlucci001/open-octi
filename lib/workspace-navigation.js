function allowedChild(item, canOpenTab) {
  if (!item?.children?.length) return null
  return item.children.find(child => child.postizPath || canOpenTab(child.id)) || null
}

export function getWorkspaceDestination(workspace, currentTab, {
  canOpenTab,
  getItem,
  workspaceOf,
} = {}) {
  if (!workspace || typeof canOpenTab !== 'function') return null
  if (currentTab && workspaceOf?.(currentTab) === workspace.id && canOpenTab(currentTab)) {
    return currentTab
  }

  for (const id of workspace.ids || []) {
    const item = getItem?.(id)
    const child = allowedChild(item, canOpenTab)
    if (child) return child.postizPath ? id : child.id
    if (canOpenTab(id)) return id
  }
  return null
}

export function getVisibleWorkspaces(workspaces, options = {}) {
  return (workspaces || []).filter(workspace => (
    getWorkspaceDestination(workspace, '', { ...options, workspaceOf: () => '' })
  ))
}
