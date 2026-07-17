# Content authoring

Use these checklists when extending Cart Clash without changing its gameplay architecture.
Stable runtime IDs are persistence and network contracts; add new IDs, but do not rename
existing `cart-rave`, `cartRave*`, Worker, Durable Object, or legacy asset identifiers.

## Add an arena

1. Add the implementation module under `src/levels/` and return the existing level lifecycle
   contract, including `dispose`.
2. Add its explicit lazy importer to `src/levels/index.js`.
3. Add one entry to `src/levels/arenaCatalog.js` with:
   `id`, `displayName`, `menuTheme`, `quickplay`, `music`, `ambience`, and `unlock`.
4. Add one matching `data-level="<id>"` card to canonical menu markup in `index.html`.
5. If the arena needs a distinct look or size, add presentation knobs in `src/config.js` and
   one branch in `applyArenaLook`; do not put these knobs in the catalog.
6. Run `npm run qa`, then switch through the arena in the menu and check its label, lock icon,
   theme, music, and ambience.

`shared/arenaPool.js` stays a Worker-safe ID list. Its exact order is contract-tested against
catalog entries with `quickplay: true`.

Keep post-FX, fog, dust, bloom, radii, hazards, AI data, and dynamic imports out of the catalog.

## Add a hazard

Author visual geometry, Rapier colliders, and the level's hazard descriptor together in its
`src/levels/` module. Return the descriptor as `aiHazards`; `main.js` passes it to simulation
and contact-shadow consumers.

Reuse the existing square-hole, circular-keep-out, or open-octagon descriptor shapes. A new
shape requires a deliberate `simulation.js` extension and gameplay testing; hazards are not
a drop-in registry and never run on the server.

## Add announcer content

1. Add or update the event in `src/announcer/announcerEvents.js`.
2. Add English subtitle variants in `src/announcer/announcerLines.js`.
3. Add a procedural fallback in `announcerStings.js` when needed.
4. Trigger the event through the director or the authoritative gameplay hook.
5. Record files as `public/sounds/announcer/<locale>/<voiceKey>_<NN>.opus` and set
   `voice.variants` to the number of takes. A value of `0` is sting-only.

Runtime voice keys are derived from the event table; there is no list to update in `main.js`.
See [Announcer System](../reference/announcer.md) for arbitration and recording details.

## Add an unlock or challenge

1. Reuse an ID from `src/progression/eventIds.js`, or add a new ID there.
2. Emit that constant from the authoritative gameplay hook through `ChallengeTracker.record`.
   Challenge progress automatically forwards to lifetime unlock progress.
3. Add the goal to `src/unlockConfig.js` or `CHALLENGE_POOL` in
   `src/stores/challengeStore.js`.
4. Run `npm run qa`; contract tests reject goal event IDs outside the closed vocabulary.

For a new unlock category, persistence normalization and menu rendering are separate product
work. Existing pattern, sunglasses, color, arena, daily, and weekly categories need only data.

## Add a Living Store directive

1. Add a frozen entry to `src/directives/directives.js` using supported effect fields.
2. Add its announcer event, subtitle lines, and voice takes.
3. Test apply/expiry/restore behavior in the directive engine.

Do not add new direct `CONFIG` mutation mechanisms. The deferred DIR-1 modifier-stack work is
separate from content authoring.

## Add audio

- Arena music: place the Opus file under `public/sounds/` and add its filename to the arena's
  `music` array in `src/levels/arenaCatalog.js`. Loudness-match it using
  [Arena Music](../reference/music.md).
- Arena ambience: place the loop under `public/sounds/ambience/`, set the catalog
  `ambience` keys, and add its authored base mix in `src/ambience/arenaAmbience.js`. See
  [Arena Ambience](../reference/ambience.md).
- Ordinary SFX: place the Opus file under `public/sounds/`, register it during audio setup,
  and play it through `AudioManager`.

## Add a grocery prop

1. Add the source GLB to `art/models/groceries/<name>.glb`.
2. Add one `{ name, path, type, sizeM, cargoMul }` entry to
   `src/effects/groceryDefinitions.js`.
3. Run `npm run compress:groceries -- <name>`.
4. Inspect both spill collider fit and basket cargo fit.

The compression script derives valid default names from the same definitions used by the
runtime pool. Pool capacity derives from definition count; no second name list or total needs
updating.
