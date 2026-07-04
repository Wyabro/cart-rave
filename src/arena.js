// arena.js — dancefloor record, pit wall, and spawn booth geometry + physics

import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RAPIER } from "./physics/rapierInstance.js";
import { createPhysicalMaterial } from "./scene.js";
import { isLowQualityMode } from "./utils.js";

const REFLECTOR_TEXTURE_SIZE_FULL = 1024;
const REFLECTOR_TEXTURE_SIZE_BOOT = 256;

const VISUAL_RECORD_THICKNESS = 0.28;

function buildRecordRingGeometry({
  outerRadius,
  innerRadius,
  thickness,
  curveSegments,
  bevelThickness = 0.15,
  bevelSize = 0.15,
}) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);

  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: thickness,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments,
  });

  // ExtrudeGeometry extrudes along +Z; center it and rotate so thickness becomes Y (floor height).
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * * Procedural record physics mesh: annular floor with beveled outer rim and a chamfered
 * * inner hole. Visual hole stays at innerRadius; physics flat surface ends at
 * * playInnerR (= innerRadius + holeClearance), then chamferWidth slopes inward to
 * * chamferInnerR before the open void. Must stay aligned with getRecordFloorInnerR()
 * * in simulation.js (floorInnerR = innerRadius).
 */
function buildRecordPhysicsGeometry({
  outerRadius,
  innerRadius,
  thickness,
  chamferWidth = 0.35,
  holeClearance = 0.45,
  outerBevel = 0.12,
  segments = 72,
}) {
  const positions = [];
  const indices = [];
  const halfT = thickness / 2;
  const topY = halfT;
  const bottomY = -halfT;
  const outerTopR = outerRadius - outerBevel;

  // * Flat playing surface ends slightly beyond the visual hole (holeClearance).
  // * The chamfer ramp then slopes inward/down over chamferWidth before the open void.
  const playInnerR = innerRadius + Math.max(holeClearance, 0);
  const chamferInnerR = Math.max(innerRadius, playInnerR - Math.max(chamferWidth, 0));

  const pushVertex = (x, y, z) => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };
  const pushTri = (a, b, c) => {
    indices.push(a, b, c);
  };
  const addQuad = (i0, i1, i2, i3) => {
    pushTri(i0, i1, i2);
    pushTri(i0, i2, i3);
  };

  let prevOt = null;
  let prevPi = null;
  let prevCi = null;
  let prevOb = null;
  let prevOr = null;

  for (let i = 0; i < segments; i += 1) {
    const t0 = (i / segments) * Math.PI * 2;
    const t1 = ((i + 1) / segments) * Math.PI * 2;
    const cos0 = Math.cos(t0);
    const sin0 = Math.sin(t0);
    const cos1 = Math.cos(t1);
    const sin1 = Math.sin(t1);

    // * Reuse seam vertices from the previous segment instead of duplicating radial edges.
    const ot0 = prevOt ?? pushVertex(outerTopR * cos0, topY, outerTopR * sin0);
    const pi0 = prevPi ?? pushVertex(playInnerR * cos0, topY, playInnerR * sin0);
    const ci0 = prevCi ?? pushVertex(chamferInnerR * cos0, bottomY, chamferInnerR * sin0);
    const ob0 = prevOb ?? pushVertex(outerRadius * cos0, bottomY, outerRadius * sin0);
    const or0 = prevOr ?? pushVertex(outerRadius * cos0, topY, outerRadius * sin0);

    const ot1 = pushVertex(outerTopR * cos1, topY, outerTopR * sin1);
    const pi1 = pushVertex(playInnerR * cos1, topY, playInnerR * sin1);
    const ci1 = pushVertex(chamferInnerR * cos1, bottomY, chamferInnerR * sin1);
    const ob1 = pushVertex(outerRadius * cos1, bottomY, outerRadius * sin1);
    const or1 = pushVertex(outerRadius * cos1, topY, outerRadius * sin1);

    // Top playing surface — flat annulus up to the chamfer start.
    addQuad(ot0, ot1, pi1, pi0);

    // Inner hole chamfer — gentle inward slope instead of a vertical drop at the rim.
    addQuad(pi0, pi1, ci1, ci0);

    // Underside substrate ring; open void begins at chamferInnerR.
    addQuad(ob0, ob1, ci1, ci0);

    // Outer top bevel — matches the visual record's softened outer edge.
    addQuad(or0, or1, ot1, ot0);

    // Outer rim wall.
    addQuad(ot0, ot1, ob1, ob0);

    prevOt = ot1;
    prevPi = pi1;
    prevCi = ci1;
    prevOb = ob1;
    prevOr = or1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildRecordSurfaceGrooves(parentMesh, config, visualRecordThickness) {
  const surf = config.record.surface;
  const th = visualRecordThickness;
  const yBase = th / 2;

  const rings = surf.concentricRings;
  const rMin = rings.innerRadius;
  const rMax = rings.outerRadius;

  const grooveGeometries = [];
  const ringColorA = new THREE.Color(rings.color);
  const ringColorB = new THREE.Color(0x111118);

  for (let i = 0; i < rings.count; i += 1) {
    const t = (i + 0.5) / rings.count;
    const rCenter = rMin + (rMax - rMin) * t;
    const halfW = rings.lineWidth / 2;
    let inner = rCenter - halfW;
    let outer = rCenter + halfW;
    inner = Math.max(inner, rMin + 0.001);
    outer = Math.min(outer, rMax - 0.001);
    if (outer - inner < 0.002) continue;

    const ringGeo = new THREE.RingGeometry(inner, outer, 64);
    ringGeo.rotateX(-Math.PI / 2);

    const ringColor = i % 2 === 0 ? ringColorA : ringColorB;
    const pos = ringGeo.attributes.position;
    const colorArray = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v += 1) {
      colorArray[v * 3] = ringColor.r;
      colorArray[v * 3 + 1] = ringColor.g;
      colorArray[v * 3 + 2] = ringColor.b;
    }
    ringGeo.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));
    grooveGeometries.push(ringGeo);
  }

  if (grooveGeometries.length === 0) {
    return null;
  }

  const mergedGrooves = BufferGeometryUtils.mergeGeometries(grooveGeometries, false);
  grooveGeometries.forEach((g) => g.dispose());

  // * Grooves — Physical: metalness 0.55, roughness 0.5, opacity 0.6
  const ringMat = createPhysicalMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.55,
    depthWrite: false,
    transparent: true,
    opacity: 0.6,
  });
  const ringMesh = new THREE.Mesh(mergedGrooves, ringMat);
  ringMesh.userData.recordSurfacePart = "groove";
  ringMesh.position.y = yBase + rings.yOffset + 0.006;
  ringMesh.renderOrder = 1;
  parentMesh.add(ringMesh);
  return { ringMesh, ringMat, mergedGrooves };
}

function buildBooths(scene, world, config, boothNeonMeshes, boothColliderHandles) {
  const B = config.booth;
  const arenaR = config.record.radius;

  const boothCenterDist = arenaR + B.gapDistance + B.rampLength + B.platformDepth / 2;
  const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

  const boothColors = [
    0xff2bd6,
    0x2bff6e,
    0x2bd6ff,
    0xff6b2b,
  ];

  // * Booth truss — Physical metal: leg metalness 0.85 / roughness 0.35, cross metalness 0.75 / roughness 0.4
  const trussLegMat = createPhysicalMaterial({
    color: 0x888899, roughness: 0.35, metalness: 0.85,
  });
  const trussCrossMat = createPhysicalMaterial({
    color: 0x666677, roughness: 0.4, metalness: 0.75,
  });
  const trussLightGeo = new THREE.BoxGeometry(0.5, 0.3, 0.5);
  const mixerGeo = new THREE.BoxGeometry(3.0, 0.5, 1.2);
  const mixerMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e, roughness: 0.6, metalness: 0.4,
  });
  const mixerPanelGeo = new THREE.BoxGeometry(2.6, 0.06, 0.8);
  const deckGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16);
  // * Booth DJ deck — Physical: metalness 0.8, roughness 0.25
  const deckMat = createPhysicalMaterial({
    color: 0x0d0d0d, roughness: 0.25, metalness: 0.8,
  });
  const spkGeo = new THREE.BoxGeometry(0.9, 1.6, 0.9);
  // * Booth speaker cabinets — Physical: metalness 0.65, roughness 0.35
  const spkMat = createPhysicalMaterial({
    color: 0x0e0e1a, roughness: 0.35, metalness: 0.65,
  });
  const coneGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12);
  const coneMat = new THREE.MeshStandardMaterial({
    color: 0x222233, roughness: 0.9, metalness: 0.1,
  });
  const wooferGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12);
  const platterGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.02, 24);
  // * DJ platter — Physical chrome: metalness 0.9, roughness 0.12
  const platterMat = createPhysicalMaterial({
    color: 0x222222, roughness: 0.12, metalness: 0.9,
  });
  const knobGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8);
  const knobMat = new THREE.MeshStandardMaterial({
    color: 0xcccccc, roughness: 0.2, metalness: 0.8,
  });
  const sidePanelGeo = new THREE.PlaneGeometry(B.platformDepth * 0.8, 1.0);
  const platGeo = new THREE.BoxGeometry(B.platformWidth, B.platformThickness, B.platformDepth);
  const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
  const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 6);

  const neonMats = boothColors.map((color) => createPhysicalMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.5,
    roughness: 0.25,
    metalness: 0.85,
    toneMapped: false,
  }));
  const trussLightMats = boothColors.map((color) => createPhysicalMaterial({
    color,
    emissive: color,
    emissiveIntensity: 2.0,
    roughness: 0.2,
    metalness: 0.7,
    toneMapped: false,
  }));
  const platMats = boothColors.map((color) => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.3,
    emissive: color,
    emissiveIntensity: 0.15,
  }));
  const sidePanelMats = boothColors.map((color) => new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  const diamondMats = boothColors.map((color) => new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  const panelMats = boothColors.map((color) => new THREE.MeshStandardMaterial({
    color: 0x333355,
    roughness: 0.4,
    metalness: 0.6,
    emissive: color,
    emissiveIntensity: 0.15,
  }));
  const dotMats = boothColors.map((color) => new THREE.MeshBasicMaterial({ color }));

  const neonAxis = new THREE.Vector3(0, 1, 0);
  const neonDir = new THREE.Vector3();
  const neonMid = new THREE.Vector3();
  const diamondGeo = new THREE.PlaneGeometry(0.5, 0.8);
  diamondGeo.rotateZ(Math.PI / 4);
  const dotGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.025, 12);

  function makeNeonTube(p1, p2, radius, neonMat) {
    neonDir.subVectors(p2, p1);
    const len = neonDir.length();
    const mesh = new THREE.Mesh(UNIT_CYL, neonMat);
    mesh.scale.set(radius, len, radius);
    neonMid.addVectors(p1, p2).multiplyScalar(0.5);
    mesh.position.copy(neonMid);
    mesh.quaternion.setFromUnitVectors(neonAxis, neonDir.normalize());
    return mesh;
  }

  function makeTruss(height, baseY, lightMat) {
    const trussGroup = new THREE.Group();
    const legW = 0.12;
    const trussW = 0.45;

    const offsets = [
      [-trussW / 2, -trussW / 2],
      [trussW / 2, -trussW / 2],
      [-trussW / 2, trussW / 2],
      [trussW / 2, trussW / 2],
    ];
    for (const [ox, oz] of offsets) {
      const leg = new THREE.Mesh(UNIT_BOX, trussLegMat);
      leg.scale.set(legW, height, legW);
      leg.position.set(ox, baseY + height / 2, oz);
      trussGroup.add(leg);
    }

    const braceH = 0.08;
    const braceCount = Math.floor(height / 2);
    for (let b = 0; b <= braceCount; b += 1) {
      const by = baseY + b * 2;
      const xf = new THREE.Mesh(UNIT_BOX, trussCrossMat);
      xf.scale.set(trussW, braceH, braceH);
      xf.position.set(0, by, -trussW / 2);
      trussGroup.add(xf);
      const xb = new THREE.Mesh(UNIT_BOX, trussCrossMat);
      xb.scale.set(trussW, braceH, braceH);
      xb.position.set(0, by, trussW / 2);
      trussGroup.add(xb);
      const zl = new THREE.Mesh(UNIT_BOX, trussCrossMat);
      zl.scale.set(braceH, braceH, trussW);
      zl.position.set(-trussW / 2, by, 0);
      trussGroup.add(zl);
      const zr = new THREE.Mesh(UNIT_BOX, trussCrossMat);
      zr.scale.set(braceH, braceH, trussW);
      zr.position.set(trussW / 2, by, 0);
      trussGroup.add(zr);
    }

    const light = new THREE.Mesh(trussLightGeo, lightMat);
    light.position.set(0, baseY + height + 0.2, 0);
    trussGroup.add(light);

    return trussGroup;
  }

  // Spawn platform fog particles
  const fogPuffCount = 40;
  const fogPuffCanvas = document.createElement("canvas");
  fogPuffCanvas.width = 64;
  fogPuffCanvas.height = 64;
  const fogPuffCtx = fogPuffCanvas.getContext("2d");
  const fogPuffGrad = fogPuffCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  fogPuffGrad.addColorStop(0, "rgba(255,255,255,0.3)");
  fogPuffGrad.addColorStop(0.5, "rgba(255,255,255,0.08)");
  fogPuffGrad.addColorStop(1, "rgba(255,255,255,0)");
  fogPuffCtx.fillStyle = fogPuffGrad;
  fogPuffCtx.fillRect(0, 0, 64, 64);
  const fogPuffTex = new THREE.CanvasTexture(fogPuffCanvas);
  const boothGroups = [];
  const fogSprites = [];
  const boothBodies = [];

  for (let i = 0; i < 4; i += 1) {
    const angle = angles[i];
    const accentColor = boothColors[i];
    const neonMat = neonMats[i];

    const cx = boothCenterDist * Math.cos(angle);
    const cz = boothCenterDist * Math.sin(angle);
    const topY = B.platformY;

    const yaw = Math.PI / 2 - angle;

    const boothGroup = new THREE.Group();
    boothGroup.position.set(cx, 0, cz);
    boothGroup.rotation.y = yaw;

    // ===== PLATFORM SLAB =====
    const platMesh = new THREE.Mesh(platGeo, platMats[i]);
    platMesh.position.set(0, topY, 0);
    boothGroup.add(platMesh);

    // Platform collider (world space)
    const platBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, topY, cz),
    );
    const halfYaw = yaw / 2;
    platBody.setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) }, true);
    const boothCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(B.platformWidth / 2, B.platformThickness / 2, B.platformDepth / 2)
        .setFriction(B.friction)
        .setRestitution(B.restitution),
      platBody,
    );
    boothColliderHandles.push(boothCollider.handle);
    boothBodies.push(platBody);

    // ===== NEON EDGE STRIPS (platform perimeter) =====
    const pw = B.platformWidth / 2;
    const pd = B.platformDepth / 2;
    const edgeY = topY + B.platformThickness / 2 + 0.02;
    const edgeR = 0.035;

    const platformEdges = [
      [new THREE.Vector3(-pw, edgeY, -pd), new THREE.Vector3(pw, edgeY, -pd)],
      [new THREE.Vector3(-pw, edgeY, pd), new THREE.Vector3(pw, edgeY, pd)],
      [new THREE.Vector3(-pw, edgeY, -pd), new THREE.Vector3(-pw, edgeY, pd)],
      [new THREE.Vector3(pw, edgeY, -pd), new THREE.Vector3(pw, edgeY, pd)],
    ];
    for (const [a, b] of platformEdges) {
      const tube = makeNeonTube(a, b, edgeR, neonMat);
      boothGroup.add(tube);
      boothNeonMeshes.push(tube);
    }


    // ===== SIDE RAILINGS (platform only) =====
    const rh = B.railHeight;
    const railBaseY = topY + B.platformThickness / 2;
    const railTopY = railBaseY + rh;
    const tubeR = B.railThickness / 2;

    for (const ry of [railBaseY, railTopY]) {
      const t = makeNeonTube(
        new THREE.Vector3(-pw, ry, pd),
        new THREE.Vector3(pw, ry, pd),
        tubeR, neonMat,
      );
      boothGroup.add(t);
      boothNeonMeshes.push(t);
    }

    for (const sz of [-pd, pd]) {
      const t = makeNeonTube(
        new THREE.Vector3(-pw, railBaseY, sz),
        new THREE.Vector3(-pw, railTopY, sz),
        tubeR, neonMat,
      );
      boothGroup.add(t);
      boothNeonMeshes.push(t);
    }
    const ltop = makeNeonTube(
      new THREE.Vector3(-pw, railTopY, -pd),
      new THREE.Vector3(-pw, railTopY, pd),
      tubeR, neonMat,
    );
    boothGroup.add(ltop);
    boothNeonMeshes.push(ltop);

    for (const sz of [-pd, pd]) {
      const t = makeNeonTube(
        new THREE.Vector3(pw, railBaseY, sz),
        new THREE.Vector3(pw, railTopY, sz),
        tubeR, neonMat,
      );
      boothGroup.add(t);
      boothNeonMeshes.push(t);
    }
    const rtop = makeNeonTube(
      new THREE.Vector3(pw, railTopY, -pd),
      new THREE.Vector3(pw, railTopY, pd),
      tubeR, neonMat,
    );
    boothGroup.add(rtop);
    boothNeonMeshes.push(rtop);

    // ===== TRUSS TOWERS (4 corners of platform) =====
    const trussHeight = 6;
    const trussBaseY = railBaseY;
    const trussOffsets = [
      [-pw + 0.5, -pd + 0.5],
      [pw - 0.5, -pd + 0.5],
      [-pw + 0.5, pd - 0.5],
      [pw - 0.5, pd - 0.5],
    ];
    for (const [tx, tz] of trussOffsets) {
      const truss = makeTruss(trussHeight, trussBaseY, trussLightMats[i]);
      truss.position.set(tx, 0, tz);
      boothGroup.add(truss);
    }

    // ===== DECORATIVE SIDE PANELS =====
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(sidePanelGeo, sidePanelMats[i]);
      panel.position.set(side * (pw + 0.02), topY + 1.5, 0);
      panel.rotation.y = side * Math.PI / 2;
      boothGroup.add(panel);

      // Horizontal neon strips on side panels
      for (let s = 0; s < 3; s++) {
        const stripY = topY + 0.8 + s * 0.6;
        const strip = makeNeonTube(
          new THREE.Vector3(side * (pw + 0.03), stripY, -pd * 0.35),
          new THREE.Vector3(side * (pw + 0.03), stripY, pd * 0.35),
          0.02, neonMat
        );
        boothGroup.add(strip);
        boothNeonMeshes.push(strip);
      }
    }

    // Diamond accent on each side
    for (const side of [-1, 1]) {
      const diamond = new THREE.Mesh(diamondGeo, diamondMats[i]);
      diamond.position.set(side * (pw + 0.04), topY + 1.5, 0);
      diamond.rotation.y = side * Math.PI / 2;
      boothGroup.add(diamond);
    }

    // ===== DJ GEAR (behind cart spawn, local +Z = away from arena) =====
    if (B.gearEnabled) {
      const gearGroup = new THREE.Group();
      gearGroup.position.set(0, topY + B.platformThickness / 2, pd - 0.6);

      const mixer = new THREE.Mesh(mixerGeo, mixerMat);
      mixer.position.set(0, 0.25, 0);
      gearGroup.add(mixer);

      const panel = new THREE.Mesh(mixerPanelGeo, panelMats[i]);
      panel.position.set(0, 0.52, 0);
      gearGroup.add(panel);

      const ld = new THREE.Mesh(deckGeo, deckMat);
      ld.position.set(-0.9, 0.55, 0);
      gearGroup.add(ld);
      const rd = new THREE.Mesh(deckGeo, deckMat);
      rd.position.set(0.9, 0.55, 0);
      gearGroup.add(rd);

      const ls = new THREE.Mesh(spkGeo, spkMat);
      ls.position.set(-2.2, 0.8, 0.2);
      gearGroup.add(ls);
      const rs = new THREE.Mesh(spkGeo, spkMat);
      rs.position.set(2.2, 0.8, 0.2);
      gearGroup.add(rs);

      const lc = new THREE.Mesh(coneGeo, coneMat);
      lc.rotation.x = Math.PI / 2;
      lc.position.set(-2.2, 0.9, -0.25);
      gearGroup.add(lc);
      const rc = new THREE.Mesh(coneGeo, coneMat);
      rc.rotation.x = Math.PI / 2;
      rc.position.set(2.2, 0.9, -0.25);
      gearGroup.add(rc);

      // Speaker neon trim
      for (const sx of [-2.2, 2.2]) {
        const spkEdges = [
          [new THREE.Vector3(sx - 0.45, 0.0, -0.25), new THREE.Vector3(sx + 0.45, 0.0, -0.25)],
          [new THREE.Vector3(sx - 0.45, 1.6, -0.25), new THREE.Vector3(sx + 0.45, 1.6, -0.25)],
          [new THREE.Vector3(sx - 0.45, 0.0, -0.25), new THREE.Vector3(sx - 0.45, 1.6, -0.25)],
          [new THREE.Vector3(sx + 0.45, 0.0, -0.25), new THREE.Vector3(sx + 0.45, 1.6, -0.25)],
        ];
        for (const [a, b] of spkEdges) {
          const edge = makeNeonTube(a, b, 0.015, neonMat);
          gearGroup.add(edge);
          boothNeonMeshes.push(edge);
        }
        const woofer = new THREE.Mesh(wooferGeo, coneMat);
        woofer.rotation.x = Math.PI / 2;
        woofer.position.set(sx, 0.4, -0.25);
        gearGroup.add(woofer);
      }

      for (const dx of [-0.9, 0.9]) {
        const platter = new THREE.Mesh(platterGeo, platterMat);
        platter.position.set(dx, 0.6, 0);
        gearGroup.add(platter);
        const dot = new THREE.Mesh(dotGeo, dotMats[i]);
        dot.position.set(dx, 0.62, 0);
        gearGroup.add(dot);
      }

      for (let k = 0; k < 5; k += 1) {
        const knob = new THREE.Mesh(knobGeo, knobMat);
        knob.position.set(-0.5 + k * 0.25, 0.56, 0);
        gearGroup.add(knob);
      }

      const ledStrip = makeNeonTube(
        new THREE.Vector3(-1.3, 0.3, -0.6),
        new THREE.Vector3(1.3, 0.3, -0.6),
        0.025, neonMat,
      );
      gearGroup.add(ledStrip);
      boothNeonMeshes.push(ledStrip);

      boothGroup.add(gearGroup);
    }

    scene.add(boothGroup);
    boothGroups.push(boothGroup);

    if (!isLowQualityMode()) {
      for (let f = 0; f < fogPuffCount; f++) {
        const puff = new THREE.Sprite(new THREE.SpriteMaterial({
          map: fogPuffTex,
          color: accentColor,
          transparent: true,
          opacity: 0.25 + Math.random() * 0.15,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }));
        const spread = B.platformWidth * 1.5;
        const puffScale = 4 + Math.random() * 4;
        puff.scale.set(puffScale, puffScale * 0.3, 1);
        puff.position.set(
          cx + (Math.random() - 0.5) * spread,
          B.platformY + 0.05 + Math.random() * 0.3,
          cz + (Math.random() - 0.5) * spread,
        );
        scene.add(puff);
        fogSprites.push(puff);
      }
    }
  }

  return {
    boothGroups,
    fogSprites,
    boothBodies,
    sharedGeometries: [
      UNIT_BOX, UNIT_CYL, trussLightGeo, platGeo, sidePanelGeo, diamondGeo, dotGeo,
      mixerGeo, mixerPanelGeo, deckGeo, spkGeo, coneGeo, wooferGeo, platterGeo, knobGeo,
    ],
    sharedMaterials: [
      trussLegMat, trussCrossMat, mixerMat, deckMat, spkMat, coneMat, platterMat, knobMat,
      fogPuffTex, ...neonMats, ...trussLightMats, ...platMats, ...sidePanelMats,
      ...diamondMats, ...panelMats, ...dotMats,
    ],
  };
}

/**
 * Builds the dancefloor record (visual + physics), center pit wall, and four spawn booths.
 * Adds all meshes to the scene and registers Rapier colliders on the supplied world.
 *
 * @param {THREE.Scene} scene Root Three.js scene.
 * @param {import("@dimforge/rapier3d").World} world Active Rapier physics world.
 * @param {object} config Full game CONFIG (record, booth, debug sections).
 * @returns {{
 *   recordMesh: THREE.Mesh,
 *   recordColliderHandles: number[],
 *   pitWallColliderHandle: number,
 *   boothColliderHandles: number[],
 *   boothNeonMeshes: THREE.Mesh[],
 *   spindleLight: THREE.PointLight,
 *   spindleLightColorPink: THREE.Color,
 *   spindleLightColorCyan: THREE.Color,
 *   pitInnerRadius: number,
 *   dispose: () => void,
 * }}
 */
export function initArena(scene, world, config, options = {}) {
  // * Classic Record uses a deeper void death threshold so carts fall farther
  // * before respawning. Backrooms keeps the default -10 via its own init.
  const prevFallYThreshold = config.fall.yThreshold;
  config.fall.yThreshold = -30;

  const reflectorTextureSize = options.reflectorTextureSize ?? REFLECTOR_TEXTURE_SIZE_FULL;
  const visualRecordThickness = VISUAL_RECORD_THICKNESS;
  const boothNeonMeshes = [];
  const boothColliderHandles = [];

  // --- Record platform (visual rotates; physics ring collider stays world-fixed) ---
  const visualRecordY = -0.46;
  const recordGeo = buildRecordRingGeometry({
    outerRadius: config.record.radius,
    innerRadius: config.record.innerRadius,
    thickness: visualRecordThickness,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    curveSegments: 64,
  });
  // * Vinyl dancefloor — Physical + clearcoat: metalness 0.35, roughness 0.68, clearcoat 0.4, opacity 0.7.
  // * Always use createPhysicalMaterial so transparency can be toggled at runtime for quality changes.
  // * When the Reflector is visible (high quality) the record is transparent; in low quality it's opaque.
  const recordMat = createPhysicalMaterial({
    color: config.record.color,
    roughness: isLowQualityMode() ? 0.9 : 0.68,
    metalness: isLowQualityMode() ? 0 : 0.35,
    clearcoat: isLowQualityMode() ? 0 : 0.4,
    clearcoatRoughness: 0.22,
    transparent: !isLowQualityMode(),
    opacity: isLowQualityMode() ? 1.0 : 0.7,
  });
  recordMat.depthWrite = isLowQualityMode();
  const recordMesh = new THREE.Mesh(recordGeo, recordMat);
  recordMesh.position.set(0, visualRecordY, 0);
  recordMesh.receiveShadow = false;
  scene.add(recordMesh);

  // ! Debug export — expose record mesh for Tweakpane export buttons.
  window.recordMesh = recordMesh;

  // * Spindle accent light: slowly cycles pink <-> cyan in the render loop.
  const spindleLight = new THREE.PointLight(0xff2bd6, 80, 30, 2);
  const spindleLightColorPink = new THREE.Color(0xff2bd6);
  const spindleLightColorCyan = new THREE.Color(0x2bd6ff);
  spindleLight.position.set(0, 1.5, 0);
  scene.add(spindleLight);

  const visualRecordTopY = visualRecordThickness / 2;
  const reflectorYOffset =
    visualRecordTopY + config.record.surface.concentricRings.yOffset + 0.001;

  function createRecordReflector(textureSize) {
    const geo = new THREE.RingGeometry(
      config.record.innerRadius,
      config.record.radius,
      128,
      1,
    );
    const reflector = new Reflector(geo, {
      clipBias: 0.003,
      textureWidth: textureSize,
      textureHeight: textureSize,
      color: 0x111111,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = reflectorYOffset;
    reflector.renderOrder = 0;
    reflector.userData._cartRaveTextureSize = textureSize;
    return reflector;
  }

  // * Reflector — always created so quality toggle can show/hide it without a world rebuild.
  let recordReflector = createRecordReflector(reflectorTextureSize);
  recordReflector.visible = !isLowQualityMode();
  recordMesh.add(recordReflector);

  // * Solid opaque floor ring for low-quality mode — covers the record surface when the Reflector is hidden.
  const solidFloorGeo = new THREE.RingGeometry(
    config.record.innerRadius,
    config.record.radius,
    128,
    1,
  );
  const solidFloorMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1e,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  const recordSolidFloor = new THREE.Mesh(solidFloorGeo, solidFloorMat);
  recordSolidFloor.rotation.x = -Math.PI / 2;
  recordSolidFloor.position.y = reflectorYOffset;
  recordSolidFloor.visible = isLowQualityMode();
  recordSolidFloor.renderOrder = 0;
  recordSolidFloor.userData.isRecordSolidFloor = true;
  recordMesh.add(recordSolidFloor);

  function upgradeRecordReflector() {
    if (!recordReflector) return;
    if (recordReflector.userData._cartRaveTextureSize >= REFLECTOR_TEXTURE_SIZE_FULL) return;
    // @ts-expect-error THREE duck-typing suppress
    if (recordReflector.renderTarget) recordReflector.renderTarget.dispose();
    if (recordReflector.material) disposeMaterial(recordReflector.material);
    recordReflector.geometry.dispose();
    recordMesh.remove(recordReflector);
    recordReflector = createRecordReflector(REFLECTOR_TEXTURE_SIZE_FULL);
    // * Preserve current quality-mode visibility from the solid floor state.
    recordReflector.visible = !recordSolidFloor.visible;
    recordMesh.add(recordReflector);
  }

  /**
   * Toggles the Reflector and solid-floor replacement for quality changes.
   * Call with `true` to show the reflective floor, `false` for the opaque low-quality surface.
   * @param {boolean} visible
   */
  function setReflectorVisible(visible) {
    if (recordReflector) recordReflector.visible = visible;
    if (recordSolidFloor) recordSolidFloor.visible = !visible;
    // Toggle record material transparency to match.
    if (recordMat) {
      recordMat.transparent = !visible;
      recordMat.opacity = visible ? 0.7 : 1.0;
      recordMat.depthWrite = !visible;
      recordMat.needsUpdate = true;
    }
  }

  // --- Record center label (stars) ---
  const recordLabelCanvas = document.createElement("canvas");
  recordLabelCanvas.width = 512;
  recordLabelCanvas.height = 512;
  const recordLabelCtx = recordLabelCanvas.getContext("2d");
  recordLabelCtx.clearRect(0, 0, 512, 512);

  const labelCx = 256;
  const labelCy = 256;
  const labelR = 256;

  // Label background disc (white; tint comes from material.color)
  recordLabelCtx.fillStyle = "#ffffff";
  recordLabelCtx.beginPath();
  recordLabelCtx.arc(labelCx, labelCy, labelR, 0, Math.PI * 2);
  recordLabelCtx.fill();

  // 5-point star path helper.
  const drawStar = (cx, cy, outerR, innerR, rotationRad) => {
    recordLabelCtx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = rotationRad + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) recordLabelCtx.moveTo(x, y);
      else recordLabelCtx.lineTo(x, y);
    }
    recordLabelCtx.closePath();
    recordLabelCtx.fill();
  };

  // Three stars, 120° apart.
  recordLabelCtx.fillStyle = "#ffffff";
  const starOrbit = labelR * 0.6;
  const starOuter = labelR * 0.32;
  const starInner = starOuter * 0.45;
  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3 - Math.PI / 2;
    const sx = labelCx + Math.cos(a) * starOrbit;
    const sy = labelCy + Math.sin(a) * starOrbit;
    drawStar(sx, sy, starOuter, starInner, a);
  }

  // Transparent center hole.
  recordLabelCtx.globalCompositeOperation = "destination-out";
  recordLabelCtx.beginPath();
  recordLabelCtx.arc(labelCx, labelCy, labelR * 0.27, 0, Math.PI * 2);
  recordLabelCtx.fill();
  recordLabelCtx.globalCompositeOperation = "source-over";

  const recordLabelTex = new THREE.CanvasTexture(recordLabelCanvas);
  recordLabelTex.needsUpdate = true;
  const recordLabelGeo = new THREE.RingGeometry(3.7, 7.0, 96);
  const recordLabelMat = new THREE.MeshBasicMaterial({
    map: recordLabelTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.495,
    blending: THREE.NormalBlending,
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  recordLabelMat.depthTest = true;
  const recordLabelMesh = new THREE.Mesh(recordLabelGeo, recordLabelMat);
  recordLabelMesh.rotation.x = -Math.PI / 2;
  recordLabelMesh.position.y = visualRecordTopY + config.record.surface.concentricRings.yOffset + 0.012;
  recordLabelMesh.renderOrder = -1;
  recordMesh.add(recordLabelMesh);

  const grooveResult = buildRecordSurfaceGrooves(recordMesh, config, visualRecordThickness);

  // Neon rim (visual only).
  // * Record neon rim — Physical emissive: emissiveIntensity 2.2, metalness 0, roughness 0.45
  const rimMat = createPhysicalMaterial({
    color: config.record.rimColor,
    emissive: config.record.rimColor,
    emissiveIntensity: 2.2,
    roughness: 0.45,
    metalness: 0.0,
    depthWrite: false,
    toneMapped: false,
  });
  // * Beveled ExtrudeGeometry extends past nominal outerRadius — inset torus (0.985*r) sits inside the floor mesh and
  // * disappears; place slightly outside the nominal edge (mirrors inner rim * 1.015) so the neon ring stays visible.
  const rimGeo = new THREE.TorusGeometry(config.record.radius * 1.015, 0.12, 10, 72);
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.set(0, config.record.y + config.record.thickness / 2 + 0.02, 0);
  rimMesh.rotation.x = Math.PI / 2;
  scene.add(rimMesh);

  const edgeRingGeo = new THREE.TorusGeometry(config.record.radius * 1.015, 0.05, 10, 96);
  const edgeRingMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  const edgeRingMesh = new THREE.Mesh(edgeRingGeo, edgeRingMat);
  edgeRingMesh.position.set(0, config.record.y + config.record.thickness / 2 + 0.021, 0);
  edgeRingMesh.rotation.x = Math.PI / 2;
  scene.add(edgeRingMesh);

  // Inner neon rim (visual only): sells the hole edge.
  const innerRimGeo = new THREE.TorusGeometry(config.record.innerRadius * 1.02, 0.12, 10, 72);
  const innerRimMesh = new THREE.Mesh(innerRimGeo, rimMat);
  innerRimMesh.position.set(0, config.record.y + config.record.thickness / 2 + 0.03, 0);
  innerRimMesh.rotation.x = Math.PI / 2;
  scene.add(innerRimMesh);

  const recordBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(0, config.record.y, 0),
  );

  // * Build visual debug geometry (wireframe only, lazy allocated if debug enabled).
  const recordPhysics = config.record.physics || {};
  let recordPhysicsGeo = null;
  if (config.debug.arenaTrimesh) {
    recordPhysicsGeo = buildRecordPhysicsGeometry({
      outerRadius: config.record.radius,
      innerRadius: config.record.innerRadius,
      thickness: config.record.thickness,
      chamferWidth: recordPhysics.chamferWidth ?? 0.35,
      holeClearance: recordPhysics.holeClearance ?? 0.45,
      outerBevel: recordPhysics.outerBevel ?? 0.12,
      segments: recordPhysics.segments ?? 72,
    });
  }

  // --- PRIMITIVE RING COLLIDER (Fixes Trimesh Bounce & Overlap Tunneling) ---
  const N_SEGMENTS = 16;
  const R_out = config.record.radius;
  const R_in = config.record.innerRadius;
  const halfT = config.record.thickness / 2;

  // * Exact tangent widths so segments touch edge-to-edge with zero overlap.
  const halfAngle = Math.PI / N_SEGMENTS;
  const zIn = R_in * Math.tan(halfAngle);
  const zOut = R_out * Math.tan(halfAngle);
  const topY = halfT;
  const botY = -halfT;

  // * 8 vertices of a trapezoidal prism, centered radially (no translation needed).
  // * Vertices already encode R_in → R_out; rotation around origin places them in the ring.
  const vertices = new Float32Array([
    // Top face
    R_in, topY, -zIn,
    R_in, topY,  zIn,
    R_out, topY, -zOut,
    R_out, topY,  zOut,
    // Bottom face
    R_in, botY, -zIn,
    R_in, botY,  zIn,
    R_out, botY, -zOut,
    R_out, botY,  zOut,
  ]);

  const yAxis = new THREE.Vector3(0, 1, 0);
  /** @type {number[]} */
  const recordColliderHandles = [];

  for (let i = 0; i < N_SEGMENTS; i++) {
    const angle = (i / N_SEGMENTS) * Math.PI * 2;
    const quat = new THREE.Quaternion().setFromAxisAngle(yAxis, angle);

    const segmentDesc = RAPIER.ColliderDesc.convexHull(vertices)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setFriction(config.record.friction)
      .setRestitution(config.record.restitution);

    const segmentCollider = world.createCollider(segmentDesc, recordBody);
    recordColliderHandles.push(segmentCollider.handle);
  }

  let debugMesh = null;
  let debugMat = null;
  if (config.debug.arenaTrimesh && recordPhysicsGeo) {
    debugMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      depthTest: false,
    });
    debugMesh = new THREE.Mesh(recordPhysicsGeo.clone(), debugMat);
    debugMesh.position.set(0, config.record.y, 0);
    scene.add(debugMesh);
  }

  // DJ spawn booths (4x, N/S/E/W)
  const boothBuild = buildBooths(scene, world, config, boothNeonMeshes, boothColliderHandles);

  const pitInnerRadius = (config.record.radius + 2) * 1.30 * 1.20;

  const pitWallDepth = 600;
  const pitWallTopY = -3;
  const pitWallCenterY = pitWallTopY - pitWallDepth / 2;
  const pitWallGeo = new THREE.CylinderGeometry(
    pitInnerRadius,
    pitInnerRadius,
    pitWallDepth,
    64,
    1,
    true,
  );
  {
    const pos = pitWallGeo.attributes.position;
    const pitWallColorArray = new Float32Array(pos.count * 3);
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      const t = yMax > yMin
        ? Math.max(0, Math.min(1, (y - yMin) / (yMax - yMin)))
        : 0;
      // * Bottom: black. Top: purple in linear components (0.25, 0.03, 0.41).
      pitWallColorArray[i * 3] = 0.25 * t;
      pitWallColorArray[i * 3 + 1] = 0.03 * t;
      pitWallColorArray[i * 3 + 2] = 0.41 * t;
    }
    pitWallGeo.setAttribute("color", new THREE.BufferAttribute(pitWallColorArray, 3));
  }
  const pitWallMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.3,
    roughness: 0.7,
    side: THREE.BackSide,
    vertexColors: true,
  });
  const pitWall = new THREE.Mesh(pitWallGeo, pitWallMat);
  pitWall.position.y = pitWallCenterY;
  scene.add(pitWall);

  const pitWallPhysicsTopY = -32;
  const pitWallPhysicsBottomY = pitWallCenterY - pitWallDepth / 2;
  const pitWallPhysicsHalfHeight = (pitWallPhysicsTopY - pitWallPhysicsBottomY) / 2;
  const pitWallPhysicsCenterY = (pitWallPhysicsTopY + pitWallPhysicsBottomY) / 2;
  const pitWallBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, pitWallPhysicsCenterY, 0),
  );
  // * Native cylinder collider — smooth wall, no tri-seam jitter. Top cap sits below fall
  // * respawn (yThreshold) so the open record hole stays unobstructed (unlike open trimesh).
  const pitWallCollider = world.createCollider(
    RAPIER.ColliderDesc.cylinder(pitWallPhysicsHalfHeight, pitInnerRadius)
      .setFriction(0.2)
      .setRestitution(0.8),
    pitWallBody,
  );
  const pitWallColliderHandle = pitWallCollider.handle;

  const sceneRoots = [
    recordMesh, rimMesh, edgeRingMesh, innerRimMesh, pitWall, spindleLight,
    ...boothBuild.boothGroups,
    ...boothBuild.fogSprites,
    recordSolidFloor,
  ];
  if (debugMesh) {
    // @ts-expect-error THREE duck-typing suppress
    sceneRoots.push(debugMesh);
  }

  /** @type {THREE.BufferGeometry[]} */
  const ownedGeometries = [
    recordGeo, recordLabelGeo, rimGeo, edgeRingGeo, innerRimGeo, pitWallGeo,
    solidFloorGeo,
  ];
  if (recordPhysicsGeo) {
    ownedGeometries.push(recordPhysicsGeo);
  }
  if (grooveResult) {
    ownedGeometries.push(grooveResult.mergedGrooves);
  }

  const ownedMaterials = [
    recordMat, recordLabelMat, rimMat, edgeRingMat, pitWallMat, solidFloorMat,
  ];
  if (grooveResult) {
    ownedMaterials.push(grooveResult.ringMat);
  }
  if (debugMat) {
    ownedMaterials.push(debugMat);
  }

  function disposeMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
      return;
    }
    if (typeof material.dispose === "function") material.dispose();
  }

  function dispose() {
    const sharedGeos = new Set(boothBuild.sharedGeometries);
    const sharedMats = new Set(boothBuild.sharedMaterials);
    const ownedGeoSet = new Set(ownedGeometries);
    const ownedMatSet = new Set(ownedMaterials);

    for (const root of sceneRoots) {
      scene.remove(root);
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Sprite)) return;
        const target = /** @type {THREE.Mesh | THREE.Sprite} */ (child);
        if (target.geometry && !sharedGeos.has(/** @type {any} */ (target.geometry)) && !ownedGeoSet.has(/** @type {any} */ (target.geometry))) {
          target.geometry.dispose();
        }
        const mats = Array.isArray(target.material) ? target.material : [target.material];
        mats.forEach((mat) => {
          if (mat && !sharedMats.has(/** @type {any} */ (mat)) && !ownedMatSet.has(/** @type {any} */ (mat))) disposeMaterial(mat);
        });
      });
    }

    ownedGeometries.forEach((geo) => geo.dispose());
    ownedMaterials.forEach((mat) => disposeMaterial(mat));
    recordLabelTex.dispose();
    boothBuild.sharedGeometries.forEach((geo) => geo.dispose());
    boothBuild.sharedMaterials.forEach((item) => {
      // @ts-expect-error THREE duck-typing suppress
      if (item && item.isTexture) item.dispose();
      else disposeMaterial(item);
    });

    if (recordReflector) {
      // @ts-expect-error THREE duck-typing suppress
      if (recordReflector.renderTarget) {
        // @ts-expect-error THREE duck-typing suppress
        recordReflector.renderTarget.dispose();
      }
      if (recordReflector.material) {
        disposeMaterial(recordReflector.material);
      }
      recordReflector.geometry?.dispose?.();
    }

    if (window.recordMesh === recordMesh) {
      window.recordMesh = undefined;
    }

    world.removeRigidBody(recordBody);
    world.removeRigidBody(pitWallBody);
    for (const body of boothBuild.boothBodies) {
      world.removeRigidBody(body);
    }

    config.fall.yThreshold = prevFallYThreshold;
  }

  return {
    recordMesh,
    recordColliderHandles,
    pitWallColliderHandle,
    boothColliderHandles,
    boothNeonMeshes,
    spindleLight,
    spindleLightColorPink,
    spindleLightColorCyan,
    pitInnerRadius,
    // @ts-expect-error THREE duck-typing suppress
    recordLabelMat,
    upgradeRecordReflector,
    setReflectorVisible,
    dispose,
  };
}
