# Decision

Memories stored by HackLM Memory.

- [no-session-debrief] Removed last-session-debrief rule. Can't enforce turn-end tool calls. Rule created false contract.

- [tree-view-for-browsing] Use a TreeDataProvider + registered view for browsing memories. Quick Pick is a transient input widget, not a browsing surface.

- [output-channel-singleton] One shared OutputChannel per extension. Never call createOutputChannel() per operation. Use a lazy singleton in outputChannel.ts.

- [hide-internal-commands] Hide internal commands from Command Palette via "commandPalette": [{"when": "false"}] in package.json menus.

- [tree-view-collapsed-default] Tree views default to "visibility": "collapsed" in package.json. Prevents the view hijacking Explorer on first install.

- [views-welcome-required] Always add a viewsWelcome contribution for every registered tree view. It shows guidance when the tree is empty instead of a blank panel.

- [tree-context-menu-groups] Tree item context menus include both inline (for delete) and navigation group (for open/reveal) entries. Inline appears as icon buttons on hover; navigation group appears in the right-click menu.
