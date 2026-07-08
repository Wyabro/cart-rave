# Cart Pattern Re-UV — cartrave4 body (`tripo_part_0`)

Goal: give the cart body a **clean second UV channel** (`TEXCOORD_1`) so the customization
patterns (`stripes / checker / dots / waves`) read correctly, without disturbing the baked
albedo or the derived neon wire-glow that live on `TEXCOORD_0`.

> **Blender source lives at `art/cartrave4.blend`** (kept out of `public/` so it isn't shipped
> in the build). Start there for future tweaks instead of re-importing the `.glb`.

## Why

The pattern mask is a repeating texture sampled in UV space (`src/cartPatterns.js`). The
uncompressed master `art/models/cartrave4.glb` is a Tripo auto-export whose body mesh `tripo_part_0`
(renamed `CartFrame` at load) has a **fragmented, arbitrarily-oriented** unwrap on `TEXCOORD_0`.
Oriented patterns shatter into noise across island seams; only `dots` survives. But that same
`TEXCOORD_0` also carries:

- the baked **1024² albedo** JPEG (`baseColorTexture`), and
- the **wire-glow emissive**, which `buildRaveGltfWireEmissiveMask()` derives from that albedo.

So we must **not** touch `TEXCOORD_0`. Instead add a *second* channel purely for the pattern.

The code side is already done: `applyCartPattern()` samples `uv1` when the body geometry has a
`uv1` attribute (three's name for `TEXCOORD_1`), and falls back to `uv` otherwise. Shipping the
re-UV'd GLB flips patterns onto the clean channel automatically — no further code change.

## Scope

Only `tripo_part_0` needs the new channel — it is the sole mesh that receives patterns. Leave
the other 23 `tripo_part_*` meshes untouched.

## Blender steps

1. **Import** `art/models/cartrave4.glb` (File → Import → glTF 2.0). Keep materials/textures.
2. Select **`tripo_part_0`** (the basket body; ~6980 verts, world bbox ≈ 0.77 × 0.52 × 0.61).
3. Open **UV Editing**. In the mesh's **Object Data Properties → UV Maps**, note the existing
   map (call it `UVMap`, = `TEXCOORD_0`). **Do not edit it.**
4. **Add a new UV map** (the `+` in UV Maps); name it e.g. `PatternUV`. Make it the *active* map
   (click it) but keep `UVMap` as the one with the camera/render icon so exporters keep both.
5. With `PatternUV` active and all faces selected in Edit Mode, do a **clean, connected,
   axis-aligned unwrap**:
   - **Smart UV Project** (angle limit ~66°, island margin ~0.02) is the quick option, or
   - **Cube Projection** for the most uniform stripe/checker scale, then lightly pack.
   - Aim for **few large islands, consistent texel scale, minimal rotation**. This is what the
     old procedural cart had and what makes oriented patterns tile cleanly.
6. **Sanity-check** with a UV grid / checker texture in the viewport: the checker should look
   even and unrotated across the basket panels.
7. **Export** glTF 2.0 back to `art/models/cartrave4.glb`:
   - Format **glTF Binary (.glb)**.
   - Geometry: enable **UVs** and **Normals**. Ensure **both** UV maps export (Blender exports
     all UV layers by default → `TEXCOORD_0`, `TEXCOORD_1`).
   - Keep **+Y up**, apply the same transform settings the original used (don't rescale/re-orient
     — physics + caster binding assume the current pose).
   - Do **not** enable Draco in Blender's exporter; compression is a separate step below.

## Compression step — READ THIS, there are two traps

The draco file the game actually loads is `public/models/cartrave4-draco.glb`
(`RAVE_GLTF_URL` in `src/cartRaveGltf.js`). You must regenerate it from the new `.glb`:

```bash
npm run compress:rave-gltf          # defaults to the active model (cartrave4)
```

`scripts/compress-rave-gltf.mjs` runs **discrete, non-destructive passes** (resize → webp →
draco) that preserve the node graph and every UV set, including the new `TEXCOORD_1`. It
deliberately does **not** use `gltf-transform optimize`, whose default pipeline runs `simplify`
(mesh decimation — destroys the new UVs), `flatten`/`join` (collapse the `tripo_part_*` node
names the caster binding needs), and `prune` (strips the `uv1` channel, which no *material*
references because the pattern mask is injected at runtime). That is exactly why oriented patterns
would otherwise vanish — so keep using this script, not raw `optimize`.

Other models / smaller textures:

```bash
npm run compress:rave-gltf -- cart-rave-base --texture-size 1024
```

The Draco decoder is served from `public/draco/gltf/` — no change needed.

## Verify (before wiring the UI)

1. **Confirm both UV sets survived compression:**

   ```bash
   node -e '
   const fs=require("fs");
   for (const p of ["art/models/cartrave4.glb","public/models/cartrave4-draco.glb"]){
     const b=fs.readFileSync(p);let o=12,j=null,L=b.readUInt32LE(8);
     while(o<L){const cl=b.readUInt32LE(o),ct=b.readUInt32LE(o+4),cs=o+8;
       if(ct===0x4E4F534A)j=JSON.parse(b.slice(cs,cs+cl));o=cs+cl;}
     console.log(p, Object.keys(j.meshes[0].primitives[0].attributes));
   }'
   ```

   Expect `[POSITION, NORMAL, TEXCOORD_0, TEXCOORD_1]` on **both**. If `TEXCOORD_1` is missing on
   the draco file, prune stripped it — redo compression per Trap 2.

2. **Visual check in the live preview** (same as the Phase-1 investigation): open the Customize
   screen and cycle patterns on the 3D cart. All four should now read as clean geometric
   patterns, not noise. Note: the headless preview tab reports `visibilityState: "hidden"`, which
   freezes the rAF loop and locks the canvas at 1×1 — spoof `document.visibilityState` / `hidden`
   and dispatch `resize` to wake it (see the pattern-system investigation notes).

3. Confirm the **albedo and neon wire-glow are unchanged** (they must be — `TEXCOORD_0` was left
   intact). If the cart body looks different, `TEXCOORD_0` was accidentally edited or reordered.

## After this lands

Proceed to the **PATTERNS tab** (customize-screen UI): add the third tab + section in
`index.html`, export `makePatternMiniCartSvg` / `CART_PATTERNS` from `src/cartPatternConfig.js`,
and add `buildPatternChips()` / `selectPattern()` in `src/cart-rave-menu.js` mirroring the
existing sunglasses tab (`buildSunglassesChips` / `selectSunglassesStyle`).
