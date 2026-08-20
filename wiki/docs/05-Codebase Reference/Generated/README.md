# Generated Reference

> **Audience:** Server operators, plugin authors, AI agents · **Prereqs:** None

Five reference tables extracted directly from source by `src/scripts/gen-wiki-reference.js` — never hand-edited. See [Generators](../../06-Contributing/generators.md) for the full mechanism.

## Pages

- **[Wire Protocol Opcodes](./comm-opcodes.md)** — every entry in `Comm.Code`, with its JSDoc comment.
- **[Enums & Lookup Tables](./enums-reference.md)** — every other enum-shaped object literal in `constants.js` and `comm.js` (`Slot`, `ItemType`, `CharClass`, `Team`, `CONTROL`, `MAP`, the `itemIdOffsets*` tables, `Comm.Close`/`Worker`/`Chat`).
- **[Database Schema](./database-schema.md)** — every `CREATE TABLE` statement in `recordsManagement.js`, column by column.
- **[Config Reference](./config-reference.md)** — every key in every `src/defaultconfig/*.yaml` template, with its default and comment.
- **[Slash Command Reference](./slash-commands.md)** — every built-in command registered in `permissions.js`.

The [plugin event catalog](../../04-Plugin%20Development/Event%20Reference/) is generated the same way but lives under Plugin Development instead, since that's who actually needs it day to day.

Regenerate after touching any of the source these pull from:

```bash
npm run gen-docs
```

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
