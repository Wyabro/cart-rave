# Handoff — NET-1 S1 rematch spawn retest

**Date:** 2026-07-20  
**Branch:** `cart-clash`  
**Prod:** **`index-C-kQeNwM.js`** / sha **`2a6d9ae`**

## DO THIS NOW

1. Hard-refresh both clients on prod.  
2. Quickplay · 4090 host preferred · rematch **×3**.  
3. Pass = no non-host spawn-off-edge / instant death at GO.  
4. Fail → F8 both + `captures:pull`.

## Fix shipped

Skip pre-rotation `rematchResetWorld` on quickplay rematch; non-host re-seats + `reapplyCachedCartsSnapshot` after arena swap.
