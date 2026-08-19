# @dsh-external/dsh-ungrouped-new-session

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.0.2-blue)](https://github.com/InkMeows/dsh-ungrouped-new-session/releases)

Adds a real **“start a conversation outside any workspace”** entry to the DSH
sidebar, and lets a blank ungrouped conversation actually chat **without
picking a workspace**.

## What it does

- Puts a persistent **Ungrouped chat** button in the sidebar footer, available
  even when no ungrouped session exists yet.
- Makes the built-in **Ungrouped** group row's existing `+` button live:
  clicking it starts a new workspace-less conversation instead of doing nothing.
- Uses the session runtime's workspace-less create path, so the new session
  appears in the sidebar's **Ungrouped** bucket and isn't tied to a workspace.
- **Can actually chat without picking a workspace.** DSH's conversation shell
  locks a *blank* session that has no Workspace (“Choose a workspace to start”).
  This plugin shadows `conversation.composer.bar` with a lightweight
  **first-message bar** while the current session is a blank ungrouped session;
  the first message goes through the session's own prompt path, and once the
  host marks the session non-blank the native composer takes over.

## Compatibility note

This plugin intentionally reaches into a few DSH client internals:

- `sidebar.footer.action` (sidebar footer slot),
- `sessions.create()` / `sessions.open()` / `sessions.binding().session.prompt()`,
- the `conversation.composer.bar` slot (shadowed only for blank ungrouped sessions).

These are internal to the DSH client and may change between versions. Target a
specific DSH release and re-test after upgrading.

## Install

Use the DSH super-injector (or any loader installation path) to inject this
directory or the packed tarball:

```bash
npm run build        # host + client into lib/
npm pack             # optional: produce a .tgz
dev_inject_plugin D:/path/to/dsh-ungrouped-new-session
```

After injection, **reload the web UI**. The footer action appears immediately;
the live Ungrouped `+` appears whenever the built-in Ungrouped bucket renders.
If the sidebar is collapsed to its 56px rail, the footer entry is a small `+`
icon (hover for the label).

## Development

```bash
npm install          # installs dev tooling (typescript / tsdown / types)
npm run typecheck    # host typecheck (tsc --noEmit)
npm run build        # build host (lib/index.js) + client (lib/client.js)
npm run pack         # package lib/ into a tarball
```

The build is self-contained — it no longer requires a DSH checkout.
(Peers like `cordis` / `schemastery` / `react` are provided by the host at
runtime and are only listed as dev dependencies for local compilation.)

## How it stays clean

- DOM `+` listeners are tracked and removed on unload/reload (no stale
  closures, no stale `dataset` markers).
- The `+` match is narrowed to the exact built-in labels
  (`New session in Ungrouped` / `在“未分组”中新建会话`), so the plugin's own
  footer button and workspaces merely *named* like Ungrouped are not hijacked.
- Rapid double-clicks are guarded by a window-level in-flight lock.

## License

[MIT](./LICENSE)
