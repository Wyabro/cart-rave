// groceryDefinitions.js — Pure grocery asset and scale authoring data.

/**
 * @typedef {"cuboid" | "cylinder" | "ball"} GroceryColliderType
 */

/**
 * @typedef {object} GroceryDefinition
 * @property {string} name Stable asset and runtime identifier.
 * @property {string} path Runtime GLB path (resolve with {@link publicUrl} at load).
 * @property {GroceryColliderType} type Physics collider shape.
 * @property {number} sizeM Spill model longest dimension in world meters.
 * @property {number} cargoMul Per-model basket scale adjustment.
 */

/** @type {readonly Readonly<GroceryDefinition>[]} */
export const GROCERY_DEFINITIONS = Object.freeze([
  Object.freeze({
    name: "milk",
    path: "models/groceries/milk.glb",
    type: "cuboid",
    sizeM: 0.575,
    cargoMul: 1.0,
  }),
  Object.freeze({
    name: "cereal",
    path: "models/groceries/cereal.glb",
    type: "cuboid",
    sizeM: 0.5,
    cargoMul: 1.0,
  }),
  Object.freeze({
    name: "soda",
    path: "models/groceries/soda.glb",
    type: "cylinder",
    sizeM: 0.5,
    cargoMul: 1.0,
  }),
  Object.freeze({
    name: "soup",
    path: "models/groceries/soup.glb",
    type: "cylinder",
    sizeM: 0.5,
    cargoMul: 1.0,
  }),
  Object.freeze({
    name: "orange",
    path: "models/groceries/orange.glb",
    type: "ball",
    sizeM: 0.5,
    cargoMul: 1.0,
  }),
  Object.freeze({
    name: "baguette",
    path: "models/groceries/baguette.glb",
    type: "cuboid",
    sizeM: 2.0,
    cargoMul: 0.26,
  }),
]);

/** Grocery names consumed by asset-authoring scripts. */
export const GROCERY_NAMES = Object.freeze(
  GROCERY_DEFINITIONS.map((definition) => definition.name),
);
