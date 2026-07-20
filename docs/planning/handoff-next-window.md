# Handoff — NH-BOOST v2 shipped, await retest

**Prod:** **`917af54`** / **`index-Xu1vuW5T.js`**  
**Active:** NH-BOOST — joiner boost bar / trails / SFX retest  

**Do not** re-open P0–P4 / NH-STATS without new evidence. Ship only on “ship it.”

## What shipped (v2)

- Wire `b` from `ramBoostActiveUntilMs` (v1)
- Nitro sample includes gamepad (v1)
- Charge SFX stop on reconcile (v1)
- **v2:** re-arm charge while `boostHeld` after reconcile cancel; silent replay re-arm; remote trail full-window latch on rising edge

## Retest

Joiner hard-refresh → hold charge → bar fills → release → trails + one SFX. Peer trails visible.
