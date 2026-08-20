# Wire Protocol

> **Audience:** Core contributors, AI agents · **Prereqs:** [Shared Shell Layer](./shared-shell-layer.md)
>
> **Canonical source:** `src/shell/comm.js`

LegacyShell's network protocol is hand-rolled binary, not JSON - `Comm.Out`/`Comm.In` are the pack/unpack classes, shared verbatim between client and server (the file's own comment: "This file is designed to be imported into the shell JS too"). For the plugin-author-facing view (adding your own opcode), see [Networking](../04-Plugin%20Development/networking.md); for the actual opcode table, see the [generated reference](./Generated/comm-opcodes.md). This page is the packing-format detail underneath both.

## `Comm.Out` - fixed or growable, your choice

```js
constructor(size) {
    this.fixedSize = size !== undefined;
    this.buffer = this.fixedSize ? new Uint8Array(size) : [];
    this.idx = 0;
};
```

Pass a `size` and you get a **fixed**-capacity `Uint8Array` that throws `Buffer overflow` if you write past it - used for hot-path packets like weapon fire, where the exact byte count is known and fixed in advance (constructing a plain JS array and growing it per-write would be slower here). Omit `size` and you get a plain array that `_resizeBuffer` grows on demand as needed - the safer default when you're not counting bytes by hand.

## Packing methods

| Method | Bytes | Encoding |
|---|---|---|
| `packInt8(U)` | 1 | Signed masked to `255 & val`; unsigned is a direct alias. |
| `packInt16(U)` | 2 | |
| `packInt32(U)` | 4 | |
| `packFloat(val)` | 2 | `packInt16(300 * val)` - a position/velocity component quantized to `1/300` precision, not a real IEEE float. This is a deliberate bandwidth/precision tradeoff, not a bug - don't expect exact round-trip float values through this. |
| `packRad(U)` | 2 | An angle in radians, quantized the same way (`packInt16(1e4 * val)`, with the signed variant offsetting by `Math.PI` first). |
| `packString` / `packLongString` / `packVeryLongString` | length-prefix + 2 bytes/char | 8/16/32-bit length prefix respectively, character codes packed as `packInt16` each (i.e. these are **not** UTF-8 byte-packed strings - 2 bytes per character unconditionally, regardless of what the length prefix's own bit width might suggest about efficiency). |

## `Comm.In` - the reader, and the multi-message-per-buffer pattern

```js
constructor(buf) {
    this.buffer = new Uint8Array(buf);
    this.idx = 0;
}
isMoreDataAvailable() { return this.idx < this.buffer.length; }
unPackInt8U() { return this.buffer[this.idx++]; }
unPackInt8() { return (this.unPackInt8U() + 128) % 256 - 128; }
```

Every `unPack*` method advances `idx` by however many bytes it consumed - there's no explicit length/position tracking beyond this. The standard receive pattern (both `server-game/src/client.js`'s `onmessage` and the in-browser `LegacyShellOnMessage`) wraps this in a `while (input.isMoreDataAvailable())` loop, since **a single incoming WebSocket message can contain multiple packed commands back to back** - the receiver doesn't get one opcode per message, it drains the buffer until nothing's left, dispatching on whatever opcode it finds at the front of each iteration.

## `Comm.Add` - registering a new opcode at runtime

```js
Add: function(name) {
    if (Comm.Code[name]) return devlog("Custom commcode already exists?", name, Comm.Code[name]);
    let codes = Object.values(Comm.Code).sort((a, b) => a - b);
    let code = 0;
    for (let i = 0; i < codes.length; i++) { if (codes[i] !== i) { code = i; break; }; };
    Comm.Code[name] = code;
    return code;
},
```

Finds the lowest currently-unused integer and assigns it - not append-to-the-end, so registering opcodes in a different order between two separate evaluations of `comm.js` (e.g. client vs. server, if they don't share one call site - see [Networking](../04-Plugin%20Development/networking.md#registering-a-new-opcode)) can genuinely produce different numbers for the same name. This is why that page's guidance is to call `Comm.Add` from one piece of code that's genuinely shared between both runtimes, not independently on each side.

## `Comm.Convert` - opcode number back to name

Used purely for logging/debugging (`Comm.Convert(cmd)` appears in `devlog` calls on both the incoming-message paths described above) - a reverse lookup through `Comm.Code`'s entries, falling back to `'unknownCode'` if nothing matches.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
