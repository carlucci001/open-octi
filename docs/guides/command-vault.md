# Command Vault

## What it does

Command Vault is a local Markdown workspace for notes, prompts, skills, search, insights, and linked knowledge. Its Graph view can follow explicit wikilinks, semantic relationships, or change impact across one or more configured vault roots.

![Command Vault wikilink graph](../screenshots/command-vault-graph.jpg)

## Where it lives

- Route: `/?tab=notes`
- Sidebar: **Projects → Command Vault**

## Enable it

Open the Vault menu and select a configured vault. A default local vault is created under the OpenOcti data directory. For a separate location, set `COMMAND_VAULT_ROOT` to a mounted directory, restart OpenOcti, and refresh the vault index.

## What it needs

- Read and write access to the configured vault root.
- Markdown files for notes and `[[wikilinks]]` for the explicit graph.
- An embedding-model download on first semantic indexing.
- Git metadata in a mounted vault repository for change-impact analysis.

## Limits and safety

OpenOcti resolves files only inside configured roots. Semantic links are similarity signals, not factual proof. Large vaults take longer to index, and a container can see only host directories mounted into it. Back up the vault before bulk edits.

