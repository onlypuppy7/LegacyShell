# Networking

> **Audience:** Plugin authors · **Prereqs:** [Events (concept)](./events-concept.md)
>
> **Canonical source:** `src/shell/comm.js` (`Comm.Add`, `Comm.Out`, `Comm.In`)

LegacyShell doesn't use JSON over the wire for gameplay traffic - it's a hand-rolled binary protocol (`src/shell/comm.js`), shared verbatim between client and server the same way the rest of `src/shell/` is (see [Codebase Reference](../05-Codebase%20Reference/) for the splice mechanism). This page covers adding your own message type to it.

## Registering a new opcode

`Comm.Code` is a plain object mapping message names to small integers. `Comm.Add(name)` finds the next free integer and registers it:

```js
const myOpcode = Comm.Add("myCustomThing");
```

::: warning Call `Comm.Add` from code that runs identically on both sides
`Comm.Add` just picks "the next free number" at the time it's called - it doesn't coordinate between client and server. If your server calls `Comm.Add("myCustomThing")` once and your client-injected code calls it independently, they can end up assigning **different numbers** to the same name if anything about load order or which other plugins are also calling `Comm.Add` differs between the two builds - and then every packet you send gets misinterpreted as whatever the *other* side thinks that number means. The safe pattern is to put the `Comm.Add` call inside a file that's shared between both sides the normal way - a small module you both `import` server-side and inject via [Client-Side Code](./client-side-code.md) - so the exact same call happens in the exact same order on both builds.
:::

## Packing a message

`Comm.Out` is a binary buffer writer. A real example from the base game's own fire packet (`src/shell/guns.js`):

```js
var output = new Comm.Out(15, true);   // 15 = a fixed-size 15-byte buffer; the second argument is unused
output.packInt8(Comm.Code.fire);       // opcode always goes first
output.packInt8(this.player.id);
output.packFloat(pos.x);
output.packFloat(pos.y);
output.packFloat(pos.z);
// ...

this.player.client.sendToAll(output, "fire");
```

`Comm.Out`'s constructor only takes one real parameter. Pass a number and you get a **fixed**-size buffer that throws `Buffer overflow` if you try to pack more than that many bytes (`15` here is exactly the byte count this specific packet needs - 1 opcode + 1 player id + 6 floats × 2 bytes + 1 seed byte). Omit the argument entirely and you get a **dynamically growable** buffer instead - the right default for a plugin's own packet where you're not confident of the exact final size up front. The `true` second argument in the example above is inert; `Comm.Out` never reads a second constructor argument at all.

The packing methods available on `Comm.Out`:

| Method | Packs |
|---|---|
| `packInt8(U)` / `packInt16(U)` / `packInt32(U)` | Signed/unsigned integers of the given bit width. |
| `packFloat(val)` | A float, quantized as `int16` scaled by 300 - not full precision, matches what the rest of the protocol uses for positions. |
| `packRad(U)` | An angle in radians, similarly quantized. |
| `packString` / `packLongString` / `packVeryLongString` | Strings, with an 8/16/32-bit length prefix respectively (pick based on expected max length). |

Always pack the opcode first (`packInt8(Comm.Code.yourOpcode)`) - that's the byte every receiver reads to know how to interpret the rest of the message.

## Reading a message

The symmetric reader is `Comm.In`, with matching `unPackInt8(U)` / `unPackInt16(U)` / etc. methods. Where you actually get access to one depends on which side you're receiving on:

### Client-side: `LegacyShellOnMessage`

Every incoming packet is decoded opcode-by-opcode in a loop, and the event fires with the reader still positioned right after the opcode, before the built-in `switch` dispatches on it:

```js
this.plugins.on('game:LegacyShellOnMessage', this.onMessage.bind(this));

onMessage(data) {
    if (data.cmd === myOpcode) {
        const value = data.input.unPackInt32();
        // ...do something with it...
    };
};
```

Since the built-in `switch` won't have a case for your custom opcode, it simply falls through with no effect - you don't need to set `plugins.cancel` unless you're specifically overriding a *built-in* opcode's default handling.

### Server-side: `roomWsMessage`

There's no direct server-side equivalent of `LegacyShellOnMessage` - the closest hook is `game:roomWsMessage`, which fires with the **raw, not-yet-decoded** message content, right before it's handed to the normal per-client message handler:

```js
this.plugins.on('game:roomWsMessage', this.onRoomMessage.bind(this));

onRoomMessage(data) {
    if (data.type !== "wsMessage") return;
    const input = new Comm.In(data.content);
    const cmd = input.unPackInt8U();
    if (cmd === myOpcode) {
        const value = input.unPackInt32();
        // ...
    };
};
```

You decode it yourself here rather than being handed an already-parsed `cmd`/`input` pair - this fires for *every* incoming message (not just ones matching your opcode), so check the opcode first before reading further.

## Common Issues

**Packets seem scrambled / wrong values come out the other end.** Almost always a pack/unpack order or type mismatch - `Comm.In`'s unpack calls must exactly mirror the `Comm.Out` pack calls, same order, same types (an `unPackInt8` where you packed an `unPackInt16` reads garbage, and desyncs every subsequent read for that message).

**My custom opcode collides with another plugin's.** See the warning above about calling `Comm.Add` from genuinely shared code - if two plugins both independently call `Comm.Add` with different names, they still can't collide with *each other* (each gets the next actually-free number at the time it's called), but a client/server mismatch within your own single plugin is the real risk.

Next: [Workers and State](./workers-and-state.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
