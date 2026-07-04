// customizationStore.js — Vanilla Zustand store for player cart customization.
import { createStore } from "zustand/vanilla";
import {
  loadPlayerCustomization,
  savePlayerCustomization,
  wireCustomizationStorageSync,
} from "../customization.js";

/**
 * Vanilla Zustand store wrapping cart customization state.
 */
export const customizationStore = createStore((set) => {
  // Ensure cross-tab storage sync is wired up
  if (typeof window !== "undefined") {
    wireCustomizationStorageSync();
    window.addEventListener("cartrave:customization-changed", (e) => {
      const customEvent = /** @type {CustomEvent} */ (e);
      if (customEvent.detail) {
        set(customEvent.detail);
      }
    });
  }

  const initial = loadPlayerCustomization();

  return {
    ...initial,

    /**
     * Updates cart customization state, persists to localStorage, and updates store.
     * @param {{ colorMode?: 'preset' | 'custom', color?: string, customHue?: number, pattern?: string, sunglassesStyle?: string }} input
     */
    save: (input) => {
      const updated = savePlayerCustomization(input);
      set(updated);
      return updated;
    },

    /** Reloads customization from storage. */
    reload: () => {
      const current = loadPlayerCustomization();
      set(current);
      return current;
    },
  };
});
