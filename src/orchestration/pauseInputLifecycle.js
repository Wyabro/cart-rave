/**
 * Applies pause input ownership before a solo/test-drive loop can skip its next frame.
 * Online pause only cancels the local cart; another player's live charge is authoritative.
 * @param {object} deps
 * @param {boolean} deps.open
 * @param {string} deps.mode
 * @param {any} deps.localCart
 * @param {(active: boolean) => void} deps.setUiActive
 * @param {(cart: any) => void} deps.stopChargeSfxForCart
 * @param {() => void} deps.stopAllChargeSfx
 */
export function applyPauseInputLifecycle({
  open,
  mode,
  localCart,
  setUiActive,
  stopChargeSfxForCart,
  stopAllChargeSfx,
}) {
  setUiActive(open);
  if (!open) return;
  if (mode === "solo" || mode === "testdrive") {
    stopAllChargeSfx();
  } else if (localCart) {
    stopChargeSfxForCart(localCart);
  }
}
