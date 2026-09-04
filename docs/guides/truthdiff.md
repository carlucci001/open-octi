# TruthDiff

## What it does

TruthDiff is the Command Vault change-impact adapter. It combines Git-changed Markdown files with wikilink and semantic neighborhoods, then ranks notes that may need review after a change. The result explains the changed-file count and whether usable Git changes were found.

![Command Vault graph used by TruthDiff](../screenshots/command-vault-graph.jpg)

## Where it lives

- Route: `/?tab=notes`
- Sidebar: **Projects → Command Vault → Graph → Impact**

## Enable it

Select a vault whose root is a Git working tree, open **Graph**, and choose **Impact**. Refresh after changing Markdown files. Use **Semantic** or **Wikilinks** beside it to inspect the relationships behind an impact result.

## What it needs

- A configured Command Vault with readable Markdown.
- Git metadata and local changes in the mounted repository.
- The local embedding model for semantic neighbors.

## Limits and safety

TruthDiff identifies review candidates; it does not prove a note is correct or stale. No Git changes produces an explicit no-changes result. Deleted or unreadable notes may disappear between scanning and analysis. Review the underlying diff before editing impacted notes.

