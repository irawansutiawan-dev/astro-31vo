
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, Sparkles, Volume2, VolumeX } from "lucide-react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { VertexNormalsHelper } from "three/addons/helpers/VertexNormalsHelper.js";
import { useNavigate } from "react-router-dom";
import type { QuizQuestion } from "@/components/MeteorShootingGame";
import {
  buildCewekHalusGeometry,
  CEWEK_HALUS_BONE_NAMES,
  measureCewekHalusArmBodyClearance,
  type CewekHalusCapsule,
} from "./cewekHalusGeometry";

type IslandId = "rainbow" | "snow" | "candy" | "cloud" | "volcano";
type IslandTheme = {
  id: IslandId;
  name: string;
  emoji: string;
  description: string;
  palette: {
    grass: string;
    grassLight: string;
    path: string;
    roof: string;
    blue: string;
    leaf: string;
    leafLight: string;
    water: string;
  };
};

const ISLANDS: IslandTheme[] = [
  {
    id: "rainbow",
    name: "Pulau Pelangi",
    emoji: "🌈",
    description: "Desa ceria penuh warna",
    palette: { grass: "#70cf66", grassLight: "#9be36b", path: "#f6d58a", roof: "#ff806d", blue: "#5495ef", leaf: "#42b96b", leafLight: "#85dc65", water: "#42c7e8" },
  },
  {
    id: "snow",
    name: "Pulau Salju",
    emoji: "❄️",
    description: "Pegunungan es berkilau",
    palette: { grass: "#c5eaf2", grassLight: "#effbff", path: "#a9d8e9", roof: "#8c9ff5", blue: "#53c9e8", leaf: "#398f9c", leafLight: "#74c7c7", water: "#49b8dd" },
  },
  {
    id: "candy",
    name: "Pulau Permen",
    emoji: "🍭",
    description: "Hutan manis warna-warni",
    palette: { grass: "#f39acb", grassLight: "#ffc5dc", path: "#ffe5a0", roof: "#ae78ed", blue: "#61b8f5", leaf: "#ed6fa7", leafLight: "#ffb25f", water: "#64d7e8" },
  },
  {
    id: "cloud",
    name: "Pulau Awan",
    emoji: "☁️",
    description: "Taman langit yang lembut",
    palette: { grass: "#8ecaf4", grassLight: "#c7e9ff", path: "#fff1bd", roof: "#f28caf", blue: "#6d95ef", leaf: "#5ba9a4", leafLight: "#a1d9ca", water: "#76c9f3" },
  },
  {
    id: "volcano",
    name: "Pulau Vulkanik",
    emoji: "🌋",
    description: "Petualangan hangat di kawah",
    palette: { grass: "#727076", grassLight: "#9a8988", path: "#ffad68", roof: "#e85e58", blue: "#6cbbe0", leaf: "#477c5d", leafLight: "#8fad62", water: "#3d9bb4" },
  },
];

type WorldQuestion = {
  prompt: string;
  answer: string;
  options: string[];
};

type Treasure = {
  id: number;
  group: THREE.Group;
  glow: THREE.Group;
  beaconLight: THREE.PointLight;
  home: THREE.Vector3;
  phase: number;
  collected: boolean;
};

type IslandInhabitant = {
  group: THREE.Group;
  homeY: number;
  phase: number;
  isAnimal: boolean;
};

const TREASURE_COUNT = 5;
const TREASURE_CORRECT_POINTS = 20;
const TREASURE_WRONG_POINTS = 0;
const TREASURE_RANKS = [
  { title: "PANTANG MENYERAH", emoji: "🌱", description: "Setiap peti yang kamu taklukkan adalah langkah menjadi penjelajah hebat!" },
  { title: "CALON PENJELAJAH", emoji: "🧭", description: "Awal petualangan yang hebat—terus asah ketajaman berhitungmu!" },
  { title: "PETUALANG TANGGUH", emoji: "🗺️", description: "Kamu tetap gigih dan berhasil membawa pulang semua harta!" },
  { title: "PEMBURU ANDAL", emoji: "🔎", description: "Insting penjelajahmu tajam. Tinggal selangkah lagi menuju kesempurnaan!" },
  { title: "PENJELAJAH EMAS", emoji: "🏅", description: "Luar biasa! Hampir semua peti terbuka dengan jawaban tepat sejak awal!" },
  { title: "LEGENDA HARTA", emoji: "👑", description: "Sempurna! Semua peti terbuka dengan jawaban benar pada percobaan pertama!" },
] as const;
const WORLD_RADIUS = 62;
const RADAR_CENTER = 60;
const RADAR_RADIUS = 48;
const TREASURE_POSITIONS: Array<[number, number]> = [
  [2, 45], [-18, 28], [20, 30], [-34, 3], [36, -7],
];
const toRadarCoordinates = (x: number, z: number) => ({
  x: RADAR_CENTER + (x / WORLD_RADIUS) * RADAR_RADIUS,
  y: RADAR_CENTER + (z / WORLD_RADIUS) * RADAR_RADIUS,
});

// Skala tunggal untuk mengatur ukuran figur tanpa menggeser telapak dari pangkal rig.
const AVATAR_SCALE = 1;

const RUN_CONFIG = {
  cycleLength: 4.2,
  maxCyclesPerSecond: 2.6,
  legSwing: 0.8,
  elbowBend: 1.57,
  bodyLean: 0.24,
  footLift: 0.34,
  bodyBounce: 0.06,
  blendSeconds: 0.2,
  torsoTwist: 0.08,
  maxDeltaTime: 0.04,
} as const;

const CEWEK_HALUS_CONFIG = {
  skinColor: "#F3D2BC",
  hairColor: "#2B1B17",
  shirtColor: "#F5F5F5",
  jacketColor: "#5B7FA6",
  pantsColor: "#3E5C86",
  shoesColor: "#F2F2F2",
  stepLength: RUN_CONFIG.cycleLength,
  maxCyclesPerSecond: RUN_CONFIG.maxCyclesPerSecond,
  gridStep: 0.032,
  bounds: { minX: -0.42, maxX: 0.42, minY: -0.08, maxY: 2.12, minZ: -0.3, maxZ: 0.3 },
  hipSwing: 0.72,
  kneeForwardBend: 1.64,
  kneeMaxBend: 1.72,
  elbowBend: 1.62,
  elbowMaxBend: 1.72,
  shoulderAbduction: 2 * Math.PI / 180,
  shoulderSwing: 0.48,
  bodyLean: 0.17,
  pelvisYaw: 0.08,
  torsoCounterYaw: 0.055,
  ankleSwing: 0.12,
  runBounce: 0.06,
  breathAmplitude: 0.012,
  idleWeightShift: 0.012,
  idleHeadNod: 0.01,
  forearmLagCycles: 0.06,
  bodyBlend: 0.075,
  shoulderBlend: 0.026,
  elbowBlend: 0.03,
  wristBlend: 0.026,
  hipBlend: 0.12,
  kneeBlend: 0.028,
  ankleBlend: 0.026,
  blendBand: 0.065,
  jointBlendFraction: 0.25,
  hipWeightFraction: 0.36,
  idleElbowBend: 0.2,
  jumpArmRaise: 0.9,
  jumpKneeBend: 0.35,
  landingKneeBend: 0.32,
  transitionSeconds: 0.2,
  groundOffset: 0,
  shoulderBindEndY: 1.13,
  armLength: 0.57,
  legLength: 0.70,
  bodyHeight: 2.04,
  headHeight: 0.68,
} as const;

const SHOW_TEST_AVATARS = true;
const DEBUG_FREEZE_PHASE: number | null = null;
const DEBUG_PANEL = false;
const DEBUG_PANEL_PHASES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] as const;

type DebugPanelOptions = {
  avatarShadows: "normal" | "on" | "off";
  sceneShadows: "normal" | "on" | "off";
  body: boolean;
  hair: boolean;
  accessories: boolean;
  rig: boolean;
  otherPresets: boolean;
  wireframe: boolean;
  normalMaterial: boolean;
  skeleton: boolean;
  vertexNormals: boolean;
  bodySide: "original" | "front" | "back" | "double";
  flatShading: boolean;
  directionalLight: boolean;
  hemisphereLight: boolean;
  basicMaterial: boolean;
  lockArms: boolean;
  lockBody: boolean;
  lockLeftLeg: boolean;
  lockRightLeg: boolean;
  lockHipYawRoll: boolean;
  lockSecondaryMotion: boolean;
  fixedFacing: "left" | "right" | "front" | "back" | null;
  freezePhase: number | null;
};

type DebugMeshInfo = {
  name: string;
  type: string;
  castShadow: string;
  receiveShadow: string;
  material: string;
  transparent: string;
  depthWrite: string;
  side: string;
};

type DebugAvatarStats = {
  skinnedMeshes: number;
  meshes: number;
  drawCalls: number;
  objects: DebugMeshInfo[];
};

const INITIAL_DEBUG_PANEL_OPTIONS: DebugPanelOptions = {
  avatarShadows: "normal",
  sceneShadows: "normal",
  body: true,
  hair: true,
  accessories: true,
  rig: false,
  otherPresets: false,
  wireframe: false,
  normalMaterial: false,
  skeleton: false,
  vertexNormals: false,
  bodySide: "original",
  flatShading: false,
  directionalLight: true,
  hemisphereLight: true,
  basicMaterial: false,
  lockArms: false,
  lockBody: false,
  lockLeftLeg: false,
  lockRightLeg: false,
  lockHipYawRoll: false,
  lockSecondaryMotion: false,
  fixedFacing: null,
  freezePhase: null,
};

const ROBLOX_SLIM_CONFIG = {
  parts: {
    head: [0.56, 0.52, 0.46],
    upperTorso: [0.54, 0.44, 0.28],
    lowerTorso: [0.44, 0.3, 0.27],
    hand: [0.105, 0.095, 0.075],
    thigh: [0.17, 0.31, 0.16],
    calf: [0.145, 0.3, 0.135],
    foot: [0.16, 0.08, 0.26],
  },
  armReference: {
    upper: [0.24, 0.3, 0.24],
    forearm: [0.164, 0.24, 0.164],
  },
  elbowForward: 70 * Math.PI / 180,
  elbowBackward: 15 * Math.PI / 180,
  kneeBackward: 90 * Math.PI / 180,
  forearmLagCycles: 0.2,
  handLagCycles: 0.27,
  armThicknessScale: 0.58,
  bevelRatio: 0.12,
  bodyLean: 6 * Math.PI / 180,
  transitionSeconds: 0.2,
} as const;

const KEMEJA_CONFIG = {
  colors: {
    skin: "#D8A982",
    warmSkin: "#C98F6B",
    hair: "#D9A441",
    hairShadow: "#B9822C",
    shirt: "#8E949B",
    flannelRed: "#B3262E",
    flannelBlack: "#1A1A1A",
    flannelWhite: "#EDEDED",
    shorts: "#4F78B0",
    socks: "#3C8CE0",
    shoes: "#E6D8C3",
    sole: "#B83228",
    glasses: "#111820",
    lenses: "#2A4D9B",
    glassesHighlight: "#BBD9FF",
    brow: "#49332B",
    lip: "#A95B55",
    denimDetail: "#81A0CA",
    button: "#E8D8B8",
  },
  head: [0.52, 0.48, 0.46] as const,
  upperTorso: [0.8, 0.5, 0.48] as const,
  lowerTorso: [0.78, 0.28, 0.5] as const,
  upperArm: [0.24, 0.34, 0.24] as const,
  forearm: [0.22, 0.32, 0.22] as const,
  thigh: [0.34, 0.38, 0.34] as const,
  calf: [0.3, 0.34, 0.3] as const,
  hand: [0.24, 0.2, 0.12] as const,
  shoe: [0.36, 0.14, 0.54] as const,
  totalHeight: 2.1,
  glasses: true,
  bevelRatio: 0.22,
  headSegments: 5,
  torsoSegments: 2,
  pelvisSegments: 2,
  torsoY: 1,
  headPivotY: 0.67,
  shoulderY: 1.22,
  hipY: 0.65,
  shoulderWidth: 0.4,
  shoulderAbduction: 7 * Math.PI / 180,
  shoulderSwing: 0.62,
  elbowFrontBend: Math.PI / 2,
  elbowBackBend: Math.PI / 6,
  kneeBend: 1.68,
  bodyLean: 0.17,
  runBounce: 0.06,
  forearmLagCycles: 0.045,
  transitionSeconds: 0.2,
  groundOffset: 0,
  idleBreathAmplitude: 0.012,
  idleWeightShift: 0.012,
  hairSway: 0.025,
  jumpArmRaise: 0.85,
  jumpKneeBend: 0.35,
  landingKneeBend: 0.28,
} as const;

const KEMEJA_DEBUG_FREEZE_PHASE: number | null = null;
const CHIBI_DEBUG_FREEZE_PHASE: number | null = null;
const KUCING_DEBUG_FREEZE_PHASE: number | null = null;
// Pakaian dan sepatu berbagi satu SkinnedMesh dengan tubuh; hide* akan menyembunyikan permukaan gabungan.
const DEBUG_AVATAR = {
  enabled: false,
  skeletonHelper: false,
  wireframe: false,
  hideBody: false,
  hideClothing: false,
  hideShoes: false,
  hideHair: false,
} as const;

const CHIBI_CONFIG = {
  colors: {
    skin: "#D8A982",
    blush: "#EE9CA7",
    hoodie: "#C9B6F2",
    hoodieDetail: "#B39DE3",
    shorts: "#E9D9BE",
    socks: "#FFFFFF",
    shoes: "#F2F2F2",
    sole: "#D8D8D8",
    hair: "#5A3A24",
    hairShadow: "#382316",
    faceInk: "#382B35",
    eyeHighlight: "#FFFFFF",
  },
  totalHeight: 2.1,
  headHeight: 0.8,
  headWidth: 0.6,
  headDepth: 0.54,
  gridStep: 0.032,
  bounds: { minX: -0.56, maxX: 0.56, minY: -0.08, maxY: 2.12, minZ: -0.4, maxZ: 0.4 },
  bodyBlend: 0.14,
  shoulderBlend: 0.055,
  elbowBlend: 0.035,
  wristBlend: 0.03,
  hipBlend: 0.09,
  kneeBlend: 0.035,
  ankleBlend: 0.03,
  blendBand: 0.055,
  blendFraction: 0.32,
  hipWeightFraction: 0.38,
  shoulderBlendRamp: [1.22, 1.4] as const,
  hipBlendRamp: [0.62, 0.88] as const,
  shoulderBindEndY: 1.2,
  armWeightZone: { minY: 0.72, maxY: 1.48, minAbsX: 0.19 },
  legWeightZone: { minY: -0.08, maxY: 0.96, minAbsX: 0.04 },
  minimumThighGap: 0.18,
  headBottomY: 1.23,
  headTopY: 2.03,
  faceForwardZ: 0.08,
  handWidth: 0.15,
  wristWidth: 0.12,
  handLength: 0.195,
  shoulderAbduction: 12 * Math.PI / 180,
  shoulderForward: 40 * Math.PI / 180,
  shoulderBackward: -30 * Math.PI / 180,
  elbowForward: 90 * Math.PI / 180,
  elbowBackward: 40 * Math.PI / 180,
  hipForward: 35 * Math.PI / 180,
  hipBackward: -25 * Math.PI / 180,
  kneeCross: 105 * Math.PI / 180,
  bodyLean: 10 * Math.PI / 180,
  flightHeight: 0.06,
  transitionSeconds: 0.2,
  forearmLagCycles: 0.045,
  hairSway: 0.035,
  idleBreath: 0.012,
  debugFreezePhases: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] as const,
  runKeyframes: [
    { phase: 0, shoulder: [-30, 40], elbow: [40, 90], hip: [35, -25], knee: [5, 95], height: 0 },
    { phase: 0.125, shoulder: [-5, 10], elbow: [55, 65], hip: [5, -5], knee: [28, 25], height: -0.035 },
    { phase: 0.25, shoulder: [25, -20], elbow: [85, 50], hip: [-15, 15], knee: [55, 105], height: 0 },
    { phase: 0.375, shoulder: [40, -30], elbow: [90, 40], hip: [-25, 35], knee: [90, 65], height: 0.06 },
    { phase: 0.5, shoulder: [40, -30], elbow: [90, 40], hip: [-25, 35], knee: [95, 5], height: 0 },
    { phase: 0.625, shoulder: [10, -5], elbow: [65, 55], hip: [-5, 5], knee: [25, 28], height: -0.035 },
    { phase: 0.75, shoulder: [-20, 25], elbow: [50, 85], hip: [15, -15], knee: [105, 55], height: 0 },
    { phase: 0.875, shoulder: [-30, 40], elbow: [40, 90], hip: [35, -25], knee: [65, 90], height: 0.06 },
  ],
} as const;

const KUCING_CONFIG = {
  ...CHIBI_CONFIG,
  colors: {
    skin: "#D8A982",
    blush: "#EE9CA7",
    hair: "#2B1B17",
    hairShadow: "#17110F",
    shirt: "#FFFFFF",
    sleeve: "#5269A9",
    pants: "#E6E6E6",
    shoes: "#5269A9",
    sole: "#293558",
    collar: "#E0AA48",
    seams: "#C8C8C8",
    headset: "#2A2A2E",
    earInner: "#F4A3C0",
    faceInk: "#382B35",
    eyeHighlight: "#FFFFFF",
  },
  headHeight: 0.76,
  headWidth: 0.6,
  headDepth: 0.54,
  neckLength: 0.18,
  neckWidth: 0.3,
  handWidth: 0.145,
  wristWidth: 0.12,
  handLength: 0.19,
  armWeightZone: { minY: 0.58, maxY: 1.48, minAbsX: 0.19 },
  hairSway: 0.035,
  hairChainDamping: 7.5,
  earSway: 0.025,
  shirtRoughness: 0.7,
  pantsRoughness: 0.7,
  shoeRoughness: 0.7,
  microphone: false,
  totalHeight: 2.1,
  runKeyframes: [
    { phase: 0, shoulder: [-24, 30], elbow: [30, 60], hip: [28, -24], knee: [10, 72], height: 0 },
    { phase: 0.125, shoulder: [-5, 10], elbow: [38, 45], hip: [5, -5], knee: [24, 22], height: -0.02 },
    { phase: 0.25, shoulder: [18, -15], elbow: [60, 38], hip: [-14, 15], knee: [45, 78], height: 0 },
    { phase: 0.375, shoulder: [30, -24], elbow: [65, 32], hip: [-24, 30], knee: [72, 50], height: 0.045 },
    { phase: 0.5, shoulder: [30, -24], elbow: [65, 32], hip: [-24, 30], knee: [75, 10], height: 0 },
    { phase: 0.625, shoulder: [10, -5], elbow: [45, 38], hip: [-5, 5], knee: [22, 24], height: -0.02 },
    { phase: 0.75, shoulder: [-15, 22], elbow: [38, 58], hip: [14, -14], knee: [78, 45], height: 0 },
    { phase: 0.875, shoulder: [-24, 30], elbow: [30, 60], hip: [28, -24], knee: [50, 72], height: 0.045 },
  ],
} as const;

const CHIBI_CAPSULES: readonly CewekHalusCapsule[] = [
  { group: "body", start: [0, 0.72, 0], end: [0, 0.91, 0], startRadius: [0.21, 0.18], endRadius: [0.22, 0.18], owner: "pelvis", proximal: "pelvis", distal: "spine1" },
  { group: "body", start: [0, 0.88, 0], end: [0, 1.12, 0], startRadius: [0.2, 0.17], endRadius: [0.19, 0.16], owner: "spine1", proximal: "pelvis", distal: "spine2" },
  { group: "body", start: [0, 1.08, 0], end: [0, 1.35, 0], startRadius: [0.19, 0.16], endRadius: [0.17, 0.14], owner: "spine2", proximal: "spine1", distal: "neck" },
  { group: "body", start: [0, 1.28, 0], end: [0, 1.49, 0], startRadius: [0.13, 0.12], endRadius: [0.11, 0.1], owner: "neck", proximal: "spine2", distal: "head" },
  { group: "body", start: [0, 1.5, 0], end: [0, 1.76, 0], startRadius: [0.3, 0.27], endRadius: [0.3, 0.27], owner: "head", proximal: "neck", distal: "head" },
  ...([-1, 1] as const).flatMap((side): CewekHalusCapsule[] => {
    const prefix = side < 0 ? "left" : "right";
    const x = (amount: number) => side * amount;
    return [
      { group: side < 0 ? "leftArm" : "rightArm", start: [x(0.13), 1.34, 0], end: [x(0.22), 1.3, 0], startRadius: [0.07, 0.065], endRadius: [0.075, 0.068], owner: `${prefix}Clavicle`, proximal: "spine2", distal: `${prefix}UpperArm` },
      { group: side < 0 ? "leftArm" : "rightArm", start: [x(0.22), 1.3, 0], end: [x(0.26), 1.04, 0], startRadius: [0.075, 0.068], endRadius: [0.07, 0.064], owner: `${prefix}UpperArm`, proximal: `${prefix}Clavicle`, distal: `${prefix}Forearm` },
      { group: side < 0 ? "leftArm" : "rightArm", start: [x(0.26), 1.04, 0], end: [x(0.28), 0.81, 0], startRadius: [0.07, 0.064], endRadius: [0.058, 0.055], owner: `${prefix}Forearm`, proximal: `${prefix}UpperArm`, distal: `${prefix}Hand` },
      { group: side < 0 ? "leftArm" : "rightArm", start: [x(0.28), 0.81, 0], end: [x(0.3), 0.74, 0], startRadius: [0.058, 0.055], endRadius: [0.052, 0.05], owner: `${prefix}Hand`, proximal: `${prefix}Forearm`, distal: `${prefix}Hand` },
      { group: side < 0 ? "leftLeg" : "rightLeg", start: [x(0.16), 0.83, 0], end: [x(0.18), 0.49, 0], startRadius: [0.12, 0.105], endRadius: [0.11, 0.1], owner: `${prefix}Thigh`, proximal: "pelvis", distal: `${prefix}Shin` },
      { group: side < 0 ? "leftLeg" : "rightLeg", start: [x(0.18), 0.5, 0], end: [x(0.18), 0.17, 0], startRadius: [0.1, 0.09], endRadius: [0.075, 0.07], owner: `${prefix}Shin`, proximal: `${prefix}Thigh`, distal: `${prefix}Foot` },
      { group: side < 0 ? "leftLeg" : "rightLeg", start: [x(0.18), 0.16, 0], end: [x(0.18), 0.1, 0.13], startRadius: [0.1, 0.1], endRadius: [0.09, 0.085], owner: `${prefix}Foot`, proximal: `${prefix}Shin`, distal: `${prefix}Toe` },
      { group: side < 0 ? "leftLeg" : "rightLeg", start: [x(0.18), 0.1, 0.12], end: [x(0.18), 0.09, 0.2], startRadius: [0.09, 0.085], endRadius: [0.08, 0.075], owner: `${prefix}Toe`, proximal: `${prefix}Foot`, distal: `${prefix}Toe` },
    ];
  }),
];

const measureChibiArmClearances = (capsules: readonly CewekHalusCapsule[]) => {
  let rest = Number.POSITIVE_INFINITY;
  let widestSwing = Number.POSITIVE_INFINITY;
  [-1, 1].forEach((side) => {
    const sideName = side < 0 ? "left" : "right";
    const sideIndex = side < 0 ? 0 : 1;
    const abduction = side * CHIBI_CONFIG.shoulderAbduction;
    rest = Math.min(rest, measureCewekHalusArmBodyClearance(capsules, CHIBI_CONFIG.bodyBlend, sideName, {
      upperArmRotationX: 0,
      upperArmRotationZ: abduction,
      forearmRotationX: -12 * Math.PI / 180,
      handRotationX: 0.025,
    }));
    CHIBI_CONFIG.runKeyframes.forEach((pose) => {
      const wristAngle = Math.sin((pose.phase - CHIBI_CONFIG.forearmLagCycles) * Math.PI * 2) * 0.045;
      widestSwing = Math.min(widestSwing, measureCewekHalusArmBodyClearance(
        capsules,
        CHIBI_CONFIG.bodyBlend,
        sideName,
        {
          upperArmRotationX: -pose.shoulder[sideIndex]! * Math.PI / 180,
          upperArmRotationZ: abduction,
          forearmRotationX: -pose.elbow[sideIndex]! * Math.PI / 180,
          handRotationX: wristAngle,
        },
      ));
    });
  });
  return { rest, widestSwing };
};

const measureChibiJointWeights = (geometry: THREE.BufferGeometry) => {
  const positions = geometry.getAttribute("position");
  const indices = geometry.getAttribute("skinIndex");
  const weights = geometry.getAttribute("skinWeight");
  const regions = {
    pangkalPaha: { minY: 0.62, maxY: 0.96, minAbsX: 0.06, maxAbsX: 0.34 },
    lutut: { minY: 0.38, maxY: 0.62, minAbsX: 0.08, maxAbsX: 0.3 },
  } as const;
  const results = Object.fromEntries(Object.keys(regions).map((name) => [name, {
    vertexCount: 0,
    moreThanTwoBones: 0,
    minimumBoneWeight: Number.POSITIVE_INFINITY,
    maximumBoneWeight: 0,
  }])) as Record<keyof typeof regions, {
    vertexCount: number;
    moreThanTwoBones: number;
    minimumBoneWeight: number;
    maximumBoneWeight: number;
  }>;
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const y = positions.getY(vertex);
    const absX = Math.abs(positions.getX(vertex));
    Object.entries(regions).forEach(([name, region]) => {
      if (y < region.minY || y > region.maxY || absX < region.minAbsX || absX > region.maxAbsX) return;
      const result = results[name as keyof typeof regions]!;
      result.vertexCount += 1;
      const boneWeights = new Map<number, number>();
      for (let influence = 0; influence < 4; influence += 1) {
        const weight = weights.getComponent(vertex, influence);
        const boneIndex = indices.getComponent(vertex, influence);
        if (weight > 0) boneWeights.set(boneIndex, (boneWeights.get(boneIndex) ?? 0) + weight);
      }
      if (boneWeights.size > 2) result.moreThanTwoBones += 1;
      boneWeights.forEach((weight) => {
        result.minimumBoneWeight = Math.min(result.minimumBoneWeight, weight);
        result.maximumBoneWeight = Math.max(result.maximumBoneWeight, weight);
      });
    });
  }
  Object.values(results).forEach((result) => {
    if (!Number.isFinite(result.minimumBoneWeight)) result.minimumBoneWeight = 0;
  });
  return results;
};

const measureChibiScaleDiagnostics = (layer: THREE.Group, bones: readonly THREE.Bone[]) => {
  const nonUniformMeshes: string[] = [];
  const negativeScaleObjects: string[] = [];
  layer.traverse((object) => {
    const scale = object.scale;
    if (scale.x < 0 || scale.y < 0 || scale.z < 0) negativeScaleObjects.push(object.name || object.type);
    if (object instanceof THREE.Mesh
      && (Math.abs(scale.x - scale.y) > 1e-6 || Math.abs(scale.y - scale.z) > 1e-6)) {
      nonUniformMeshes.push(object.name || object.type);
    }
  });
  return {
    layerScale: layer.scale.toArray().map((value) => Number(value.toFixed(5))),
    boneScales: bones.map((bone) => ({
      name: bone.name,
      scale: bone.scale.toArray().map((value) => Number(value.toFixed(5))),
    })),
    nonUniformMeshes,
    negativeScaleObjects,
  };
};

type AvatarHairStyle = "swept" | "short" | "long" | "wavy";

type AvatarColors = {
  skin: string;
  hair: string;
  hoodie: string;
  vest: string;
  pants: string;
  shoes: string;
};

type OrganicAvatarPalette = {
  skin: string;
  hair: string;
  jacket: string;
  shirt: string;
  skirt: string;
  shorts: string;
  socks: string;
  shoes: string;
  accent: string;
  metal: string;
};

type AvatarPreset = {
  id: string;
  name: string;
  description: string;
  colors: AvatarColors;
  hairstyle: AvatarHairStyle;
  clothing: "hoodie-vest" | "shirt-suspenders" | "streetwear-crop" | "organic-pastel" | "roblox-slim" | "cewek-halus" | "cowok-kemeja" | "petualang-flanel" | "chibi-halus" | "chibi-kucing";
  accessories: readonly string[];
  perutTerbuka?: boolean;
  organicPalette?: OrganicAvatarPalette;
};

const AVATAR_PRESETS: readonly AvatarPreset[] = [
  {
    id: "anak-cokelat",
    name: "Dery",
    description: "Hoodie krem dengan rambut cokelat",
    colors: { skin: "#f2c9a5", hair: "#7a4a32", hoodie: "#e8c98a", vest: "#3b3f44", pants: "#292c30", shoes: "#c98b4e" },
    hairstyle: "swept",
    clothing: "hoodie-vest",
    accessories: ["kalung", "sarung-tangan-gelap"],
  },
  {
    id: "kacamata-hitam",
    name: "Rhevan",
    description: "Rambut bergelombang, kacamata, dan suspender",
    colors: { skin: "#F3D2BC", hair: "#14110F", hoodie: "#F5F5F5", vest: "#111111", pants: "#1A1A1A", shoes: "#111111" },
    hairstyle: "wavy",
    clothing: "shirt-suspenders",
    accessories: ["kacamata", "permen-karet", "aksesori-rambut"],
  },
  {
    id: "cewek-streetwear",
    name: "Si Streetwear",
    description: "Beanie hitam, lengan merah, dan celana cargo",
    colors: { skin: "#F3D2BC", hair: "#14110F", hoodie: "#151515", vest: "#1A1A1A", pants: "#1A1A1A", shoes: "#D63A2F" },
    hairstyle: "long",
    clothing: "streetwear-crop",
    accessories: ["beanie", "resleting", "sabuk", "saku-cargo"],
    perutTerbuka: true,
  },
  {
    id: "cewek-gaul",
    name: "Si Gaul",
    description: "Rambut panjang dan outfit pastel",
    colors: { skin: "#F3D2BC", hair: "#2B1B17", hoodie: "#C9B6F2", vest: "#F5F5F5", pants: "#F3F3F3", shoes: "#F5F5F5" },
    hairstyle: "long",
    clothing: "organic-pastel",
    accessories: ["jepit-pink", "tas-selempang", "kalung-bintang", "gelang"],
    organicPalette: {
      skin: "#F3D2BC",
      hair: "#2B1B17",
      jacket: "#C9B6F2",
      shirt: "#F5F5F5",
      skirt: "#F3F3F3",
      shorts: "#171717",
      socks: "#F5F5F5",
      shoes: "#F5F5F5",
      accent: "#F4A3C0",
      metal: "#D6D1DA",
    },
  },
  {
    id: "roblox-slim",
    name: "Regan",
    description: "Avatar ramping bergaya Roblox R15",
    colors: { skin: "#F3D2BC", hair: "#171313", hoodie: "#3188D8", vest: "#3188D8", pants: "#315C91", shoes: "#F5F5F5" },
    hairstyle: "short",
    clothing: "roblox-slim",
    accessories: [],
  },
  {
    id: "cewek-halus",
    name: "Queen",
    description: "Kuncir tinggi dan jaket denim",
    colors: {
      skin: CEWEK_HALUS_CONFIG.skinColor,
      hair: CEWEK_HALUS_CONFIG.hairColor,
      hoodie: CEWEK_HALUS_CONFIG.shirtColor,
      vest: CEWEK_HALUS_CONFIG.jacketColor,
      pants: CEWEK_HALUS_CONFIG.pantsColor,
      shoes: CEWEK_HALUS_CONFIG.shoesColor,
    },
    hairstyle: "long",
    clothing: "cewek-halus",
    accessories: [],
  },
  {
    id: "cowok-kemeja",
    name: "Agung",
    description: "Rambut pirang bob, flanel kotak, dan sneakers",
    colors: {
      skin: KEMEJA_CONFIG.colors.skin,
      hair: KEMEJA_CONFIG.colors.hair,
      hoodie: KEMEJA_CONFIG.colors.shirt,
      vest: KEMEJA_CONFIG.colors.flannelRed,
      pants: KEMEJA_CONFIG.colors.shorts,
      shoes: KEMEJA_CONFIG.colors.shoes,
    },
    hairstyle: "short",
    clothing: "cowok-kemeja",
    accessories: ["kacamata-biru"],
  },
  {
    id: "petualang-flanel",
    name: "Si Petualang",
    description: "Tubuh kokoh, rambut pirang, flanel kotak, dan kacamata biru",
    colors: {
      skin: KEMEJA_CONFIG.colors.skin,
      hair: KEMEJA_CONFIG.colors.hair,
      hoodie: KEMEJA_CONFIG.colors.shirt,
      vest: KEMEJA_CONFIG.colors.flannelRed,
      pants: KEMEJA_CONFIG.colors.shorts,
      shoes: KEMEJA_CONFIG.colors.shoes,
    },
    hairstyle: "short",
    clothing: "petualang-flanel",
    accessories: ["kacamata-biru"],
  },
  {
    id: "chibi-halus",
    name: "Si Imut",
    description: "Chibi bulat dengan hoodie pastel dan senyum ceria",
    colors: {
      skin: CHIBI_CONFIG.colors.skin,
      hair: CHIBI_CONFIG.colors.hair,
      hoodie: CHIBI_CONFIG.colors.hoodie,
      vest: CHIBI_CONFIG.colors.hoodieDetail,
      pants: CHIBI_CONFIG.colors.shorts,
      shoes: CHIBI_CONFIG.colors.shoes,
    },
    hairstyle: "short",
    clothing: "chibi-halus",
    accessories: [],
  },
  {
    id: "chibi-kucing",
    name: "Si Kucing",
    description: "Chibi berambut panjang dengan headset telinga kucing",
    colors: {
      skin: KUCING_CONFIG.colors.skin,
      hair: KUCING_CONFIG.colors.hair,
      hoodie: KUCING_CONFIG.colors.shirt,
      vest: KUCING_CONFIG.colors.collar,
      pants: KUCING_CONFIG.colors.pants,
      shoes: KUCING_CONFIG.colors.shoes,
    },
    hairstyle: "long",
    clothing: "chibi-kucing",
    accessories: ["headset-kucing"],
  },
];

const DEFAULT_AVATAR_PRESET = AVATAR_PRESETS[0]!;
const AVATAR_PICKER_PRESETS = AVATAR_PRESETS.filter(
  ({ id }) => !["cewek-streetwear", "cewek-gaul", "petualang-flanel", "chibi-halus", "chibi-kucing"].includes(id),
);
type AvatarPresetId = AvatarPreset["id"];

const AVATAR_STORAGE_KEY = "numatik-world-avatar";

const readSavedAvatar = (): AvatarPresetId => {
  try {
    const savedId = window.localStorage.getItem(AVATAR_STORAGE_KEY);
    const savedPresetEnabled = savedId !== "cewek-halus" || SHOW_TEST_AVATARS;
    return savedPresetEnabled && AVATAR_PICKER_PRESETS.some((preset) => preset.id === savedId)
      ? (savedId as AvatarPresetId)
      : DEFAULT_AVATAR_PRESET.id;
  } catch {
    return DEFAULT_AVATAR_PRESET.id;
  }
};

type DustParticle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
  lifetime: number;
  baseScale: number;
};

const makeQuestion = (quizQuestion?: QuizQuestion): WorldQuestion => {
  if (quizQuestion) {
    return {
      prompt: quizQuestion.question,
      answer: quizQuestion.options[quizQuestion.correctIndex] ?? "",
      options: quizQuestion.options,
    };
  }
  const first = 3 + Math.floor(Math.random() * 18);
  const second = 2 + Math.floor(Math.random() * 12);
  const useAddition = Math.random() > 0.45;
  const answer = useAddition ? first + second : Math.max(first, second) - Math.min(first, second);
  const prompt = useAddition
    ? `${first} + ${second} = ?`
    : `${Math.max(first, second)} − ${Math.min(first, second)} = ?`;
  const choices = new Set([answer]);
  while (choices.size < 4) {
    choices.add(Math.max(0, answer + Math.floor(Math.random() * 13) - 6));
  }
  const options = [...choices].sort(() => Math.random() - 0.5);
  return { prompt, answer: String(answer), options: options.map(String) };
};

const NumatikWorldPage = ({
  treasureQuestions,
  backPath = "/math-game-arena/umum",
}: {
  treasureQuestions?: QuizQuestion[];
  backPath?: string;
} = {}) => {
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement>(null);
  const worldMusicRef = useRef<HTMLAudioElement>(null);
  const radarPlayerRef = useRef<SVGCircleElement>(null);
  const keysRef = useRef(new Set<string>());
  const movementStickRef = useRef({ x: 0, y: 0 });
  const movementStickPointerRef = useRef<number | null>(null);
  const pendingTreasureRef = useRef<Treasure | null>(null);
  const treasureFirstAttemptRef = useRef(true);
  const treasureQuestionIndexRef = useRef(0);
  const treasureQuestionsRef = useRef(treasureQuestions);
  treasureQuestionsRef.current = treasureQuestions;
  const gameCompleteRef = useRef(false);
  const jumpRequestedRef = useRef(false);
  const [selectedIsland, setSelectedIsland] = useState<IslandId>("rainbow");
  const [selectedAvatarId, setSelectedAvatarId] = useState<AvatarPresetId>(readSavedAvatar);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarBuildProgress, setAvatarBuildProgress] = useState(0);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [treasuresFound, setTreasuresFound] = useState(0);
  const [firstTryCorrectCount, setFirstTryCorrectCount] = useState(0);
  const [collectedTreasureIds, setCollectedTreasureIds] = useState<number[]>([]);
  const [gameComplete, setGameComplete] = useState(false);
  const [question, setQuestion] = useState<WorldQuestion | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<string | null>(null);
  const [answerOutcome, setAnswerOutcome] = useState<"correct" | "wrong" | null>(null);
  const [questionResolved, setQuestionResolved] = useState(false);
  const [wrongAnswerCount, setWrongAnswerCount] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [movementStick, setMovementStick] = useState({ x: 0, y: 0 });
  const [debugOptions, setDebugOptions] = useState<DebugPanelOptions>(INITIAL_DEBUG_PANEL_OPTIONS);
  const debugOptionsRef = useRef(debugOptions);
  debugOptionsRef.current = debugOptions;
  const [debugPanelOpen, setDebugPanelOpen] = useState(true);
  const [debugStats, setDebugStats] = useState<DebugAvatarStats>({
    skinnedMeshes: 0,
    meshes: 0,
    drawCalls: 0,
    objects: [],
  });

  const selectAvatar = (presetId: AvatarPresetId) => {
    setSelectedAvatarId(presetId);
    try {
      window.localStorage.setItem(AVATAR_STORAGE_KEY, presetId);
    } catch {
      // Pilihan tetap berlaku untuk sesi ini meski penyimpanan browser tidak tersedia.
    }
    setAvatarPickerOpen(false);
  };

  useEffect(() => {
    let effectDisposed = false;
    if (!gameStarted) return;
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch (error) {
      console.error("NUMATIK WORLD tidak dapat membuat WebGLRenderer:", error);
      host.textContent = "Perangkat ini belum mendukung dunia 3D.";
      return;
    }

    const scene = new THREE.Scene();
    const island = ISLANDS.find(({ id }) => id === selectedIsland) ?? ISLANDS[0]!;
    scene.background = new THREE.Color("#91ddff");
    scene.fog = new THREE.Fog("#91ddff", 100, 235);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 300);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.domElement.className = "world-canvas";
    renderer.domElement.setAttribute("aria-label", "Jelajahi dunia 3D NUMATIK WORLD");
    host.appendChild(renderer.domElement);

    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    const originalShadowMapEnabled = renderer.shadowMap.enabled;
    const debugNormalMaterial = DEBUG_PANEL
      ? new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
      : null;
    if (debugNormalMaterial) resources.add(debugNormalMaterial);
    const makeMaterial = (color: THREE.ColorRepresentation, roughness = 0.8) => {
      const value = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
      resources.add(value);
      return value;
    };
    const mats = {
      grass: makeMaterial(island.palette.grass),
      grassLight: makeMaterial(island.palette.grassLight),
      water: makeMaterial(island.palette.water, 0.36),
      path: makeMaterial(island.palette.path),
      wood: makeMaterial("#bd7951"),
      roof: makeMaterial(island.palette.roof),
      blue: makeMaterial(island.palette.blue),
      yellow: makeMaterial("#ffd858"),
      white: makeMaterial("#fff6dc"),
      skin: makeMaterial(DEFAULT_AVATAR_PRESET.colors.skin, 0.6),
      hair: makeMaterial(DEFAULT_AVATAR_PRESET.colors.hair, 0.6),
      hoodie: makeMaterial(DEFAULT_AVATAR_PRESET.colors.hoodie, 0.6),
      vest: makeMaterial(DEFAULT_AVATAR_PRESET.colors.vest, 0.6),
      pants: makeMaterial(DEFAULT_AVATAR_PRESET.colors.pants, 0.6),
      shoes: makeMaterial(DEFAULT_AVATAR_PRESET.colors.shoes, 0.6),
      shoeSole: makeMaterial("#292722", 0.65),
      glove: makeMaterial("#242629", 0.6),
      pendant: makeMaterial("#d8b15e", 0.6),
      eye: makeMaterial("#293e61"),
      pink: makeMaterial("#ff92c4", 0.2),
      chestWood: makeMaterial("#9f5834"),
      chestGold: makeMaterial("#f6c542", 0.32),
      treasureCoin: makeMaterial("#ffd52e", 0.22),
      villagerSkin: makeMaterial("#f2c39b", 0.7),
      villagerClothes: makeMaterial("#e75d58", 0.75),
      villagerClothesAlt: makeMaterial("#4d81d5", 0.75),
      villagerHair: makeMaterial("#493326", 0.9),
      animalFur: makeMaterial("#d99a58", 0.85),
      animalFurAlt: makeMaterial("#f0e2c6", 0.85),
      trunk: makeMaterial("#a86f4d"),
      leaf: makeMaterial(island.palette.leaf),
      leafLight: makeMaterial(island.palette.leafLight),
    };
    const treasureGlowMaterial = new THREE.MeshBasicMaterial({
      color: "#ffe66d",
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    resources.add(treasureGlowMaterial);
    const treasureGlowGeometry = new THREE.TorusGeometry(1.12, 0.07, 8, 40);
    const treasureOuterGlowGeometry = new THREE.TorusGeometry(1.38, 0.04, 8, 40);
    resources.add(treasureGlowGeometry);
    resources.add(treasureOuterGlowGeometry);
    const addMesh = <T extends THREE.BufferGeometry>(
      geometry: T,
      mat: THREE.Material,
      parent: THREE.Object3D,
      position: THREE.Vector3 | [number, number, number],
      scale?: [number, number, number],
    ) => {
      resources.add(geometry);
      const mesh = new THREE.Mesh(geometry, mat);
      if (position instanceof THREE.Vector3) mesh.position.copy(position);
      else mesh.position.set(...position);
      if (scale) mesh.scale.set(...scale);
      parent.add(mesh);
      return mesh;
    };
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const addBox = (
      parent: THREE.Object3D,
      mat: THREE.Material,
      position: [number, number, number],
      scale: [number, number, number],
    ) => addMesh(boxGeometry, mat, parent, position, scale);

    const hemisphereLight = new THREE.HemisphereLight("#e8fbff", "#83bd63", 2.7);
    scene.add(hemisphereLight);
    const originalHemisphereLightVisible = hemisphereLight.visible;
    const sunlight = new THREE.DirectionalLight("#fff1bf", 3);
    sunlight.position.set(-24, 38, 17);
    scene.add(sunlight);
    const originalDirectionalLightVisible = sunlight.visible;
    scene.add(new THREE.AmbientLight("#ffffff", 0.35));

    addMesh(new THREE.PlaneGeometry(280, 280), mats.water, scene, [0, -1.45, 0]).rotation.x = -Math.PI / 2;
    addMesh(new THREE.CylinderGeometry(70, 74, 3.2, 72), mats.path, scene, [0, -0.5, 0]);
    addMesh(new THREE.CylinderGeometry(67, 68, 0.95, 72), mats.grass, scene, [0, 1.05, 0]);
    addMesh(new THREE.CylinderGeometry(63, 63, 0.14, 72), mats.grassLight, scene, [0, 1.58, 0]);

    const mainPath = addMesh(new THREE.BoxGeometry(8, 0.1, 88), mats.path, scene, [0, 1.68, 9]);
    mainPath.rotation.y = -0.08;
    const crossPath = addMesh(new THREE.BoxGeometry(84, 0.1, 7), mats.path, scene, [0, 1.68, -8]);
    crossPath.rotation.y = -0.08;

    const makeTree = (x: number, z: number, size: number, variant: number) => {
      const tree = new THREE.Group();
      tree.position.set(x, 1.65, z);
      scene.add(tree);
      addBox(tree, mats.trunk, [0, size * 0.72, 0], [size * 0.32, size * 1.45, size * 0.32]);
      addBox(tree, variant % 2 ? mats.leafLight : mats.leaf, [0, size * 1.82, 0], [size * 1.38, size * 0.95, size * 1.38]);
      addBox(tree, variant % 2 ? mats.leaf : mats.leafLight, [0, size * 2.42, 0], [size * 0.9, size * 0.82, size * 0.9]);
      addBox(tree, mats.grassLight, [0, size * 2.92, 0], [size * 0.45, size * 0.45, size * 0.45]);
    };
    [
      [-45, -40, 3.2], [-30, -52, 2.6], [-51, -14, 2.8], [-48, 24, 3],
      [45, -43, 2.8], [52, -8, 3.2], [47, 32, 2.7], [32, 48, 3],
      [-28, 49, 2.6], [-54, 37, 2.8], [18, -52, 2.6], [56, 20, 2.6],
    ].forEach(([x, z, size], index) => makeTree(x!, z!, size!, index));

    const makeHouse = (x: number, z: number, wall: THREE.Material, roof: THREE.Material) => {
      const house = new THREE.Group();
      house.position.set(x, 1.68, z);
      scene.add(house);
      addBox(house, wall, [0, 2, 0], [7, 4, 6]);
      addBox(house, roof, [0, 4.5, 0], [7.8, 1, 6.8]);
      addBox(house, mats.wood, [0, 0.9, 3.08], [1.35, 2.2, 0.14]);
      addBox(house, mats.blue, [-2.15, 2.35, 3.1], [1.1, 1.05, 0.13]);
      addBox(house, mats.blue, [2.15, 2.35, 3.1], [1.1, 1.05, 0.13]);
      addBox(house, mats.white, [0, 3.3, 3.12], [0.2, 1.2, 0.12]);
      addBox(house, mats.white, [0, 3.3, 3.12], [1.2, 0.2, 0.12]);
    };
    makeHouse(-29, -29, mats.yellow, mats.roof);
    makeHouse(31, -34, mats.white, mats.blue);
    makeHouse(30, 24, mats.roof, mats.yellow);

    const arch = new THREE.Group();
    arch.position.set(0, 1.7, 53);
    scene.add(arch);
    addBox(arch, mats.roof, [-5.1, 3.2, 0], [1.15, 6.4, 0.85]);
    addBox(arch, mats.blue, [5.1, 3.2, 0], [1.15, 6.4, 0.85]);
    addBox(arch, mats.yellow, [0, 6.2, 0], [11.4, 1.3, 0.9]);
    addBox(arch, mats.white, [0, 6.18, 0.5], [8.8, 0.38, 0.08]);

    if (island.id === "rainbow") {
      [mats.roof, mats.yellow, mats.blue].forEach((mat, index) => {
        const rainbow = addMesh(new THREE.TorusGeometry(9 - index * 1.25, 0.7, 10, 48, Math.PI), mat, scene, [0, 7 + index * 0.1, -35]);
        rainbow.rotation.z = Math.PI;
      });
    } else if (island.id === "snow") {
      [-1, 1].forEach((side) => {
        addMesh(new THREE.ConeGeometry(5, 13, 7), mats.blue, scene, [side * 29, 8, -39]);
        addMesh(new THREE.ConeGeometry(3.2, 9, 7), mats.white, scene, [side * 29, 15, -39]);
      });
      addMesh(new THREE.SphereGeometry(3.2, 16, 12), mats.white, scene, [0, 4.7, -34]);
      addMesh(new THREE.SphereGeometry(2.2, 16, 12), mats.white, scene, [0, 8.8, -34]);
      addMesh(new THREE.SphereGeometry(0.35, 10, 8), mats.eye, scene, [-0.75, 9, -32]);
      addMesh(new THREE.SphereGeometry(0.35, 10, 8), mats.eye, scene, [0.75, 9, -32]);
    } else if (island.id === "candy") {
      [-1, 1].forEach((side, index) => {
        const lollipop = new THREE.Group();
        lollipop.position.set(side * 32, 1.68, -37 + index * 13);
        scene.add(lollipop);
        addBox(lollipop, mats.wood, [0, 6, 0], [0.7, 12, 0.7]);
        addMesh(new THREE.SphereGeometry(4.5, 20, 16), index ? mats.blue : mats.pink, lollipop, [0, 13, 0]);
        addMesh(new THREE.TorusGeometry(2.8, 0.35, 8, 32), mats.white, lollipop, [0, 13, 3.4]);
      });
    } else if (island.id === "cloud") {
      [-1, 1].forEach((side) => {
        const cloud = new THREE.Group();
        cloud.position.set(side * 34, 1.68, -40);
        scene.add(cloud);
        [[0, 5, 0, 5], [-4, 3.5, 0, 3.6], [4, 3.5, 0, 3.8], [0, 2.5, 2, 3.7]].forEach(([x, y, z, radius]) => {
          addMesh(new THREE.SphereGeometry(radius!, 14, 10), mats.white, cloud, [x!, y!, z!]);
        });
      });
    } else {
      addMesh(new THREE.ConeGeometry(17, 25, 9), mats.wood, scene, [0, 14, -38]);
      addMesh(new THREE.ConeGeometry(7, 10, 9), mats.roof, scene, [0, 27, -38]);
      addMesh(new THREE.TorusGeometry(12, 1.2, 10, 36), mats.roof, scene, [0, 2.4, -38]).rotation.x = Math.PI / 2;
    }

    const inhabitants: IslandInhabitant[] = [];
    const addVillager = (x: number, z: number, clothes: THREE.Material, phase: number) => {
      const group = new THREE.Group();
      group.position.set(x, 1.66, z);
      scene.add(group);
      addMesh(new THREE.CylinderGeometry(0.19, 0.25, 0.62, 8), clothes, group, [0, 0.82, 0]);
      addMesh(new THREE.SphereGeometry(0.24, 12, 10), mats.villagerSkin, group, [0, 1.35, 0]);
      addMesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.53), mats.villagerHair, group, [0, 1.43, -0.015]);
      [-1, 1].forEach((side) => {
        addMesh(new THREE.SphereGeometry(0.025, 6, 6), mats.eye, group, [side * 0.085, 1.37, 0.222]);
        addMesh(new THREE.CylinderGeometry(0.065, 0.075, 0.43, 7), mats.villagerSkin, group, [side * 0.28, 0.84, 0]);
        addMesh(new THREE.CylinderGeometry(0.085, 0.095, 0.48, 7), mats.villagerClothesAlt, group, [side * 0.12, 0.29, 0]);
        addBox(group, mats.shoes, [side * 0.12, 0.055, 0.035], [0.18, 0.1, 0.27]);
      });
      addMesh(new THREE.TorusGeometry(0.075, 0.012, 5, 12), mats.pink, group, [0, 1.31, 0.232]);
      inhabitants.push({ group, homeY: group.position.y, phase, isAnimal: false });
    };
    const addAnimal = (x: number, z: number, fur: THREE.Material, phase: number, size = 1) => {
      const group = new THREE.Group();
      group.position.set(x, 1.66, z);
      group.scale.setScalar(size);
      scene.add(group);
      addMesh(new THREE.SphereGeometry(0.38, 12, 9), fur, group, [0, 0.42, 0], [1.35, 0.9, 0.85]);
      addMesh(new THREE.SphereGeometry(0.27, 12, 10), fur, group, [0, 0.55, 0.36]);
      [-1, 1].forEach((side) => {
        addMesh(new THREE.ConeGeometry(0.09, 0.25, 7), fur, group, [side * 0.16, 0.82, 0.35]);
        addMesh(new THREE.SphereGeometry(0.035, 6, 6), mats.eye, group, [side * 0.1, 0.59, 0.59]);
        [-0.23, 0.23].forEach((legX) => {
          addMesh(new THREE.CylinderGeometry(0.07, 0.055, 0.3, 7), fur, group, [legX, 0.17, side * 0.18]);
        });
      });
      const tail = addMesh(new THREE.ConeGeometry(0.12, 0.38, 7), fur, group, [0, 0.55, -0.42]);
      tail.rotation.x = -Math.PI / 2;
      addMesh(new THREE.SphereGeometry(0.095, 8, 6), mats.villagerSkin, group, [0, 0.43, 0.58]);
      inhabitants.push({ group, homeY: group.position.y, phase, isAnimal: true });
    };
    addVillager(-12, 9, mats.villagerClothes, 0);
    addVillager(14, -17, mats.villagerClothesAlt, 1.2);
    addAnimal(-9, -17, mats.animalFur, 0.6, 1);
    addAnimal(20, 10, mats.animalFurAlt, 1.8, 0.9);
    addAnimal(-25, 2, island.id === "candy" ? mats.pink : mats.animalFur, 2.7, 0.78);

    const avatar = new THREE.Group();
    scene.add(avatar);
    const avatarRig = new THREE.Group();
    // Pangkal rig berada di telapak sehingga perubahan skala tidak mengubah titik tanah.
    avatarRig.scale.setScalar(AVATAR_SCALE);
    avatar.add(avatarRig);
    const textures = new Set<THREE.Texture>();
    const skeletons = new Set<THREE.Skeleton>();
    const makeRoundedGeometry = (width: number, height: number, depth: number, radius: number) => (
      new RoundedBoxGeometry(width, height, depth, 5, radius)
    );
    const torsoGeometry = makeRoundedGeometry(0.76, 0.68, 0.54, 0.16);
    const hoodieGeometry = makeRoundedGeometry(0.8, 0.72, 0.58, 0.17);
    const vestGeometry = makeRoundedGeometry(0.52, 0.6, 0.08, 0.025);
    const vestBackGeometry = makeRoundedGeometry(0.5, 0.58, 0.07, 0.02);
    const sleeveGeometry = makeRoundedGeometry(0.3, 0.34, 0.32, 0.075);
    const forearmSleeveGeometry = makeRoundedGeometry(0.29, 0.35, 0.31, 0.075);
    const armGeometry = makeRoundedGeometry(0.27, 0.33, 0.29, 0.075);
    const forearmGeometry = makeRoundedGeometry(0.26, 0.34, 0.28, 0.07);
    const cuffGeometry = makeRoundedGeometry(0.28, 0.11, 0.3, 0.035);
    const handGeometry = makeRoundedGeometry(0.27, 0.24, 0.3, 0.08);
    const gloveGeometry = makeRoundedGeometry(0.29, 0.17, 0.32, 0.055);
    const legGeometry = makeRoundedGeometry(0.35, 0.48, 0.38, 0.09);
    const kneePadGeometry = makeRoundedGeometry(0.27, 0.19, 0.08, 0.02);
    const bootGeometry = makeRoundedGeometry(0.42, 0.34, 0.58, 0.11);
    const soleGeometry = makeRoundedGeometry(0.44, 0.09, 0.6, 0.027);
    const neckGeometry = makeRoundedGeometry(0.24, 0.18, 0.25, 0.055);
    const headGeometry = makeRoundedGeometry(0.58, 0.56, 0.52, 0.15);
    const earGeometry = makeRoundedGeometry(0.1, 0.18, 0.12, 0.03);
    const hairCapGeometry = makeRoundedGeometry(0.62, 0.2, 0.56, 0.06);
    const hairFringeGeometry = makeRoundedGeometry(0.43, 0.16, 0.18, 0.055);
    const hairLockGeometry = makeRoundedGeometry(0.15, 0.24, 0.17, 0.05);
    const hairSpikeGeometry = makeRoundedGeometry(0.14, 0.22, 0.14, 0.045);
    const hoodGeometry = makeRoundedGeometry(0.48, 0.38, 0.18, 0.05);
    const pocketGeometry = makeRoundedGeometry(0.36, 0.17, 0.045, 0.015);
    const pendantGeometry = makeRoundedGeometry(0.09, 0.12, 0.045, 0.015);
    const faceGeometry = new THREE.PlaneGeometry(0.28, 0.2);
    [
      torsoGeometry,
      hoodieGeometry,
      vestGeometry,
      vestBackGeometry,
      sleeveGeometry,
      forearmSleeveGeometry,
      armGeometry,
      forearmGeometry,
      cuffGeometry,
      handGeometry,
      gloveGeometry,
      legGeometry,
      kneePadGeometry,
      bootGeometry,
      soleGeometry,
      neckGeometry,
      headGeometry,
      earGeometry,
      hairCapGeometry,
      hairFringeGeometry,
      hairLockGeometry,
      hairSpikeGeometry,
      hoodGeometry,
      pocketGeometry,
      pendantGeometry,
      faceGeometry,
    ].forEach((geometry) => resources.add(geometry));

    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = 128;
    faceCanvas.height = 128;
    const faceContext = faceCanvas.getContext("2d");
    if (!faceContext) throw new Error("Canvas 2D tidak tersedia untuk membuat wajah avatar.");
    faceContext.fillStyle = "#161616";
    faceContext.beginPath();
    faceContext.arc(43, 54, 4, 0, Math.PI * 2);
    faceContext.arc(85, 54, 4, 0, Math.PI * 2);
    faceContext.fill();
    faceContext.strokeStyle = "#161616";
    faceContext.lineWidth = 2.5;
    faceContext.lineCap = "round";
    faceContext.beginPath();
    faceContext.moveTo(57, 82);
    faceContext.quadraticCurveTo(64, 88, 71, 82);
    faceContext.stroke();
    const faceTexture = new THREE.CanvasTexture(faceCanvas);
    faceTexture.colorSpace = THREE.SRGBColorSpace;
    textures.add(faceTexture);
    const faceMaterial = new THREE.MeshStandardMaterial({
      map: faceTexture,
      transparent: true,
      roughness: 0.6,
      metalness: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    resources.add(faceMaterial);

    const bodyRig = new THREE.Group();
    bodyRig.position.y = 1;
    avatarRig.add(bodyRig);
    const legacyLayers: THREE.Group[] = [];
    const legacyBody = new THREE.Group();
    bodyRig.add(legacyBody);
    legacyLayers.push(legacyBody);
    addMesh(torsoGeometry, mats.skin, legacyBody, [0, 0, 0]);
    addMesh(hoodieGeometry, mats.hoodie, legacyBody, [0, 0, 0]);
    addMesh(vestGeometry, mats.vest, legacyBody, [0, -0.015, 0.31]);
    addMesh(vestBackGeometry, mats.vest, legacyBody, [0, 0, -0.3]);
    addMesh(pocketGeometry, mats.hoodie, legacyBody, [0, -0.19, 0.355]);
    const hoodPivot = new THREE.Group();
    hoodPivot.position.set(0, 0.43, -0.3);
    legacyBody.add(hoodPivot);
    addMesh(hoodGeometry, mats.hoodie, hoodPivot, [0, 0, 0]);
    addMesh(neckGeometry, mats.skin, legacyBody, [0, 0.47, 0]);
    const necklace = addMesh(cuffGeometry, mats.pendant, legacyBody, [0, 0.29, 0.06], [0.72, 0.14, 0.72]);
    necklace.rotation.x = -0.16;
    const pendantPivot = new THREE.Group();
    pendantPivot.position.set(0, 0.17, 0.16);
    legacyBody.add(pendantPivot);
    addMesh(pendantGeometry, mats.pendant, pendantPivot, [0, 0, 0]);

    const head = new THREE.Group();
    head.position.set(0, 0.72, 0);
    bodyRig.add(head);
    const legacyHead = new THREE.Group();
    head.add(legacyHead);
    legacyLayers.push(legacyHead);
    addMesh(headGeometry, mats.skin, legacyHead, [0, 0, 0]);
    addMesh(faceGeometry, faceMaterial, legacyHead, [0, 0, 0.264]);
    [-1, 1].forEach((side) => {
      addMesh(earGeometry, mats.skin, legacyHead, [side * 0.32, 0, 0]);
    });

    const hairMotion = new THREE.Group();
    const makeHairStyle = (style: AvatarHairStyle) => {
      const group = new THREE.Group();
      group.visible = style === "swept";
      hairMotion.add(group);
      addMesh(hairCapGeometry, mats.hair, group, [0, 0.22, -0.015]);
      if (style === "swept") {
        const fringe = addMesh(hairFringeGeometry, mats.hair, group, [0.035, 0.205, 0.205]);
        fringe.rotation.z = -0.16;
        [-1, 1].forEach((side) => {
          const lock = addMesh(hairLockGeometry, mats.hair, group, [side * 0.23, -0.015, 0.17]);
          lock.rotation.z = side * -0.12;
        });
        [
          [-0.22, 0.29, -0.08, -0.35],
          [-0.08, 0.32, -0.02, -0.12],
          [0.08, 0.31, -0.02, 0.18],
          [0.22, 0.27, -0.08, 0.38],
        ].forEach(([x, y, z, angle]) => {
          const spike = addMesh(hairSpikeGeometry, mats.hair, group, [x!, y!, z!]);
          spike.rotation.z = angle!;
        });
      } else if (style === "short") {
        [-1, 1].forEach((side) => {
          addMesh(hairLockGeometry, mats.hair, group, [side * 0.23, -0.015, 0.17]);
        });
        [-0.16, 0, 0.16].forEach((x, index) => {
          const spike = addMesh(hairSpikeGeometry, mats.hair, group, [x, 0.3, -0.04]);
          spike.rotation.z = (index - 1) * 0.2;
        });
      } else {
        const fringe = addMesh(hairFringeGeometry, mats.hair, group, [-0.025, 0.2, 0.205]);
        fringe.rotation.z = 0.14;
        [-1, 1].forEach((side) => {
          const lock = addMesh(hairLockGeometry, mats.hair, group, [side * 0.24, -0.12, -0.02]);
          lock.scale.y = 2;
        });
        [-0.12, 0.08].forEach((x) => {
          const spike = addMesh(hairSpikeGeometry, mats.hair, group, [x, 0.3, -0.03]);
          spike.rotation.z = x * -1.5;
        });
      }
    };
    (["swept", "short", "long"] as const).forEach(makeHairStyle);
    legacyHead.add(hairMotion);

    type LimbRig = { pivot: THREE.Group; elbow: THREE.Group; hand: THREE.Group };
    const makeArm = (side: number): LimbRig => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.47, 0.28, 0);
      bodyRig.add(shoulder);
      const legacyUpper = new THREE.Group();
      shoulder.add(legacyUpper);
      legacyLayers.push(legacyUpper);
      addMesh(armGeometry, mats.skin, legacyUpper, [0, -0.16, 0]);
      addMesh(sleeveGeometry, mats.hoodie, legacyUpper, [0, -0.08, 0], [1.06, 1, 1.06]);
      const elbow = new THREE.Group();
      elbow.position.y = -0.25;
      shoulder.add(elbow);
      const legacyForearm = new THREE.Group();
      elbow.add(legacyForearm);
      legacyLayers.push(legacyForearm);
      addMesh(forearmGeometry, mats.skin, legacyForearm, [0, -0.15, 0]);
      addMesh(forearmSleeveGeometry, mats.hoodie, legacyForearm, [0, -0.14, 0], [1.04, 1, 1.04]);
      addMesh(cuffGeometry, mats.hoodie, legacyForearm, [0, -0.2, 0]);
      const hand = new THREE.Group();
      hand.position.y = -0.22;
      elbow.add(hand);
      const legacyHand = new THREE.Group();
      hand.add(legacyHand);
      legacyLayers.push(legacyHand);
      addMesh(handGeometry, mats.skin, legacyHand, [0, -0.045, 0]);
      addMesh(gloveGeometry, mats.glove, legacyHand, [0, -0.13, 0.015]);
      addMesh(cuffGeometry, mats.glove, legacyHand, [0, 0.055, 0]);
      return { pivot: shoulder, elbow, hand };
    };
    const makeLeg = (side: number): { pivot: THREE.Group; baseY: number } => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.2, 0.64, 0);
      avatarRig.add(hip);
      const legacyLeg = new THREE.Group();
      hip.add(legacyLeg);
      legacyLayers.push(legacyLeg);
      addMesh(legGeometry, mats.pants, legacyLeg, [0, -0.22, 0]);
      addMesh(kneePadGeometry, mats.glove, legacyLeg, [0, -0.28, 0.2]);
      const boot = new THREE.Group();
      boot.position.set(0, -0.445, 0.08);
      legacyLeg.add(boot);
      addMesh(bootGeometry, mats.shoes, boot, [0, 0.02, 0.03]);
      addMesh(soleGeometry, mats.shoeSole, boot, [0, -0.15, 0.02]);
      return { pivot: hip, baseY: hip.position.y };
    };
    const leftArm = makeArm(-1);
    const rightArm = makeArm(1);
    const leftLeg = makeLeg(-1);
    const rightLeg = makeLeg(1);
    const newAvatarLayers: THREE.Group[] = [];
    const blackPreset = AVATAR_PRESETS.find((preset) => preset.id === "kacamata-hitam")!;
    const streetwearPreset = AVATAR_PRESETS.find((preset) => preset.id === "cewek-streetwear")!;
    const gaulPreset = AVATAR_PRESETS.find((preset) => preset.id === "cewek-gaul")!;
    let blackAvatarBuilt = false;
    let streetwearBuilt = false;
    let gaulBuilt = false;
    let blackHairMotion: THREE.Group | null = null;
    let streetwearHairMotion: THREE.Group | null = null;
    let gumMesh: THREE.Mesh | null = null;
    let gaulTorsoMotion: THREE.Group | null = null;
    let gaulHeadLayer: THREE.Group | null = null;
    let gaulHairMotion: THREE.Group | null = null;
    let gaulSkirtMotion: THREE.Group | null = null;
    let gaulBagMotion: THREE.Group | null = null;
    let gaulLeftKnee: THREE.Group | null = null;
    let gaulRightKnee: THREE.Group | null = null;
    let gaulLeftKneeAngle = 0.08;
    let gaulRightKneeAngle = 0.08;
    const gaulShoulders: Array<{ layer: THREE.Group; side: number }> = [];
    const gaulForearms: THREE.Group[] = [];
    const gaulHairSegments: Array<{ pivot: THREE.Group; delay: number; phase: number }> = [];
    const gaulEyeLids: THREE.Mesh[] = [];
    let gaulNextBlinkAt = 0;
    let gaulBlinkStartedAt = -1;
    type CewekHalusBoneName =
      | "pelvis" | "spine1" | "spine2" | "neck" | "head" | "ponytail"
      | "leftClavicle" | "leftUpperArm" | "leftForearm" | "leftHand" | "leftThigh" | "leftShin" | "leftFoot" | "leftToe"
      | "rightClavicle" | "rightUpperArm" | "rightForearm" | "rightHand" | "rightThigh" | "rightShin" | "rightFoot" | "rightToe";
    const cewekHalusLayers: THREE.Group[] = [];
    let cewekHalusBuilt = false;
    let cewekHalusLayer: THREE.Group | null = null;
    let cewekHalusSkeleton: THREE.Skeleton | null = null;
    let cewekHalusBones: Partial<Record<CewekHalusBoneName, THREE.Bone>> = {};
    let cewekHalusBodyMesh: THREE.SkinnedMesh | null = null;
    let cewekHalusFaceMaterial: THREE.MeshStandardMaterial | null = null;
    let cewekHalusOpenFaceTexture: THREE.CanvasTexture | null = null;
    let cewekHalusClosedFaceTexture: THREE.CanvasTexture | null = null;
    let cewekHalusNextBlinkAt = 0;
    let cewekHalusBlinkStartedAt = -1;
    let cewekHalusRunBlend = 0;
    let cewekHalusBreath = 0;
    const cewekHalusBindQuaternions = new Map<string, THREE.Quaternion>();
    const cewekHalusPoseAngles = new Map<string, number>();
    const cewekHalusLayerQuaternion = new THREE.Quaternion();
    const cewekHalusParentQuaternion = new THREE.Quaternion();
    const cewekHalusParentInverse = new THREE.Quaternion();
    const cewekHalusBodyAxisWorld = new THREE.Vector3();
    const cewekHalusParentAxis = new THREE.Vector3();
    const cewekHalusDeltaQuaternion = new THREE.Quaternion();
    const cewekHalusSagittalAxis = new THREE.Vector3(1, 0, 0);
    const cewekHalusAbductionAxis = new THREE.Vector3(0, 0, 1);
    const setCewekHalusBodyRotation = (
      name: string,
      bone: THREE.Bone,
      bodyAxis: THREE.Vector3,
      targetAngle: number,
      alpha: number,
    ) => {
      if (!cewekHalusLayer || !bone.parent) return;
      const currentAngle = cewekHalusPoseAngles.get(name) ?? 0;
      const angle = THREE.MathUtils.lerp(currentAngle, targetAngle, alpha);
      cewekHalusPoseAngles.set(name, angle);
      cewekHalusLayer.getWorldQuaternion(cewekHalusLayerQuaternion);
      bone.parent.getWorldQuaternion(cewekHalusParentQuaternion);
      cewekHalusParentInverse.copy(cewekHalusParentQuaternion).invert();
      cewekHalusBodyAxisWorld.copy(bodyAxis).applyQuaternion(cewekHalusLayerQuaternion);
      cewekHalusParentAxis.copy(cewekHalusBodyAxisWorld).applyQuaternion(cewekHalusParentInverse).normalize();
      cewekHalusDeltaQuaternion.setFromAxisAngle(cewekHalusParentAxis, angle);
      const bindQuaternion = cewekHalusBindQuaternions.get(name);
      if (bindQuaternion) bone.quaternion.copy(cewekHalusDeltaQuaternion).multiply(bindQuaternion);
    };
    type RobloxSlimArm = { upper: THREE.Group; elbow: THREE.Group; wrist: THREE.Group; limb: LimbRig; side: number };
    type RobloxSlimLeg = { upper: THREE.Group; knee: THREE.Group; ankle: THREE.Group; limb: typeof leftLeg; side: number };
    const robloxSlimLayers: THREE.Group[] = [];
    const robloxSlimArms: RobloxSlimArm[] = [];
    const robloxSlimLegs: RobloxSlimLeg[] = [];
    let robloxSlimBuilt = false;
    let robloxSlimTorso: THREE.Group | null = null;
    let robloxSlimUpperTorso: THREE.Group | null = null;
    let robloxSlimHead: THREE.Group | null = null;
    type KemejaArm = {
      shoulder: THREE.Group;
      upper: THREE.Group;
      elbow: THREE.Group;
      wrist: THREE.Group;
      hand: THREE.Group;
      side: number;
    };
    type KemejaLeg = {
      hip: THREE.Group;
      upper: THREE.Group;
      knee: THREE.Group;
      ankle: THREE.Group;
      side: number;
    };
    const kemejaLayers: THREE.Group[] = [];
    const kemejaArms: KemejaArm[] = [];
    const kemejaLegs: KemejaLeg[] = [];
    const petualangFlanelLayers: THREE.Group[] = [];
    const petualangFlanelPosePairs: Array<{ source: THREE.Object3D; target: THREE.Object3D }> = [];
    let kemejaBuilt = false;
    let kemejaRoot: THREE.Group | null = null;
    let petualangFlanelRoot: THREE.Group | null = null;
    let kemejaTorsoMotion: THREE.Group | null = null;
    let kemejaHead: THREE.Group | null = null;
    let kemejaHair: THREE.Group | null = null;
    let kemejaFloorOffset = 0;
    let kemejaBreath = 0;
    let kemejaWeightShift = 0;
    let kemejaRunBlend = 0;
    type ChibiBoneName = typeof CEWEK_HALUS_BONE_NAMES[number];
    const chibiLayers: THREE.Group[] = [];
    let chibiBuilt = false;
    let chibiLayer: THREE.Group | null = null;
    let chibiSkeleton: THREE.Skeleton | null = null;
    let chibiBones: Partial<Record<ChibiBoneName, THREE.Bone>> = {};
    let chibiBodyMesh: THREE.SkinnedMesh | null = null;
    let chibiHairRoot: THREE.Group | null = null;
    let chibiDebugSkeletonHelper: THREE.SkeletonHelper | null = null;
    let chibiFaceMaterial: THREE.MeshStandardMaterial | null = null;
    let chibiFaceTextures: THREE.CanvasTexture[] = [];
    let chibiFaceIndex = 0;
    let chibiNextBlinkAt = 0;
    let chibiBlinkUntil = 0;
    let chibiNextHappyAt = 0;
    let chibiHappyUntil = 0;
    let chibiRunBlend = 0;
    let chibiBreath = 0;
    let chibiFloorOffset = 0;
    let chibiElapsedMs = 0;
    const kucingLayers: THREE.Group[] = [];
    let kucingBuilt = false;
    let kucingLayer: THREE.Group | null = null;
    let kucingSkeleton: THREE.Skeleton | null = null;
    let kucingBones: Partial<Record<ChibiBoneName, THREE.Bone>> = {};
    let kucingHairBones: THREE.Bone[] = [];
    let kucingEarPivots: THREE.Group[] = [];
    let kucingBodyMesh: THREE.SkinnedMesh | null = null;
    let kucingFaceMaterial: THREE.MeshStandardMaterial | null = null;
    let kucingFaceTextures: THREE.CanvasTexture[] = [];
    let kucingFaceIndex = 0;
    let kucingNextBlinkAt = 0;
    let kucingBlinkUntil = 0;
    let kucingNextHappyAt = 0;
    let kucingHappyUntil = 0;
    let kucingRunBlend = 0;
    let kucingBreath = 0;
    let kucingFloorOffset = 0;
    let kucingElapsedMs = 0;

    const buildBlackAvatar = () => {
      if (blackAvatarBuilt) return;
      const blackMats = {
        skin: makeMaterial(blackPreset.colors.skin, 0.6),
        hair: makeMaterial(blackPreset.colors.hair, 0.6),
        shirt: makeMaterial(blackPreset.colors.hoodie, 0.72),
        black: makeMaterial(blackPreset.colors.vest, 0.58),
        pants: makeMaterial(blackPreset.colors.pants, 0.72),
        shoes: makeMaterial(blackPreset.colors.shoes, 0.65),
        sole: makeMaterial("#292722", 0.65),
        glove: makeMaterial("#F5F5F5", 0.68),
        gum: makeMaterial("#F4A3C0", 0.28),
      };

      const torsoLayer = new THREE.Group();
      bodyRig.add(torsoLayer);
      newAvatarLayers.push(torsoLayer);
      addMesh(torsoGeometry, blackMats.skin, torsoLayer, [0, 0, 0]);
      addMesh(hoodieGeometry, blackMats.shirt, torsoLayer, [0, 0, 0]);
      addMesh(neckGeometry, blackMats.skin, torsoLayer, [0, 0.47, 0]);
      const collarLeft = addMesh(hairFringeGeometry, blackMats.shirt, torsoLayer, [-0.105, 0.29, 0.27], [0.55, 0.8, 0.72]);
      const collarRight = addMesh(hairFringeGeometry, blackMats.shirt, torsoLayer, [0.105, 0.29, 0.27], [0.55, 0.8, 0.72]);
      collarLeft.rotation.z = -0.5;
      collarRight.rotation.z = 0.5;
      addMesh(cuffGeometry, blackMats.black, torsoLayer, [0, 0.17, 0.32], [0.38, 0.7, 0.4]);
      addMesh(pendantGeometry, blackMats.black, torsoLayer, [0, -0.01, 0.34], [0.75, 3.5, 0.8]);
      [-1, 1].forEach((side) => {
        addMesh(cuffGeometry, blackMats.black, torsoLayer, [side * 0.2, 0.02, 0.31], [0.44, 3.5, 0.2]);
        addMesh(cuffGeometry, blackMats.black, torsoLayer, [side * 0.2, 0.02, -0.31], [0.44, 3.5, 0.2]);
      });

      const headLayer = new THREE.Group();
      head.add(headLayer);
      newAvatarLayers.push(headLayer);
      addMesh(headGeometry, blackMats.skin, headLayer, [0, 0, 0]);

      const faceCanvas = document.createElement("canvas");
      faceCanvas.width = 128;
      faceCanvas.height = 128;
      const faceContext = faceCanvas.getContext("2d");
      if (!faceContext) throw new Error("Canvas 2D tidak tersedia untuk wajah avatar.");
      faceContext.fillStyle = "#C2182B";
      faceContext.beginPath();
      faceContext.moveTo(32, 50);
      faceContext.lineTo(53, 56);
      faceContext.lineTo(43, 62);
      faceContext.closePath();
      faceContext.fill();
      faceContext.beginPath();
      faceContext.moveTo(75, 56);
      faceContext.lineTo(96, 50);
      faceContext.lineTo(85, 62);
      faceContext.closePath();
      faceContext.fill();
      faceContext.fillStyle = "#171313";
      faceContext.beginPath();
      faceContext.arc(44, 56, 2.5, 0, Math.PI * 2);
      faceContext.arc(84, 56, 2.5, 0, Math.PI * 2);
      faceContext.fill();
      faceContext.strokeStyle = "#171313";
      faceContext.lineWidth = 2;
      faceContext.beginPath();
      faceContext.moveTo(34, 39);
      faceContext.quadraticCurveTo(43, 35, 52, 39);
      faceContext.moveTo(76, 39);
      faceContext.quadraticCurveTo(85, 35, 94, 39);
      faceContext.stroke();
      faceContext.lineWidth = 5;
      faceContext.lineCap = "round";
      faceContext.beginPath();
      faceContext.moveTo(31, 47);
      faceContext.lineTo(53, 49);
      faceContext.moveTo(75, 49);
      faceContext.lineTo(97, 47);
      faceContext.stroke();
      faceContext.strokeStyle = "#36221E";
      faceContext.lineWidth = 2;
      faceContext.beginPath();
      faceContext.moveTo(59, 83);
      faceContext.quadraticCurveTo(64, 86, 69, 83);
      faceContext.stroke();
      const blackFaceTexture = new THREE.CanvasTexture(faceCanvas);
      blackFaceTexture.colorSpace = THREE.SRGBColorSpace;
      textures.add(blackFaceTexture);
      const blackFaceMaterial = new THREE.MeshStandardMaterial({
        map: blackFaceTexture,
        transparent: true,
        roughness: 0.6,
        metalness: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      resources.add(blackFaceMaterial);
      addMesh(faceGeometry, blackFaceMaterial, headLayer, [0, 0, 0.264]);
      [-1, 1].forEach((side) => {
        addMesh(earGeometry, blackMats.skin, headLayer, [side * 0.32, 0, 0]);
      });

      const blackHair = new THREE.Group();
      blackHairMotion = blackHair;
      headLayer.add(blackHair);
      addMesh(hairCapGeometry, blackMats.hair, blackHair, [0, 0.22, -0.015]);
      [-1, 0, 1].forEach((side) => {
        const fringe = addMesh(hairFringeGeometry, blackMats.hair, blackHair, [side * 0.11, 0.17, 0.22], [0.82, 1.15, 1]);
        fringe.rotation.z = side * -0.17;
      });
      [-1, 1].forEach((side) => {
        const lock = addMesh(hairLockGeometry, blackMats.hair, blackHair, [side * 0.25, 0.015, 0.14], [1.1, 1.35, 1]);
        lock.rotation.z = side * -0.14;
      });
      [-0.24, -0.08, 0.08, 0.24].forEach((x, index) => {
        const wave = addMesh(hairSpikeGeometry, blackMats.hair, blackHair, [x, 0.29 + (index % 2) * 0.025, -0.035], [1.35, 1.2, 1.25]);
        wave.rotation.z = (index - 1.5) * 0.17;
      });
      const hairAccessory = addMesh(hairSpikeGeometry, blackMats.black, blackHair, [-0.22, 0.14, 0.235], [0.62, 0.38, 0.5]);
      hairAccessory.rotation.z = -0.4;

      const glassesGeometry = makeRoundedGeometry(0.25, 0.045, 0.035, 0.018);
      const glassesLayer = new THREE.Group();
      headLayer.add(glassesLayer);
      newAvatarLayers.push(glassesLayer);
      [-1, 1].forEach((side) => {
        const centerX = side * 0.09;
        addMesh(glassesGeometry, blackMats.black, glassesLayer, [centerX, 0.075, 0.3]);
        addMesh(glassesGeometry, blackMats.black, glassesLayer, [centerX, -0.025, 0.3]);
        const outerBar = addMesh(glassesGeometry, blackMats.black, glassesLayer, [centerX + side * 0.1, 0.025, 0.3], [0.2, 1, 1]);
        const innerBar = addMesh(glassesGeometry, blackMats.black, glassesLayer, [centerX - side * 0.1, 0.025, 0.3], [0.2, 1, 1]);
        outerBar.rotation.z = Math.PI / 2;
        innerBar.rotation.z = Math.PI / 2;
      });
      addMesh(glassesGeometry, blackMats.black, glassesLayer, [0, 0.025, 0.3], [0.42, 0.8, 1]);
      const gumGeometry = new THREE.SphereGeometry(0.055, 12, 10);
      gumMesh = addMesh(gumGeometry, blackMats.gum, headLayer, [0, -0.075, 0.315]);

      const buildSleevedArm = (limb: LimbRig) => {
        const upper = new THREE.Group();
        limb.pivot.add(upper);
        newAvatarLayers.push(upper);
        addMesh(armGeometry, blackMats.skin, upper, [0, -0.16, 0]);
        addMesh(sleeveGeometry, blackMats.shirt, upper, [0, -0.08, 0], [1.1, 1.08, 1.1]);
        const forearm = new THREE.Group();
        limb.elbow.add(forearm);
        newAvatarLayers.push(forearm);
        addMesh(forearmGeometry, blackMats.skin, forearm, [0, -0.15, 0]);
        addMesh(forearmSleeveGeometry, blackMats.shirt, forearm, [0, -0.14, 0], [1.08, 1.08, 1.08]);
        const hand = new THREE.Group();
        limb.hand.add(hand);
        newAvatarLayers.push(hand);
        addMesh(handGeometry, blackMats.skin, hand, [0, -0.045, 0]);
        addMesh(gloveGeometry, blackMats.glove, hand, [0, -0.13, 0.015], [1.02, 1, 1.02]);
      };
      buildSleevedArm(leftArm);
      buildSleevedArm(rightArm);

      const buildBlackLeg = (leg: typeof leftLeg) => {
        const pantsLayer = new THREE.Group();
        leg.pivot.add(pantsLayer);
        newAvatarLayers.push(pantsLayer);
        addMesh(legGeometry, blackMats.pants, pantsLayer, [0, -0.22, 0], [1.24, 1.08, 1.12]);
        const boot = new THREE.Group();
        boot.position.set(0, -0.445, 0.08);
        pantsLayer.add(boot);
        addMesh(bootGeometry, blackMats.shoes, boot, [0, 0.02, 0.03]);
        addMesh(soleGeometry, blackMats.sole, boot, [0, -0.15, 0.02]);
      };
      buildBlackLeg(leftLeg);
      buildBlackLeg(rightLeg);
      blackAvatarBuilt = true;
    };

    const streetwearLayers: THREE.Group[] = [];
    const buildStreetwearAvatar = () => {
      if (streetwearBuilt) return;
      const streetMats = {
        skin: makeMaterial(streetwearPreset.colors.skin, 0.62),
        hair: makeMaterial(streetwearPreset.colors.hair, 0.7),
        beanie: makeMaterial("#1A1A1A", 0.88),
        top: makeMaterial(streetwearPreset.colors.hoodie, 0.74),
        black: makeMaterial(streetwearPreset.colors.vest, 0.72),
        red: makeMaterial("#D63A2F", 0.7),
        silver: makeMaterial("#C7C7C7", 0.38),
        pants: makeMaterial(streetwearPreset.colors.pants, 0.82),
        shoes: makeMaterial(streetwearPreset.colors.shoes, 0.55),
        sole: makeMaterial("#F2F2F2", 0.76),
        glove: makeMaterial("#111111", 0.76),
      };

      const torsoLayer = new THREE.Group();
      bodyRig.add(torsoLayer);
      streetwearLayers.push(torsoLayer);
      addMesh(torsoGeometry, streetMats.skin, torsoLayer, [0, 0, 0]);
      addMesh(hoodieGeometry, streetMats.top, torsoLayer, [0, 0.13, 0], [1, 0.56, 1]);
      addMesh(neckGeometry, streetMats.skin, torsoLayer, [0, 0.47, 0]);
      addMesh(cuffGeometry, streetMats.top, torsoLayer, [0, 0.31, 0.11], [1.55, 1, 1.15]);
      addMesh(cuffGeometry, streetMats.silver, torsoLayer, [0, 0.12, 0.324], [0.1, 2.2, 0.12]);
      addMesh(pendantGeometry, streetMats.silver, torsoLayer, [0, 0.25, 0.343], [0.35, 0.4, 0.35]);
      addMesh(cuffGeometry, streetMats.black, torsoLayer, [0, -0.27, 0.31], [2.4, 0.9, 0.22]);
      addMesh(pendantGeometry, streetMats.silver, torsoLayer, [0, -0.27, 0.348], [0.9, 0.8, 0.3]);
      if (!streetwearPreset.perutTerbuka) {
        addMesh(pocketGeometry, streetMats.black, torsoLayer, [0, -0.13, 0.302], [1.7, 0.72, 0.3]);
      }

      const headLayer = new THREE.Group();
      head.add(headLayer);
      streetwearLayers.push(headLayer);
      addMesh(headGeometry, streetMats.skin, headLayer, [0, 0, 0]);
      const streetFaceCanvas = document.createElement("canvas");
      streetFaceCanvas.width = 128;
      streetFaceCanvas.height = 128;
      const streetFaceContext = streetFaceCanvas.getContext("2d");
      if (!streetFaceContext) throw new Error("Canvas 2D tidak tersedia untuk wajah avatar.");
      streetFaceContext.fillStyle = "#111111";
      streetFaceContext.beginPath();
      streetFaceContext.arc(43, 55, 3.2, 0, Math.PI * 2);
      streetFaceContext.arc(85, 55, 3.2, 0, Math.PI * 2);
      streetFaceContext.fill();
      streetFaceContext.fillStyle = "#FFFFFF";
      streetFaceContext.beginPath();
      streetFaceContext.arc(44, 54, 1, 0, Math.PI * 2);
      streetFaceContext.arc(86, 54, 1, 0, Math.PI * 2);
      streetFaceContext.fill();
      streetFaceContext.strokeStyle = "#171313";
      streetFaceContext.lineWidth = 1.5;
      streetFaceContext.lineCap = "round";
      streetFaceContext.beginPath();
      streetFaceContext.moveTo(36, 48);
      streetFaceContext.lineTo(42, 44);
      streetFaceContext.moveTo(48, 47);
      streetFaceContext.lineTo(53, 49);
      streetFaceContext.moveTo(75, 49);
      streetFaceContext.lineTo(80, 47);
      streetFaceContext.moveTo(86, 44);
      streetFaceContext.lineTo(92, 48);
      streetFaceContext.moveTo(60, 83);
      streetFaceContext.lineTo(68, 83);
      streetFaceContext.stroke();
      const streetFaceTexture = new THREE.CanvasTexture(streetFaceCanvas);
      streetFaceTexture.colorSpace = THREE.SRGBColorSpace;
      textures.add(streetFaceTexture);
      const streetFaceMaterial = new THREE.MeshStandardMaterial({
        map: streetFaceTexture,
        transparent: true,
        roughness: 0.7,
        metalness: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      resources.add(streetFaceMaterial);
      addMesh(faceGeometry, streetFaceMaterial, headLayer, [0, 0, 0.264]);
      [-1, 1].forEach((side) => {
        addMesh(earGeometry, streetMats.skin, headLayer, [side * 0.32, 0, 0]);
      });

      streetwearHairMotion = new THREE.Group();
      headLayer.add(streetwearHairMotion);
      [-0.18, -0.06, 0.06, 0.18].forEach((x) => {
        addMesh(hairLockGeometry, streetMats.hair, streetwearHairMotion!, [x, -0.35, -0.37], [1.05, 3.8, 0.65]);
      });
      [-1, 1].forEach((side) => {
        const frontLock = addMesh(hairLockGeometry, streetMats.hair, streetwearHairMotion!, [side * 0.19, -0.2, 0.35], [0.8, 2.6, 0.65]);
        frontLock.rotation.z = side * -0.045;
      });
      [-1, 1].forEach((side) => {
        const bang = addMesh(hairFringeGeometry, streetMats.hair, streetwearHairMotion!, [side * 0.12, 0.04, 0.22], [0.72, 0.65, 0.78]);
        bang.rotation.z = side * -0.2;
      });
      addMesh(hairCapGeometry, streetMats.beanie, headLayer, [0, 0.22, -0.015]);
      const beanieBrimGeometry = new THREE.TorusGeometry(0.255, 0.026, 6, 20);
      const beanieBrim = addMesh(beanieBrimGeometry, streetMats.beanie, headLayer, [0, 0.13, 0]);
      beanieBrim.rotation.x = Math.PI / 2;

      const addStreetSleeve = (limb: LimbRig) => {
        const upper = new THREE.Group();
        limb.pivot.add(upper);
        streetwearLayers.push(upper);
        addMesh(armGeometry, streetMats.skin, upper, [0, -0.16, 0]);
        addMesh(sleeveGeometry, streetMats.red, upper, [0, -0.08, 0], [1.22, 1.18, 1.2]);
        addMesh(cuffGeometry, streetMats.black, upper, [0, -0.08, 0.18], [0.52, 1.25, 0.22]);
        addMesh(cuffGeometry, streetMats.black, upper, [0, -0.19, 0], [1.25, 0.36, 1.15]);
        const forearm = new THREE.Group();
        limb.elbow.add(forearm);
        streetwearLayers.push(forearm);
        addMesh(forearmGeometry, streetMats.skin, forearm, [0, -0.15, 0]);
        addMesh(forearmSleeveGeometry, streetMats.red, forearm, [0, -0.14, 0], [1.24, 1.18, 1.2]);
        addMesh(cuffGeometry, streetMats.black, forearm, [0, -0.14, 0.18], [0.5, 1.22, 0.22]);
        addMesh(cuffGeometry, streetMats.black, forearm, [0, -0.24, 0], [1.2, 0.36, 1.12]);
        const hand = new THREE.Group();
        limb.hand.add(hand);
        streetwearLayers.push(hand);
        addMesh(handGeometry, streetMats.skin, hand, [0, -0.045, 0]);
        addMesh(gloveGeometry, streetMats.glove, hand, [0, -0.13, 0.015]);
        addMesh(cuffGeometry, streetMats.black, hand, [0, 0.055, 0], [1, 0.7, 1]);
      };
      addStreetSleeve(leftArm);
      addStreetSleeve(rightArm);

      const addCargoLeg = (leg: typeof leftLeg) => {
        const cargoLayer = new THREE.Group();
        leg.pivot.add(cargoLayer);
        streetwearLayers.push(cargoLayer);
        addMesh(legGeometry, streetMats.pants, cargoLayer, [0, -0.22, 0], [1.08, 1.08, 1.06]);
        const outside = Math.sign(leg.pivot.position.x);
        addMesh(cuffGeometry, streetMats.red, cargoLayer, [outside * 0.155, -0.22, 0], [0.22, 3.5, 0.15]);
        addMesh(pocketGeometry, streetMats.pants, cargoLayer, [outside * 0.065, -0.2, 0.205], [0.52, 1, 0.65]);
        const sneaker = new THREE.Group();
        sneaker.position.set(0, -0.445, 0.08);
        cargoLayer.add(sneaker);
        addMesh(bootGeometry, streetMats.shoes, sneaker, [0, 0.02, 0.03]);
        addMesh(soleGeometry, streetMats.sole, sneaker, [0, -0.13, 0.02], [1.04, 1.45, 1.04]);
      };
      addCargoLeg(leftLeg);
      addCargoLeg(rightLeg);
      streetwearBuilt = true;
    };

    const organicLayers: THREE.Group[] = [];
    const buildOrganicAvatar = () => {
      if (gaulBuilt) return;
      const palette = gaulPreset.organicPalette!;
      const organicMats = {
        skin: makeMaterial(palette.skin, 0.56),
        hair: makeMaterial(palette.hair, 0.62),
        jacket: makeMaterial(palette.jacket, 0.68),
        shirt: makeMaterial(palette.shirt, 0.78),
        skirt: makeMaterial(palette.skirt, 0.8),
        shorts: makeMaterial(palette.shorts, 0.72),
        socks: makeMaterial(palette.socks, 0.8),
        shoes: makeMaterial(palette.shoes, 0.58),
        accent: makeMaterial(palette.accent, 0.56),
        metal: makeMaterial(palette.metal, 0.34),
        eyelid: makeMaterial(palette.skin, 0.56),
      };
      const makeLathe = (profile: Array<[number, number]>, segments: number) => new THREE.LatheGeometry(
        profile.map(([radius, height]) => new THREE.Vector2(radius, height)),
        segments,
      );
      const smoothSphere = new THREE.SphereGeometry(1, 16, 12);
      const torsoGeometry = makeLathe([
        [0.1, -0.36], [0.17, -0.31], [0.19, -0.22], [0.145, -0.08],
        [0.15, 0.06], [0.205, 0.19], [0.22, 0.27], [0.15, 0.35],
      ], 24);
      const shirtGeometry = makeLathe([
        [0.105, -0.34], [0.175, -0.29], [0.195, -0.2], [0.153, -0.07],
        [0.16, 0.07], [0.215, 0.2], [0.23, 0.27], [0.16, 0.34],
      ], 20);
      const jacketGeometry = makeLathe([
        [0.16, 0.015], [0.17, 0.07], [0.22, 0.2], [0.235, 0.27], [0.17, 0.34],
      ], 20);
      const upperArmGeometry = makeLathe([[0.075, -0.25], [0.095, -0.19], [0.09, -0.1], [0.11, -0.035], [0.085, 0]], 12);
      const forearmGeometry = makeLathe([[0.045, -0.22], [0.055, -0.17], [0.073, -0.09], [0.075, -0.035], [0.07, 0]], 12);
      const upperSleeveGeometry = makeLathe([[0.083, -0.25], [0.105, -0.19], [0.1, -0.1], [0.12, -0.035], [0.092, 0]], 12);
      const forearmSleeveGeometry = makeLathe([[0.052, -0.22], [0.063, -0.17], [0.082, -0.09], [0.084, -0.035], [0.079, 0]], 12);
      const thighGeometry = makeLathe([[0.055, -0.25], [0.075, -0.2], [0.09, -0.1], [0.1, -0.035], [0.095, 0]], 12);
      const calfGeometry = makeLathe([[0.045, -0.22], [0.052, -0.17], [0.073, -0.08], [0.078, -0.025], [0.07, 0]], 12);
      const sockGeometry = makeLathe([[0.053, -0.21], [0.06, -0.17], [0.081, -0.08], [0.086, -0.02], [0.083, 0]], 12);
      const hairSegmentGeometry = makeLathe([[0.008, -0.12], [0.028, -0.09], [0.035, -0.035], [0.032, 0.035], [0.016, 0.1]], 10);
      const faceGeometry = new THREE.PlaneGeometry(0.32, 0.32);
      const eyeLidGeometry = new THREE.PlaneGeometry(0.09, 0.055);
      const collarGeometry = new THREE.TorusGeometry(0.11, 0.014, 6, 20);
      const necklaceGeometry = new THREE.TorusGeometry(0.075, 0.004, 5, 20);
      const sockStripeGeometry = new THREE.TorusGeometry(0.081, 0.009, 5, 16);
      const shoeGeometry = new THREE.SphereGeometry(1, 14, 10);
      const shoeSoleGeometry = new RoundedBoxGeometry(0.22, 0.045, 0.32, 3, 0.016);
      const bagGeometry = new THREE.SphereGeometry(1, 12, 10);

      const torsoLayer = new THREE.Group();
      bodyRig.add(torsoLayer);
      organicLayers.push(torsoLayer);
      gaulTorsoMotion = torsoLayer;
      addMesh(torsoGeometry, organicMats.skin, torsoLayer, [0, 0, 0]);
      addMesh(shirtGeometry, organicMats.shirt, torsoLayer, [0, 0, 0]);
      addMesh(jacketGeometry, organicMats.jacket, torsoLayer, [0, 0, 0]);
      const shirtPanelGeometry = new THREE.PlaneGeometry(0.12, 0.28);
      addMesh(shirtPanelGeometry, organicMats.shirt, torsoLayer, [0, 0.17, 0.235]);
      const zipperGeometry = new THREE.CylinderGeometry(0.004, 0.004, 0.26, 6);
      addMesh(zipperGeometry, organicMats.metal, torsoLayer, [-0.074, 0.16, 0.237]);
      addMesh(zipperGeometry, organicMats.metal, torsoLayer, [0.074, 0.16, 0.237]);
      addMesh(smoothSphere, organicMats.metal, torsoLayer, [0.074, 0.27, 0.245], [0.012, 0.018, 0.008]);
      const jacketCollar = addMesh(collarGeometry, organicMats.shirt, torsoLayer, [0, 0.34, 0]);
      jacketCollar.rotation.x = Math.PI / 2;

      const shortsGeometry = new THREE.CylinderGeometry(0.16, 0.19, 0.12, 16, 1, false);
      addMesh(shortsGeometry, organicMats.shorts, torsoLayer, [0, -0.27, 0]);
      const skirtMotion = new THREE.Group();
      skirtMotion.position.y = -0.255;
      torsoLayer.add(skirtMotion);
      gaulSkirtMotion = skirtMotion;
      const skirtGeometry = new THREE.CylinderGeometry(0.18, 0.29, 0.2, 24, 1, false);
      const skirtMaterial = makeMaterial(palette.skirt, 0.8);
      skirtMaterial.flatShading = true;
      skirtMaterial.needsUpdate = true;
      addMesh(skirtGeometry, skirtMaterial, skirtMotion, [0, 0, 0]);

      const necklace = addMesh(necklaceGeometry, organicMats.metal, torsoLayer, [0, 0.39, 0.08]);
      necklace.rotation.x = Math.PI / 2;
      const starShape = new THREE.Shape();
      for (let point = 0; point < 10; point += 1) {
        const angle = -Math.PI / 2 + point * Math.PI / 5;
        const radius = point % 2 === 0 ? 0.025 : 0.012;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (point === 0) starShape.moveTo(x, y);
        else starShape.lineTo(x, y);
      }
      starShape.closePath();
      addMesh(new THREE.ShapeGeometry(starShape), organicMats.accent, torsoLayer, [0, 0.31, 0.16]);

      const bagMotion = new THREE.Group();
      torsoLayer.add(bagMotion);
      gaulBagMotion = bagMotion;
      const bagPath = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.12, 0.33, 0.19),
        new THREE.Vector3(0.02, 0.21, 0.23),
        new THREE.Vector3(0.2, 0.02, 0.22),
        new THREE.Vector3(0.29, -0.16, 0.17),
      ]);
      const bagStrapGeometry = new THREE.TubeGeometry(bagPath, 16, 0.009, 5, false);
      addMesh(bagStrapGeometry, organicMats.accent, bagMotion, [0, 0, 0]);
      addMesh(bagGeometry, organicMats.accent, bagMotion, [0.29, -0.17, 0.18], [0.075, 0.095, 0.045]);

      const headLayer = new THREE.Group();
      head.add(headLayer);
      organicLayers.push(headLayer);
      gaulHeadLayer = headLayer;
      addMesh(smoothSphere, organicMats.skin, headLayer, [0, 0, 0], [0.22, 0.28, 0.18]);
      const chinGeometry = new THREE.ConeGeometry(0.15, 0.16, 16, 1);
      const chin = addMesh(chinGeometry, organicMats.skin, headLayer, [0, -0.19, 0.035]);
      chin.rotation.z = Math.PI;
      [-1, 1].forEach((side) => {
        addMesh(smoothSphere, organicMats.skin, headLayer, [side * 0.22, -0.005, 0], [0.045, 0.065, 0.045]);
      });
      addMesh(smoothSphere, organicMats.skin, headLayer, [0, -0.015, 0.194], [0.021, 0.032, 0.026]);

      const faceCanvas = document.createElement("canvas");
      faceCanvas.width = 512;
      faceCanvas.height = 512;
      const faceContext = faceCanvas.getContext("2d");
      if (!faceContext) throw new Error("Canvas 2D tidak tersedia untuk wajah avatar.");
      faceContext.clearRect(0, 0, 512, 512);
      [125, 387].forEach((x) => {
        const blush = faceContext.createRadialGradient(x, 310, 3, x, 310, 48);
        blush.addColorStop(0, "rgba(244,163,192,0.34)");
        blush.addColorStop(1, "rgba(244,163,192,0)");
        faceContext.fillStyle = blush;
        faceContext.beginPath();
        faceContext.arc(x, 310, 48, 0, Math.PI * 2);
        faceContext.fill();
      });
      [165, 347].forEach((x) => {
        faceContext.fillStyle = "#FFFDFC";
        faceContext.beginPath();
        faceContext.ellipse(x, 218, 42, 30, 0, 0, Math.PI * 2);
        faceContext.fill();
        const iris = faceContext.createRadialGradient(x - 5, 211, 2, x, 220, 24);
        iris.addColorStop(0, "#8B6049");
        iris.addColorStop(0.68, "#4E3025");
        iris.addColorStop(1, "#2B1B17");
        faceContext.fillStyle = iris;
        faceContext.beginPath();
        faceContext.arc(x, 220, 22, 0, Math.PI * 2);
        faceContext.fill();
        faceContext.fillStyle = "#171313";
        faceContext.beginPath();
        faceContext.arc(x, 221, 12, 0, Math.PI * 2);
        faceContext.fill();
        faceContext.fillStyle = "#FFFFFF";
        faceContext.beginPath();
        faceContext.arc(x - 7, 211, 6, 0, Math.PI * 2);
        faceContext.arc(x + 7, 228, 2.7, 0, Math.PI * 2);
        faceContext.fill();
        faceContext.strokeStyle = "#2B1B17";
        faceContext.lineWidth = 12;
        faceContext.lineCap = "round";
        faceContext.beginPath();
        faceContext.ellipse(x, 218, 43, 31, 0, Math.PI + 0.12, Math.PI * 2 - 0.12);
        faceContext.stroke();
        faceContext.lineWidth = 4;
        for (let lash = -1; lash <= 1; lash += 1) {
          faceContext.beginPath();
          faceContext.moveTo(x + lash * 24, 191);
          faceContext.lineTo(x + lash * 27, 181);
          faceContext.stroke();
        }
      });
      faceContext.strokeStyle = "#51372C";
      faceContext.lineWidth = 5;
      faceContext.lineCap = "round";
      faceContext.beginPath();
      faceContext.quadraticCurveTo(145, 169, 190, 179);
      faceContext.moveTo(322, 179);
      faceContext.quadraticCurveTo(367, 169, 390, 181);
      faceContext.stroke();
      const noseShade = faceContext.createLinearGradient(249, 235, 267, 300);
      noseShade.addColorStop(0, "rgba(114,72,56,0)");
      noseShade.addColorStop(1, "rgba(114,72,56,0.18)");
      faceContext.fillStyle = noseShade;
      faceContext.beginPath();
      faceContext.ellipse(256, 275, 16, 38, 0, 0, Math.PI * 2);
      faceContext.fill();
      faceContext.fillStyle = "#D97991";
      faceContext.beginPath();
      faceContext.ellipse(256, 359, 26, 10, 0, 0, Math.PI * 2);
      faceContext.fill();
      faceContext.strokeStyle = "#A84F69";
      faceContext.lineWidth = 3;
      faceContext.beginPath();
      faceContext.moveTo(228, 356);
      faceContext.quadraticCurveTo(256, 370, 284, 356);
      faceContext.stroke();
      faceContext.fillStyle = "rgba(255,255,255,0.85)";
      faceContext.beginPath();
      faceContext.ellipse(249, 352, 8, 2.5, 0, 0, Math.PI * 2);
      faceContext.fill();
      const faceTexture = new THREE.CanvasTexture(faceCanvas);
      faceTexture.colorSpace = THREE.SRGBColorSpace;
      textures.add(faceTexture);
      const faceMaterial = new THREE.MeshStandardMaterial({
        map: faceTexture,
        transparent: true,
        roughness: 0.58,
        metalness: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      resources.add(faceMaterial);
      addMesh(faceGeometry, faceMaterial, headLayer, [0, 0, 0.17]);
      const eyelidMaterial = makeMaterial(palette.skin, 0.56);
      [-1, 1].forEach((side) => {
        const eyelid = addMesh(eyeLidGeometry, eyelidMaterial, headLayer, [side * 0.057, 0.024, 0.185]);
        eyelid.scale.y = 0.001;
        gaulEyeLids.push(eyelid);
      });

      const hairMotion = new THREE.Group();
      headLayer.add(hairMotion);
      gaulHairMotion = hairMotion;
      const addHairChain = (side: number, rootY: number, rootZ: number, segmentCount: number, delay: number) => {
        let parent = hairMotion;
        for (let segment = 0; segment < segmentCount; segment += 1) {
          const pivot = new THREE.Group();
          if (segment === 0) pivot.position.set(side * 0.13, rootY, rootZ);
          else pivot.position.set(side * 0.018, -0.22, 0);
          parent.add(pivot);
          addMesh(hairSegmentGeometry, organicMats.hair, pivot, [0, -0.1, 0]);
          gaulHairSegments.push({ pivot, delay: delay + segment * 0.28, phase: side * 0.35 });
          parent = pivot;
        }
      };
      addHairChain(-1, 0.12, -0.29, 4, 0.1);
      addHairChain(1, 0.12, -0.29, 4, 0.35);
      addHairChain(-1, 0.17, 0.205, 2, 0.18);
      addHairChain(1, 0.17, 0.205, 2, 0.42);
      const hairClipGeometry = new THREE.SphereGeometry(1, 10, 8);
      addMesh(hairClipGeometry, organicMats.accent, headLayer, [-0.18, 0.105, 0.19], [0.035, 0.015, 0.012]);

      const beanieGeometry = new THREE.SphereGeometry(1, 16, 10);
      addMesh(beanieGeometry, organicMats.hair, headLayer, [0, 0.19, -0.015], [0.235, 0.125, 0.19]);

      const shoulderJointGeometry = new THREE.SphereGeometry(1, 12, 8);
      const upperLegJointGeometry = new THREE.SphereGeometry(1, 12, 8);
      const kneeJointGeometry = new THREE.SphereGeometry(1, 12, 8);
      const addOrganicArm = (limb: LimbRig, side: number) => {
        const upper = new THREE.Group();
        limb.pivot.add(upper);
        organicLayers.push(upper);
        gaulShoulders.push({ layer: upper, side });
        addMesh(shoulderJointGeometry, organicMats.skin, upper, [-side * 0.12, 0.015, 0], [0.14, 0.11, 0.13]);
        addMesh(upperArmGeometry, organicMats.skin, upper, [0, 0, 0]);
        addMesh(upperSleeveGeometry, organicMats.jacket, upper, [0, 0, 0]);
        const forearm = new THREE.Group();
        limb.elbow.add(forearm);
        organicLayers.push(forearm);
        gaulForearms.push(forearm);
        addMesh(shoulderJointGeometry, organicMats.skin, forearm, [0, 0, 0], [0.078, 0.078, 0.078]);
        addMesh(forearmGeometry, organicMats.skin, forearm, [0, 0, 0]);
        addMesh(forearmSleeveGeometry, organicMats.jacket, forearm, [0, 0, 0]);
        const handLayer = new THREE.Group();
        limb.hand.add(handLayer);
        organicLayers.push(handLayer);
        const handShape = new THREE.Shape();
        handShape.moveTo(-0.04, -0.075);
        handShape.quadraticCurveTo(-0.065, -0.03, -0.055, 0.015);
        handShape.lineTo(-0.064, 0.07);
        handShape.quadraticCurveTo(-0.062, 0.095, -0.046, 0.075);
        handShape.lineTo(-0.035, 0.035);
        handShape.lineTo(-0.022, 0.098);
        handShape.quadraticCurveTo(-0.013, 0.119, 0, 0.096);
        handShape.lineTo(0.005, 0.04);
        handShape.lineTo(0.018, 0.105);
        handShape.quadraticCurveTo(0.03, 0.123, 0.039, 0.096);
        handShape.lineTo(0.037, 0.035);
        handShape.lineTo(0.05, 0.087);
        handShape.quadraticCurveTo(0.066, 0.102, 0.07, 0.072);
        handShape.lineTo(0.06, -0.04);
        handShape.quadraticCurveTo(0.055, -0.082, 0.025, -0.09);
        handShape.closePath();
        const handGeometry = new THREE.ExtrudeGeometry(handShape, {
          depth: 0.035,
          bevelEnabled: true,
          bevelSegments: 2,
          steps: 1,
          bevelSize: 0.006,
          bevelThickness: 0.006,
        });
        addMesh(handGeometry, organicMats.skin, handLayer, [0, -0.03, 0.015]);
      };
      addOrganicArm(leftArm, -1);
      addOrganicArm(rightArm, 1);

      const gaulKnees: THREE.Group[] = [];
      const addOrganicLeg = (leg: typeof leftLeg) => {
        const thigh = new THREE.Group();
        leg.pivot.add(thigh);
        organicLayers.push(thigh);
        addMesh(upperLegJointGeometry, organicMats.skin, thigh, [0, -0.015, 0], [0.105, 0.105, 0.095]);
        addMesh(thighGeometry, organicMats.skin, thigh, [0, 0, 0]);
        const knee = new THREE.Group();
        knee.position.y = -0.25;
        thigh.add(knee);
        organicLayers.push(knee);
        gaulKnees.push(knee);
        addMesh(kneeJointGeometry, organicMats.skin, knee, [0, 0, 0], [0.075, 0.075, 0.07]);
        addMesh(calfGeometry, organicMats.skin, knee, [0, 0, 0]);
        addMesh(sockGeometry, organicMats.socks, knee, [0, 0, 0]);
        const stripeGeometry = new THREE.TorusGeometry(0.081, 0.008, 5, 12);
        const stripe = addMesh(stripeGeometry, organicMats.accent, knee, [0, -0.015, 0]);
        stripe.rotation.x = Math.PI / 2;
        addMesh(shoeGeometry, organicMats.shoes, knee, [0, -0.3, 0.065], [0.115, 0.065, 0.17]);
        addMesh(shoeSoleGeometry, organicMats.shirt, knee, [0, -0.3625, 0.065]);
      };
      addOrganicLeg(leftLeg);
      addOrganicLeg(rightLeg);
      gaulLeftKnee = gaulKnees[0] ?? null;
      gaulRightKnee = gaulKnees[1] ?? null;
      gaulNextBlinkAt = performance.now() + 3000 + Math.random() * 2000;
      gaulBuilt = true;
    };

    const buildRobloxSlimAvatar = () => {
      if (robloxSlimBuilt) return;
      const preset = AVATAR_PRESETS.find(({ id }) => id === "roblox-slim")!;
      const slimMats = {
        skin: makeMaterial(preset.colors.skin, 0.84),
        hair: makeMaterial(preset.colors.hair, 0.9),
        shirt: makeMaterial(preset.colors.hoodie, 0.86),
        denim: makeMaterial(preset.colors.pants, 0.88),
        shoes: makeMaterial(preset.colors.shoes, 0.72),
        sole: makeMaterial("#d8dce2", 0.9),
      };
      const rounded = (size: readonly [number, number, number], segments = 2) => (
        new RoundedBoxGeometry(...size, segments, Math.min(...size) * ROBLOX_SLIM_CONFIG.bevelRatio)
      );
      const slimUpperArmSize = ROBLOX_SLIM_CONFIG.armReference.upper.map((size, axis) => (
        axis === 1 ? size : size * ROBLOX_SLIM_CONFIG.armThicknessScale
      )) as unknown as readonly [number, number, number];
      const slimForearmSize = ROBLOX_SLIM_CONFIG.armReference.forearm.map((size, axis) => (
        axis === 1 ? size : size * ROBLOX_SLIM_CONFIG.armThicknessScale
      )) as unknown as readonly [number, number, number];
      const partGeometry = {
        head: rounded(ROBLOX_SLIM_CONFIG.parts.head),
        upperTorso: rounded(ROBLOX_SLIM_CONFIG.parts.upperTorso),
        lowerTorso: rounded(ROBLOX_SLIM_CONFIG.parts.lowerTorso),
        upperArm: rounded(slimUpperArmSize),
        forearm: rounded(slimForearmSize),
        hand: rounded(ROBLOX_SLIM_CONFIG.parts.hand),
        thigh: rounded(ROBLOX_SLIM_CONFIG.parts.thigh),
        calf: rounded(ROBLOX_SLIM_CONFIG.parts.calf),
        foot: rounded(ROBLOX_SLIM_CONFIG.parts.foot),
        neck: rounded([0.16, 0.2, 0.15], 1),
        hairCap: rounded([0.56, 0.16, 0.47], 1),
        hairFringe: rounded([0.38, 0.1, 0.13], 1),
        hairLock: rounded([0.12, 0.16, 0.13], 1),
        sole: rounded([0.16, 0.025, 0.26], 1),
      };
      const jointGeometry = new THREE.SphereGeometry(1, 6, 4);

      // Torso dan kepala tetap menumpang rig umum; seluruh detail visual berada di layer baru.
      const torso = new THREE.Group();
      bodyRig.add(torso);
      robloxSlimLayers.push(torso);
      robloxSlimTorso = torso;
      addMesh(partGeometry.lowerTorso, slimMats.denim, torso, [0, -0.2, 0]);
      const upperTorso = new THREE.Group();
      upperTorso.position.y = 0.1;
      torso.add(upperTorso);
      robloxSlimUpperTorso = upperTorso;
      addMesh(partGeometry.upperTorso, slimMats.shirt, upperTorso, [0, 0.1, 0]);

      const headLayer = new THREE.Group();
      head.add(headLayer);
      robloxSlimLayers.push(headLayer);
      robloxSlimHead = headLayer;
      addMesh(partGeometry.head, slimMats.skin, headLayer, [0, 0, 0]);
      addMesh(partGeometry.neck, slimMats.skin, headLayer, [0, -0.34, 0]);

      const faceCanvas = document.createElement("canvas");
      faceCanvas.width = 128;
      faceCanvas.height = 128;
      const faceContext = faceCanvas.getContext("2d");
      if (!faceContext) throw new Error("Canvas 2D tidak tersedia untuk wajah avatar.");
      faceContext.fillStyle = "#171313";
      faceContext.beginPath();
      faceContext.arc(43, 54, 4, 0, Math.PI * 2);
      faceContext.arc(85, 54, 4, 0, Math.PI * 2);
      faceContext.fill();
      faceContext.strokeStyle = "#171313";
      faceContext.lineWidth = 3;
      faceContext.lineCap = "round";
      faceContext.beginPath();
      faceContext.moveTo(55, 81);
      faceContext.quadraticCurveTo(64, 89, 73, 81);
      faceContext.stroke();
      const faceTexture = new THREE.CanvasTexture(faceCanvas);
      faceTexture.colorSpace = THREE.SRGBColorSpace;
      textures.add(faceTexture);
      const faceMaterial = new THREE.MeshStandardMaterial({
        map: faceTexture,
        transparent: true,
        roughness: 0.82,
        metalness: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      resources.add(faceMaterial);
      addMesh(new THREE.PlaneGeometry(0.32, 0.22), faceMaterial, headLayer, [0, 0, 0.232]);
      addMesh(partGeometry.hairCap, slimMats.hair, headLayer, [0, 0.19, -0.015]);
      [-1, 0, 1].forEach((side) => {
        const bang = addMesh(partGeometry.hairFringe, slimMats.hair, headLayer, [side * 0.11, 0.12, 0.2]);
        bang.rotation.z = side * -0.08;
      });
      [-1, 1].forEach((side) => {
        addMesh(partGeometry.hairLock, slimMats.hair, headLayer, [side * 0.205, 0.01, 0.12]);
      });

      const addArm = (limb: LimbRig, side: number) => {
        const upper = new THREE.Group();
        upper.position.x = -side * 0.26;
        upper.rotation.z = side * 0.12;
        limb.pivot.add(upper);
        robloxSlimLayers.push(upper);
        addMesh(partGeometry.upperArm, slimMats.shirt, upper, [0, -0.15, 0]);
        const elbow = new THREE.Group();
        elbow.position.y = -0.29;
        upper.add(elbow);
        addMesh(jointGeometry, slimMats.skin, elbow, [0, 0, 0], [0.057, 0.057, 0.057]);
        addMesh(partGeometry.forearm, slimMats.shirt, elbow, [0, -0.12, 0]);
        const wrist = new THREE.Group();
        wrist.position.y = -0.23;
        elbow.add(wrist);
        addMesh(jointGeometry, slimMats.skin, wrist, [0, 0, 0], [0.047, 0.047, 0.047]);
        addMesh(partGeometry.hand, slimMats.skin, wrist, [0, -0.035, 0.008]);
        robloxSlimArms.push({ upper, elbow, wrist, limb, side });
      };
      addArm(leftArm, -1);
      addArm(rightArm, 1);

      const addLeg = (limb: typeof leftLeg, side: number) => {
        const upper = new THREE.Group();
        limb.pivot.add(upper);
        robloxSlimLayers.push(upper);
        addMesh(partGeometry.thigh, slimMats.denim, upper, [0, -0.15, 0]);
        const knee = new THREE.Group();
        knee.position.y = -0.3;
        upper.add(knee);
        addMesh(jointGeometry, slimMats.denim, knee, [0, 0, 0], [0.068, 0.068, 0.068]);
        addMesh(partGeometry.calf, slimMats.denim, knee, [0, -0.15, 0]);
        const ankle = new THREE.Group();
        ankle.position.y = -0.29;
        knee.add(ankle);
        addMesh(jointGeometry, slimMats.skin, ankle, [0, 0, 0], [0.055, 0.055, 0.055]);
        addMesh(partGeometry.foot, slimMats.shoes, ankle, [0, 0, 0.035]);
        addMesh(partGeometry.sole, slimMats.sole, ankle, [0, -0.037, 0.035]);
        robloxSlimLegs.push({ upper, knee, ankle, limb, side });
      };
      addLeg(leftLeg, -1);
      addLeg(rightLeg, 1);
      robloxSlimBuilt = true;
    };

    const buildKemejaAvatar = () => {
      if (kemejaBuilt) return;
      const buildStartedAt = performance.now();
      const palette = KEMEJA_CONFIG.colors;
      const rounded = (size: readonly [number, number, number], segments = 1) => (
        new RoundedBoxGeometry(...size, segments, Math.min(...size) * KEMEJA_CONFIG.bevelRatio)
      );
      const makePlaidTexture = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 2D tidak tersedia untuk tekstur kemeja flanel.");
        context.fillStyle = palette.flannelRed;
        context.fillRect(0, 0, 256, 256);
        for (let offset = 0; offset < 256; offset += 64) {
          context.fillStyle = palette.flannelBlack;
          context.fillRect(offset + 17, 0, 15, 256);
          context.fillRect(0, offset + 17, 256, 15);
          context.fillStyle = palette.flannelWhite;
          context.fillRect(offset + 8, 0, 4, 256);
          context.fillRect(0, offset + 8, 256, 4);
          context.fillRect(offset + 45, 0, 3, 256);
          context.fillRect(0, offset + 45, 256, 3);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 1.5);
        textures.add(texture);
        return texture;
      };
      const plaidMaterial = new THREE.MeshStandardMaterial({
        map: makePlaidTexture(),
        roughness: 0.72,
        metalness: 0,
      });
      resources.add(plaidMaterial);
      const materials = {
        skin: makeMaterial(palette.skin, 0.62),
        warmSkin: makeMaterial(palette.warmSkin, 0.66),
        hair: makeMaterial(palette.hair, 0.5),
        hairShadow: makeMaterial(palette.hairShadow, 0.62),
        shirt: makeMaterial(palette.shirt, 0.82),
        flannelWhite: makeMaterial(palette.flannelWhite, 0.76),
        denim: makeMaterial(palette.shorts, 0.8),
        denimDetail: makeMaterial(palette.denimDetail, 0.78),
        socks: makeMaterial(palette.socks, 0.78),
        shoes: makeMaterial(palette.shoes, 0.68),
        sole: makeMaterial(palette.sole, 0.76),
        glasses: makeMaterial(palette.glasses, 0.48),
        glassesHighlight: makeMaterial(palette.glassesHighlight, 0.34),
        lenses: new THREE.MeshStandardMaterial({
          color: palette.lenses,
          roughness: 0.28,
          metalness: 0.08,
          transparent: true,
          opacity: 0.88,
        }),
        white: makeMaterial("#FFFFFF", 0.34),
        button: makeMaterial(palette.button, 0.38),
      };
      resources.add(materials.lenses);
      const root = new THREE.Group();
      root.name = "cowok-kemeja-layer";
      avatarRig.add(root);
      kemejaLayers.push(root);
      kemejaRoot = root;
      const addKemejaMesh = (
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        parent: THREE.Object3D,
        position: [number, number, number],
        section: string,
        scale?: [number, number, number],
      ) => {
        const mesh = addMesh(geometry, material, parent, position, scale);
        mesh.userData.kemejaSection = section;
        return mesh;
      };
      const makeRoundedMesh = (
        parent: THREE.Object3D,
        material: THREE.Material,
        size: readonly [number, number, number],
        position: [number, number, number],
        section: string,
        segments = 1,
      ) => addKemejaMesh(rounded(size, segments), material, parent, position, section);
      const torsoMotion = new THREE.Group();
      torsoMotion.position.y = KEMEJA_CONFIG.torsoY;
      root.add(torsoMotion);
      kemejaTorsoMotion = torsoMotion;
      makeRoundedMesh(torsoMotion, materials.denim, KEMEJA_CONFIG.lowerTorso, [0, -0.2, 0], "celana", KEMEJA_CONFIG.pelvisSegments);
      makeRoundedMesh(torsoMotion, materials.shirt, KEMEJA_CONFIG.upperTorso, [0, 0.035, 0], "kaus", KEMEJA_CONFIG.torsoSegments);

      const flannelBack = makeRoundedMesh(
        torsoMotion,
        plaidMaterial,
        [KEMEJA_CONFIG.upperTorso[0] - 0.02, KEMEJA_CONFIG.upperTorso[1] - 0.01, 0.055],
        [0, 0.025, -0.225],
        "kemeja",
      );
      flannelBack.material.side = THREE.DoubleSide;
      [-1, 1].forEach((side) => {
        makeRoundedMesh(torsoMotion, plaidMaterial, [0.29, 0.47, 0.08], [side * 0.17, 0.025, 0.245], "kemeja");
        const pocket = addKemejaMesh(new THREE.PlaneGeometry(0.14, 0.12), plaidMaterial, torsoMotion, [side * 0.23, 0.13, 0.27], "detail pakaian");
        pocket.rotation.z = side * -0.025;
        const pocketFlap = addKemejaMesh(new THREE.PlaneGeometry(0.14, 0.025), materials.flannelWhite, torsoMotion, [side * 0.23, 0.18, 0.281], "detail pakaian");
        pocketFlap.rotation.z = side * -0.025;
        [-0.08, -0.16, -0.24].forEach((y) => {
          const button = new THREE.SphereGeometry(0.018, 4, 3);
          addKemejaMesh(button, materials.button, torsoMotion, [side * 0.018, y, 0.278], "detail pakaian");
        });
        const shortsHem = makeRoundedMesh(torsoMotion, materials.denimDetail, [0.35, 0.035, 0.37], [side * 0.195, -0.405, 0], "celana");
        shortsHem.rotation.z = side * 0.02;
        const shortsPocket = addKemejaMesh(new THREE.PlaneGeometry(0.15, 0.11), materials.denimDetail, torsoMotion, [side * 0.22, -0.19, 0.263], "detail pakaian");
        shortsPocket.rotation.z = side * 0.04;
      });
      [-1, 1].forEach((side) => {
        const collar = makeRoundedMesh(torsoMotion, plaidMaterial, [0.2, 0.13, 0.045], [side * 0.105, 0.285, 0.255], "kerah");
        collar.rotation.z = side * 0.42;
        const vEdge = addKemejaMesh(new THREE.PlaneGeometry(0.035, 0.2), materials.shirt, torsoMotion, [side * 0.045, 0.25, 0.265], "kaus");
        vEdge.rotation.z = side * 0.36;
      });
      makeRoundedMesh(torsoMotion, materials.skin, [0.2, 0.14, 0.2], [0, 0.315, 0], "kulit");

      const headPivot = new THREE.Group();
      headPivot.position.set(0, KEMEJA_CONFIG.headPivotY, 0);
      torsoMotion.add(headPivot);
      kemejaHead = headPivot;
      makeRoundedMesh(headPivot, materials.skin, KEMEJA_CONFIG.head, [0, 0, 0], "kepala", KEMEJA_CONFIG.headSegments);
      const faceCanvas = document.createElement("canvas");
      faceCanvas.width = 512;
      faceCanvas.height = 512;
      const faceContext = faceCanvas.getContext("2d");
      if (!faceContext) throw new Error("Canvas 2D tidak tersedia untuk wajah Si Kemeja.");
      faceContext.clearRect(0, 0, 512, 512);
      faceContext.strokeStyle = palette.brow;
      faceContext.lineWidth = 16;
      faceContext.lineCap = "round";
      faceContext.beginPath();
      faceContext.moveTo(112, 166);
      faceContext.quadraticCurveTo(155, 140, 199, 157);
      faceContext.moveTo(313, 157);
      faceContext.quadraticCurveTo(356, 140, 400, 166);
      faceContext.stroke();
      faceContext.strokeStyle = palette.glasses;
      faceContext.lineWidth = 17;
      faceContext.beginPath();
      faceContext.moveTo(209, 353);
      faceContext.quadraticCurveTo(255, 394, 306, 346);
      faceContext.stroke();
      faceContext.strokeStyle = palette.lip;
      faceContext.lineWidth = 8;
      faceContext.beginPath();
      faceContext.moveTo(223, 365);
      faceContext.quadraticCurveTo(255, 380, 291, 362);
      faceContext.stroke();
      faceContext.fillStyle = "rgba(201,143,107,0.5)";
      [-1, 1].forEach((side) => {
        faceContext.beginPath();
        faceContext.arc(110 + (side > 0 ? 292 : 0), 294, 10, 0, Math.PI * 2);
        faceContext.fill();
      });
      if (!KEMEJA_CONFIG.glasses) {
        [-1, 1].forEach((side) => {
          const x = side < 0 ? 155 : 357;
          faceContext.fillStyle = "#FFFFFF";
          faceContext.beginPath();
          faceContext.ellipse(x, 218, 37, 46, 0, 0, Math.PI * 2);
          faceContext.fill();
          faceContext.fillStyle = "#513321";
          faceContext.beginPath();
          faceContext.ellipse(x, 224, 22, 32, 0, 0, Math.PI * 2);
          faceContext.fill();
          faceContext.fillStyle = "#FFFFFF";
          faceContext.beginPath();
          faceContext.arc(x - 9, 211, 9, 0, Math.PI * 2);
          faceContext.arc(x + 8, 231, 4, 0, Math.PI * 2);
          faceContext.fill();
          faceContext.strokeStyle = "#30211C";
          faceContext.lineWidth = 8;
          faceContext.beginPath();
          faceContext.moveTo(x - 36, 185);
          faceContext.quadraticCurveTo(x, 154, x + 36, 185);
          faceContext.stroke();
        });
      } else {
        const frames = [-1, 1].map((side) => {
          const centerX = side * 0.082;
          const frame = new THREE.Shape();
          frame.moveTo(centerX - 0.07, 0.035);
          frame.bezierCurveTo(centerX - 0.075, 0.09, centerX + 0.055, 0.1, centerX + 0.07, 0.035);
          frame.bezierCurveTo(centerX + 0.075, -0.01, centerX - 0.055, -0.02, centerX - 0.07, 0.035);
          frame.closePath();
          const lensHole = new THREE.Path();
          lensHole.moveTo(centerX - 0.058, 0.035);
          lensHole.bezierCurveTo(centerX - 0.062, 0.076, centerX + 0.043, 0.084, centerX + 0.058, 0.035);
          lensHole.bezierCurveTo(centerX + 0.061, 0.004, centerX - 0.043, -0.004, centerX - 0.058, 0.035);
          lensHole.closePath();
          frame.holes.push(lensHole);
          return frame;
        });
        addKemejaMesh(new THREE.ShapeGeometry(frames), materials.glasses, headPivot, [0, 0, 0.25], "kacamata");
        addKemejaMesh(new THREE.BoxGeometry(0.042, 0.014, 0.012), materials.glasses, headPivot, [0, 0.036, 0.256], "kacamata");
        [-1, 1].forEach((side) => {
          addKemejaMesh(
            new THREE.SphereGeometry(1, 8, 6),
            materials.lenses,
            headPivot,
            [side * 0.082, 0.038, 0.253],
            "kacamata",
            [0.057, 0.04, 0.008],
          );
          addKemejaMesh(new THREE.SphereGeometry(0.009, 5, 4), materials.glassesHighlight, headPivot, [side * 0.064, 0.059, 0.262], "kacamata");
        });
        [-1, 1].forEach((side) => {
          const arm = addKemejaMesh(new THREE.BoxGeometry(0.12, 0.014, 0.014), materials.glasses, headPivot, [side * 0.205, 0.035, 0.205], "kacamata");
          arm.rotation.y = side * 0.18;
        });
      }
      const faceTexture = new THREE.CanvasTexture(faceCanvas);
      faceTexture.colorSpace = THREE.SRGBColorSpace;
      textures.add(faceTexture);
      const faceMaterial = new THREE.MeshStandardMaterial({
        map: faceTexture,
        transparent: true,
        roughness: 0.72,
        metalness: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      resources.add(faceMaterial);
      addKemejaMesh(new THREE.PlaneGeometry(0.4, 0.35), faceMaterial, headPivot, [0, 0, 0.233], "wajah");
      addKemejaMesh(
        new THREE.SphereGeometry(1, 8, 6),
        materials.warmSkin,
        headPivot,
        [0, -0.025, 0.268],
        "wajah",
        [0.0375, 0.0475, 0.035],
      );

      const hairMotion = new THREE.Group();
      headPivot.add(hairMotion);
      kemejaHair = hairMotion;
      addKemejaMesh(new THREE.SphereGeometry(1, 8, 6), materials.hairShadow, hairMotion, [0, -0.005, -0.005], "rambut", [0.28, 0.245, 0.25]);
      addKemejaMesh(new THREE.SphereGeometry(1, 8, 6), materials.hair, hairMotion, [0, 0.115, 0], "rambut", [0.28, 0.17, 0.245]);
      const lockGeometry = new THREE.SphereGeometry(1, 6, 4);
      for (let strand = 0; strand < 12; strand += 1) {
        const isFringe = strand < 4;
        const angle = (strand - 4) / 8 * Math.PI * 2;
        const x = isFringe ? -0.17 + strand * 0.11 : Math.sin(angle) * 0.245;
        const y = isFringe ? 0.075 + strand * 0.014 : -0.045;
        const z = isFringe ? 0.205 : Math.cos(angle) * 0.2;
        const lock = addKemejaMesh(
          lockGeometry,
          strand % 3 === 0 ? materials.hairShadow : materials.hair,
          hairMotion,
          [x, y, z],
          "rambut",
          [0.072, isFringe ? 0.11 : 0.145, 0.085],
        );
        lock.rotation.z = isFringe ? -0.22 + strand * 0.11 : Math.sin(angle) * 0.13;
        lock.rotation.y = isFringe ? 0 : angle;
      }

      const shoulderWidth = KEMEJA_CONFIG.shoulderWidth;
      const upperArmGeometry = rounded(KEMEJA_CONFIG.upperArm);
      const sleeveGeometry = rounded([0.25, 0.2, 0.25]);
      const elbowGeometry = new THREE.SphereGeometry(0.11, 6, 4);
      const forearmGeometry = rounded(KEMEJA_CONFIG.forearm);
      const cuffGeometry = rounded([0.235, 0.035, 0.235]);
      const handShape = new THREE.Shape();
      handShape.moveTo(-0.12, 0.09);
      handShape.lineTo(-0.12, -0.075);
      handShape.lineTo(-0.115, -0.18);
      handShape.quadraticCurveTo(-0.11, -0.205, -0.085, -0.205);
      handShape.quadraticCurveTo(-0.06, -0.205, -0.058, -0.18);
      handShape.lineTo(-0.052, -0.075);
      handShape.lineTo(-0.033, -0.22);
      handShape.quadraticCurveTo(-0.028, -0.245, -0.005, -0.245);
      handShape.quadraticCurveTo(0.02, -0.245, 0.02, -0.22);
      handShape.lineTo(0.022, -0.075);
      handShape.lineTo(0.042, -0.215);
      handShape.quadraticCurveTo(0.047, -0.24, 0.07, -0.237);
      handShape.quadraticCurveTo(0.094, -0.234, 0.09, -0.207);
      handShape.lineTo(0.085, -0.065);
      handShape.lineTo(0.103, -0.17);
      handShape.quadraticCurveTo(0.11, -0.195, 0.132, -0.187);
      handShape.quadraticCurveTo(0.154, -0.18, 0.15, -0.155);
      handShape.lineTo(0.12, 0.015);
      handShape.quadraticCurveTo(0.105, 0.09, 0.045, 0.09);
      handShape.closePath();
      const handGeometry = new THREE.ExtrudeGeometry(handShape, {
        depth: KEMEJA_CONFIG.hand[2],
        bevelEnabled: true,
        bevelSegments: 1,
        steps: 1,
        bevelSize: 0.008,
        bevelThickness: 0.008,
        curveSegments: 2,
      });
      const thumbGeometry = rounded([0.052, 0.115, 0.055]);
      [-1, 1].forEach((side) => {
        const shoulder = new THREE.Group();
        shoulder.position.set(side * shoulderWidth, KEMEJA_CONFIG.shoulderY, 0);
        root.add(shoulder);
        kemejaLayers.push(shoulder);
        const upper = new THREE.Group();
        shoulder.add(upper);
        addKemejaMesh(upperArmGeometry, materials.skin, upper, [0, -0.16, 0], "kulit lengan atas");
        addKemejaMesh(sleeveGeometry, plaidMaterial, upper, [0, -0.08, 0], "lengan");
        const cuff = addKemejaMesh(cuffGeometry, materials.flannelWhite, upper, [0, -0.18, 0], "lengan");
        cuff.rotation.x = Math.PI / 2;
        const elbow = new THREE.Group();
        elbow.position.y = -0.31;
        upper.add(elbow);
        addKemejaMesh(elbowGeometry, materials.skin, elbow, [0, 0, 0], "kulit siku", [0.108, 0.108, 0.108]);
        const forearm = new THREE.Group();
        elbow.add(forearm);
        addKemejaMesh(forearmGeometry, materials.skin, forearm, [0, -0.15, 0], "kulit lengan bawah");
        const wrist = new THREE.Group();
        wrist.position.y = -0.29;
        forearm.add(wrist);
        const hand = new THREE.Group();
        wrist.add(hand);
        addKemejaMesh(handGeometry, materials.skin, hand, [0, 0, 0.02], "tangan");
        const thumb = addKemejaMesh(thumbGeometry, materials.warmSkin, hand, [side * 0.14, -0.065, 0.015], "tangan");
        thumb.rotation.z = -side * 0.7;
        kemejaArms.push({ shoulder, upper, elbow, wrist, hand, side });

        const hip = new THREE.Group();
        hip.position.set(side * 0.19, KEMEJA_CONFIG.hipY, 0);
        root.add(hip);
        kemejaLayers.push(hip);
        const thigh = new THREE.Group();
        hip.add(thigh);
        addKemejaMesh(rounded(KEMEJA_CONFIG.thigh), materials.skin, thigh, [0, -0.18, 0], "kulit");
        const shortsLeg = makeRoundedMesh(hip, materials.denim, [0.35, 0.31, 0.36], [0, 0.02, 0], "celana");
        shortsLeg.rotation.z = side * 0.015;
        const knee = new THREE.Group();
        knee.position.y = -0.34;
        thigh.add(knee);
        addKemejaMesh(elbowGeometry, materials.skin, knee, [0, 0, 0], "kulit", [0.125, 0.125, 0.125]);
        const calf = new THREE.Group();
        knee.add(calf);
        addKemejaMesh(rounded(KEMEJA_CONFIG.calf), materials.socks, calf, [0, -0.16, 0], "kaus kaki");
        const ankle = new THREE.Group();
        ankle.position.y = -0.31;
        calf.add(ankle);
        addKemejaMesh(rounded(KEMEJA_CONFIG.shoe), materials.shoes, ankle, [0, 0.015, 0.11], "sepatu");
        addKemejaMesh(new THREE.BoxGeometry(0.37, 0.035, 0.55), materials.sole, ankle, [0, -0.067, 0.11], "sepatu");
        makeRoundedMesh(ankle, materials.shoes, [0.13, 0.09, 0.035], [0, 0.075, 0.12], "sepatu");
        const lace = new THREE.BoxGeometry(0.12, 0.008, 0.008);
        [-0.025, 0.005, 0.035].forEach((y) => {
          const laceBar = addKemejaMesh(lace, materials.white, ankle, [0, y, 0.235], "sepatu");
          laceBar.rotation.z = 0.12;
        });
        kemejaLegs.push({ hip, upper: thigh, knee, ankle, side });
      });

      avatar.updateMatrixWorld(true);
      avatarRig.updateMatrixWorld(true);
      const rootBounds = new THREE.Box3().setFromObject(root);
      const toRigSpace = avatarRig.matrixWorld.clone().invert();
      const corner = new THREE.Vector3();
      let minimumY = Number.POSITIVE_INFINITY;
      let maximumY = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < 8; index += 1) {
        corner.set(
          index & 1 ? rootBounds.max.x : rootBounds.min.x,
          index & 2 ? rootBounds.max.y : rootBounds.min.y,
          index & 4 ? rootBounds.max.z : rootBounds.min.z,
        ).applyMatrix4(toRigSpace);
        minimumY = Math.min(minimumY, corner.y);
        maximumY = Math.max(maximumY, corner.y);
      }
      if (!Number.isFinite(minimumY) || !Number.isFinite(maximumY)) {
        throw new Error("Tidak dapat menghitung batas avatar Si Kemeja.");
      }
      const verticalScale = KEMEJA_CONFIG.totalHeight / (maximumY - minimumY);
      root.scale.y = verticalScale;
      kemejaFloorOffset = KEMEJA_CONFIG.groundOffset - minimumY * verticalScale;
      root.position.y = kemejaFloorOffset;
      avatar.updateMatrixWorld(true);
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const geometry = object.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
      });
      const sectionTriangles: Record<string, number> = {};
      let totalTriangles = 0;
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const geometry = object.geometry;
        const triangles = (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
        const section = String(object.userData.kemejaSection ?? "detail");
        sectionTriangles[section] = (sectionTriangles[section] ?? 0) + triangles;
        totalTriangles += triangles;
      });
      kemejaBuilt = true;
      console.info("[cowok-kemeja] mesh selesai", {
        triangles: sectionTriangles,
        totalTriangles,
        tinggiTotal: Number(((maximumY - minimumY) * verticalScale).toFixed(3)),
        rasioKepala: Number((KEMEJA_CONFIG.head[1] / (maximumY - minimumY)).toFixed(3)),
        offsetLantai: Number(kemejaFloorOffset.toFixed(4)),
        lebarPerut: KEMEJA_CONFIG.lowerTorso[0],
        lebarBokong: KEMEJA_CONFIG.lowerTorso[0],
        waktuPembuatanMs: Number((performance.now() - buildStartedAt).toFixed(1)),
      });
    };

    const buildPetualangFlanelAvatar = () => {
      if (petualangFlanelRoot) return;
      buildKemejaAvatar();
      if (!kemejaRoot) throw new Error("Avatar Si Kemeja belum tersedia untuk membuat Si Petualang.");

      const root = kemejaRoot.clone(true);
      root.name = "petualang-flanel-layer";
      petualangFlanelPosePairs.length = 0;
      const pairPose = (source: THREE.Object3D, target: THREE.Object3D) => {
        petualangFlanelPosePairs.push({ source, target });
        source.children.forEach((child, index) => {
          const targetChild = target.children[index];
          if (targetChild) pairPose(child, targetChild);
        });
      };
      pairPose(kemejaRoot, root);
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const section = String(object.userData.kemejaSection ?? "");
        const widthScale: Record<string, number> = {
          kaus: 1.08,
          kemeja: 1.08,
          celana: 1.08,
          "kulit lengan atas": 1.12,
          "kulit siku": 1.08,
          "kulit lengan bawah": 1.1,
          lengan: 1.1,
          tangan: 1.12,
          "kaus kaki": 1.06,
          sepatu: 1.08,
        };
        const width = widthScale[section];
        if (width) object.scale.x *= width;
        if (section === "sepatu") object.scale.z *= 1.08;
      });
      avatarRig.add(root);
      petualangFlanelRoot = root;
      petualangFlanelLayers.push(root);
    };

    const buildChibiAvatar = async (onProgress?: (progress: number) => void, shouldCancel?: () => boolean) => {
      if (chibiBuilt) return;
      const buildStartedAt = performance.now();
      const layer = new THREE.Group();
      layer.name = "chibi-halus-layer";
      avatarRig.add(layer);
      chibiLayer = layer;
      chibiLayers.push(layer);

      const bones: THREE.Bone[] = [];
      const boneMap: Partial<Record<ChibiBoneName, THREE.Bone>> = {};
      const makeBone = (
        name: ChibiBoneName,
        parent: THREE.Object3D,
        position: [number, number, number],
      ) => {
        const bone = new THREE.Bone();
        bone.name = name;
        bone.position.set(...position);
        parent.add(bone);
        bones.push(bone);
        boneMap[name] = bone;
        return bone;
      };
      const pelvis = makeBone("pelvis", layer, [0, 0.8, 0]);
      const spine1 = makeBone("spine1", pelvis, [0, 0.12, 0]);
      const spine2 = makeBone("spine2", spine1, [0, 0.2, 0]);
      const neck = makeBone("neck", spine2, [0, 0.17, 0]);
      const head = makeBone("head", neck, [0, 0.31, 0]);
      const ponytail = makeBone("ponytail", head, [0, 0.23, -0.035]);
      [-1, 1].forEach((side) => {
        const prefix = side < 0 ? "left" : "right";
        const clavicle = makeBone(`${prefix}Clavicle` as ChibiBoneName, spine2, [side * 0.13, 0.21, 0]);
        const upperArm = makeBone(`${prefix}UpperArm` as ChibiBoneName, clavicle, [side * 0.09, -0.04, 0]);
        const forearm = makeBone(`${prefix}Forearm` as ChibiBoneName, upperArm, [side * 0.04, -0.26, 0]);
        makeBone(`${prefix}Hand` as ChibiBoneName, forearm, [side * 0.02, -0.23, 0]);
        const thigh = makeBone(`${prefix}Thigh` as ChibiBoneName, pelvis, [side * 0.16, 0.03, 0]);
        const shin = makeBone(`${prefix}Shin` as ChibiBoneName, thigh, [side * 0.02, -0.33, 0]);
        const foot = makeBone(`${prefix}Foot` as ChibiBoneName, shin, [0, -0.32, 0]);
        makeBone(`${prefix}Toe` as ChibiBoneName, foot, [0, -0.02, 0.08]);
      });

      const colors = Object.fromEntries(
        Object.entries(CHIBI_CONFIG.colors).map(([name, value]) => [name, new THREE.Color(value)]),
      ) as Record<keyof typeof CHIBI_CONFIG.colors, THREE.Color>;
      const palette = CHIBI_CONFIG.colors;
      const smooth = (value: number) => {
        const t = THREE.MathUtils.clamp(value, 0, 1);
        return t * t * (3 - 2 * t);
      };
      const band = (value: number, start: number, end: number, feather = 0.014) => (
        smooth((value - start) / feather) * (1 - smooth((value - end) / feather))
      );
      const surfaceColorAt = (point: readonly [number, number, number], target: THREE.Color) => {
        const [x, y, z] = point;
        const absX = Math.abs(x);
        target.copy(colors.skin);
        const hoodieBody = band(y, 0.96, 1.4) * (1 - smooth((absX - 0.18) / 0.055));
        const hoodieSleeve = band(y, 0.82, 1.39) * smooth((absX - 0.17) / 0.07);
        const shorts = band(y, 0.63, 0.91) * (1 - smooth((absX - 0.29) / 0.06));
        const socks = band(y, 0.15, 0.51) * smooth((absX - 0.1) / 0.05);
        const shoes = (1 - smooth((y - 0.12) / 0.055)) * smooth((absX - 0.1) / 0.05);
        const sole = (1 - smooth((y - 0.035) / 0.025)) * smooth((absX - 0.1) / 0.05);
        if (hoodieBody > 0) target.lerp(colors.hoodie, hoodieBody);
        if (hoodieSleeve > 0) target.lerp(colors.hoodie, hoodieSleeve);
        if (shorts > 0) target.lerp(colors.shorts, shorts);
        if (socks > 0) target.lerp(colors.socks, socks);
        if (shoes > 0) target.lerp(colors.shoes, shoes);
        if (sole > 0) target.lerp(colors.sole, sole);
        const pouch = hoodieBody * band(y, 0.97, 1.04) * (1 - smooth((Math.abs(x) - 0.09) / 0.035)) * smooth((z - 0.12) / 0.04);
        const cuff = hoodieSleeve * band(y, 0.82, 0.87);
        const shortsHem = shorts * band(y, 0.64, 0.67);
        if (pouch > 0) target.lerp(colors.hoodieDetail, pouch);
        if (cuff > 0) target.lerp(colors.hoodieDetail, cuff * 0.72);
        if (shortsHem > 0) target.lerp(colors.hoodieDetail, shortsHem * 0.28);
      };
      const uvAt = (point: readonly [number, number, number], target: THREE.Vector2) => {
        const [x, y, z] = point;
        if (y >= CHIBI_CONFIG.headBottomY && y <= CHIBI_CONFIG.headTopY && z >= CHIBI_CONFIG.faceForwardZ) {
          target.set(
            THREE.MathUtils.clamp(x / CHIBI_CONFIG.headWidth + 0.5, 0, 1),
            THREE.MathUtils.clamp((y - CHIBI_CONFIG.headBottomY) / CHIBI_CONFIG.headHeight, 0, 1),
          );
        } else {
          target.set(0.002, 0.002);
        }
      };
      const boneIndices = new Map(CEWEK_HALUS_BONE_NAMES.map((name, index) => [name, index]));
      const result = await buildCewekHalusGeometry({
        skinColor: palette.skin,
        gridStep: CHIBI_CONFIG.gridStep,
        bounds: CHIBI_CONFIG.bounds,
        bodyBlend: CHIBI_CONFIG.bodyBlend,
        shoulderBlend: CHIBI_CONFIG.shoulderBlend,
        elbowBlend: CHIBI_CONFIG.elbowBlend,
        wristBlend: CHIBI_CONFIG.wristBlend,
        hipBlend: CHIBI_CONFIG.hipBlend,
        kneeBlend: CHIBI_CONFIG.kneeBlend,
        ankleBlend: CHIBI_CONFIG.ankleBlend,
        blendBand: CHIBI_CONFIG.blendBand,
        blendFraction: CHIBI_CONFIG.blendFraction,
        hipWeightFraction: CHIBI_CONFIG.hipWeightFraction,
        groundOffset: 0,
        shoulderBindEndY: CHIBI_CONFIG.shoulderBindEndY,
        capsules: CHIBI_CAPSULES,
        armWeightZone: CHIBI_CONFIG.armWeightZone,
        legWeightZone: CHIBI_CONFIG.legWeightZone,
        shoulderBlendRamp: CHIBI_CONFIG.shoulderBlendRamp,
        hipBlendRamp: CHIBI_CONFIG.hipBlendRamp,
        minimumThighGap: CHIBI_CONFIG.minimumThighGap,
        includeTriangleDiagnostics: DEBUG_PANEL,
        colorAt: surfaceColorAt,
        uvAt,
      }, boneIndices, onProgress, shouldCancel);
      if (!result || shouldCancel?.()) {
        layer.clear();
        layer.removeFromParent();
        chibiLayers.splice(chibiLayers.indexOf(layer), 1);
        chibiLayer = null;
        return;
      }
      const armClearance = measureChibiArmClearances(CHIBI_CAPSULES);
      const jointWeightStats = measureChibiJointWeights(result.geometry);
      const skinWeights = result.geometry.getAttribute("skinWeight");
      const skinIndices = result.geometry.getAttribute("skinIndex");
      let invalidWeightVertices = 0;
      let zeroWeightVertices = 0;
      for (let vertex = 0; vertex < result.vertexCount; vertex += 1) {
        let sum = 0;
        let valid = true;
        let hasZeroWeight = false;
        for (let influence = 0; influence < 4; influence += 1) {
          const weight = skinWeights.getComponent(vertex, influence);
          const boneIndex = skinIndices.getComponent(vertex, influence);
          sum += weight;
          valid &&= Number.isFinite(weight) && boneIndex >= 0 && boneIndex < bones.length;
          hasZeroWeight ||= weight <= 0;
        }
        if (!valid || Math.abs(sum - 1) > 1e-4) invalidWeightVertices += 1;
        if (hasZeroWeight) zeroWeightVertices += 1;
      }
      if (invalidWeightVertices > 0) {
        result.geometry.dispose();
        layer.clear();
        layer.removeFromParent();
        chibiLayers.splice(chibiLayers.indexOf(layer), 1);
        chibiLayer = null;
        throw new Error(`Si Imut memiliki ${invalidWeightVertices} vertex dengan skin weight tidak valid.`);
      }

      const makeFaceTexture = (expression: "open" | "blink" | "happy" | "jump") => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 2D tidak tersedia untuk wajah Si Imut.");
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const drawEye = (x: number) => {
          context.fillStyle = palette.faceInk;
          if (expression === "happy") {
            context.lineWidth = 18;
            context.lineCap = "round";
            context.beginPath();
            context.moveTo(x - 35, 285);
            context.quadraticCurveTo(x, 245, x + 35, 285);
            context.stroke();
            return;
          }
          if (expression === "blink") {
            context.lineWidth = 17;
            context.lineCap = "round";
            context.beginPath();
            context.moveTo(x - 31, 278);
            context.quadraticCurveTo(x, 298, x + 31, 278);
            context.stroke();
            return;
          }
          context.beginPath();
          context.ellipse(x, 278, 34, 43, 0, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = palette.eyeHighlight;
          context.beginPath();
          context.arc(x - 11, 263, 11, 0, Math.PI * 2);
          context.arc(x + 12, 290, 5, 0, Math.PI * 2);
          context.fill();
        };
        context.strokeStyle = palette.faceInk;
        context.lineWidth = 8;
        context.lineCap = "round";
        [-1, 1].forEach((side) => {
          const x = 256 + side * 111;
          context.beginPath();
          context.moveTo(x - 30, 218);
          context.quadraticCurveTo(x, 202, x + 30, 218);
          context.stroke();
          drawEye(x);
        });
        context.fillStyle = "rgba(238,156,167,0.82)";
        [102, 410].forEach((x) => {
          context.beginPath();
          context.ellipse(x, 338, 37, 19, 0, 0, Math.PI * 2);
          context.fill();
        });
        context.strokeStyle = palette.faceInk;
        context.lineWidth = 14;
        context.beginPath();
        if (expression === "jump") {
          context.ellipse(256, 391, 24, 31, 0, 0, Math.PI * 2);
          context.fillStyle = "#6F3344";
          context.fill();
          context.stroke();
        } else {
          context.moveTo(216, 374);
          context.bezierCurveTo(226, 424, 286, 424, 296, 374);
          context.stroke();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        textures.add(texture);
        return texture;
      };
      chibiFaceTextures = [
        makeFaceTexture("open"),
        makeFaceTexture("blink"),
        makeFaceTexture("happy"),
        makeFaceTexture("jump"),
      ];
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: "#FFFFFF",
        map: chibiFaceTextures[0],
        roughness: 0.6,
        metalness: 0,
        vertexColors: true,
        transparent: false,
        side: THREE.DoubleSide,
      });
      resources.add(bodyMaterial);
      resources.add(result.geometry);
      const body = new THREE.SkinnedMesh(result.geometry, bodyMaterial);
      body.name = "chibi-halus-body";
      body.userData.debugLayer = "body";
      body.castShadow = true;
      body.receiveShadow = false;
      body.visible = !DEBUG_AVATAR.enabled
        || !(DEBUG_AVATAR.hideBody || DEBUG_AVATAR.hideClothing || DEBUG_AVATAR.hideShoes);
      bodyMaterial.wireframe = DEBUG_AVATAR.enabled && DEBUG_AVATAR.wireframe;
      body.frustumCulled = false;
      layer.add(body);
      avatar.updateMatrixWorld(true);
      const skeleton = new THREE.Skeleton(bones);
      skeleton.calculateInverses();
      body.bind(skeleton, body.matrixWorld);
      skeletons.add(skeleton);
      chibiSkeleton = skeleton;
      chibiBones = boneMap;
      chibiBodyMesh = body;
      chibiFaceMaterial = bodyMaterial;
      if (DEBUG_AVATAR.enabled && DEBUG_AVATAR.skeletonHelper) {
        chibiDebugSkeletonHelper = new THREE.SkeletonHelper(body);
        chibiDebugSkeletonHelper.name = "chibi-halus-debug-skeleton";
        scene.add(chibiDebugSkeletonHelper);
        resources.add(chibiDebugSkeletonHelper.geometry);
        if (Array.isArray(chibiDebugSkeletonHelper.material)) {
          chibiDebugSkeletonHelper.material.forEach((material) => resources.add(material));
        } else {
          resources.add(chibiDebugSkeletonHelper.material);
        }
      }

      const hairRoot = new THREE.Group();
      hairRoot.name = "chibi-hair";
      hairRoot.visible = !DEBUG_AVATAR.enabled || !DEBUG_AVATAR.hideHair;
      head.add(hairRoot);
      chibiHairRoot = hairRoot;
      const hairGeometry = new THREE.SphereGeometry(1, 8, 6);
      const hairMaterial = makeMaterial(palette.hair, 0.55);
      const shadowMaterial = makeMaterial(palette.hairShadow, 0.62);
      let hairMeshIndex = 0;
      const addHair = (
        parent: THREE.Object3D,
        material: THREE.Material,
        position: [number, number, number],
        scale: [number, number, number],
        rotationZ = 0,
      ) => {
        const mesh = addMesh(hairGeometry, material, parent, position, scale);
        hairMeshIndex += 1;
        mesh.name = `chibi-halus-hair-${hairMeshIndex}`;
        mesh.userData.debugLayer = "hair";
        mesh.rotation.z = rotationZ;
        mesh.castShadow = true;
        mesh.receiveShadow = false;
      };
      addHair(hairRoot, shadowMaterial, [0, 0.22, -0.01], [0.31, 0.22, 0.28]);
      addHair(hairRoot, hairMaterial, [0, 0.28, 0.015], [0.3, 0.18, 0.275]);
      for (let strand = 0; strand < 10; strand += 1) {
        const angle = strand / 10 * Math.PI * 2;
        const front = strand < 4;
        const x = front ? -0.2 + strand * 0.13 : Math.sin(angle) * 0.285;
        const y = front ? 0.08 + strand * 0.016 : 0.015;
        const z = front ? 0.225 : Math.cos(angle) * 0.235;
        const target = front ? hairRoot : ponytail;
        addHair(
          target,
          strand % 3 === 0 ? shadowMaterial : hairMaterial,
          [x, y, z],
          [front ? 0.095 : 0.105, front ? 0.13 : 0.18, 0.095],
          front ? -0.3 + strand * 0.16 : Math.sin(angle) * 0.12,
        );
      }

      avatar.updateMatrixWorld(true);
      body.computeBoundingBox();
      body.computeBoundingSphere();
      const legacyBounds = new THREE.Box3();
      legacyLayers.forEach((legacyLayer) => legacyBounds.union(new THREE.Box3().setFromObject(legacyLayer)));
      const toRigSpace = avatarRig.matrixWorld.clone().invert();
      const transformBounds = (bounds: THREE.Box3) => {
        const transformed = new THREE.Box3();
        const point = new THREE.Vector3();
        for (let index = 0; index < 8; index += 1) {
          point.set(
            index & 1 ? bounds.max.x : bounds.min.x,
            index & 2 ? bounds.max.y : bounds.min.y,
            index & 4 ? bounds.max.z : bounds.min.z,
          ).applyMatrix4(toRigSpace);
          transformed.expandByPoint(point);
        }
        return transformed;
      };
      const oldRigBounds = transformBounds(legacyBounds);
      const newRigBounds = transformBounds(new THREE.Box3().setFromObject(layer));
      const oldHeight = oldRigBounds.max.y - oldRigBounds.min.y;
      const newHeight = newRigBounds.max.y - newRigBounds.min.y;
      if (!(oldHeight > 0 && newHeight > 0)) throw new Error("Ukuran bind pose Si Imut tidak valid.");
      layer.scale.y = oldHeight / newHeight;
      chibiFloorOffset = oldRigBounds.min.y - newRigBounds.min.y * layer.scale.y;
      layer.position.y = chibiFloorOffset;
      avatar.updateMatrixWorld(true);

      const totalTriangles = result.triangleCount + 12 * (hairGeometry.index?.count ?? hairGeometry.getAttribute("position").count) / 3;
      chibiBuilt = true;
      chibiNextBlinkAt = performance.now() + 3000 + Math.random() * 2000;
      chibiNextHappyAt = performance.now() + 8000 + Math.random() * 4000;
      chibiElapsedMs = performance.now() - buildStartedAt;
      console.info("[chibi-halus] mesh selesai", {
        triangles: { tubuhPakaianWajah: result.triangleCount, rambut: totalTriangles - result.triangleCount, total: totalTriangles },
        vertices: result.vertexCount,
        bones: skeleton.bones.length,
        scaleDiagnostics: measureChibiScaleDiagnostics(layer, bones),
        invalidWeightVertices,
        zeroWeightVertices,
        armWeightLeakVertices: result.armWeightLeakVertexCount,
        verticesInsideMultipleCapsules: result.verticesInsideMultipleCapsules,
        inwardTriangles: result.inwardTriangleCount,
        bobotPangkalPaha: jointWeightStats.pangkalPaha,
        bobotLutut: jointWeightStats.lutut,
        tinggiTotal: Number(oldHeight.toFixed(3)),
        rasioKepala: Number((CHIBI_CONFIG.headHeight / oldHeight).toFixed(3)),
        lebarTanganVsPergelangan: Number((CHIBI_CONFIG.handWidth / CHIBI_CONFIG.wristWidth).toFixed(2)),
        offsetLantai: Number(chibiFloorOffset.toFixed(4)),
        elapsedMs: Number(chibiElapsedMs.toFixed(1)),
        gridElapsedMs: Number(result.elapsedMs.toFixed(1)),
        minimumArmBodyGap: Number(result.minimumArmBodyGap.toFixed(3)),
        minimumArmBodyGapRest: Number(armClearance.rest.toFixed(3)),
        minimumArmBodyGapWidestSwing: Number(armClearance.widestSwing.toFixed(3)),
        requiredArmBodyGap: Number((2 * CHIBI_CONFIG.shoulderBlend + 0.02).toFixed(3)),
        minimumThighGap: Number(result.minimumThighGap.toFixed(3)),
      });
    };

    const buildKucingAvatar = async (onProgress?: (progress: number) => void, shouldCancel?: () => boolean) => {
      if (kucingBuilt) return;
      const buildStartedAt = performance.now();
      const layer = new THREE.Group();
      layer.name = "chibi-kucing-layer";
      avatarRig.add(layer);
      kucingLayer = layer;
      kucingLayers.push(layer);

      const bones: THREE.Bone[] = [];
      const boneMap: Partial<Record<ChibiBoneName, THREE.Bone>> = {};
      const makeBone = (
        name: ChibiBoneName,
        parent: THREE.Object3D,
        position: [number, number, number],
      ) => {
        const bone = new THREE.Bone();
        bone.name = name;
        bone.position.set(...position);
        parent.add(bone);
        bones.push(bone);
        boneMap[name] = bone;
        return bone;
      };
      const pelvis = makeBone("pelvis", layer, [0, 0.8, 0]);
      const spine1 = makeBone("spine1", pelvis, [0, 0.12, 0]);
      const spine2 = makeBone("spine2", spine1, [0, 0.2, 0]);
      const neck = makeBone("neck", spine2, [0, 0.17, 0]);
      const head = makeBone("head", neck, [0, 0.31, 0]);
      const hairBack1 = makeBone("ponytail", head, [0, 0.23, -0.035]);
      [-1, 1].forEach((side) => {
        const prefix = side < 0 ? "left" : "right";
        const clavicle = makeBone(`${prefix}Clavicle` as ChibiBoneName, spine2, [side * 0.13, 0.21, 0]);
        const upperArm = makeBone(`${prefix}UpperArm` as ChibiBoneName, clavicle, [side * 0.14, -0.04, 0]);
        const forearm = makeBone(`${prefix}Forearm` as ChibiBoneName, upperArm, [side * 0.04, -0.26, 0]);
        makeBone(`${prefix}Hand` as ChibiBoneName, forearm, [side * 0.02, -0.23, 0]);
        const thigh = makeBone(`${prefix}Thigh` as ChibiBoneName, pelvis, [side * 0.16, 0.03, 0]);
        const shin = makeBone(`${prefix}Shin` as ChibiBoneName, thigh, [side * 0.02, -0.33, 0]);
        const foot = makeBone(`${prefix}Foot` as ChibiBoneName, shin, [0, -0.32, 0]);
        makeBone(`${prefix}Toe` as ChibiBoneName, foot, [0, -0.02, 0.08]);
      });
      const hairBackBones = [hairBack1];
      let hairParent = hairBack1;
      for (let index = 1; index < 4; index += 1) {
        const bone = new THREE.Bone();
        bone.name = `hairBack${index + 1}`;
        bone.position.set(0, -0.19, -0.025);
        hairParent.add(bone);
        bones.push(bone);
        hairBackBones.push(bone);
        hairParent = bone;
      }

      const palette = KUCING_CONFIG.colors;
      const colorValues = Object.fromEntries(
        Object.entries(palette).map(([name, value]) => [name, new THREE.Color(value)]),
      ) as Record<keyof typeof palette, THREE.Color>;
      const smooth = (value: number) => {
        const t = THREE.MathUtils.clamp(value, 0, 1);
        return t * t * (3 - 2 * t);
      };
      const band = (value: number, start: number, end: number, feather = 0.014) => (
        smooth((value - start) / feather) * (1 - smooth((value - end) / feather))
      );
      const surfaceColorAt = (point: readonly [number, number, number], target: THREE.Color) => {
        const [x, y] = point;
        const absX = Math.abs(x);
        target.copy(colorValues.skin);
        const isArm = absX >= 0.23 && absX <= 0.46;
        if (isArm && y >= 1.04 && y < 1.07) {
          target.copy(colorValues.collar);
          return;
        }
        if (isArm && y >= 1.07 && y < 1.34) {
          target.copy(colorValues.sleeve);
          return;
        }
        if (isArm && y >= 0.59 && y < 0.79) return;
        if (isArm && y >= 0.79 && y < 0.84) {
          target.copy(colorValues.collar);
          return;
        }
        const pants = band(y, 0.15, 0.94) * (1 - smooth((absX - 0.29) / 0.06));
        const shoes = (1 - smooth((y - 0.19) / 0.06)) * smooth((absX - 0.1) / 0.05);
        const sole = (1 - smooth((y - 0.045) / 0.025)) * smooth((absX - 0.1) / 0.05);
        if (pants > 0) target.lerp(colorValues.pants, pants);
        if (shoes > 0) target.lerp(colorValues.shoes, shoes);
        if (sole > 0) target.lerp(colorValues.sole, sole);
        const shirt = band(y, 0.96, 1.3) * (1 - smooth((absX - 0.18) / 0.055));
        const sleeves = band(y, 1.18, 1.3) * smooth((absX - 0.17) / 0.07);
        if (shirt > 0) target.lerp(colorValues.shirt, shirt);
        if (sleeves > 0) target.lerp(colorValues.shirt, sleeves);
        const sleeveCuff = band(y, 1.16, 1.19) * smooth((absX - 0.17) / 0.07);
        const hem = pants * band(y, 0.19, 0.215);
        const seam = pants * smooth((Math.abs(absX - 0.155) - 0.006) / 0.012);
        const neckDivider = band(y, 1.39, 1.42, 0.008);
        if (neckDivider > 0) target.lerp(colorValues.collar, neckDivider);
        if (sleeveCuff > 0) target.lerp(colorValues.seams, sleeveCuff * 0.18);
        if (hem > 0) target.lerp(colorValues.seams, hem * 0.45);
        if (seam > 0) target.lerp(colorValues.seams, seam * 0.12);
      };
      const uvAt = (point: readonly [number, number, number], target: THREE.Vector2) => {
        const [x, y, z] = point;
        if (y >= CHIBI_CONFIG.headBottomY && y <= CHIBI_CONFIG.headTopY && z >= CHIBI_CONFIG.faceForwardZ) {
          target.set(
            THREE.MathUtils.clamp(x / KUCING_CONFIG.headWidth + 0.5, 0, 1),
            THREE.MathUtils.clamp((y - CHIBI_CONFIG.headBottomY) / KUCING_CONFIG.headHeight, 0, 1),
          );
        } else {
          target.set(0.002, 0.002);
        }
      };
      const kucingCapsules = CHIBI_CAPSULES.map((capsule): CewekHalusCapsule => {
        if (capsule.group === "body" && capsule.owner === "neck") {
          return {
            ...capsule,
            start: [0, 1.3, 0],
            end: [0, 1.52, 0],
            startRadius: [0.15, 0.12],
            endRadius: [0.13, 0.11],
          };
        }
        if (!capsule.group.endsWith("Arm") || capsule.owner.endsWith("Clavicle")) return capsule;
        const side = capsule.start[0] < 0 ? -1 : 1;
        const shifted = {
          ...capsule,
          start: [capsule.start[0] + side * 0.05, capsule.start[1], capsule.start[2]] as [number, number, number],
          end: [capsule.end[0] + side * 0.05, capsule.end[1], capsule.end[2]] as [number, number, number],
        };
        return capsule.owner.endsWith("Hand")
          ? {
            ...shifted,
            end: [shifted.end[0], 0.69, shifted.end[2]],
            startRadius: [0.074, 0.06],
            endRadius: [0.074, 0.06],
          }
          : shifted;
      });
      [-1, 1].forEach((side) => {
        const prefix = side < 0 ? "left" : "right";
        kucingCapsules.push({
          group: side < 0 ? "leftArm" : "rightArm",
          start: [side * 0.35, 0.75, 0.035],
          end: [side * 0.41, 0.66, 0.06],
          startRadius: [0.066, 0.058],
          endRadius: [0.058, 0.052],
          owner: `${prefix}Hand`,
          proximal: `${prefix}Hand`,
          distal: `${prefix}Hand`,
        });
      });
      const boneIndices = new Map(CEWEK_HALUS_BONE_NAMES.map((name, index) => [name, index]));
      const result = await buildCewekHalusGeometry({
        skinColor: palette.skin,
        gridStep: KUCING_CONFIG.gridStep,
        bounds: KUCING_CONFIG.bounds,
        bodyBlend: KUCING_CONFIG.bodyBlend,
        shoulderBlend: KUCING_CONFIG.shoulderBlend,
        elbowBlend: KUCING_CONFIG.elbowBlend,
        wristBlend: KUCING_CONFIG.wristBlend,
        hipBlend: KUCING_CONFIG.hipBlend,
        kneeBlend: KUCING_CONFIG.kneeBlend,
        ankleBlend: KUCING_CONFIG.ankleBlend,
        blendBand: KUCING_CONFIG.blendBand,
        blendFraction: KUCING_CONFIG.blendFraction,
        hipWeightFraction: KUCING_CONFIG.hipWeightFraction,
        groundOffset: 0,
        shoulderBindEndY: KUCING_CONFIG.shoulderBindEndY,
        capsules: kucingCapsules,
        armWeightZone: KUCING_CONFIG.armWeightZone,
        legWeightZone: KUCING_CONFIG.legWeightZone,
        shoulderBlendRamp: KUCING_CONFIG.shoulderBlendRamp,
        hipBlendRamp: KUCING_CONFIG.hipBlendRamp,
        minimumThighGap: KUCING_CONFIG.minimumThighGap,
        includeTriangleDiagnostics: DEBUG_PANEL,
        colorAt: surfaceColorAt,
        uvAt,
      }, boneIndices, onProgress, shouldCancel);
      if (!result || shouldCancel?.()) {
        layer.clear();
        layer.removeFromParent();
        kucingLayers.splice(kucingLayers.indexOf(layer), 1);
        kucingLayer = null;
        return;
      }
      const armClearance = measureChibiArmClearances(kucingCapsules);
      const jointWeightStats = measureChibiJointWeights(result.geometry);
      const skinWeights = result.geometry.getAttribute("skinWeight");
      const skinIndices = result.geometry.getAttribute("skinIndex");
      let invalidWeightVertices = 0;
      let zeroWeightVertices = 0;
      for (let vertex = 0; vertex < result.vertexCount; vertex += 1) {
        let sum = 0;
        let valid = true;
        let hasZeroWeight = false;
        for (let influence = 0; influence < 4; influence += 1) {
          const weight = influence === 0 ? skinWeights.getX(vertex)
            : influence === 1 ? skinWeights.getY(vertex)
              : influence === 2 ? skinWeights.getZ(vertex)
                : skinWeights.getW(vertex);
          const boneIndex = skinIndices.getComponent(vertex, influence);
          sum += weight;
          valid &&= Number.isFinite(weight) && boneIndex >= 0 && boneIndex < bones.length;
          hasZeroWeight ||= weight <= 0;
        }
        if (!valid || Math.abs(sum - 1) > 1e-4) invalidWeightVertices += 1;
        if (hasZeroWeight) zeroWeightVertices += 1;
      }
      if (invalidWeightVertices > 0) {
        result.geometry.dispose();
        layer.clear();
        layer.removeFromParent();
        kucingLayers.splice(kucingLayers.indexOf(layer), 1);
        kucingLayer = null;
        throw new Error(`Si Kucing memiliki ${invalidWeightVertices} vertex dengan skin weight tidak valid.`);
      }

      const makeFaceTexture = (expression: "open" | "blink" | "happy" | "jump") => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 2D tidak tersedia untuk wajah Si Kucing.");
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, 512, 512);
        context.strokeStyle = palette.faceInk;
        context.fillStyle = palette.faceInk;
        context.lineCap = "round";
        [-1, 1].forEach((side) => {
          const eyeX = 256 + side * 111;
          context.lineWidth = 8;
          context.beginPath();
          context.moveTo(eyeX - 30, 218);
          context.quadraticCurveTo(eyeX, 202, eyeX + 30, 218);
          context.stroke();
          if (expression === "happy") {
            context.lineWidth = 18;
            context.beginPath();
            context.moveTo(eyeX - 35, 285);
            context.quadraticCurveTo(eyeX, 245, eyeX + 35, 285);
            context.stroke();
          } else if (expression === "blink") {
            context.lineWidth = 17;
            context.beginPath();
            context.moveTo(eyeX - 31, 278);
            context.quadraticCurveTo(eyeX, 298, eyeX + 31, 278);
            context.stroke();
          } else {
            context.beginPath();
            context.ellipse(eyeX, 278, 34, 43, 0, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = palette.eyeHighlight;
            context.beginPath();
            context.arc(eyeX - 11, 263, 11, 0, Math.PI * 2);
            context.arc(eyeX + 12, 290, 5, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = palette.faceInk;
          }
        });
        context.fillStyle = "rgba(238,156,167,0.82)";
        [102, 410].forEach((x) => {
          context.beginPath();
          context.ellipse(x, 338, 37, 19, 0, 0, Math.PI * 2);
          context.fill();
        });
        context.strokeStyle = palette.faceInk;
        context.lineWidth = 14;
        context.beginPath();
        if (expression === "jump") {
          context.ellipse(256, 391, 24, 31, 0, 0, Math.PI * 2);
          context.fillStyle = "#6F3344";
          context.fill();
          context.stroke();
        } else {
          context.moveTo(216, 374);
          context.bezierCurveTo(226, 424, 286, 424, 296, 374);
          context.stroke();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        textures.add(texture);
        return texture;
      };
      kucingFaceTextures = [
        makeFaceTexture("open"),
        makeFaceTexture("blink"),
        makeFaceTexture("happy"),
        makeFaceTexture("jump"),
      ];
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: "#FFFFFF",
        map: kucingFaceTextures[0],
        roughness: KUCING_CONFIG.shirtRoughness,
        metalness: 0,
        vertexColors: true,
        transparent: false,
        side: THREE.DoubleSide,
      });
      resources.add(bodyMaterial);
      resources.add(result.geometry);
      const body = new THREE.SkinnedMesh(result.geometry, bodyMaterial);
      body.name = "chibi-kucing-body";
      body.userData.debugLayer = "body";
      body.castShadow = true;
      body.receiveShadow = false;
      body.visible = !DEBUG_AVATAR.enabled
        || !(DEBUG_AVATAR.hideBody || DEBUG_AVATAR.hideClothing || DEBUG_AVATAR.hideShoes);
      bodyMaterial.wireframe = DEBUG_AVATAR.enabled && DEBUG_AVATAR.wireframe;
      body.frustumCulled = false;
      layer.add(body);
      avatar.updateMatrixWorld(true);
      const skeleton = new THREE.Skeleton(bones);
      skeleton.calculateInverses();
      body.bind(skeleton, body.matrixWorld);
      skeletons.add(skeleton);
      kucingSkeleton = skeleton;
      kucingBones = boneMap;
      kucingBodyMesh = body;
      kucingFaceMaterial = bodyMaterial;

      const hairGeometry = new THREE.SphereGeometry(1, 8, 6);
      resources.add(hairGeometry);
      const hairMaterial = makeMaterial(palette.hair, 0.55);
      const hairShadowMaterial = makeMaterial(palette.hairShadow, 0.62);
      let hairMeshIndex = 0;
      const addHair = (
        parent: THREE.Object3D,
        position: [number, number, number],
        scale: [number, number, number],
        material: THREE.Material = hairMaterial,
      ) => {
        const mesh = new THREE.Mesh(hairGeometry, material);
        hairMeshIndex += 1;
        mesh.name = `chibi-kucing-hair-${hairMeshIndex}`;
        mesh.userData.debugLayer = "hair";
        mesh.position.set(...position);
        mesh.scale.set(...scale);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.visible = !DEBUG_AVATAR.enabled || !DEBUG_AVATAR.hideHair;
        parent.add(mesh);
        return mesh;
      };
      addHair(head, [0, 0.24, 0.025], [0.31, 0.19, 0.28], hairShadowMaterial);
      addHair(head, [0, 0.29, 0.015], [0.3, 0.15, 0.27]);
      for (let strand = 0; strand < 4; strand += 1) {
        addHair(
          head,
          [-0.19 + strand * 0.125, 0.12 + (strand % 2) * 0.025, 0.225],
          [0.1, 0.16, 0.075],
          strand % 2 ? hairMaterial : hairShadowMaterial,
        );
      }
      for (let segment = 0; segment < hairBackBones.length; segment += 1) {
        const parent = hairBackBones[segment]!;
        for (const side of [-1, 1]) {
          addHair(
            parent,
            [side * (0.075 + segment * 0.005), -0.1, -0.065],
            [0.095, 0.16, 0.09],
            (segment + (side < 0 ? 1 : 0)) % 3 === 0 ? hairShadowMaterial : hairMaterial,
          );
        }
      }
      kucingHairBones = hairBackBones;

      const accessoryMaterial = makeMaterial(palette.headset, 0.55);
      const innerEarMaterial = makeMaterial(palette.earInner, 0.6);
      const bandGeometry = new THREE.TorusGeometry(0.26, 0.027, 7, 24, Math.PI);
      resources.add(bandGeometry);
      const bandMesh = new THREE.Mesh(bandGeometry, accessoryMaterial);
      bandMesh.name = "chibi-kucing-headset-band";
      bandMesh.userData.debugLayer = "accessory";
      bandMesh.position.set(0, 0.29, -0.055);
      bandMesh.castShadow = true;
      bandMesh.receiveShadow = false;
      bandMesh.visible = !DEBUG_AVATAR.enabled || !DEBUG_AVATAR.hideHair;
      head.add(bandMesh);
      const earCupGeometry = new THREE.SphereGeometry(1, 10, 8);
      resources.add(earCupGeometry);
      [-1, 1].forEach((side) => {
        const cup = new THREE.Mesh(earCupGeometry, accessoryMaterial);
        cup.name = `chibi-kucing-headset-cup-${side < 0 ? "left" : "right"}`;
        cup.userData.debugLayer = "accessory";
        cup.position.set(side * 0.275, 0.02, -0.035);
        cup.scale.set(0.085, 0.105, 0.085);
        cup.castShadow = true;
        cup.receiveShadow = false;
        cup.visible = !DEBUG_AVATAR.enabled || !DEBUG_AVATAR.hideHair;
        head.add(cup);
      });
      const makeRoundedEar = (width: number, height: number, bevelSize: number) => {
        const shape = new THREE.Shape();
        shape.moveTo(-width * 0.5, 0);
        shape.quadraticCurveTo(-width * 0.58, height * 0.25, -width * 0.31, height * 0.72);
        shape.quadraticCurveTo(0, height * 1.12, width * 0.31, height * 0.72);
        shape.quadraticCurveTo(width * 0.58, height * 0.25, width * 0.5, 0);
        shape.quadraticCurveTo(0, -height * 0.08, -width * 0.5, 0);
        return new THREE.ExtrudeGeometry(shape, {
          depth: 0.025,
          bevelEnabled: true,
          bevelSegments: 1,
          curveSegments: 4,
          steps: 1,
          bevelSize: Math.min(bevelSize, 0.006),
          bevelThickness: 0.006,
        });
      };
      const outerEarGeometry = makeRoundedEar(0.19, 0.27, 0.012);
      const innerEarGeometry = makeRoundedEar(0.105, 0.16, 0.006);
      resources.add(outerEarGeometry);
      resources.add(innerEarGeometry);
      kucingEarPivots = [];
      [-1, 1].forEach((side) => {
        const pivot = new THREE.Group();
        pivot.name = `chibi-kucing-ear-pivot-${side < 0 ? "left" : "right"}`;
        pivot.position.set(side * 0.17, 0.37, -0.055);
        pivot.rotation.z = side * -0.12;
        head.add(pivot);
        kucingEarPivots.push(pivot);
        const outer = new THREE.Mesh(outerEarGeometry, accessoryMaterial);
        outer.name = `chibi-kucing-ear-outer-${side < 0 ? "left" : "right"}`;
        outer.userData.debugLayer = "accessory";
        outer.position.set(0, 0, 0);
        outer.castShadow = true;
        outer.receiveShadow = false;
        outer.visible = !DEBUG_AVATAR.enabled || !DEBUG_AVATAR.hideHair;
        pivot.add(outer);
        const inner = new THREE.Mesh(innerEarGeometry, innerEarMaterial);
        inner.name = `chibi-kucing-ear-inner-${side < 0 ? "left" : "right"}`;
        inner.userData.debugLayer = "accessory";
        inner.position.set(0, 0.035, 0.032);
        inner.castShadow = false;
        inner.receiveShadow = false;
        inner.visible = !DEBUG_AVATAR.enabled || !DEBUG_AVATAR.hideHair;
        pivot.add(inner);
      });
      if (KUCING_CONFIG.microphone) {
        const microphone = new THREE.Mesh(
          new THREE.CylinderGeometry(0.008, 0.01, 0.18, 8),
          accessoryMaterial,
        );
        microphone.name = "chibi-kucing-headset-microphone";
        microphone.userData.debugLayer = "accessory";
        microphone.position.set(0.31, -0.1, 0.04);
        microphone.rotation.z = -0.85;
        head.add(microphone);
        resources.add(microphone.geometry);
      }
      if (DEBUG_AVATAR.enabled && DEBUG_AVATAR.skeletonHelper) {
        const helper = new THREE.SkeletonHelper(body);
        helper.name = "chibi-kucing-debug-skeleton";
        scene.add(helper);
        resources.add(helper.geometry);
        if (Array.isArray(helper.material)) helper.material.forEach((material) => resources.add(material));
        else resources.add(helper.material);
      }

      avatar.updateMatrixWorld(true);
      body.computeBoundingBox();
      body.computeBoundingSphere();
      const legacyBounds = new THREE.Box3();
      legacyLayers.forEach((legacyLayer) => legacyBounds.union(new THREE.Box3().setFromObject(legacyLayer)));
      const toRigSpace = avatarRig.matrixWorld.clone().invert();
      const transformBounds = (bounds: THREE.Box3) => {
        const transformed = new THREE.Box3();
        const point = new THREE.Vector3();
        for (let index = 0; index < 8; index += 1) {
          point.set(
            index & 1 ? bounds.max.x : bounds.min.x,
            index & 2 ? bounds.max.y : bounds.min.y,
            index & 4 ? bounds.max.z : bounds.min.z,
          ).applyMatrix4(toRigSpace);
          transformed.expandByPoint(point);
        }
        return transformed;
      };
      const oldRigBounds = transformBounds(legacyBounds);
      const newRigBounds = transformBounds(new THREE.Box3().setFromObject(layer));
      const oldHeight = oldRigBounds.max.y - oldRigBounds.min.y;
      const newHeight = newRigBounds.max.y - newRigBounds.min.y;
      if (!(oldHeight > 0 && newHeight > 0)) throw new Error("Ukuran bind pose Si Kucing tidak valid.");
      layer.scale.y = oldHeight / newHeight;
      kucingFloorOffset = oldRigBounds.min.y - newRigBounds.min.y * layer.scale.y;
      layer.position.y = kucingFloorOffset;
      avatar.updateMatrixWorld(true);
      const minimumY = new THREE.Box3().setFromObject(layer).min.y;
      const hairTriangles = 14 * (hairGeometry.index?.count ?? hairGeometry.getAttribute("position").count) / 3;
      const headsetTriangles = (bandGeometry.index?.count ?? bandGeometry.getAttribute("position").count) / 3
        + 2 * (earCupGeometry.index?.count ?? earCupGeometry.getAttribute("position").count) / 3
        + 2 * (outerEarGeometry.index?.count ?? outerEarGeometry.getAttribute("position").count) / 3
        + 2 * (innerEarGeometry.index?.count ?? innerEarGeometry.getAttribute("position").count) / 3;
      const totalTriangles = result.triangleCount + hairTriangles + headsetTriangles;
      kucingBuilt = true;
      kucingNextBlinkAt = performance.now() + 3000 + Math.random() * 2000;
      kucingNextHappyAt = performance.now() + 8000 + Math.random() * 4000;
      kucingElapsedMs = performance.now() - buildStartedAt;
      console.info("[chibi-kucing] mesh selesai", {
        triangles: { tubuhPakaianWajah: result.triangleCount, rambut: hairTriangles, headset: headsetTriangles, total: totalTriangles },
        vertices: result.vertexCount,
        scaleDiagnostics: measureChibiScaleDiagnostics(layer, bones),
        invalidWeightVertices,
        zeroWeightVertices,
        armWeightLeakVertices: result.armWeightLeakVertexCount,
        verticesInsideMultipleCapsules: result.verticesInsideMultipleCapsules,
        inwardTriangles: result.inwardTriangleCount,
        bobotPangkalPaha: jointWeightStats.pangkalPaha,
        bobotLutut: jointWeightStats.lutut,
        bones: skeleton.bones.length,
        tinggiTotal: Number(oldHeight.toFixed(3)),
        rasioKepala: Number((KUCING_CONFIG.headHeight * layer.scale.y / oldHeight).toFixed(3)),
        panjangLeher: Number(KUCING_CONFIG.neckLength.toFixed(3)),
        lebarLeherVsKepala: Number((KUCING_CONFIG.neckWidth / KUCING_CONFIG.headWidth).toFixed(2)),
        lebarTanganVsPergelangan: Number((KUCING_CONFIG.handWidth / KUCING_CONFIG.wristWidth).toFixed(2)),
        offsetLantai: Number(kucingFloorOffset.toFixed(4)),
        minimumY: Number(minimumY.toFixed(4)),
        elapsedMs: Number(kucingElapsedMs.toFixed(1)),
        gridElapsedMs: Number(result.elapsedMs.toFixed(1)),
        minimumArmBodyGap: Number(result.minimumArmBodyGap.toFixed(3)),
        minimumArmBodyGapRest: Number(armClearance.rest.toFixed(3)),
        minimumArmBodyGapWidestSwing: Number(armClearance.widestSwing.toFixed(3)),
        requiredArmBodyGap: Number((2 * CHIBI_CONFIG.shoulderBlend + 0.02).toFixed(3)),
        minimumThighGap: Number(result.minimumThighGap.toFixed(3)),
      });
    };

    const buildCewekHalusAvatar = async (onProgress?: (progress: number) => void, shouldCancel?: () => boolean) => {
      if (cewekHalusBuilt) return;
      if (!cewekHalusLayer) {
        cewekHalusLayer = new THREE.Group();
        avatarRig.add(cewekHalusLayer);
        cewekHalusLayers.push(cewekHalusLayer);
      }
      const buildStartedAt = performance.now();
      const boneList: THREE.Bone[] = [];
      const boneMap = {} as Record<CewekHalusBoneName, THREE.Bone>;
      const makeBone = (name: CewekHalusBoneName, parent: THREE.Object3D, position: [number, number, number]) => {
        const bone = new THREE.Bone();
        bone.name = name;
        bone.position.set(...position);
        parent.add(bone);
        boneList.push(bone);
        boneMap[name] = bone;
        return bone;
      };
      const pelvis = makeBone("pelvis", cewekHalusLayer, [0, 0.88, 0]);
      const spine1 = makeBone("spine1", pelvis, [0, 0.13, 0]);
      const spine2 = makeBone("spine2", spine1, [0, 0.2, 0]);
      const neck = makeBone("neck", spine2, [0, 0.18, 0]);
      const head = makeBone("head", neck, [0, 0.23, 0]);
      makeBone("ponytail", head, [0, 0.24, -0.08]);
      [-1, 1].forEach((side) => {
        const prefix = side < 0 ? "left" : "right";
        const clavicle = makeBone(`${prefix}Clavicle` as CewekHalusBoneName, spine2, [side * 0.14, 0.11, 0]);
        const upperArm = makeBone(`${prefix}UpperArm` as CewekHalusBoneName, clavicle, [side * 0.13, -0.03, 0]);
        const forearm = makeBone(`${prefix}Forearm` as CewekHalusBoneName, upperArm, [side * 0.03, -0.27, 0]);
        const hand = makeBone(`${prefix}Hand` as CewekHalusBoneName, forearm, [side * 0.02, -0.23, 0]);
        const thigh = makeBone(`${prefix}Thigh` as CewekHalusBoneName, pelvis, [side * 0.15, 0, 0]);
        const shin = makeBone(`${prefix}Shin` as CewekHalusBoneName, thigh, [side * 0.03, -0.36, 0]);
        const foot = makeBone(`${prefix}Foot` as CewekHalusBoneName, shin, [0, -0.34, 0]);
        makeBone(`${prefix}Toe` as CewekHalusBoneName, foot, [0, 0, 0.14]);
        void hand;
      });

      const boneIndices = new Map(CEWEK_HALUS_BONE_NAMES.map((name, index) => [name, index]));
      const result = await buildCewekHalusGeometry({
        skinColor: CEWEK_HALUS_CONFIG.skinColor,
        gridStep: CEWEK_HALUS_CONFIG.gridStep,
        bounds: CEWEK_HALUS_CONFIG.bounds,
        bodyBlend: CEWEK_HALUS_CONFIG.bodyBlend,
        shoulderBlend: CEWEK_HALUS_CONFIG.shoulderBlend,
        elbowBlend: CEWEK_HALUS_CONFIG.elbowBlend,
        wristBlend: CEWEK_HALUS_CONFIG.wristBlend,
        hipBlend: CEWEK_HALUS_CONFIG.hipBlend,
        kneeBlend: CEWEK_HALUS_CONFIG.kneeBlend,
        ankleBlend: CEWEK_HALUS_CONFIG.ankleBlend,
        blendBand: CEWEK_HALUS_CONFIG.blendBand,
        blendFraction: CEWEK_HALUS_CONFIG.jointBlendFraction,
        hipWeightFraction: CEWEK_HALUS_CONFIG.hipWeightFraction,
        groundOffset: CEWEK_HALUS_CONFIG.groundOffset,
        shoulderBindEndY: CEWEK_HALUS_CONFIG.shoulderBindEndY,
      }, boneIndices, onProgress, shouldCancel);
      if (!result || shouldCancel?.()) {
        cewekHalusLayer.clear();
        cewekHalusLayer.removeFromParent();
        cewekHalusLayers.splice(cewekHalusLayers.indexOf(cewekHalusLayer), 1);
        cewekHalusLayer = null;
        return;
      }

      const clothingRegions = {
        shirt: (x: number, y: number, z: number) => y >= 1.15 && y <= 1.4 && Math.abs(x) < 0.13 && z > 0.035,
        jacket: (x: number, y: number, z: number) => (
          (y >= 1.08 && y <= 1.4 && Math.abs(x) < 0.16 && !(z > 0.035 && Math.abs(x) < 0.085))
          || (y >= 0.76 && y <= 1.35 && Math.abs(x) >= 0.205 && Math.abs(x) <= 0.34)
        ),
        collar: (x: number, y: number, z: number) => y >= 1.3 && y <= 1.42 && z > 0.045
          && Math.abs(x) >= 0.07 && Math.abs(x) <= 0.145,
        jeans: (x: number, y: number, _z: number) => (
          (y >= 0.75 && y <= 0.99 && Math.abs(x) <= 0.25)
          || (y >= 0.08 && y <= 0.82 && Math.abs(x) >= 0.09 && Math.abs(x) <= 0.26)
        ),
        pockets: (x: number, y: number, z: number) => y >= 0.78 && y <= 0.87 && z > 0.06
          && Math.abs(x) >= 0.12 && Math.abs(x) <= 0.225,
        shoes: (x: number, y: number, z: number) => y >= -0.035 && y <= 0.14
          && Math.abs(x) >= 0.09 && Math.abs(x) <= 0.27 && z >= -0.07 && z <= 0.25,
      };
      const sourceGeometry = result.geometry;
      const sourceIndex = sourceGeometry.getIndex()!;
      const sourcePosition = sourceGeometry.getAttribute("position");
      const sourceNormal = sourceGeometry.getAttribute("normal");
      const sourceColor = sourceGeometry.getAttribute("color");
      const sourceSkinIndex = sourceGeometry.getAttribute("skinIndex");
      const sourceSkinWeight = sourceGeometry.getAttribute("skinWeight");
      const visiblePositions: number[] = [];
      const visibleNormals: number[] = [];
      const visibleColors: number[] = [];
      const visibleSkinIndices: number[] = [];
      const visibleSkinWeights: number[] = [];
      for (let triangle = 0; triangle < sourceIndex.count; triangle += 3) {
        const vertices = [
          sourceIndex.getX(triangle),
          sourceIndex.getX(triangle + 1),
          sourceIndex.getX(triangle + 2),
        ];
        const center = new THREE.Vector3();
        vertices.forEach((vertex) => center.add(new THREE.Vector3(
          sourcePosition.getX(vertex),
          sourcePosition.getY(vertex),
          sourcePosition.getZ(vertex),
        )));
        center.multiplyScalar(1 / 3);
        const covered = Object.values(clothingRegions).some((region) => region(center.x, center.y, center.z));
        if (covered) continue;
        vertices.forEach((vertex) => {
          visiblePositions.push(sourcePosition.getX(vertex), sourcePosition.getY(vertex), sourcePosition.getZ(vertex));
          visibleNormals.push(sourceNormal.getX(vertex), sourceNormal.getY(vertex), sourceNormal.getZ(vertex));
          visibleColors.push(sourceColor.getX(vertex), sourceColor.getY(vertex), sourceColor.getZ(vertex));
          for (let component = 0; component < 4; component += 1) {
            visibleSkinIndices.push(sourceSkinIndex.getComponent(vertex, component));
            visibleSkinWeights.push(sourceSkinWeight.getComponent(vertex, component));
          }
        });
      }
      const visibleBodyGeometry = new THREE.BufferGeometry();
      visibleBodyGeometry.setAttribute("position", new THREE.Float32BufferAttribute(visiblePositions, 3));
      visibleBodyGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(visibleNormals, 3));
      visibleBodyGeometry.setAttribute("color", new THREE.Float32BufferAttribute(visibleColors, 3));
      visibleBodyGeometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(visibleSkinIndices, 4));
      visibleBodyGeometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(visibleSkinWeights, 4));
      visibleBodyGeometry.computeBoundingBox();
      visibleBodyGeometry.computeBoundingSphere();
      const skinMaterial = new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.58,
        metalness: 0,
        vertexColors: true,
        side: THREE.DoubleSide,
      });
      resources.add(sourceGeometry);
      resources.add(visibleBodyGeometry);
      resources.add(skinMaterial);
      const bodyMesh = new THREE.SkinnedMesh(visibleBodyGeometry, skinMaterial);
      bodyMesh.name = "cewek-halus-body";
      bodyMesh.frustumCulled = false;
      cewekHalusLayer.add(bodyMesh);
      const skeleton = new THREE.Skeleton(boneList);
      avatar.updateMatrixWorld(true);
      skeleton.calculateInverses();
      bodyMesh.bind(skeleton, bodyMesh.matrixWorld);
      skeletons.add(skeleton);
      boneList.forEach((bone) => cewekHalusBindQuaternions.set(bone.name, bone.quaternion.clone()));
      cewekHalusSkeleton = skeleton;
      cewekHalusBones = boneMap;
      cewekHalusBodyMesh = bodyMesh;

      const clothingTriangles: Record<string, number> = {};
      const makeClothMaterial = (color: string, roughness = 0.82) => {
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness,
          metalness: 0,
          side: THREE.DoubleSide,
        });
        resources.add(material);
        return material;
      };
      const addSkinnedShell = (
        source: THREE.BufferGeometry,
        name: string,
        material: THREE.Material,
        includes: (x: number, y: number, z: number) => boolean,
        offset: number,
      ) => {
        const sourceIndex = source.getIndex();
        const sourcePosition = source.getAttribute("position");
        const sourceNormal = source.getAttribute("normal");
        const sourceSkinIndex = source.getAttribute("skinIndex");
        const sourceSkinWeight = source.getAttribute("skinWeight");
        if (!sourceIndex || !sourcePosition || !sourceNormal || !sourceSkinIndex || !sourceSkinWeight) {
          throw new Error("Geometri cewek-halus belum memiliki atribut permukaan dan skin yang lengkap.");
        }
        const positions: number[] = [];
        const normals: number[] = [];
        const skinIndices: number[] = [];
        const skinWeights: number[] = [];
        const indices: number[] = [];
        for (let triangle = 0; triangle < sourceIndex.count; triangle += 3) {
          const vertices = [
            sourceIndex.getX(triangle),
            sourceIndex.getX(triangle + 1),
            sourceIndex.getX(triangle + 2),
          ];
          const center = new THREE.Vector3();
          vertices.forEach((vertex) => center.add(new THREE.Vector3(
            sourcePosition.getX(vertex),
            sourcePosition.getY(vertex),
            sourcePosition.getZ(vertex),
          )));
          center.multiplyScalar(1 / 3);
          if (!includes(center.x, center.y, center.z)) continue;
          vertices.forEach((vertex) => {
            const normal = new THREE.Vector3(
              sourceNormal.getX(vertex),
              sourceNormal.getY(vertex),
              sourceNormal.getZ(vertex),
            ).normalize();
            positions.push(
              sourcePosition.getX(vertex) + normal.x * offset,
              sourcePosition.getY(vertex) + normal.y * offset,
              sourcePosition.getZ(vertex) + normal.z * offset,
            );
            normals.push(normal.x, normal.y, normal.z);
            for (let component = 0; component < 4; component += 1) {
              skinIndices.push(sourceSkinIndex.getComponent(vertex, component));
              skinWeights.push(sourceSkinWeight.getComponent(vertex, component));
            }
            indices.push(indices.length);
          });
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
        geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
        geometry.setIndex(indices);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        resources.add(geometry);
        const garment = new THREE.SkinnedMesh(geometry, material);
        garment.name = name;
        garment.frustumCulled = false;
        cewekHalusLayer.add(garment);
        avatar.updateMatrixWorld(true);
        garment.bind(skeleton, bodyMesh.bindMatrix);
        clothingTriangles[name] = indices.length / 3;
        return garment;
      };
      const shirtMaterial = makeClothMaterial(CEWEK_HALUS_CONFIG.shirtColor);
      const denimMaterial = makeClothMaterial(CEWEK_HALUS_CONFIG.jacketColor);
      const denimDetailMaterial = makeClothMaterial("#7796B4");
      const jeansMaterial = makeClothMaterial(CEWEK_HALUS_CONFIG.pantsColor);
      const jeansDetailMaterial = makeClothMaterial("#6F8EAF");
      addSkinnedShell(
        sourceGeometry,
        "kaus putih",
        shirtMaterial,
        clothingRegions.shirt,
        0.012,
      );
      addSkinnedShell(
        sourceGeometry,
        "jaket denim",
        denimMaterial,
        clothingRegions.jacket,
        0.016,
      );
      addSkinnedShell(
        sourceGeometry,
        "kerah jaket",
        denimDetailMaterial,
        clothingRegions.collar,
        0.02,
      );
      addSkinnedShell(
        sourceGeometry,
        "jins ramping",
        jeansMaterial,
        clothingRegions.jeans,
        0.014,
      );
      addSkinnedShell(
        sourceGeometry,
        "kantong jins",
        jeansDetailMaterial,
        clothingRegions.pockets,
        0.018,
      );

      const shoeMaterial = makeClothMaterial(CEWEK_HALUS_CONFIG.shoesColor, 0.62);
      const soleMaterial = makeClothMaterial("#FFFFFF", 0.72);
      const addWeightedShoe = (
        name: string,
        side: number,
        width: number,
        height: number,
        depth: number,
        centerY: number,
        material: THREE.Material,
      ) => {
        const geometry = new RoundedBoxGeometry(width, height, depth, 1, 0.025);
        geometry.translate(side * 0.18, centerY, 0.105);
        const vertexCount = geometry.getAttribute("position").count;
        const weights = new Float32Array(vertexCount * 4);
        const indices = new Uint16Array(vertexCount * 4);
        const toeIndex = boneIndices.get(`${side < 0 ? "left" : "right"}Toe`)!;
        const footIndex = boneIndices.get(`${side < 0 ? "left" : "right"}Foot`)!;
        for (let vertex = 0; vertex < vertexCount; vertex += 1) {
          const toeWeight = geometry.getAttribute("position").getZ(vertex) > 0.19 ? 0.65 : 0.2;
          indices[vertex * 4] = footIndex;
          indices[vertex * 4 + 1] = toeIndex;
          weights[vertex * 4] = 1 - toeWeight;
          weights[vertex * 4 + 1] = toeWeight;
        }
        geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
        geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
        resources.add(geometry);
        const shoe = new THREE.SkinnedMesh(geometry, material);
        shoe.name = name;
        shoe.frustumCulled = false;
        cewekHalusLayer.add(shoe);
        avatar.updateMatrixWorld(true);
        shoe.bind(skeleton, bodyMesh.bindMatrix);
        clothingTriangles[name] = geometry.index
          ? geometry.index.count / 3
          : geometry.getAttribute("position").count / 3;
      };
      [-1, 1].forEach((side) => {
        addWeightedShoe("sneaker", side, 0.15, 0.13, 0.29, 0.068, shoeMaterial);
        addWeightedShoe("sol sneaker", side, 0.158, 0.03, 0.3, 0.015, soleMaterial);
      });

      const faceCanvasTexture = (closed: boolean) => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 2D tidak tersedia untuk membuat wajah cewek-halus.");
        const drawEye = (centerX: number) => {
          context.save();
          context.translate(centerX, 372);
          if (closed) {
            context.strokeStyle = "#392923";
            context.lineWidth = 15;
            context.lineCap = "round";
            context.beginPath();
            context.moveTo(-57, 2);
            context.quadraticCurveTo(0, 30, 57, 2);
            context.stroke();
            context.lineWidth = 5;
            context.beginPath();
            context.moveTo(-48, 12);
            context.lineTo(-60, 22);
            context.moveTo(48, 12);
            context.lineTo(60, 22);
            context.stroke();
          } else {
            context.fillStyle = "#FFFFFF";
            context.beginPath();
            context.ellipse(0, 0, 60, 67, 0, 0, Math.PI * 2);
            context.fill();
            const iris = context.createRadialGradient(-9, -15, 3, 0, 4, 45);
            iris.addColorStop(0, "#E4B66F");
            iris.addColorStop(0.58, "#A9683B");
            iris.addColorStop(1, "#5A321F");
            context.fillStyle = iris;
            context.beginPath();
            context.ellipse(0, 8, 39, 48, 0, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = "#1C120F";
            context.beginPath();
            context.ellipse(0, 13, 21, 33, 0, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = "#FFFFFF";
            context.beginPath();
            context.arc(-15, -20, 13, 0, Math.PI * 2);
            context.arc(17, 18, 7, 0, Math.PI * 2);
            context.fill();
            context.strokeStyle = "#30211C";
            context.lineWidth = 13;
            context.lineCap = "round";
            context.beginPath();
            context.moveTo(-58, -10);
            context.quadraticCurveTo(0, -80, 58, -10);
            context.stroke();
            context.lineWidth = 5;
            context.beginPath();
            context.moveTo(-44, -33);
            context.lineTo(-53, -43);
            context.moveTo(0, -46);
            context.lineTo(1, -57);
            context.moveTo(44, -33);
            context.lineTo(53, -43);
            context.stroke();
          }
          context.restore();
        };
        [93, 419].forEach((x) => {
          const cheek = context.createRadialGradient(x, 415, 3, x, 415, 62);
          cheek.addColorStop(0, "rgba(244,111,144,0.58)");
          cheek.addColorStop(1, "rgba(242,132,142,0)");
          context.fillStyle = cheek;
          context.beginPath();
          context.ellipse(x, 415, 62, 42, 0, 0, Math.PI * 2);
          context.fill();
        });
        drawEye(135);
        drawEye(377);
        context.strokeStyle = "#49332B";
        context.lineWidth = 6;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(89, 276);
        context.quadraticCurveTo(136, 250, 177, 270);
        context.moveTo(333, 270);
        context.quadraticCurveTo(374, 250, 423, 276);
        context.stroke();
        context.fillStyle = "#E9879A";
        context.beginPath();
        context.moveTo(224, 468);
        context.quadraticCurveTo(239, 448, 256, 465);
        context.quadraticCurveTo(273, 448, 288, 468);
        context.quadraticCurveTo(278, 491, 256, 495);
        context.quadraticCurveTo(234, 491, 224, 468);
        context.fill();
        context.strokeStyle = "#B9526C";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(228, 469);
        context.quadraticCurveTo(256, 480, 284, 469);
        context.stroke();
        context.fillStyle = "rgba(255,255,255,0.82)";
        context.beginPath();
        context.ellipse(264, 461, 8, 3, -0.15, 0, Math.PI * 2);
        context.fill();
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        textures.add(texture);
        return texture;
      };
      cewekHalusOpenFaceTexture = faceCanvasTexture(false);
      cewekHalusClosedFaceTexture = faceCanvasTexture(true);
      cewekHalusFaceMaterial = new THREE.MeshStandardMaterial({
        map: cewekHalusOpenFaceTexture,
        transparent: true,
        roughness: 0.62,
        metalness: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      resources.add(cewekHalusFaceMaterial);
      const faceGeometry = new THREE.BufferGeometry();
      const facePositions: number[] = [];
      const faceUvs: number[] = [];
      const faceIndices: number[] = [];
      const faceColumns = 20;
      const faceRows = 24;
      for (let row = 0; row <= faceRows; row += 1) {
        const v = row / faceRows;
        const y = -0.02 + v * 0.35;
        for (let column = 0; column <= faceColumns; column += 1) {
          const u = column / faceColumns;
          const edgeScale = 0.78 + 0.22 * Math.sin(Math.PI * v);
          const x = (u - 0.5) * 0.49 * edgeScale;
          const ellipse = Math.max(0.08, 1 - (x / 0.3) ** 2 - ((y - 0.095) / 0.235) ** 2);
          const z = 0.235 * Math.sqrt(ellipse) + 0.008;
          facePositions.push(x, y, z);
          faceUvs.push(u, v);
          if (row === faceRows || column === faceColumns) continue;
          const a = row * (faceColumns + 1) + column;
          const b = a + 1;
          const d = a + faceColumns + 1;
          const c = d + 1;
          faceIndices.push(a, b, c, a, c, d);
        }
      }
      faceGeometry.setAttribute("position", new THREE.Float32BufferAttribute(facePositions, 3));
      faceGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(faceUvs, 2));
      faceGeometry.setIndex(faceIndices);
      faceGeometry.computeVertexNormals();
      resources.add(faceGeometry);
      const faceMesh = new THREE.Mesh(faceGeometry, cewekHalusFaceMaterial);
      faceMesh.name = "wajah cewek-halus";
      head.add(faceMesh);
      const skinDetailMaterial = makeClothMaterial(CEWEK_HALUS_CONFIG.skinColor, 0.58);
      const faceDetailGeometries: THREE.BufferGeometry[] = [];
      const noseGeometry = new THREE.SphereGeometry(0.014, 10, 7);
      faceDetailGeometries.push(noseGeometry);
      resources.add(noseGeometry);
      const nose = new THREE.Mesh(noseGeometry, skinDetailMaterial);
      nose.scale.set(0.8, 1.2, 0.8);
      nose.position.set(0, 0.06, 0.245);
      head.add(nose);
      [-1, 1].forEach((side) => {
        const earGeometry = new THREE.SphereGeometry(0.045, 10, 7);
        faceDetailGeometries.push(earGeometry);
        resources.add(earGeometry);
        const ear = new THREE.Mesh(earGeometry, skinDetailMaterial);
        ear.scale.set(0.72, 1.05, 0.7);
        ear.position.set(side * 0.29, 0.08, 0);
        head.add(ear);
      });
      const hairMaterial = makeClothMaterial(CEWEK_HALUS_CONFIG.hairColor, 0.78);
      const hairGeometries: THREE.BufferGeometry[] = [];
      const addHairMesh = (geometry: THREE.BufferGeometry, parent: THREE.Object3D, position?: [number, number, number], scale?: [number, number, number]) => {
        resources.add(geometry);
        hairGeometries.push(geometry);
        const mesh = new THREE.Mesh(geometry, hairMaterial);
        if (position) mesh.position.set(...position);
        if (scale) mesh.scale.set(...scale);
        parent.add(mesh);
        return mesh;
      };
      const hairCap = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.53);
      addHairMesh(hairCap, head, [0, 0.2, -0.008], [0.305, 0.235, 0.244]);
      const sideBang = new THREE.SphereGeometry(1, 12, 8);
      addHairMesh(sideBang, head, [-0.055, 0.255, 0.145], [0.19, 0.045, 0.09]);
      const makeHairTube = (points: [number, number, number][], radius: number, parent: THREE.Object3D) => {
        const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
        const tube = new THREE.TubeGeometry(curve, 12, radius, 6, false);
        addHairMesh(tube, parent);
        return tube;
      };
      makeHairTube([
        [-0.08, 0.145, 0.07],
        [-0.04, 0.13, 0.09],
        [0.015, 0.095, 0.098],
        [0.065, 0.055, 0.085],
      ], 0.018, head);
      [-1, 1].forEach((side) => {
        makeHairTube([
          [side * 0.265, 0.22, 0.105],
          [side * 0.285, 0.13, 0.12],
          [side * 0.28, 0.02, 0.12],
          [side * 0.26, -0.075, 0.09],
        ], 0.025, head);
      });
      const ponytail = boneMap.ponytail!;
      const ponytailKnot = new THREE.SphereGeometry(1, 10, 8);
      addHairMesh(ponytailKnot, ponytail, [0, -0.01, -0.045], [0.047, 0.05, 0.045]);
      makeHairTube([
        [0, 0, -0.045],
        [0.012, -0.1, -0.12],
        [0.022, -0.25, -0.18],
        [0.006, -0.4, -0.23],
      ], 0.04, ponytail);
      avatar.updateMatrixWorld(true);
      skeleton.update();
      const layerInverse = cewekHalusLayer.matrixWorld.clone().invert();
      const bindVertex = new THREE.Vector3();
      let minimumAvatarY = Number.POSITIVE_INFINITY;
      let maximumAvatarY = Number.NEGATIVE_INFINITY;
      cewekHalusLayer.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute("position");
        for (let vertex = 0; vertex < positions.count; vertex += 1) {
          bindVertex.fromBufferAttribute(positions, vertex);
          if (object instanceof THREE.SkinnedMesh) object.applyBoneTransform(vertex, bindVertex);
          bindVertex.applyMatrix4(object.matrixWorld).applyMatrix4(layerInverse);
          minimumAvatarY = Math.min(minimumAvatarY, bindVertex.y);
          maximumAvatarY = Math.max(maximumAvatarY, bindVertex.y);
        }
      });
      if (!Number.isFinite(minimumAvatarY) || !Number.isFinite(maximumAvatarY)) {
        throw new Error("Tidak dapat menghitung batas avatar cewek-halus pada pose ikat.");
      }
      const verticalScale = CEWEK_HALUS_CONFIG.bodyHeight / (maximumAvatarY - minimumAvatarY);
      cewekHalusLayer.scale.y = verticalScale;
      cewekHalusLayer.position.y = CEWEK_HALUS_CONFIG.groundOffset - minimumAvatarY * verticalScale;
      avatar.updateMatrixWorld(true);
      const avatarHeight = (maximumAvatarY - minimumAvatarY) * verticalScale;

      clothingTriangles.wajah = faceIndices.length / 3;
      clothingTriangles.rambut = hairGeometries.reduce(
        (sum, geometry) => sum + (geometry.index?.count ?? geometry.getAttribute("position").count) / 3,
        0,
      );
      clothingTriangles.detailWajah = faceDetailGeometries.reduce(
        (sum, geometry) => sum + (geometry.index?.count ?? geometry.getAttribute("position").count) / 3,
        0,
      );
      const garmentTotals = {
        tubuh: visibleBodyGeometry.getAttribute("position").count / 3,
        wajah: clothingTriangles.wajah,
        rambut: clothingTriangles.rambut,
        kaus: clothingTriangles["kaus putih"] ?? 0,
        jaket: (clothingTriangles["jaket denim"] ?? 0) + (clothingTriangles["kerah jaket"] ?? 0),
        jins: (clothingTriangles["jins ramping"] ?? 0) + (clothingTriangles["kantong jins"] ?? 0),
        sepatu: (clothingTriangles.sneaker ?? 0) * 2 + (clothingTriangles["sol sneaker"] ?? 0) * 2,
        detailWajah: clothingTriangles.detailWajah,
      };
      console.info("[cewek-halus] rincian segitiga", {
        ...garmentTotals,
        total: Object.values(garmentTotals).reduce((sum, count) => sum + count, 0),
        segitigaMedanTubuhSebelumPakaian: result.triangleCount,
      });
      cewekHalusNextBlinkAt = performance.now() + 3000 + Math.random() * 2000;
      cewekHalusBuilt = true;
      console.info("[cewek-halus] mesh selesai", {
        triangles: visibleBodyGeometry.getAttribute("position").count / 3,
        vertices: result.vertexCount,
        bones: skeleton.bones.length,
        tinggiTotal: Number(avatarHeight.toFixed(3)),
        rasioKepala: Number((CEWEK_HALUS_CONFIG.headHeight / avatarHeight).toFixed(3)),
        offsetLantai: Number((CEWEK_HALUS_CONFIG.groundOffset - minimumAvatarY * verticalScale).toFixed(4)),
        elapsedMs: Number((performance.now() - buildStartedAt).toFixed(1)),
        gridElapsedMs: Number(result.elapsedMs.toFixed(1)),
        minimumArmBodyGap: Number(result.minimumArmBodyGap.toFixed(3)),
        minimumThighGap: Number(result.minimumThighGap.toFixed(3)),
      });
    };

    const avatarLayerRegistry = new Map<AvatarPresetId, {
      layers: THREE.Group[];
      build?: (onProgress?: (progress: number) => void, shouldCancel?: () => boolean) => void | Promise<void>;
    }>([
      ["anak-cokelat", { layers: legacyLayers }],
      ["kacamata-hitam", { layers: newAvatarLayers, build: buildBlackAvatar }],
      ["cewek-streetwear", { layers: streetwearLayers, build: buildStreetwearAvatar }],
      ["cewek-gaul", { layers: organicLayers, build: buildOrganicAvatar }],
      ["roblox-slim", { layers: robloxSlimLayers, build: buildRobloxSlimAvatar }],
      ["cewek-halus", { layers: cewekHalusLayers, build: buildCewekHalusAvatar }],
      ["cowok-kemeja", { layers: kemejaLayers, build: buildKemejaAvatar }],
      ["petualang-flanel", { layers: petualangFlanelLayers, build: buildPetualangFlanelAvatar }],
      ["chibi-halus", { layers: chibiLayers, build: buildChibiAvatar }],
      ["chibi-kucing", { layers: kucingLayers, build: buildKucingAvatar }],
    ]);

    type DebugMeshState = {
      visible: boolean;
      castShadow: boolean;
      material: THREE.Material | THREE.Material[];
    };
    const debugMeshStates = new Map<THREE.Mesh, DebugMeshState>();
    const debugOriginalRenderCallbacks = new Map<THREE.Mesh, THREE.Object3D["onBeforeRender"]>();
    const debugOriginalWireframes = new Map<THREE.Material, boolean>();
    const debugOriginalMaterialSettings = new Map<THREE.Material, { side: THREE.Side; flatShading: boolean | null }>();
    const debugBasicMaterials = new Map<THREE.SkinnedMesh, THREE.MeshBasicMaterial>();
    let debugAvatarDrawCalls = 0;
    let debugSkeletonHelper: THREE.SkeletonHelper | null = null;
    let debugSkeletonMesh: THREE.SkinnedMesh | null = null;
    let debugVertexNormalsHelper: VertexNormalsHelper | null = null;
    let debugVertexNormalsMesh: THREE.SkinnedMesh | null = null;
    let lastDebugStatsUpdate = 0;
    const debugPreviousAngles = new Map<string, number>();
    let debugLargestAngleDelta = 0;
    let debugLargestAngleLabel = "";
    let lastDebugAngleLog = performance.now();

    const recordDebugAngle = (label: string, angle: number) => {
      const previous = debugPreviousAngles.get(label);
      debugPreviousAngles.set(label, angle);
      if (previous === undefined) return;
      const delta = Math.abs(Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous)));
      if (delta > debugLargestAngleDelta) {
        debugLargestAngleDelta = delta;
        debugLargestAngleLabel = label;
      }
    };

    const debugMaterialSide = (side: THREE.Side) => {
      if (side === THREE.DoubleSide) return "DoubleSide";
      if (side === THREE.BackSide) return "BackSide";
      return "FrontSide";
    };
    const debugMaterialInfo = (mesh: THREE.Mesh): DebugMeshInfo => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      return {
        name: mesh.name || "(tanpa nama)",
        type: mesh.type,
        castShadow: String(mesh.castShadow),
        receiveShadow: String(mesh.receiveShadow),
        material: materials.map((material) => material.type).join(", "),
        transparent: materials.map((material) => String(material.transparent)).join(", "),
        depthWrite: materials.map((material) => String(material.depthWrite)).join(", "),
        side: materials.map((material) => debugMaterialSide(material.side)).join(", "),
      };
    };
    const isAvatarObjectVisible = (object: THREE.Object3D) => {
      let current: THREE.Object3D | null = object;
      while (current) {
        if (!current.visible) return false;
        if (current === avatar) return true;
        current = current.parent;
      }
      return false;
    };
    const removeDebugSkeletonHelper = () => {
      if (!debugSkeletonHelper) return;
      debugSkeletonHelper.removeFromParent();
      debugSkeletonHelper.geometry.dispose();
      if (Array.isArray(debugSkeletonHelper.material)) {
        debugSkeletonHelper.material.forEach((material) => material.dispose());
      } else {
        debugSkeletonHelper.material.dispose();
      }
      debugSkeletonHelper = null;
      debugSkeletonMesh = null;
    };
    const removeDebugVertexNormalsHelper = () => {
      if (!debugVertexNormalsHelper) return;
      debugVertexNormalsHelper.removeFromParent();
      debugVertexNormalsHelper.geometry.dispose();
      if (Array.isArray(debugVertexNormalsHelper.material)) {
        debugVertexNormalsHelper.material.forEach((material) => material.dispose());
      } else {
        debugVertexNormalsHelper.material.dispose();
      }
      debugVertexNormalsHelper = null;
      debugVertexNormalsMesh = null;
    };
    const applyDebugPanelOptions = () => {
      if (!DEBUG_PANEL) return;
      const options = debugOptionsRef.current;
      renderer.shadowMap.enabled = options.sceneShadows === "normal"
        ? originalShadowMapEnabled
        : options.sceneShadows === "on";
      sunlight.visible = options.directionalLight;
      hemisphereLight.visible = options.hemisphereLight;
      avatarLayerRegistry.forEach((entry, id) => {
        const visible = id === selectedAvatarId
          ? id !== "anak-cokelat" || options.rig
          : id === "anak-cokelat"
            ? options.rig
            : options.otherPresets;
        entry.layers.forEach((layer) => { layer.visible = visible; });
      });

      avatar.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        let state = debugMeshStates.get(object);
        if (!state) {
          state = {
            visible: object.visible,
            castShadow: object.castShadow,
            material: object.material,
          };
          debugMeshStates.set(object, state);
          const previousCallback = object.onBeforeRender;
          debugOriginalRenderCallbacks.set(object, previousCallback);
          object.onBeforeRender = (...args) => {
            if (args[2] === camera) debugAvatarDrawCalls += 1;
            previousCallback.apply(object, args);
          };
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            if (!debugOriginalMaterialSettings.has(material)) {
              debugOriginalMaterialSettings.set(material, {
                side: material.side,
                flatShading: "flatShading" in material ? material.flatShading : null,
              });
            }
            if ("wireframe" in material && !debugOriginalWireframes.has(material)) {
              debugOriginalWireframes.set(material, material.wireframe);
            }
          });
        }

        const category = object.userData.debugLayer as string | undefined;
        const categoryVisible = category === "body" ? options.body
          : category === "hair" ? options.hair
            : category === "accessory" ? options.accessories
              : true;
        object.visible = state.visible && categoryVisible;
        object.castShadow = options.avatarShadows === "normal"
          ? state.castShadow
          : options.avatarShadows === "on";
        const sourceMaterials = Array.isArray(state.material) ? state.material : [state.material];
        const isBody = category === "body";
        const selectedSide = options.bodySide === "front" ? THREE.FrontSide
          : options.bodySide === "back" ? THREE.BackSide
            : options.bodySide === "double" ? THREE.DoubleSide
            : null;
        sourceMaterials.forEach((material) => {
          if (!isBody) return;
          const original = debugOriginalMaterialSettings.get(material);
          if (!original) return;
          const side = selectedSide ?? original.side;
          if (material.side !== side) {
            material.side = side;
            material.needsUpdate = true;
          }
          if (original.flatShading !== null && "flatShading" in material) {
            const flatShading = options.flatShading || original.flatShading;
            if (material.flatShading !== flatShading) {
            material.flatShading = flatShading;
            material.needsUpdate = true;
            }
          }
        });
        object.material = options.normalMaterial && debugNormalMaterial
          ? Array.isArray(state.material)
            ? state.material.map(() => debugNormalMaterial)
            : debugNormalMaterial
          : isBody && options.basicMaterial && object instanceof THREE.SkinnedMesh
            ? (() => {
            const baseMaterial = sourceMaterials[0];
            if (!(baseMaterial instanceof THREE.MeshStandardMaterial)) return state.material;
            let basicMaterial = debugBasicMaterials.get(object);
            if (!basicMaterial) {
              basicMaterial = new THREE.MeshBasicMaterial({
                color: baseMaterial.color,
                map: baseMaterial.map,
                vertexColors: baseMaterial.vertexColors,
                side: baseMaterial.side,
                transparent: baseMaterial.transparent,
                opacity: baseMaterial.opacity,
                depthWrite: baseMaterial.depthWrite,
              });
              debugBasicMaterials.set(object, basicMaterial);
            }
            basicMaterial.color.copy(baseMaterial.color);
            basicMaterial.map = baseMaterial.map;
            basicMaterial.vertexColors = baseMaterial.vertexColors;
            basicMaterial.side = selectedSide ?? baseMaterial.side;
            basicMaterial.wireframe = options.wireframe;
            return basicMaterial;
            })()
            : state.material;
        sourceMaterials.forEach((material) => {
          if ("wireframe" in material) {
            material.wireframe = options.wireframe || (debugOriginalWireframes.get(material) ?? false);
          }
        });
        if (debugNormalMaterial) {
          debugNormalMaterial.wireframe = options.wireframe;
          if (isBody) debugNormalMaterial.side = selectedSide ?? debugOriginalMaterialSettings.get(sourceMaterials[0]!)?.side ?? THREE.FrontSide;
        }
      });

      const selectedBody = selectedAvatarId === "chibi-kucing" ? kucingBodyMesh : chibiBodyMesh;
      if (options.skeleton && selectedBody) {
        if (debugSkeletonMesh !== selectedBody) {
          removeDebugSkeletonHelper();
          debugSkeletonHelper = new THREE.SkeletonHelper(selectedBody);
          debugSkeletonHelper.name = "debug-skeleton-avatar";
          debugSkeletonMesh = selectedBody;
          scene.add(debugSkeletonHelper);
        }
      } else {
        removeDebugSkeletonHelper();
      }
      if (options.vertexNormals && selectedBody) {
        if (debugVertexNormalsMesh !== selectedBody) {
          removeDebugVertexNormalsHelper();
          debugVertexNormalsHelper = new VertexNormalsHelper(selectedBody, 0.045, 0x00ffae);
          debugVertexNormalsHelper.name = "debug-vertex-normals-bind-pose";
          debugVertexNormalsMesh = selectedBody;
          scene.add(debugVertexNormalsHelper);
        }
      } else {
        removeDebugVertexNormalsHelper();
      }
    };
    const updateDebugAvatarStats = () => {
      let skinnedMeshes = 0;
      let meshes = 0;
      const objects: DebugMeshInfo[] = [];
      avatar.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !isAvatarObjectVisible(object)) return;
        if (object instanceof THREE.SkinnedMesh) skinnedMeshes += 1;
        else meshes += 1;
        objects.push(debugMaterialInfo(object));
      });
      setDebugStats({
        skinnedMeshes,
        meshes,
        drawCalls: debugAvatarDrawCalls,
        objects,
      });
    };

    const applyAvatar = async (presetId: AvatarPresetId) => {
      const selectedLayer = avatarLayerRegistry.get(presetId);
      if (!selectedLayer) return;
      const needsBuildIndicator = (presetId === "cewek-halus" && !cewekHalusBuilt)
        || (presetId === "chibi-halus" && !chibiBuilt)
        || (presetId === "chibi-kucing" && !kucingBuilt);
      if (needsBuildIndicator) {
        setAvatarLoading(true);
        setAvatarBuildProgress(0);
      }
      try {
        await selectedLayer.build?.(
          (progress) => {
            if (!effectDisposed) setAvatarBuildProgress(Math.round(progress * 100));
          },
          () => effectDisposed,
        );
      } catch (error) {
        if (presetId === "cewek-halus") {
          console.warn("Avatar cewek-halus gagal dibangun; periksa geometri tubuh dan skeleton.", error);
        } else if (presetId === "chibi-halus") {
          console.error("Avatar Si Imut gagal dibangun.", error);
          setAvatarLoading(false);
          return;
        } else if (presetId === "chibi-kucing") {
          console.error("Avatar Si Kucing gagal dibangun.", error);
          setAvatarLoading(false);
          return;
        } else {
          throw error;
        }
      }
      if (effectDisposed) return;
      avatarLayerRegistry.forEach((entry, id) => {
        entry.layers.forEach((layer) => { layer.visible = id === presetId; });
      });
      if (presetId === "cewek-halus" && (!cewekHalusBodyMesh || !cewekHalusSkeleton || cewekHalusSkeleton.bones.length !== 22)) {
        console.warn("Avatar cewek-halus tidak tampil: SkinnedMesh tubuh atau skeleton 22 tulang tidak terbentuk.");
      }
      if (presetId === "chibi-halus" && (!chibiBodyMesh || !chibiSkeleton || chibiSkeleton.bones.length !== 22)) {
        console.error("Avatar Si Imut tidak tampil: SkinnedMesh atau skeleton 22 tulang tidak terbentuk.");
      }
      if (presetId === "chibi-kucing" && (!kucingBodyMesh || !kucingSkeleton || kucingSkeleton.bones.length !== 25)) {
        console.error("Avatar Si Kucing tidak tampil: SkinnedMesh atau skeleton 25 tulang tidak terbentuk.");
      }
      if (needsBuildIndicator) setAvatarLoading(false);
    };
    void applyAvatar(selectedAvatarId);

    const animationState = {
      phase: 0,
      runBlend: 0,
      runIntensity: 0,
      armSwing: 0,
      armLift: 0,
      elbowBend: 0,
      breath: 0,
      torsoLean: 0,
      torsoTwist: 0,
      bodyBounce: 0,
      leftFootLift: 0,
      rightFootLift: 0,
      leftLegSwing: 0,
      rightLegSwing: 0,
      hoodSway: 0,
      hairSway: 0,
      pendantSway: 0,
      landingBend: 0,
    };

    // Pool debu berukuran tetap; mesh dan material dipakai ulang setiap langkah.
    const dustGeometry = new THREE.SphereGeometry(0.045, 8, 6);
    const dustMaterial = new THREE.MeshStandardMaterial({
      color: "#d8c6a5",
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    resources.add(dustGeometry);
    resources.add(dustMaterial);
    const dustParticles: DustParticle[] = Array.from({ length: 16 }, () => {
      const mesh = new THREE.Mesh(dustGeometry, dustMaterial);
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, velocity: new THREE.Vector3(), age: 0, lifetime: 0.32, baseScale: 0.55 };
    });
    let dustCursor = 0;

    const treasures: Treasure[] = TREASURE_POSITIONS.map(([x, z], index) => {
      const group = new THREE.Group();
      group.position.set(x, 1.74, z);
      scene.add(group);
      addBox(group, mats.chestWood, [0, 0.4, 0], [1.55, 0.72, 1.08]);
      addBox(group, mats.chestGold, [0, 0.75, 0.555], [0.25, 0.27, 0.08]);
      addBox(group, mats.chestWood, [0, 0.73, 0.6], [0.12, 0.07, 0.02]);
      [-0.56, 0.56].forEach((bandX) => {
        addBox(group, mats.chestGold, [bandX, 0.4, 0.55], [0.1, 0.7, 0.045]);
      });

      const coinGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 20);
      [-0.38, 0, 0.38].forEach((coinX, coinIndex) => {
        const coin = addMesh(coinGeometry, mats.treasureCoin, group, [coinX, 0.82, -0.12]);
        coin.rotation.z = coinIndex === 1 ? -0.14 : 0.12;
        addMesh(new THREE.TorusGeometry(0.19, 0.022, 6, 20), mats.chestGold, group, [coinX, 0.88, -0.12]);
      });
      const coinStack = addMesh(coinGeometry, mats.treasureCoin, group, [0.43, 0.93, -0.32]);
      coinStack.rotation.z = -0.18;

      const glow = new THREE.Group();
      group.add(glow);
      const innerGlow = addMesh(treasureGlowGeometry, treasureGlowMaterial, glow, [0, -0.035, 0]);
      innerGlow.rotation.x = Math.PI / 2;
      const outerGlow = addMesh(treasureOuterGlowGeometry, treasureGlowMaterial, glow, [0, -0.02, 0]);
      outerGlow.rotation.x = Math.PI / 2;
      const beaconLight = new THREE.PointLight("#ffe66d", 0.8, 5, 2);
      beaconLight.position.set(0, 0.9, 0);
      group.add(beaconLight);
      return { id: index, group, glow, beaconLight, home: group.position.clone(), phase: index * 0.8, collected: false };
    });

    const playerPosition = new THREE.Vector3(0, 1.68, 43);
    const emitDust = (side: number, count: number) => {
      const facingX = Math.sin(avatar.rotation.y);
      const facingZ = Math.cos(avatar.rotation.y);
      for (let index = 0; index < count; index += 1) {
        const particle = dustParticles[dustCursor]!;
        dustCursor = (dustCursor + 1) % dustParticles.length;
        const lateral = side * 0.2 + (index - (count - 1) / 2) * 0.07;
        particle.mesh.position.set(
          playerPosition.x - facingX * 0.2 + Math.cos(avatar.rotation.y) * lateral,
          playerPosition.y + 0.035,
          playerPosition.z - facingZ * 0.2 - Math.sin(avatar.rotation.y) * lateral,
        );
        particle.velocity.set(
          -facingX * (0.25 + index * 0.04) + Math.cos(avatar.rotation.y) * side * 0.18,
          0.35 + index * 0.04,
          -facingZ * (0.25 + index * 0.04) - Math.sin(avatar.rotation.y) * side * 0.18,
        );
        particle.age = 0;
        particle.lifetime = 0.28 + index * 0.025;
        particle.baseScale = 0.55 + index * 0.08;
        particle.mesh.scale.setScalar(particle.baseScale);
        particle.mesh.visible = true;
      }
    };
    const velocity = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();
    let cameraYaw = 0;
    let cameraPitch = 0.16;
    let pointerId: number | null = null;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let grounded = true;
    let scoreNow = 0;
    let lastFrameTime = performance.now();
    let frameId = 0;
    const maxIslandRadius = WORLD_RADIUS;

    const updateSize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      setMobile(window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
      keysRef.current.add(key);
      if (key === " " && !event.repeat) jumpRequestedRef.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    const onBlur = () => {
      keysRef.current.clear();
      movementStickRef.current = { x: 0, y: 0 };
      setMovementStick({ x: 0, y: 0 });
      movementStickPointerRef.current = null;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      pointerId = event.pointerId;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      cameraYaw -= (event.clientX - lastPointerX) * 0.006;
      cameraPitch = THREE.MathUtils.clamp(cameraPitch + (event.clientY - lastPointerY) * 0.003, -0.05, 0.55);
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 0 && (event.target as HTMLElement).closest(".world-hud")) event.preventDefault();
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);

    const animate = (now: number) => {
      frameId = window.requestAnimationFrame(animate);
      const dt = Math.min((now - lastFrameTime) / 1000, RUN_CONFIG.maxDeltaTime);
      lastFrameTime = now;
      if (selectedAvatarId === "cewek-halus" && cewekHalusFaceMaterial
        && cewekHalusOpenFaceTexture && cewekHalusClosedFaceTexture) {
        if (cewekHalusBlinkStartedAt < 0 && now >= cewekHalusNextBlinkAt) {
          cewekHalusBlinkStartedAt = now;
          cewekHalusFaceMaterial.map = cewekHalusClosedFaceTexture;
          cewekHalusFaceMaterial.needsUpdate = true;
        } else if (cewekHalusBlinkStartedAt >= 0 && now - cewekHalusBlinkStartedAt >= 130) {
          cewekHalusBlinkStartedAt = -1;
          cewekHalusFaceMaterial.map = cewekHalusOpenFaceTexture;
          cewekHalusFaceMaterial.needsUpdate = true;
          cewekHalusNextBlinkAt = now + 3000 + Math.random() * 2000;
        }
      }
      const input = keysRef.current;
      const fixedFacing = DEBUG_PANEL ? debugOptionsRef.current.fixedFacing : null;
      const forward = THREE.MathUtils.clamp(
        Number(input.has("w") || input.has("arrowup"))
          - Number(input.has("s") || input.has("arrowdown"))
          - movementStickRef.current.y,
        -1,
        1,
      );
      const sideways = THREE.MathUtils.clamp(
        Number(input.has("d") || input.has("arrowright"))
          - Number(input.has("a") || input.has("arrowleft"))
          + movementStickRef.current.x,
        -1,
        1,
      );
      const inputMagnitude = Math.min(1, Math.hypot(forward, sideways));
      const moving = fixedFacing === null && inputMagnitude > 0.06;
      const wasGrounded = grounded;
      let movementSpeed = 0;

      if (!pendingTreasureRef.current && !gameCompleteRef.current && fixedFacing === null) {
        const direction = new THREE.Vector3(
          Math.sin(cameraYaw) * forward + Math.cos(cameraYaw) * sideways,
          0,
          -Math.cos(cameraYaw) * forward + Math.sin(cameraYaw) * sideways,
        );
        if (moving) {
          direction.normalize();
          const speed = (input.has("shift") ? 10 : 6.2) * inputMagnitude;
          movementSpeed = speed;
          playerPosition.x += direction.x * speed * dt;
          playerPosition.z += direction.z * speed * dt;
          avatar.rotation.y = Math.atan2(direction.x, direction.z);
        }
        if (jumpRequestedRef.current && grounded) {
          velocity.y = 8.5;
          grounded = false;
        }
        jumpRequestedRef.current = false;
        velocity.y -= 22 * dt;
        playerPosition.y += velocity.y * dt;
        if (playerPosition.y <= 1.68) {
          playerPosition.y = 1.68;
          velocity.y = 0;
          grounded = true;
        }
        const distanceFromCenter = Math.hypot(playerPosition.x, playerPosition.z);
        if (distanceFromCenter > maxIslandRadius) {
          playerPosition.x *= maxIslandRadius / distanceFromCenter;
          playerPosition.z *= maxIslandRadius / distanceFromCenter;
        }
        avatar.position.copy(playerPosition);
        const nearbyTreasure = treasures.find((treasure) => (
          !treasure.collected && treasure.group.position.distanceTo(playerPosition) < 2.15
        ));
        if (nearbyTreasure) {
          nearbyTreasure.collected = true;
          nearbyTreasure.group.visible = false;
          pendingTreasureRef.current = nearbyTreasure;
          treasureFirstAttemptRef.current = true;
          setQuestion(makeQuestion(treasureQuestionsRef.current?.[treasureQuestionIndexRef.current]));
          setAnswerFeedback(null);
          setAnswerOutcome(null);
          setQuestionResolved(false);
        }
      }
      if (fixedFacing !== null) {
        const facingYaw = fixedFacing === "left" ? -Math.PI / 2
          : fixedFacing === "right" ? Math.PI / 2
            : fixedFacing === "back" ? Math.PI
              : 0;
        avatar.rotation.y = facingYaw;
        jumpRequestedRef.current = false;
      }
      const radarPlayer = radarPlayerRef.current;
      if (radarPlayer) {
        const radarPosition = toRadarCoordinates(playerPosition.x, playerPosition.z);
        radarPlayer.setAttribute("cx", String(radarPosition.x));
        radarPlayer.setAttribute("cy", String(radarPosition.y));
      }

      if (!wasGrounded && grounded) animationState.landingBend = 1;
      const isRunning = movementSpeed > 0 && grounded && !pendingTreasureRef.current;
      const runIntensity = movementSpeed >= 10 ? 1 : movementSpeed > 0 ? 0.86 : 0;
      const phaseBeforeStep = animationState.phase;
      if (isRunning) {
        const cyclesPerSecond = Math.min(
          movementSpeed / RUN_CONFIG.cycleLength,
          RUN_CONFIG.maxCyclesPerSecond,
        );
        animationState.phase += cyclesPerSecond * Math.PI * 2 * dt;
        if (phaseBeforeStep < Math.PI && animationState.phase >= Math.PI) {
          emitDust(-1, runIntensity > 0.9 ? 2 : 1);
        }
        if (animationState.phase >= Math.PI * 2) {
          animationState.phase %= Math.PI * 2;
          emitDust(1, runIntensity > 0.9 ? 2 : 1);
        }
      }

      const runTarget = isRunning ? 1 : 0;
      const blendAlpha = 1 - Math.exp(-dt / (RUN_CONFIG.blendSeconds / 3));
      const damping = 1 - Math.exp(-10 * dt);
      animationState.runBlend = THREE.MathUtils.lerp(animationState.runBlend, runTarget, blendAlpha);
      animationState.runIntensity = THREE.MathUtils.lerp(animationState.runIntensity, runIntensity, blendAlpha);
      const strideWave = Math.sin(animationState.phase);
      const leftSwing = Math.max(0, strideWave);
      const rightSwing = Math.max(0, -strideWave);
      animationState.armSwing = THREE.MathUtils.lerp(
        animationState.armSwing,
        -strideWave * RUN_CONFIG.legSwing * runIntensity,
        damping,
      );
      animationState.elbowBend = THREE.MathUtils.lerp(
        animationState.elbowBend,
        isRunning ? RUN_CONFIG.elbowBend : 0,
        damping,
      );
      animationState.landingBend *= Math.exp(-dt / 0.12);
      if (animationState.landingBend < 0.005) animationState.landingBend = 0;

      const runWeight = animationState.runIntensity * animationState.runBlend;
      const bounceTarget = isRunning
        ? Math.max(0, Math.sin(animationState.phase * 2)) * RUN_CONFIG.bodyBounce * runWeight
        : 0;
      const breathTarget = isRunning ? 0 : Math.sin(now * 0.0018) * 0.018;
      const leanTarget = isRunning
        ? RUN_CONFIG.bodyLean * runIntensity * animationState.runBlend
        : 0;
      const twistTarget = isRunning
        ? -Math.sin(animationState.phase) * RUN_CONFIG.torsoTwist * animationState.runBlend
        : 0;
      animationState.bodyBounce = THREE.MathUtils.lerp(animationState.bodyBounce, bounceTarget, damping);
      animationState.breath = THREE.MathUtils.lerp(animationState.breath, breathTarget, damping);
      animationState.torsoLean = THREE.MathUtils.lerp(animationState.torsoLean, leanTarget, damping);
      animationState.torsoTwist = THREE.MathUtils.lerp(animationState.torsoTwist, twistTarget, damping);
      animationState.hoodSway = THREE.MathUtils.lerp(
        animationState.hoodSway,
        isRunning ? Math.sin(animationState.phase - 0.35) * 0.09 * runIntensity : 0,
        1 - Math.exp(-7 * dt),
      );
      animationState.hairSway = THREE.MathUtils.lerp(
        animationState.hairSway,
        isRunning ? Math.sin(animationState.phase - 0.5) * 0.055 * runIntensity : 0,
        1 - Math.exp(-8 * dt),
      );
      animationState.pendantSway = THREE.MathUtils.lerp(
        animationState.pendantSway,
        isRunning ? Math.sin(animationState.phase - 0.45) * 0.12 * runWeight : 0,
        1 - Math.exp(-9 * dt),
      );

      animationState.leftFootLift = leftSwing * RUN_CONFIG.footLift * runWeight;
      animationState.rightFootLift = rightSwing * RUN_CONFIG.footLift * runWeight;
      animationState.leftLegSwing = leftSwing * RUN_CONFIG.legSwing * runWeight;
      animationState.rightLegSwing = -rightSwing * RUN_CONFIG.legSwing * runWeight;
      leftLeg.pivot.position.y = leftLeg.baseY + Math.max(0, animationState.leftFootLift);
      rightLeg.pivot.position.y = rightLeg.baseY + Math.max(0, animationState.rightFootLift);
      leftLeg.pivot.rotation.x = animationState.leftLegSwing;
      rightLeg.pivot.rotation.x = animationState.rightLegSwing;
      leftArm.pivot.rotation.x = animationState.armSwing * animationState.runBlend;
      rightArm.pivot.rotation.x = -animationState.armSwing * animationState.runBlend;
      const jumpLift = grounded ? 0 : 2.2;
      animationState.armLift = THREE.MathUtils.lerp(animationState.armLift, jumpLift, 1 - Math.exp(-12 * dt));
      const idleArmRaise = selectedAvatarId === "kacamata-hitam" ? 0.46 * (1 - animationState.runBlend) : 0;
      leftArm.pivot.rotation.z = animationState.armLift - idleArmRaise;
      rightArm.pivot.rotation.z = -animationState.armLift + idleArmRaise;
      leftArm.elbow.rotation.x = -animationState.elbowBend * animationState.runBlend;
      rightArm.elbow.rotation.x = -animationState.elbowBend * animationState.runBlend;
      bodyRig.position.y = 1 + Math.max(0, animationState.bodyBounce) + animationState.breath;
      bodyRig.rotation.x = animationState.torsoLean;
      bodyRig.rotation.y = animationState.torsoTwist;
      bodyRig.scale.y = 1 - animationState.landingBend * 0.06;
      head.rotation.x = -animationState.torsoLean;
      head.rotation.y = -animationState.torsoTwist;
      if (selectedAvatarId === "cewek-halus" && cewekHalusBuilt && cewekHalusSkeleton && cewekHalusLayer && cewekHalusBodyMesh) {
        const phase = DEBUG_FREEZE_PHASE === null
          ? animationState.phase
          : ((DEBUG_FREEZE_PHASE % 1) + 1) % 1 * Math.PI * 2;
        const alpha = 1 - Math.exp(-dt / CEWEK_HALUS_CONFIG.transitionSeconds);
        const gaitRunning = isRunning || DEBUG_FREEZE_PHASE !== null;
        const runningTarget = gaitRunning ? 1 : 0;
        const strideScale = input.has("shift") ? 1.08 : 1;
        cewekHalusRunBlend = THREE.MathUtils.lerp(cewekHalusRunBlend, runningTarget, alpha);
        cewekHalusBreath = THREE.MathUtils.lerp(
          cewekHalusBreath,
          grounded ? Math.sin(now * 0.0018) * CEWEK_HALUS_CONFIG.breathAmplitude : 0,
          alpha,
        );
        const runBlend = cewekHalusRunBlend;
        const wave = Math.sin(phase);
        const idleShift = grounded && !isRunning ? Math.sin(now * 0.0011) * CEWEK_HALUS_CONFIG.idleWeightShift : 0;
        const pelvis = cewekHalusBones.pelvis!;
        const spine1 = cewekHalusBones.spine1!;
        const spine2 = cewekHalusBones.spine2!;
        const neckBone = cewekHalusBones.neck!;
        const headBone = cewekHalusBones.head!;
        pelvis.position.y = 0.88 + cewekHalusBreath + idleShift
          + (gaitRunning ? Math.max(0, Math.sin(phase * 2)) * CEWEK_HALUS_CONFIG.runBounce * runBlend : 0);
        pelvis.rotation.x = THREE.MathUtils.lerp(
          pelvis.rotation.x,
          gaitRunning ? CEWEK_HALUS_CONFIG.bodyLean * runBlend : 0,
          alpha,
        );
        pelvis.rotation.y = THREE.MathUtils.lerp(
          pelvis.rotation.y,
          gaitRunning ? wave * CEWEK_HALUS_CONFIG.pelvisYaw * runBlend : idleShift,
          alpha,
        );
        spine1.rotation.y = THREE.MathUtils.lerp(spine1.rotation.y, -pelvis.rotation.y * 0.55, alpha);
        spine2.rotation.y = THREE.MathUtils.lerp(spine2.rotation.y, -pelvis.rotation.y - wave * CEWEK_HALUS_CONFIG.torsoCounterYaw * runBlend, alpha);
        neckBone.rotation.x = THREE.MathUtils.lerp(neckBone.rotation.x, -pelvis.rotation.x * 0.3, alpha);
        headBone.rotation.x = THREE.MathUtils.lerp(
          headBone.rotation.x,
          -pelvis.rotation.x * 0.7 + Math.sin(now * 0.0013) * CEWEK_HALUS_CONFIG.idleHeadNod,
          alpha,
        );
        const ponytail = cewekHalusBones.ponytail!;
        const ponytailSwing = gaitRunning
          ? THREE.MathUtils.clamp(-Math.sin(phase - 0.65) * 0.1 * runBlend, -0.11, 0.11)
          : Math.sin(now * 0.0012) * 0.012;
        setCewekHalusBodyRotation("ponytail", ponytail, cewekHalusSagittalAxis, ponytailSwing, alpha);

        for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
          const side = sideIndex === 0 ? -1 : 1;
          const prefix = side < 0 ? "left" : "right";
          const clavicle = cewekHalusBones[`${prefix}Clavicle` as CewekHalusBoneName]!;
          const upperArm = cewekHalusBones[`${prefix}UpperArm` as CewekHalusBoneName]!;
          const forearm = cewekHalusBones[`${prefix}Forearm` as CewekHalusBoneName]!;
          const hand = cewekHalusBones[`${prefix}Hand` as CewekHalusBoneName]!;
          const thigh = cewekHalusBones[`${prefix}Thigh` as CewekHalusBoneName]!;
          const shin = cewekHalusBones[`${prefix}Shin` as CewekHalusBoneName]!;
          const foot = cewekHalusBones[`${prefix}Foot` as CewekHalusBoneName]!;
          const toe = cewekHalusBones[`${prefix}Toe` as CewekHalusBoneName]!;
          const legWave = side * wave;
          const armWave = -legWave;
          const phaseLag = phase - CEWEK_HALUS_CONFIG.forearmLagCycles * Math.PI * 2;
          const delayedArmWave = -side * Math.sin(phaseLag);
          const jumpAmount = grounded ? 0 : 1;
          const elbowTarget = gaitRunning
            ? -THREE.MathUtils.clamp(
              CEWEK_HALUS_CONFIG.elbowBend * (0.88 + 0.12 * Math.max(0, -delayedArmWave)),
              0,
              CEWEK_HALUS_CONFIG.elbowMaxBend,
            )
            : grounded ? -CEWEK_HALUS_CONFIG.idleElbowBend : -CEWEK_HALUS_CONFIG.idleElbowBend * 1.5;
          const rearLegBend = Math.max(0, legWave);
          const kneeTarget = !grounded
            ? CEWEK_HALUS_CONFIG.jumpKneeBend
            : animationState.landingBend * CEWEK_HALUS_CONFIG.landingKneeBend
              + (gaitRunning ? rearLegBend * CEWEK_HALUS_CONFIG.kneeForwardBend : 0);
          const boundedKnee = THREE.MathUtils.clamp(kneeTarget, 0, CEWEK_HALUS_CONFIG.kneeMaxBend);

          setCewekHalusBodyRotation(
            clavicle.name,
            clavicle,
            cewekHalusAbductionAxis,
            side * (CEWEK_HALUS_CONFIG.shoulderAbduction + jumpAmount * CEWEK_HALUS_CONFIG.jumpArmRaise),
            alpha,
          );
          setCewekHalusBodyRotation(
            upperArm.name,
            upperArm,
            cewekHalusSagittalAxis,
            armWave * CEWEK_HALUS_CONFIG.shoulderSwing * runBlend * strideScale
              - jumpAmount * CEWEK_HALUS_CONFIG.jumpArmRaise * 0.4,
            alpha,
          );
          setCewekHalusBodyRotation(forearm.name, forearm, cewekHalusSagittalAxis, elbowTarget, alpha);
          setCewekHalusBodyRotation(hand.name, hand, cewekHalusSagittalAxis, -elbowTarget * 0.12, alpha);
          setCewekHalusBodyRotation(
            thigh.name,
            thigh,
            cewekHalusSagittalAxis,
            legWave * CEWEK_HALUS_CONFIG.hipSwing * runBlend * strideScale,
            alpha,
          );
          setCewekHalusBodyRotation(shin.name, shin, cewekHalusSagittalAxis, boundedKnee, alpha);
          const thighAngle = cewekHalusPoseAngles.get(thigh.name) ?? 0;
          const shinAngle = cewekHalusPoseAngles.get(shin.name) ?? 0;
          const footTarget = grounded
            ? -thighAngle - shinAngle
            : -thighAngle - shinAngle + CEWEK_HALUS_CONFIG.ankleSwing;
          setCewekHalusBodyRotation(
            foot.name,
            foot,
            cewekHalusSagittalAxis,
            footTarget,
            alpha,
          );
          setCewekHalusBodyRotation(
            toe.name,
            toe,
            cewekHalusSagittalAxis,
            -(cewekHalusPoseAngles.get(foot.name) ?? 0) * 0.3,
            alpha,
          );

        }
      }
      if ((selectedAvatarId === "cowok-kemeja" || selectedAvatarId === "petualang-flanel")
        && kemejaBuilt && kemejaRoot && kemejaTorsoMotion && kemejaHead) {
        const phase = KEMEJA_DEBUG_FREEZE_PHASE === null
          ? animationState.phase
          : ((KEMEJA_DEBUG_FREEZE_PHASE % 1) + 1) % 1 * Math.PI * 2;
        const alpha = 1 - Math.exp(-dt / KEMEJA_CONFIG.transitionSeconds);
        const gaitActive = isRunning || KEMEJA_DEBUG_FREEZE_PHASE !== null;
        const runTarget = gaitActive ? 1 : 0;
        const runScale = input.has("shift") ? 1.08 : 1;
        kemejaRunBlend = THREE.MathUtils.lerp(kemejaRunBlend, runTarget, alpha);
        kemejaBreath = THREE.MathUtils.lerp(
          kemejaBreath,
          grounded && !isRunning ? Math.sin(now * 0.0018) * KEMEJA_CONFIG.idleBreathAmplitude : 0,
          alpha,
        );
        kemejaWeightShift = THREE.MathUtils.lerp(
          kemejaWeightShift,
          grounded && !isRunning ? Math.sin(now * 0.0011) * KEMEJA_CONFIG.idleWeightShift : 0,
          alpha,
        );
        const wave = Math.sin(phase);
        const bounce = gaitActive
          ? Math.max(0, Math.sin(phase * 2)) * KEMEJA_CONFIG.runBounce * kemejaRunBlend
          : 0;
        kemejaTorsoMotion.position.y = KEMEJA_CONFIG.torsoY + kemejaBreath + kemejaWeightShift + bounce;
        kemejaTorsoMotion.rotation.x = THREE.MathUtils.lerp(
          kemejaTorsoMotion.rotation.x,
          gaitActive ? KEMEJA_CONFIG.bodyLean * kemejaRunBlend : 0,
          alpha,
        );
        kemejaTorsoMotion.rotation.y = THREE.MathUtils.lerp(
          kemejaTorsoMotion.rotation.y,
          gaitActive ? wave * RUN_CONFIG.torsoTwist * kemejaRunBlend : kemejaWeightShift,
          alpha,
        );
        kemejaHead.rotation.x = THREE.MathUtils.lerp(
          kemejaHead.rotation.x,
          -kemejaTorsoMotion.rotation.x + Math.sin(now * 0.0013) * 0.008,
          alpha,
        );
        kemejaHead.rotation.y = THREE.MathUtils.lerp(
          kemejaHead.rotation.y,
          -kemejaTorsoMotion.rotation.y * 0.45,
          alpha,
        );
        if (kemejaHair) {
          kemejaHair.rotation.x = THREE.MathUtils.lerp(
            kemejaHair.rotation.x,
            gaitActive ? THREE.MathUtils.clamp(-Math.sin(phase - 0.45) * KEMEJA_CONFIG.hairSway, -0.035, 0.035) : 0,
            1 - Math.exp(-8 * dt),
          );
        }
        kemejaArms.forEach(({ shoulder, upper, elbow, wrist, side }) => {
          const legWave = -side * wave;
          const delayedWave = -side * Math.sin(phase - KEMEJA_CONFIG.forearmLagCycles * Math.PI * 2);
          const jumpAmount = grounded ? 0 : 1;
          shoulder.rotation.z = THREE.MathUtils.lerp(
            shoulder.rotation.z,
            side * (KEMEJA_CONFIG.shoulderAbduction + jumpAmount * 0.04),
            alpha,
          );
          upper.rotation.x = THREE.MathUtils.lerp(
            upper.rotation.x,
            -legWave * KEMEJA_CONFIG.shoulderSwing * kemejaRunBlend * runScale
              - jumpAmount * KEMEJA_CONFIG.jumpArmRaise,
            alpha,
          );
          const elbowTarget = gaitActive
            ? THREE.MathUtils.lerp(
              KEMEJA_CONFIG.elbowBackBend,
              KEMEJA_CONFIG.elbowFrontBend,
              THREE.MathUtils.clamp(-delayedWave, 0, 1),
            )
            : grounded ? 0.14 : 0.32;
          elbow.rotation.x = THREE.MathUtils.lerp(elbow.rotation.x, -elbowTarget, alpha);
          wrist.rotation.x = THREE.MathUtils.lerp(
            wrist.rotation.x,
            gaitActive ? -elbowTarget * 0.12 + Math.sin(phase - 0.2) * 0.04 : 0,
            alpha,
          );
        });
        kemejaLegs.forEach(({ hip, upper, knee, ankle, side }) => {
          const legWave = -side * wave;
          const jumpAmount = grounded ? 0 : 1;
          const airbornePulse = gaitActive ? Math.pow(Math.max(0, Math.sin(phase * 2)), 3) * 0.06 : 0;
          const legLift = gaitActive ? Math.max(0, legWave) * 0.16 + airbornePulse : 0;
          hip.position.y = KEMEJA_CONFIG.hipY + legLift;
          hip.rotation.x = THREE.MathUtils.lerp(
            hip.rotation.x,
            legWave * 0.68 * kemejaRunBlend * runScale,
            alpha,
          );
          upper.rotation.x = THREE.MathUtils.lerp(
            upper.rotation.x,
            jumpAmount * KEMEJA_CONFIG.jumpKneeBend * 0.2,
            alpha,
          );
          const kneeTarget = !grounded
            ? KEMEJA_CONFIG.jumpKneeBend
            : animationState.landingBend * KEMEJA_CONFIG.landingKneeBend
              + (gaitActive ? Math.max(0, -legWave) * KEMEJA_CONFIG.kneeBend : 0);
          knee.rotation.x = THREE.MathUtils.lerp(
            knee.rotation.x,
            THREE.MathUtils.clamp(kneeTarget, 0, 1.74),
            alpha,
          );
          ankle.rotation.x = THREE.MathUtils.lerp(
            ankle.rotation.x,
            gaitActive ? -hip.rotation.x - knee.rotation.x * 0.18 + legWave * 0.08 : -hip.rotation.x * 0.2,
            alpha,
          );
        });
        if (selectedAvatarId === "petualang-flanel" && petualangFlanelRoot) {
          petualangFlanelPosePairs.forEach(({ source, target }) => {
            target.position.copy(source.position);
            target.quaternion.copy(source.quaternion);
          });
        }
      }
      if (selectedAvatarId === "chibi-halus" && chibiBuilt && chibiLayer && chibiSkeleton && chibiBodyMesh) {
        const debugLocks = DEBUG_PANEL ? debugOptionsRef.current : INITIAL_DEBUG_PANEL_OPTIONS;
        const frozenPhase = DEBUG_PANEL ? debugOptionsRef.current.freezePhase : CHIBI_DEBUG_FREEZE_PHASE;
        const cycle = frozenPhase === null
          ? ((animationState.phase / (Math.PI * 2)) % 1 + 1) % 1
          : ((frozenPhase % 1) + 1) % 1;
        const gaitActive = isRunning || frozenPhase !== null;
        const alpha = 1 - Math.exp(-dt / CHIBI_CONFIG.transitionSeconds);
        const runTarget = gaitActive ? 1 : 0;
        const runScale = input.has("shift") ? 1.08 : 1;
        chibiRunBlend = THREE.MathUtils.lerp(chibiRunBlend, runTarget, alpha);
        chibiBreath = THREE.MathUtils.lerp(
          chibiBreath,
          grounded && !isRunning ? Math.sin(now * 0.0017) * CHIBI_CONFIG.idleBreath : 0,
          alpha,
        );

        const poses = CHIBI_CONFIG.runKeyframes;
        const afterIndex = poses.findIndex((pose) => pose.phase >= cycle);
        const beforeIndex = afterIndex < 0 ? poses.length - 1 : (afterIndex + poses.length - 1) % poses.length;
        const poseBefore = poses[beforeIndex]!;
        const poseAfter = afterIndex < 0 ? poses[0]! : poses[afterIndex]!;
        const beforePhase = poseBefore.phase - (afterIndex === 0 ? 1 : 0);
        const afterPhase = poseAfter.phase + (afterIndex < 0 ? 1 : 0);
        const poseT = THREE.MathUtils.clamp((cycle - beforePhase) / (afterPhase - beforePhase), 0, 1);
        const easedPoseT = poseT * poseT * (3 - 2 * poseT);
        const angleAt = (name: "shoulder" | "elbow" | "hip" | "knee", sideIndex: 0 | 1) => (
          THREE.MathUtils.lerp(poseBefore[name][sideIndex], poseAfter[name][sideIndex], easedPoseT) * Math.PI / 180
        );
        const heightAt = THREE.MathUtils.lerp(poseBefore.height, poseAfter.height, easedPoseT);
        const jumpAmount = grounded ? 0 : 1;
        const lift = gaitActive ? heightAt * chibiRunBlend : 0;
        const idleShift = grounded && !isRunning ? Math.sin(now * 0.0011) * 0.008 : 0;
        const pelvisBone = chibiBones.pelvis!;
        if (!debugLocks.lockBody) {
          pelvisBone.position.y = 0.8 + chibiBreath + idleShift + lift + jumpAmount * 0.045;
        }
        if (debugLocks.lockHipYawRoll) {
          pelvisBone.rotation.y = 0;
          pelvisBone.rotation.z = 0;
        }
        const spine1Bone = chibiBones.spine1!;
        if (!debugLocks.lockBody) {
          spine1Bone.rotation.x = gaitActive ? CHIBI_CONFIG.bodyLean * chibiRunBlend : chibiBreath * 0.2;
        }
        const spine2Bone = chibiBones.spine2!;
        if (!debugLocks.lockBody) {
          spine2Bone.rotation.y = gaitActive ? Math.sin(cycle * Math.PI * 2) * RUN_CONFIG.torsoTwist * chibiRunBlend : idleShift;
        }
        const headBone = chibiBones.head!;
        if (!debugLocks.lockBody) {
          headBone.rotation.x = -spine1Bone.rotation.x + Math.sin(now * 0.0013) * 0.006;
          headBone.rotation.y = -spine2Bone.rotation.y * 0.45;
        }

        [-1, 1].forEach((side, sideIndex) => {
          const index = sideIndex as 0 | 1;
          const prefix = side < 0 ? "left" : "right";
          const clavicle = chibiBones[`${prefix}Clavicle` as ChibiBoneName]!;
          const upperArm = chibiBones[`${prefix}UpperArm` as ChibiBoneName]!;
          const forearm = chibiBones[`${prefix}Forearm` as ChibiBoneName]!;
          const wrist = chibiBones[`${prefix}Hand` as ChibiBoneName]!;
          const armAngle = gaitActive
            ? angleAt("shoulder", index) * chibiRunBlend * runScale
            : 7 * Math.PI / 180;
          if (!debugLocks.lockArms) {
            clavicle.rotation.z = side * CHIBI_CONFIG.shoulderAbduction;
            upperArm.rotation.x = -armAngle - jumpAmount * 0.72;
            const elbowAngle = gaitActive ? angleAt("elbow", index) * chibiRunBlend : 12 * Math.PI / 180;
            forearm.rotation.x = -elbowAngle;
            wrist.rotation.x = gaitActive
              ? Math.sin((cycle - CHIBI_CONFIG.forearmLagCycles) * Math.PI * 2) * 0.045
              : 0.025;
          }

          const thigh = chibiBones[`${prefix}Thigh` as ChibiBoneName]!;
          const shin = chibiBones[`${prefix}Shin` as ChibiBoneName]!;
          const foot = chibiBones[`${prefix}Foot` as ChibiBoneName]!;
          const toe = chibiBones[`${prefix}Toe` as ChibiBoneName]!;
          const lockLeg = side < 0 ? debugLocks.lockLeftLeg : debugLocks.lockRightLeg;
          const hipAngle = gaitActive ? angleAt("hip", index) * chibiRunBlend * runScale : 0;
          const kneeAngle = gaitActive
            ? angleAt("knee", index) * chibiRunBlend
            : jumpAmount * 0.38;
          if (!lockLeg) {
            thigh.rotation.x = -hipAngle + jumpAmount * 0.18;
            shin.rotation.x = -kneeAngle;
            foot.rotation.x = hipAngle + kneeAngle;
            toe.rotation.x = -foot.rotation.x * 0.2;
          }
          if (debugLocks.lockHipYawRoll) {
            thigh.rotation.y = 0;
            thigh.rotation.z = 0;
          }
        });

        const ponytailBone = chibiBones.ponytail!;
        if (!debugLocks.lockSecondaryMotion) {
          ponytailBone.rotation.x = THREE.MathUtils.clamp(
            gaitActive ? Math.sin(cycle * Math.PI * 2 - 0.45) * CHIBI_CONFIG.hairSway : 0,
            -0.05,
            0.05,
          );
        }
        if (chibiHairRoot && !debugLocks.lockSecondaryMotion) {
          chibiHairRoot.rotation.x = THREE.MathUtils.lerp(
            chibiHairRoot.rotation.x,
            gaitActive ? -ponytailBone.rotation.x * 0.55 : 0,
            1 - Math.exp(-8 * dt),
          );
        }

        if (grounded && !isRunning) {
          if (now >= chibiNextBlinkAt) {
            chibiBlinkUntil = now + 130;
            chibiNextBlinkAt = now + 3000 + Math.random() * 2000;
          }
          if (now >= chibiNextHappyAt) {
            chibiHappyUntil = now + 1000;
            chibiNextHappyAt = now + 8000 + Math.random() * 4000;
          }
        }
        const nextFaceIndex = jumpAmount
          ? 3
          : now < chibiBlinkUntil
            ? 1
            : now < chibiHappyUntil
              ? 2
              : 0;
        if (nextFaceIndex !== chibiFaceIndex && chibiFaceMaterial && chibiFaceTextures[nextFaceIndex]) {
          chibiFaceIndex = nextFaceIndex;
          chibiFaceMaterial.map = chibiFaceTextures[nextFaceIndex]!;
        }
        chibiLayer.updateMatrixWorld(true);
        chibiDebugSkeletonHelper?.updateMatrixWorld(true);
      }
      if (selectedAvatarId === "chibi-kucing" && kucingBuilt && kucingLayer && kucingSkeleton && kucingBodyMesh) {
        const debugLocks = DEBUG_PANEL ? debugOptionsRef.current : INITIAL_DEBUG_PANEL_OPTIONS;
        const frozenPhase = DEBUG_PANEL ? debugOptionsRef.current.freezePhase : KUCING_DEBUG_FREEZE_PHASE;
        const cycle = frozenPhase === null
          ? ((animationState.phase / (Math.PI * 2)) % 1 + 1) % 1
          : ((frozenPhase % 1) + 1) % 1;
        const gaitActive = isRunning || frozenPhase !== null;
        const alpha = 1 - Math.exp(-dt / KUCING_CONFIG.transitionSeconds);
        const runTarget = gaitActive ? 1 : 0;
        const runScale = input.has("shift") ? 1.08 : 1;
        kucingRunBlend = THREE.MathUtils.lerp(kucingRunBlend, runTarget, alpha);
        kucingBreath = THREE.MathUtils.lerp(
          kucingBreath,
          grounded && !isRunning ? Math.sin(now * 0.0017) * KUCING_CONFIG.idleBreath : 0,
          alpha,
        );

        const poses = KUCING_CONFIG.runKeyframes;
        const afterIndex = poses.findIndex((pose) => pose.phase >= cycle);
        const beforeIndex = afterIndex < 0 ? poses.length - 1 : (afterIndex + poses.length - 1) % poses.length;
        const poseBefore = poses[beforeIndex]!;
        const poseAfter = afterIndex < 0 ? poses[0]! : poses[afterIndex]!;
        const beforePhase = poseBefore.phase - (afterIndex === 0 ? 1 : 0);
        const afterPhase = poseAfter.phase + (afterIndex < 0 ? 1 : 0);
        const poseT = THREE.MathUtils.clamp((cycle - beforePhase) / (afterPhase - beforePhase), 0, 1);
        const easedPoseT = poseT * poseT * (3 - 2 * poseT);
        const angleAt = (name: "shoulder" | "elbow" | "hip" | "knee", sideIndex: 0 | 1) => (
          THREE.MathUtils.lerp(poseBefore[name][sideIndex], poseAfter[name][sideIndex], easedPoseT) * Math.PI / 180
        );
        const heightAt = THREE.MathUtils.lerp(poseBefore.height, poseAfter.height, easedPoseT);
        const jumpAmount = grounded ? 0 : 1;
        const lift = gaitActive ? heightAt * kucingRunBlend : 0;
        const idleShift = grounded && !isRunning ? Math.sin(now * 0.0011) * 0.008 : 0;
        const pelvisBone = kucingBones.pelvis!;
        if (!debugLocks.lockBody) {
          pelvisBone.position.y = 0.8 + kucingBreath + idleShift + lift + jumpAmount * 0.045;
        }
        if (debugLocks.lockHipYawRoll) {
          pelvisBone.rotation.y = 0;
          pelvisBone.rotation.z = 0;
        }
        const spine1Bone = kucingBones.spine1!;
        if (!debugLocks.lockBody) {
          spine1Bone.rotation.x = gaitActive ? KUCING_CONFIG.bodyLean * kucingRunBlend : kucingBreath * 0.2;
        }
        const spine2Bone = kucingBones.spine2!;
        if (!debugLocks.lockBody) {
          spine2Bone.rotation.y = gaitActive ? Math.sin(cycle * Math.PI * 2) * RUN_CONFIG.torsoTwist * kucingRunBlend : idleShift;
        }
        const headBone = kucingBones.head!;
        if (!debugLocks.lockBody) {
          headBone.rotation.x = -spine1Bone.rotation.x + Math.sin(now * 0.0013) * 0.006;
          headBone.rotation.y = -spine2Bone.rotation.y * 0.45;
        }

        [-1, 1].forEach((side, sideIndex) => {
          const index = sideIndex as 0 | 1;
          const prefix = side < 0 ? "left" : "right";
          const clavicle = kucingBones[`${prefix}Clavicle` as ChibiBoneName]!;
          const upperArm = kucingBones[`${prefix}UpperArm` as ChibiBoneName]!;
          const forearm = kucingBones[`${prefix}Forearm` as ChibiBoneName]!;
          const wrist = kucingBones[`${prefix}Hand` as ChibiBoneName]!;
          const armAngle = gaitActive
            ? angleAt("shoulder", index) * kucingRunBlend * runScale
            : 7 * Math.PI / 180;
          if (!debugLocks.lockArms) {
            clavicle.rotation.z = side * KUCING_CONFIG.shoulderAbduction;
            upperArm.rotation.x = -armAngle - jumpAmount * 0.72;
            const elbowAngle = gaitActive ? angleAt("elbow", index) * kucingRunBlend : 12 * Math.PI / 180;
            forearm.rotation.x = -elbowAngle;
            wrist.rotation.x = gaitActive
              ? Math.sin((cycle - KUCING_CONFIG.forearmLagCycles) * Math.PI * 2) * 0.045
              : 0.025;
          }

          const thigh = kucingBones[`${prefix}Thigh` as ChibiBoneName]!;
          const shin = kucingBones[`${prefix}Shin` as ChibiBoneName]!;
          const foot = kucingBones[`${prefix}Foot` as ChibiBoneName]!;
          const toe = kucingBones[`${prefix}Toe` as ChibiBoneName]!;
          const lockLeg = side < 0 ? debugLocks.lockLeftLeg : debugLocks.lockRightLeg;
          const hipAngle = gaitActive ? angleAt("hip", index) * kucingRunBlend * runScale : 0;
          const kneeAngle = gaitActive ? angleAt("knee", index) * kucingRunBlend : jumpAmount * 0.38;
          if (!lockLeg) {
            thigh.rotation.x = -hipAngle + jumpAmount * 0.18;
            shin.rotation.x = -kneeAngle;
            foot.rotation.x = hipAngle + kneeAngle;
            toe.rotation.x = -foot.rotation.x * 0.2;
          }
          if (debugLocks.lockHipYawRoll) {
            thigh.rotation.y = 0;
            thigh.rotation.z = 0;
          }
        });

        if (!debugLocks.lockSecondaryMotion) {
          kucingHairBones.forEach((bone, index) => {
            const delay = 0.45 + index * 0.11;
            const target = gaitActive
              ? THREE.MathUtils.clamp(Math.sin(cycle * Math.PI * 2 - delay) * KUCING_CONFIG.hairSway, -0.07, 0.07)
              : Math.sin(now * 0.001 + index * 0.4) * 0.006;
            bone.rotation.x = THREE.MathUtils.lerp(
              bone.rotation.x,
              target,
              1 - Math.exp(-KUCING_CONFIG.hairChainDamping * dt),
            );
          });
          kucingEarPivots.forEach((pivot, index) => {
            const side = index === 0 ? -1 : 1;
            const target = gaitActive
              ? Math.sin(cycle * Math.PI * 2 - 0.3) * KUCING_CONFIG.earSway * side
              : 0;
            pivot.rotation.z = THREE.MathUtils.lerp(pivot.rotation.z, side * -0.12 + target, 1 - Math.exp(-9 * dt));
          });
        }
        if (grounded && !isRunning) {
          if (now >= kucingNextBlinkAt) {
            kucingBlinkUntil = now + 130;
            kucingNextBlinkAt = now + 3000 + Math.random() * 2000;
          }
          if (now >= kucingNextHappyAt) {
            kucingHappyUntil = now + 1000;
            kucingNextHappyAt = now + 8000 + Math.random() * 4000;
          }
        }
        const nextFaceIndex = jumpAmount
          ? 3
          : now < kucingBlinkUntil
            ? 1
            : now < kucingHappyUntil
              ? 2
              : 0;
        if (nextFaceIndex !== kucingFaceIndex && kucingFaceMaterial && kucingFaceTextures[nextFaceIndex]) {
          kucingFaceIndex = nextFaceIndex;
          kucingFaceMaterial.map = kucingFaceTextures[nextFaceIndex]!;
        }
        kucingLayer.updateMatrixWorld(true);
      }
      if (selectedAvatarId === "roblox-slim" && robloxSlimBuilt && robloxSlimTorso && robloxSlimUpperTorso && robloxSlimHead) {
        const slimAlpha = 1 - Math.exp(-dt / ROBLOX_SLIM_CONFIG.transitionSeconds);
        const idleWave = Math.sin(now * 0.00125);
        const torsoLeanTarget = (isRunning ? ROBLOX_SLIM_CONFIG.bodyLean * runWeight : 0) - animationState.torsoLean;
        robloxSlimTorso.rotation.x = THREE.MathUtils.lerp(robloxSlimTorso.rotation.x, torsoLeanTarget, slimAlpha);
        robloxSlimTorso.position.x = THREE.MathUtils.lerp(robloxSlimTorso.position.x, grounded ? idleWave * 0.012 : 0, slimAlpha);
        robloxSlimUpperTorso.rotation.y = THREE.MathUtils.lerp(
          robloxSlimUpperTorso.rotation.y,
          -animationState.torsoTwist * 1.4,
          slimAlpha,
        );
        robloxSlimHead.rotation.x = THREE.MathUtils.lerp(robloxSlimHead.rotation.x, idleWave * 0.01, slimAlpha);
        robloxSlimHead.rotation.y = THREE.MathUtils.lerp(robloxSlimHead.rotation.y, -animationState.torsoTwist * 0.3, slimAlpha);

        robloxSlimArms.forEach(({ upper, elbow, wrist, limb, side }) => {
          const delayedPhase = animationState.phase - ROBLOX_SLIM_CONFIG.forearmLagCycles * Math.PI * 2;
          const phaseDrive = -side * Math.sin(delayedPhase);
          const sharedShoulderDrive = -limb.pivot.rotation.x / RUN_CONFIG.legSwing;
          const forwardAmount = THREE.MathUtils.clamp((0.65 * sharedShoulderDrive + 0.35 * phaseDrive + 1) / 2, 0, 1);
          const elbowTarget = isRunning
            ? THREE.MathUtils.lerp(ROBLOX_SLIM_CONFIG.elbowBackward, ROBLOX_SLIM_CONFIG.elbowForward, forwardAmount)
            : grounded
              ? 0.22 + Math.sin(now * 0.0015 + side) * 0.018
              : 0.38;
          const jumpSpread = grounded ? 0 : 0.3;
          upper.rotation.z = THREE.MathUtils.lerp(upper.rotation.z, side * (0.12 + jumpSpread), slimAlpha);
          elbow.rotation.x = THREE.MathUtils.lerp(elbow.rotation.x, elbowTarget, slimAlpha);
          const handPhase = animationState.phase - ROBLOX_SLIM_CONFIG.handLagCycles * Math.PI * 2;
          const wristTarget = isRunning
            ? Math.sin(handPhase) * 0.09 + elbow.rotation.x * 0.12
            : grounded ? 0.035 : -0.06;
          wrist.rotation.x = THREE.MathUtils.lerp(wrist.rotation.x, wristTarget, slimAlpha);
          wrist.rotation.z = THREE.MathUtils.lerp(wrist.rotation.z, side * 0.035, slimAlpha);
        });

        robloxSlimLegs.forEach(({ upper, knee, ankle, limb, side }) => {
          const sharedHipDrive = limb.pivot.rotation.x / RUN_CONFIG.legSwing;
          const phaseBack = side < 0
            ? Math.max(0, -Math.sin(animationState.phase))
            : Math.max(0, Math.sin(animationState.phase));
          const backwardAmount = THREE.MathUtils.clamp(
            phaseBack * (0.75 + 0.25 * Math.min(1, Math.abs(sharedHipDrive))),
            0,
            1,
          );
          const kneeTarget = isRunning
            ? ROBLOX_SLIM_CONFIG.kneeBackward * backwardAmount
            : grounded
              ? 0.025 + animationState.landingBend * 0.28
              : 0.28;
          knee.rotation.x = THREE.MathUtils.lerp(knee.rotation.x, kneeTarget, slimAlpha);
          const footTarget = isRunning
            ? -Math.sin(animationState.phase + side * 0.2) * 0.08 + limb.pivot.rotation.x * 0.06
            : grounded ? 0 : 0.1;
          ankle.rotation.x = THREE.MathUtils.lerp(ankle.rotation.x, footTarget, slimAlpha);

          const hipAngle = limb.pivot.rotation.x;
          const kneeAngle = knee.rotation.x;
          const ankleBaseAngle = hipAngle + kneeAngle;
          const footAngle = ankleBaseAngle + ankle.rotation.x;
          const absCos = Math.abs(Math.cos(footAngle));
          const absSin = Math.abs(Math.sin(footAngle));
          const footBottom = -0.035 * Math.sin(footAngle) - 0.04 * absCos - 0.13 * absSin;
          const soleBottom = -0.037 * Math.cos(footAngle) - 0.035 * Math.sin(footAngle)
            - 0.0125 * absCos - 0.13 * absSin;
          const lowestPoint = limb.pivot.position.y
            - 0.3 * Math.cos(hipAngle)
            + ankle.position.y * Math.cos(ankleBaseAngle)
            + Math.min(footBottom, soleBottom);
          const localLift = Math.max(0, -lowestPoint / Math.max(0.5, Math.cos(hipAngle)));
          upper.position.y = THREE.MathUtils.lerp(upper.position.y, localLift, slimAlpha);
        });
      }
      if (legacyBody.visible) {
        hoodPivot.rotation.x = animationState.hoodSway;
        hairMotion.rotation.x = animationState.hairSway;
        pendantPivot.rotation.x = animationState.pendantSway;
      }
      if (blackHairMotion?.visible && blackHairMotion.parent?.visible) {
        blackHairMotion.rotation.x = animationState.hairSway * 1.25;
        blackHairMotion.rotation.z = Math.sin(animationState.phase - 0.55) * 0.025 * animationState.runBlend;
      }
      if (streetwearHairMotion?.visible && streetwearHairMotion.parent?.visible) {
        streetwearHairMotion.rotation.x = THREE.MathUtils.clamp(animationState.hairSway * 0.55, -0.035, 0.035);
        streetwearHairMotion.rotation.z = THREE.MathUtils.clamp(Math.sin(animationState.phase - 0.65) * 0.018 * animationState.runBlend, -0.018, 0.018);
      }
      if (gumMesh?.visible && gumMesh.parent?.visible) {
        const gumCycle = now * 0.001 * (Math.PI * 2);
        gumMesh.scale.setScalar(1 + Math.sin(gumCycle) * 0.1 + Math.sin(animationState.phase) * animationState.runBlend * 0.025);
        gumMesh.position.y = -0.04 + Math.sin(gumCycle) * 0.009;
      }

      dustParticles.forEach((particle) => {
        if (!particle.mesh.visible) return;
        particle.age += dt;
        if (particle.age >= particle.lifetime) {
          particle.mesh.visible = false;
          return;
        }
        particle.velocity.y -= 0.8 * dt;
        particle.mesh.position.addScaledVector(particle.velocity, dt);
        const progress = particle.age / particle.lifetime;
        particle.mesh.scale.setScalar(particle.baseScale * (1 - progress));
      });

      treasures.forEach((treasure) => {
        if (treasure.collected) return;
        treasure.group.rotation.y = Math.sin(now * 0.0004 + treasure.phase) * 0.12;
        treasure.group.position.y = treasure.home.y + Math.sin(now * 0.002 + treasure.phase) * 0.08;
        const glowPulse = 1 + Math.sin(now * 0.003 + treasure.phase) * 0.08;
        treasure.glow.scale.setScalar(glowPulse);
        treasure.beaconLight.intensity = 0.6 + Math.sin(now * 0.003 + treasure.phase) * 0.2;
      });
      inhabitants.forEach(({ group, homeY, phase, isAnimal }) => {
        group.position.y = homeY + Math.sin(now * 0.0018 + phase) * (isAnimal ? 0.045 : 0.025);
        group.rotation.y = Math.sin(now * 0.0007 + phase) * 0.18;
      });
      if (DEBUG_PANEL && (selectedAvatarId === "chibi-halus" || selectedAvatarId === "chibi-kucing")) {
        const bones = selectedAvatarId === "chibi-kucing" ? kucingBones : chibiBones;
        ["left", "right"].forEach((side) => {
          ["Thigh", "Shin", "Foot"].forEach((segment) => {
            const bone = bones[`${side}${segment}` as ChibiBoneName];
            if (!bone) return;
            recordDebugAngle(`${side}${segment}.x`, bone.rotation.x);
            recordDebugAngle(`${side}${segment}.y`, bone.rotation.y);
            recordDebugAngle(`${side}${segment}.z`, bone.rotation.z);
          });
        });
        const pelvisBone = bones.pelvis;
        if (pelvisBone) {
          recordDebugAngle("pelvis.yaw", pelvisBone.rotation.y);
          recordDebugAngle("pelvis.roll", pelvisBone.rotation.z);
        }
        recordDebugAngle("avatar.yaw", avatar.rotation.y);
        if (now - lastDebugAngleLog >= 1000) {
          console.info("[debug-angle] perubahan terbesar antar frame", {
            joint: debugLargestAngleLabel || "(belum ada perubahan)",
            derajat: Number((debugLargestAngleDelta * 180 / Math.PI).toFixed(2)),
            arahTetap: debugOptionsRef.current.fixedFacing ?? "nonaktif",
          });
          debugLargestAngleDelta = 0;
          debugLargestAngleLabel = "";
          lastDebugAngleLog = now;
        }
      }
      cameraTarget.set(playerPosition.x, playerPosition.y + 1.1, playerPosition.z);
      const cameraDistance = 5.2;
      cameraPosition.set(
        playerPosition.x + Math.sin(cameraYaw) * Math.cos(cameraPitch) * cameraDistance,
        playerPosition.y + 1.6 + Math.sin(cameraPitch) * cameraDistance,
        playerPosition.z + Math.cos(cameraYaw) * Math.cos(cameraPitch) * cameraDistance,
      );
      camera.position.lerp(cameraPosition, 1 - Math.exp(-7 * dt));
      camera.lookAt(cameraTarget);
      applyDebugPanelOptions();
      debugSkeletonHelper?.updateMatrixWorld(true);
      debugVertexNormalsHelper?.update();
      debugAvatarDrawCalls = 0;
      renderer.render(scene, camera);
      if (DEBUG_PANEL && now - lastDebugStatsUpdate >= 250) {
        lastDebugStatsUpdate = now;
        updateDebugAvatarStats();
      }
    };
    frameId = window.requestAnimationFrame(animate);

    return () => {
      effectDisposed = true;
      window.cancelAnimationFrame(frameId);
      renderer.shadowMap.enabled = originalShadowMapEnabled;
      sunlight.visible = originalDirectionalLightVisible;
      hemisphereLight.visible = originalHemisphereLightVisible;
      removeDebugSkeletonHelper();
      removeDebugVertexNormalsHelper();
      debugMeshStates.forEach((state, mesh) => {
        mesh.visible = state.visible;
        mesh.castShadow = state.castShadow;
        mesh.material = state.material;
        const previousCallback = debugOriginalRenderCallbacks.get(mesh);
        if (previousCallback) mesh.onBeforeRender = previousCallback;
      });
      debugOriginalWireframes.forEach((wireframe, material) => {
        if ("wireframe" in material) material.wireframe = wireframe;
      });
      debugOriginalMaterialSettings.forEach((settings, material) => {
        material.side = settings.side;
        if (settings.flatShading !== null && "flatShading" in material) {
          material.flatShading = settings.flatShading;
        }
        material.needsUpdate = true;
      });
      debugBasicMaterials.forEach((material) => material.dispose());
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("touchmove", onTouchMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh && !resources.has(object.geometry)) object.geometry.dispose();
      });
      resources.forEach((resource) => resource.dispose());
      textures.forEach((texture) => texture.dispose());
      skeletons.forEach((skeleton) => skeleton.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      keysRef.current.clear();
      movementStickRef.current = { x: 0, y: 0 };
      movementStickPointerRef.current = null;
    };
  }, [gameStarted, selectedIsland, selectedAvatarId]);

  const answerQuestion = (answer: number) => {
    if (!question || !pendingTreasureRef.current || questionResolved) return;
    setAnswerOutcome(null);
    if (answer !== question.answer) {
      treasureFirstAttemptRef.current = false;
      setWrongAnswerCount((count) => count + 1);
      setAnswerOutcome("wrong");
      setAnswerFeedback(`Belum tepat! +${TREASURE_WRONG_POINTS} poin. Coba hitung sekali lagi.`);
      return;
    }
    const collectedTreasureId = pendingTreasureRef.current.id;
    treasureQuestionIndexRef.current += 1;
    if (treasureFirstAttemptRef.current) {
      setFirstTryCorrectCount((count) => count + 1);
    }
    setCollectedTreasureIds((ids) => [...ids, collectedTreasureId]);
    const nextTreasuresFound = treasuresFound + 1;
    setTreasuresFound(nextTreasuresFound);
    setScore((value) => value + TREASURE_CORRECT_POINTS);
    setQuestionResolved(true);
    setAnswerOutcome("correct");
    setAnswerFeedback(`Benar! +${TREASURE_CORRECT_POINTS} poin.`);
    if (nextTreasuresFound >= TREASURE_COUNT) {
      gameCompleteRef.current = true;
    }
  };

  useEffect(() => {
    if (!question) pendingTreasureRef.current = null;
  }, [question]);

  const restartAdventure = () => {
    const music = worldMusicRef.current;
    music?.pause();
    if (music) music.currentTime = 0;
    setMusicPlaying(false);
    setMusicError(null);
    gameCompleteRef.current = false;
    setGameComplete(false);
    setTreasuresFound(0);
    treasureQuestionIndexRef.current = 0;
    setFirstTryCorrectCount(0);
    setCollectedTreasureIds([]);
    setScore(0);
    setQuestion(null);
    setGameStarted(false);
    setQuestionResolved(false);
    setAnswerOutcome(null);
    setAnswerFeedback(null);
    setWrongAnswerCount(0);
    pendingTreasureRef.current = null;
  };
  const startAdventure = () => {
    treasureQuestionIndexRef.current = 0;
    const music = worldMusicRef.current;
    if (music) {
      music.currentTime = 0;
      void music.play().then(() => {
        setMusicPlaying(true);
        setMusicError(null);
      }).catch((error: unknown) => {
        console.error("NUMATIK WORLD tidak dapat memutar musik:", error);
        setMusicPlaying(false);
        setMusicError("Musik tidak dapat diputar. Tekan tombol musik untuk mencoba lagi.");
      });
    }
    setGameStarted(true);
  };
  const toggleWorldMusic = () => {
    const music = worldMusicRef.current;
    if (!music) return;
    if (musicPlaying) {
      music.pause();
      setMusicPlaying(false);
      setMusicError(null);
      return;
    }
    void music.play().then(() => {
      setMusicPlaying(true);
      setMusicError(null);
    }).catch((error: unknown) => {
      console.error("NUMATIK WORLD tidak dapat memutar musik:", error);
      setMusicPlaying(false);
      setMusicError("Musik tidak dapat diputar. Periksa pengaturan suara perangkat.");
    });
  };
  const continueAfterAnswer = () => {
    if (!questionResolved) return;
    const finishedAllTreasures = treasuresFound >= TREASURE_COUNT;
    pendingTreasureRef.current = null;
    setQuestion(null);
    setQuestionResolved(false);
    setAnswerOutcome(null);
    setAnswerFeedback(null);
    if (finishedAllTreasures) setGameComplete(true);
  };

  const updateMovementStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (movementStickPointerRef.current !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rawX = (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.36);
    const rawY = (event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.36);
    const distance = Math.hypot(rawX, rawY);
    const normalizedDistance = Math.min(1, distance);
    const deadZone = 0.12;
    const adjustedDistance = normalizedDistance <= deadZone
      ? 0
      : (normalizedDistance - deadZone) / (1 - deadZone);
    const next = distance === 0
      ? { x: 0, y: 0 }
      : { x: (rawX / distance) * adjustedDistance, y: (rawY / distance) * adjustedDistance };
    movementStickRef.current = next;
    setMovementStick(next);
  };
  const startMovementStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    movementStickPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateMovementStick(event);
  };
  const stopMovementStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (movementStickPointerRef.current !== event.pointerId) return;
    movementStickPointerRef.current = null;
    movementStickRef.current = { x: 0, y: 0 };
    setMovementStick({ x: 0, y: 0 });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  type DebugBooleanOption =
    | "body" | "hair" | "accessories" | "rig" | "otherPresets" | "wireframe" | "normalMaterial"
    | "skeleton" | "vertexNormals" | "flatShading" | "directionalLight" | "hemisphereLight"
    | "basicMaterial" | "lockArms" | "lockBody" | "lockLeftLeg" | "lockRightLeg"
    | "lockHipYawRoll" | "lockSecondaryMotion";
  const toggleDebugOption = (key: DebugBooleanOption) => {
    setDebugOptions((current) => ({ ...current, [key]: !current[key] }));
  };
  const cycleDebugShadow = (key: "avatarShadows" | "sceneShadows") => {
    setDebugOptions((current) => ({
      ...current,
      [key]: current[key] === "normal" ? "on" : current[key] === "on" ? "off" : "normal",
    }));
  };
  const resetDebugOptions = () => setDebugOptions(INITIAL_DEBUG_PANEL_OPTIONS);
  const closeDebugPanel = () => {
    setDebugOptions(INITIAL_DEBUG_PANEL_OPTIONS);
    setDebugPanelOpen(false);
  };
  const debugPanelToggles: Array<{
    key: DebugBooleanOption;
    label: string;
  }> = [
    { key: "body", label: "Tubuh" },
    { key: "hair", label: "Rambut" },
    { key: "accessories", label: "Headset / aksesori" },
    { key: "rig", label: "Mesh bawaan rig" },
    { key: "otherPresets", label: "Mesh preset lain" },
    { key: "wireframe", label: "Wireframe" },
    { key: "normalMaterial", label: "MeshNormalMaterial" },
    { key: "skeleton", label: "SkeletonHelper" },
    { key: "vertexNormals", label: "VertexNormalsHelper (bind pose)" },
    { key: "flatShading", label: "Flat shading tubuh" },
    { key: "directionalLight", label: "DirectionalLight" },
    { key: "hemisphereLight", label: "HemisphereLight" },
    { key: "basicMaterial", label: "MeshBasicMaterial tubuh" },
    { key: "lockArms", label: "Kunci lengan" },
    { key: "lockBody", label: "Kunci badan" },
    { key: "lockLeftLeg", label: "Kunci kaki kiri" },
    { key: "lockRightLeg", label: "Kunci kaki kanan" },
    { key: "lockHipYawRoll", label: "Kunci yaw/roll pinggul" },
    { key: "lockSecondaryMotion", label: "Kunci rambut/headset" },
  ];

  const treasureRank = TREASURE_RANKS[firstTryCorrectCount] ?? TREASURE_RANKS[0];

  return (
    <main className="world-page">
      <audio ref={worldMusicRef} src="/music/numatik-world.mp3" loop preload="auto" />
      <style>{`
        .world-page{position:relative;width:100%;height:100dvh;min-height:100dvh;overflow:hidden;background:#85dfff;color:#fff;font-family:var(--font-body,'Exo 2'),sans-serif}
        .world-canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
        .world-canvas:active{cursor:grabbing}
        .world-hud{position:absolute;inset:0;pointer-events:none}
        .world-debug-panel{position:absolute;z-index:6;top:76px;right:12px;width:min(360px,calc(100vw - 24px));max-height:calc(100dvh - 92px);overflow:auto;padding:12px;border:2px solid rgba(255,255,255,.95);border-radius:16px;background:rgba(17,35,57,.94);color:#fff;font:600 12px/1.45 var(--font-body,'Exo 2'),sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.32);pointer-events:auto;overscroll-behavior:contain}
        .world-debug-reopen{position:absolute;z-index:6;top:76px;right:12px;min-height:44px;padding:8px 12px;border:2px solid #fff;border-radius:12px;background:rgba(17,35,57,.94);color:#fff;font:800 12px var(--font-body,'Exo 2'),sans-serif;pointer-events:auto;touch-action:manipulation}
        .world-debug-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font:800 13px var(--font-display,'Orbitron'),sans-serif}
        .world-debug-counts{margin-bottom:8px;color:#c7e9ff}
        .world-debug-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
        .world-debug-button,.world-debug-phase button{min-height:44px;padding:7px;border:1px solid rgba(255,255,255,.55);border-radius:10px;background:#315d87;color:#fff;font:700 11px/1.25 var(--font-body,'Exo 2'),sans-serif;touch-action:manipulation}
        .world-debug-button[aria-pressed="true"],.world-debug-phase button[aria-pressed="true"]{background:#167e6b;border-color:#76f0d0}
        .world-debug-button:disabled{background:#424b57;color:#c5cbd1}
        .world-debug-group{display:grid;gap:5px;margin-top:8px}
        .world-debug-group>strong{color:#c7e9ff}
        .world-debug-choice-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
        .world-debug-choice-row.three{grid-template-columns:repeat(3,minmax(0,1fr))}
        .world-debug-phase{display:grid;grid-template-columns:1fr;gap:6px;margin-top:8px}
        .world-debug-phase-buttons{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}
        .world-debug-objects{margin-top:8px}
        .world-debug-objects summary{min-height:36px;padding:7px 0;color:#c7e9ff;font-weight:800;cursor:pointer}
        .world-debug-object-list{display:grid;gap:6px;margin:0;padding:0;list-style:none}
        .world-debug-object{padding:7px;border-radius:8px;background:rgba(255,255,255,.09);overflow-wrap:anywhere}
        .world-debug-object strong{display:block;color:#fff}
        .world-debug-object span{display:block;color:#c8d6e5;font-size:10px}
        .world-top{position:absolute;top:clamp(14px,3vh,28px);left:clamp(14px,3vw,34px);right:clamp(14px,3vw,34px);display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
        .world-brand{display:flex;align-items:center;gap:12px}
        .world-back,.world-score{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:9px 14px;border:1px solid rgba(255,255,255,.92);border-radius:16px;background:rgba(255,255,255,.88);color:#315d87;font:800 11px var(--font-display,'Orbitron'),sans-serif;box-shadow:0 6px 20px rgba(34,99,137,.16);backdrop-filter:blur(8px)}
        .world-back{pointer-events:auto;cursor:pointer}
        .world-score{font-size:13px;color:#3672cb}
        .world-music-toggle{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:42px;padding:9px 13px;border:1px solid rgba(255,255,255,.92);border-radius:16px;background:rgba(255,255,255,.88);color:#315d87;font:800 11px var(--font-display,'Orbitron'),sans-serif;box-shadow:0 6px 20px rgba(34,99,137,.16);pointer-events:auto;cursor:pointer}
        .world-music-error{position:absolute;z-index:4;top:76px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 28px);padding:10px 14px;border:1px solid #ffd1b8;border-radius:12px;background:#fff2e9;color:#9c4a26;font-size:12px;font-weight:800;text-align:center;box-shadow:0 6px 20px rgba(34,99,137,.16)}
        .world-radar{position:absolute;z-index:2;top:82px;right:clamp(14px,3vw,34px);display:grid;justify-items:center;gap:4px;width:152px;padding:9px 10px 8px;border:1px solid rgba(255,255,255,.92);border-radius:18px;background:rgba(22,57,79,.78);box-shadow:0 6px 20px rgba(20,54,78,.2);backdrop-filter:blur(8px);color:#fff}
        .world-radar-title{font:800 10px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.1em}
        .world-radar-map{display:block;width:126px;height:126px;overflow:visible}
        .world-radar-grid{fill:none;stroke:rgba(207,239,255,.35);stroke-width:1}
        .world-radar-treasure{fill:#ffe56c;stroke:#fff8cc;stroke-width:1.5;filter:drop-shadow(0 0 3px #ffd53d);animation:world-radar-pulse 1.5s ease-in-out infinite}
        .world-radar-player{fill:#66e8ff;stroke:#fff;stroke-width:2;filter:drop-shadow(0 0 4px #48dfff)}
        .world-radar-legend{display:flex;justify-content:center;gap:9px;color:#e5f6ff;font-size:9px;font-weight:700;white-space:nowrap}
        .world-radar-legend span{display:inline-flex;align-items:center;gap:4px}
        .world-radar-legend i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#ffe56c}
        .world-radar-legend .world-radar-player-key{background:#66e8ff}
        @keyframes world-radar-pulse{50%{opacity:.55;filter:drop-shadow(0 0 7px #ffd53d)}}
        .world-title{font:900 clamp(16px,2.4vw,25px)/1 var(--font-display,'Orbitron'),sans-serif;letter-spacing:.04em;text-shadow:0 2px 0 #3478c8,0 5px 12px rgba(22,80,138,.3)}
        .world-subtitle{margin-top:5px;font-size:11px;font-weight:700;color:#fff;text-shadow:0 1px 5px rgba(20,83,133,.4)}
        .world-brand-mark{display:grid;place-items:center;width:42px;height:42px;overflow:hidden;border:2px solid #fff;border-radius:14px;background:#fff;box-shadow:0 5px 16px rgba(34,99,137,.18)}
        .world-brand-mark img{width:100%;height:100%;object-fit:cover}
        .world-bottom{position:absolute;left:50%;bottom:clamp(14px,3vh,28px);transform:translateX(-50%);padding:10px 17px;border:1px solid rgba(255,255,255,.86);border-radius:15px;background:rgba(255,255,255,.85);color:#315d87;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 5px 17px rgba(34,99,137,.14);backdrop-filter:blur(8px)}
        .world-bottom kbd{padding:3px 6px;border:1px solid #bedcf0;border-radius:6px;background:#eff9ff;color:#3974c6;font:800 10px var(--font-display,'Orbitron'),sans-serif}
        .world-hud .world-mobile-controls{pointer-events:auto}
        .world-mobile-controls{position:absolute;left:max(16px,env(safe-area-inset-left));bottom:max(18px,env(safe-area-inset-bottom));display:grid;width:132px;height:132px;place-items:center;border:1px solid rgba(255,255,255,.85);border-radius:50%;background:radial-gradient(circle,rgba(86,166,224,.36) 0 42%,rgba(38,101,168,.62) 43% 100%);box-shadow:0 8px 24px rgba(17,63,108,.3),inset 0 0 0 8px rgba(255,255,255,.12);touch-action:none;user-select:none;-webkit-user-select:none}
        .world-mobile-controls:before{position:absolute;inset:23%;border:1px solid rgba(255,255,255,.3);border-radius:50%;content:"";pointer-events:none}
        .world-stick-knob{position:absolute;left:50%;top:50%;width:48px;height:48px;transform:translate(-50%,-50%);border:2px solid rgba(255,255,255,.95);border-radius:50%;background:linear-gradient(145deg,rgba(119,205,255,.96),rgba(48,117,207,.96));box-shadow:0 4px 13px rgba(12,48,93,.35);pointer-events:none}
        .world-jump{position:absolute;right:20px;bottom:23px;width:64px;height:64px;border:1px solid #fff;border-radius:50%;background:linear-gradient(145deg,#ffb650,#ff7c68);color:#fff;font:800 10px var(--font-display,'Orbitron'),sans-serif;box-shadow:0 6px 18px rgba(163,84,59,.25);pointer-events:auto;touch-action:none}
        .world-question-layer{position:absolute;inset:0;display:grid;place-items:center;padding:16px;background:rgba(37,103,145,.28);backdrop-filter:blur(5px);pointer-events:auto}
        .world-question-card{width:min(440px,calc(100vw - 28px));padding:clamp(22px,5vw,36px);border:2px solid rgba(255,255,255,.95);border-radius:26px;background:linear-gradient(145deg,#fff,#eaf8ff);text-align:center;box-shadow:0 22px 65px rgba(22,88,128,.3)}
        .world-question-kicker{display:flex;justify-content:center;align-items:center;gap:7px;color:#229b83;font:800 10px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.12em}
        .world-question-title{margin:12px 0;color:#315d87;font:900 clamp(21px,5vw,28px) var(--font-display,'Orbitron'),sans-serif}
        .world-question-prompt{margin:14px 0 22px;color:#3672cb;font:900 clamp(38px,9vw,54px) var(--font-display,'Orbitron'),sans-serif}
        .world-answer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .world-answer{min-height:54px;border:0;border-radius:14px;background:linear-gradient(135deg,#49b8f3,#5175e8);color:#fff;font:800 20px var(--font-display,'Orbitron'),sans-serif;box-shadow:0 5px 12px rgba(58,116,202,.2);cursor:pointer}
        .world-answer:hover{filter:brightness(1.08);transform:translateY(-1px)}
        .world-answer:disabled{opacity:.6;cursor:default}
        .world-feedback{min-height:24px;margin-top:12px;color:#249b83;font-size:13px;font-weight:800}
        .world-feedback.is-correct{color:#168b63;animation:world-answer-correct .5s ease-out}
        .world-feedback.is-wrong{color:#d66b32;animation:world-answer-wrong .35s ease-out}
        @keyframes world-answer-correct{0%{transform:scale(.75);opacity:.4}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
        @keyframes world-answer-wrong{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
        .world-question-layer.is-complete{background:radial-gradient(ellipse at 50% 42%,rgba(54,128,183,.22),rgba(17,49,89,.72));backdrop-filter:blur(8px)}
        .world-complete-card{position:relative;width:min(520px,calc(100vw - 28px));max-height:calc(100dvh - 28px);overflow:auto;border:3px solid #fff4bb;background:radial-gradient(ellipse at 50% 0%,#fff7d7 0%,transparent 42%),linear-gradient(155deg,#fff,#eaf8ff 72%);box-shadow:0 0 0 5px rgba(255,206,77,.26),0 28px 80px rgba(21,62,107,.46);animation:world-treasure-arrive .65s cubic-bezier(.18,.8,.24,1) both}
        .world-complete-card:before,.world-complete-card:after{position:absolute;top:-35px;width:110px;height:110px;border:1px solid rgba(255,191,52,.35);border-radius:50%;content:"";pointer-events:none}
        .world-complete-card:before{left:-45px;box-shadow:0 0 0 13px rgba(255,199,62,.08),0 0 0 27px rgba(255,199,62,.06)}
        .world-complete-card:after{right:-45px;box-shadow:0 0 0 13px rgba(255,199,62,.08),0 0 0 27px rgba(255,199,62,.06)}
        @keyframes world-treasure-arrive{from{opacity:0;transform:translateY(22px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}
        .world-complete-sparkles{position:relative;z-index:1;margin:0 0 4px;color:#e3a817;font-size:17px;letter-spacing:.55em}
        .world-complete-kicker{position:relative;z-index:1;color:#208f80;font:900 10px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.18em}
        .world-complete-medal{position:relative;z-index:1;display:grid;place-items:center;width:78px;height:78px;margin:14px auto 10px;border:3px solid #fff;border-radius:26px;background:linear-gradient(145deg,#ffe78e,#ffb737);box-shadow:0 5px 0 #e69b25,0 12px 24px rgba(189,130,38,.26);font-size:40px;transform:rotate(-5deg)}
        .world-complete-card .world-question-title{position:relative;z-index:1;margin:8px 0;color:#315d87;font-size:clamp(20px,5vw,27px);text-shadow:0 2px 0 #fff}
        .world-complete-copy{position:relative;z-index:1;max-width:380px;margin:0 auto 15px;color:#6982a1;font-size:13px;font-weight:700;line-height:1.55}
        .world-complete-chests{position:relative;z-index:1;display:flex;justify-content:center;gap:8px;margin:14px 0}
        .world-complete-chest{display:grid;place-items:center;width:42px;height:42px;border:2px solid #d5e4ef;border-radius:14px;background:#f0f5f8;color:#9badbc;font-size:20px;filter:grayscale(1);opacity:.64}
        .world-complete-chest.is-earned{border-color:#ffd766;background:linear-gradient(145deg,#fff6c8,#ffdc6b);color:#9e6814;filter:none;opacity:1;box-shadow:0 3px 0 #e8ad35,0 0 16px rgba(255,202,67,.3);animation:world-chest-pop .4s ease-out both}
        @keyframes world-chest-pop{from{transform:translateY(6px) scale(.8)}to{transform:translateY(0) scale(1)}}
        .world-complete-score{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:12px;margin:17px 0 12px;padding:13px 17px;border:1px solid #bde9dc;border-radius:18px;background:linear-gradient(135deg,#e1faff,#dcffe9);color:#219b83;text-align:left}
        .world-complete-score span{font-size:10px;font-weight:900;letter-spacing:.09em}
        .world-complete-score strong{font:900 clamp(30px,8vw,40px) var(--font-display,'Orbitron'),sans-serif}
        .world-complete-stats{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 17px}
        .world-complete-stat{padding:10px 7px;border:1px solid #dceaf4;border-radius:14px;background:rgba(255,255,255,.78);color:#527294;font-size:10px;font-weight:800}
        .world-complete-stat strong{display:block;margin-bottom:3px;color:#3672cb;font:900 17px var(--font-display,'Orbitron'),sans-serif}
        .world-complete-card .world-start-button{position:relative;z-index:1;margin-top:8px}
        @media(prefers-reduced-motion:reduce){.world-complete-card,.world-complete-chest.is-earned{animation:none}}
        .world-error{display:grid;place-items:center;height:100%;padding:24px;color:#315d87;text-align:center;font-weight:700}
        .world-start-screen{position:absolute;z-index:5;inset:0;overflow:auto;display:grid;place-items:center;padding:clamp(16px,4vw,40px);background:radial-gradient(ellipse at 10% 12%,rgba(255,255,255,.92),transparent 30%),radial-gradient(ellipse at 90% 85%,rgba(255,221,139,.65),transparent 34%),linear-gradient(145deg,#65d8ed 0%,#8fcef9 48%,#b5a2f5 100%);color:#34547d}
        .world-start-content{width:min(1060px,100%);margin:auto}
        .world-start-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:clamp(18px,4vh,34px)}
        .world-start-back{display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:8px 13px;border:2px solid rgba(255,255,255,.9);border-radius:15px;background:rgba(255,255,255,.78);color:#45638c;font:800 10px var(--font-display,'Orbitron'),sans-serif;box-shadow:0 5px 0 rgba(68,107,163,.14);cursor:pointer}
        .world-start-badge{display:flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid rgba(255,255,255,.76);border-radius:999px;background:rgba(255,255,255,.56);color:#47759b;font-size:11px;font-weight:800}
        .world-start-heading{text-align:center;margin:0 auto 24px}
        .world-start-mark{display:grid;place-items:center;width:58px;height:58px;margin:0 auto 12px;border:3px solid #fff;border-radius:20px;background:linear-gradient(145deg,#48c5ed,#6878ee);color:#fff;box-shadow:0 7px 0 rgba(70,102,175,.22),0 12px 25px rgba(62,107,170,.2);transform:rotate(-5deg)}
        .world-start-title{margin:0;color:#fff;font:1000 clamp(28px,6vw,48px)/1 var(--font-display,'Orbitron'),sans-serif;letter-spacing:.04em;-webkit-text-stroke:1px rgba(66,111,178,.45);text-shadow:0 4px 0 #628ed2,0 8px 0 rgba(60,102,168,.32),0 13px 22px rgba(49,81,136,.2)}
        .world-start-subtitle{margin:12px 0 0;color:#fff;font-size:clamp(13px,2vw,16px);font-weight:800;text-shadow:0 2px 6px rgba(52,88,139,.3)}
        .world-lobby{display:grid;grid-template-columns:minmax(230px,.78fr) minmax(0,1.45fr);gap:16px;align-items:stretch}
        .world-lobby-panel{padding:clamp(17px,2.7vw,25px);border:2px solid rgba(255,255,255,.9);border-radius:24px;background:rgba(255,255,255,.86);box-shadow:0 10px 0 rgba(66,100,154,.12),0 22px 48px rgba(57,95,148,.16);backdrop-filter:blur(10px)}
        .world-lobby-panel h2{margin:0 0 7px;color:#3b5f8c;font:900 15px var(--font-display,'Orbitron'),sans-serif}
        .world-lobby-intro{margin:0 0 16px;color:#6982a1;font-size:12px;font-weight:600;line-height:1.55}
        .world-island-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
        .world-island-card{position:relative;display:grid;grid-template-columns:43px minmax(0,1fr);align-items:center;gap:9px;min-height:76px;padding:10px;border:2px solid #dceaf6;border-radius:17px;background:linear-gradient(145deg,#fff,#f6fbff);color:#3d5d85;text-align:left;box-shadow:0 4px 0 rgba(74,114,165,.08);cursor:pointer;transition:transform .15s,border-color .15s,box-shadow .15s}
        .world-island-card:hover{transform:translateY(-2px);border-color:#a9d8f6}
        .world-island-card[aria-pressed="true"]{border-color:#5bbce9;background:linear-gradient(145deg,#f1fcff,#e2f4ff);box-shadow:0 4px 0 rgba(74,156,203,.2),0 0 0 3px rgba(91,188,233,.13)}
        .world-island-emoji{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:linear-gradient(145deg,#eff9ff,#dff1ff);font-size:25px}
        .world-island-name{display:block;font:900 10px var(--font-display,'Orbitron'),sans-serif;line-height:1.35}
        .world-island-description{display:block;margin-top:4px;color:#8195ad;font-size:10px;font-weight:600;line-height:1.25}
        .world-avatar-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;width:min(760px,100%);margin:0 auto 18px}
        .world-avatar-card{display:flex;flex-direction:column;align-items:stretch;min-width:0;padding:13px;border:2px solid #dceaf6;border-radius:18px;background:linear-gradient(145deg,#fff,#f6fbff);color:#3d5d85;text-align:left;box-shadow:0 4px 0 rgba(74,114,165,.08)}
        .world-avatar-card[data-selected="true"]{border-color:#5bbce9;background:linear-gradient(145deg,#f1fcff,#e2f4ff);box-shadow:0 4px 0 rgba(74,156,203,.2),0 0 0 3px rgba(91,188,233,.13)}
        .world-avatar-preview{position:relative;display:grid;place-items:center;height:154px;overflow:hidden;border-radius:13px;background:radial-gradient(ellipse at 50% 80%,#c5edfa 0 22%,transparent 23%),linear-gradient(150deg,#effaff,#dceeff)}
        .world-avatar-doll{position:relative;width:84px;height:135px}
        .world-avatar-head{position:absolute;z-index:2;top:7px;left:20px;width:44px;height:45px;border:2px solid rgba(51,64,75,.12);border-radius:13px;background:#f2c9a5}
        .world-avatar-hair{position:absolute;z-index:3;top:2px;left:18px;width:48px;height:23px;border-radius:17px 17px 7px 7px;background:#7a4a32}
        .world-avatar-shirt{position:absolute;top:49px;left:14px;width:56px;height:45px;border-radius:13px 13px 10px 10px;background:#e8c98a}
        .world-avatar-vest{position:absolute;z-index:1;top:52px;left:26px;width:32px;height:38px;border-radius:8px;background:#3b3f44}
        .world-avatar-legs{position:absolute;top:88px;left:20px;width:44px;height:35px;border-radius:7px 7px 9px 9px;background:#292c30}
        .world-avatar-shoes{position:absolute;top:118px;left:15px;width:27px;height:12px;border-radius:6px 6px 4px 4px;background:#c98b4e;box-shadow:30px 0 #c98b4e}
        .world-avatar-card[data-avatar="kacamata-hitam"] .world-avatar-head{background:#F3D2BC}
        .world-avatar-card[data-avatar="kacamata-hitam"] .world-avatar-hair{top:0;left:16px;width:52px;height:28px;border-radius:20px 19px 10px 9px;background:#14110F;box-shadow:-5px 8px 0 -2px #14110F,7px 9px 0 -2px #14110F}
        .world-avatar-card[data-avatar="kacamata-hitam"] .world-avatar-shirt{background:#F5F5F5}
        .world-avatar-card[data-avatar="kacamata-hitam"] .world-avatar-vest{z-index:2;top:49px;left:32px;width:5px;height:43px;border-radius:2px;background:#111;box-shadow:15px 0 #111}
        .world-avatar-card[data-avatar="kacamata-hitam"] .world-avatar-legs{left:18px;width:48px;background:#1A1A1A}
        .world-avatar-card[data-avatar="kacamata-hitam"] .world-avatar-shoes{background:#111;box-shadow:30px 0 #111}
        .world-avatar-card[data-avatar="cewek-streetwear"] .world-avatar-head{background:#F3D2BC}
        .world-avatar-card[data-avatar="cewek-streetwear"] .world-avatar-hair{z-index:1;top:8px;left:17px;width:50px;height:76px;border-radius:20px 20px 9px 9px;background:#14110F;box-shadow:-5px 24px 0 -2px #14110F,7px 28px 0 -2px #14110F}
        .world-avatar-card[data-avatar="cewek-streetwear"] .world-avatar-shirt{top:52px;left:19px;width:46px;height:29px;border-radius:9px;background:#151515}
        .world-avatar-card[data-avatar="cewek-streetwear"] .world-avatar-vest{z-index:3;top:48px;left:18px;width:11px;height:37px;border-radius:6px;background:#D63A2F;box-shadow:38px 0 #D63A2F}
        .world-avatar-card[data-avatar="cewek-streetwear"] .world-avatar-legs{left:17px;width:50px;height:40px;background:#1A1A1A}
        .world-avatar-card[data-avatar="cewek-streetwear"] .world-avatar-shoes{top:121px;background:#D63A2F;box-shadow:30px 0 #D63A2F}
        .world-avatar-card[data-avatar="roblox-slim"] .world-avatar-head{background:#F3D2BC}
        .world-avatar-card[data-avatar="roblox-slim"] .world-avatar-hair{top:2px;left:18px;width:48px;height:21px;border-radius:15px 15px 6px 6px;background:#171313;box-shadow:-4px 8px 0 -2px #171313,5px 8px 0 -2px #171313}
        .world-avatar-card[data-avatar="roblox-slim"] .world-avatar-shirt{top:49px;left:18px;width:48px;height:40px;border-radius:8px;background:#3188D8}
        .world-avatar-card[data-avatar="roblox-slim"] .world-avatar-vest{display:none}
        .world-avatar-card[data-avatar="roblox-slim"] .world-avatar-legs{top:87px;left:23px;width:38px;height:37px;border-radius:4px;background:#315C91}
        .world-avatar-card[data-avatar="roblox-slim"] .world-avatar-shoes{top:119px;left:14px;background:#F5F5F5;box-shadow:30px 0 #F5F5F5}
        .world-avatar-beanie{position:absolute;z-index:4;top:2px;left:15px;width:54px;height:20px;border:3px solid #1A1A1A;border-radius:16px 16px 7px 7px;background:#1A1A1A}
        .world-avatar-glasses{position:absolute;z-index:4;top:23px;left:22px;width:40px;height:12px;border:3px solid #111;border-radius:4px;box-shadow:17px 0 0 -2px #F3D2BC}
        .world-avatar-gum{position:absolute;z-index:4;top:42px;left:40px;width:9px;height:9px;border-radius:50%;background:#F4A3C0}
        .world-avatar-title{margin:12px 0 4px;font:900 12px var(--font-display,'Orbitron'),sans-serif}
        .world-avatar-description{min-height:30px;color:#8195ad;font-size:11px;font-weight:600;line-height:1.4}
        .world-avatar-loading{position:absolute;z-index:50;inset:0;display:grid;place-items:center;background:rgba(20,37,54,.36);color:#fff;font:900 12px var(--font-display,'Orbitron'),sans-serif;text-shadow:0 2px 6px rgba(0,0,0,.4);pointer-events:none}
        .world-avatar-loading span{padding:12px 16px;border:1px solid rgba(255,255,255,.7);border-radius:12px;background:rgba(31,67,86,.88)}
        .world-avatar-beta{display:inline-block;margin-left:7px;padding:3px 6px;border-radius:999px;background:#fff0c7;color:#8a5a00;font:800 8px var(--font-display,'Orbitron'),sans-serif;vertical-align:middle}
        .world-avatar-card[data-avatar="cewek-halus"] .world-avatar-head{left:22px;width:40px;height:42px;border-radius:50% 50% 46% 46%;background:#F3D2BC}
        .world-avatar-card[data-avatar="cewek-halus"] .world-avatar-head::after{position:absolute;content:"";left:8px;top:17px;width:6px;height:7px;border-radius:50%;background:#51372C;box-shadow:16px 0 #51372C,7px 12px 0 -2px #D97991}
        .world-avatar-card[data-avatar="cewek-halus"] .world-avatar-hair{top:-1px;left:16px;width:53px;height:30px;border-radius:22px 22px 12px 10px;background:#2B1B17;box-shadow:24px 17px 0 -9px #2B1B17}
        .world-avatar-card[data-avatar="cewek-halus"] .world-avatar-doll::after{position:absolute;z-index:1;content:"";top:21px;left:58px;width:13px;height:43px;border-radius:10px 12px 14px 14px;background:#2B1B17;transform:rotate(-12deg)}
        .world-avatar-card[data-avatar="cewek-halus"] .world-avatar-shirt{top:48px;left:20px;width:44px;height:38px;border-radius:10px;background:#F5F5F5}
        .world-avatar-card[data-avatar="cewek-halus"] .world-avatar-vest{z-index:2;top:49px;left:14px;width:13px;height:39px;border-radius:7px 3px 5px 8px;background:#5B7FA6;box-shadow:43px 0 #5B7FA6}
        .world-avatar-card[data-avatar="cewek-halus"] .world-avatar-legs{top:86px;left:19px;width:46px;height:39px;background:#3E5C86}
        .world-avatar-card[data-avatar="cewek-halus"] .world-avatar-shoes{top:119px;left:14px;background:#F2F2F2;box-shadow:30px 0 #F2F2F2}
        .world-avatar-card[data-avatar="cowok-kemeja"] .world-avatar-head{left:18px;width:48px;height:46px;border-radius:12px;background:#D8A982}
        .world-avatar-card[data-avatar="cowok-kemeja"] .world-avatar-head::before{position:absolute;content:"";left:5px;top:17px;width:33px;height:8px;border:2px solid #111820;border-radius:5px;background:#2A4D9B;box-shadow:17px 0 0 -2px #2A4D9B}
        .world-avatar-card[data-avatar="cowok-kemeja"] .world-avatar-hair{top:-1px;left:14px;width:56px;height:31px;border-radius:20px 20px 12px 12px;background:#D9A441;box-shadow:-5px 25px 0 -3px #B9822C,8px 26px 0 -3px #D9A441,28px 25px 0 -3px #B9822C}
        .world-avatar-card[data-avatar="cowok-kemeja"] .world-avatar-shirt{top:49px;left:15px;width:54px;height:43px;border-radius:9px;background:#8E949B}
        .world-avatar-card[data-avatar="cowok-kemeja"] .world-avatar-vest{z-index:2;top:51px;left:16px;width:23px;height:38px;border-radius:4px;background:repeating-linear-gradient(90deg,#B3262E 0 8px,#1A1A1A 8px 11px,#EDEDED 11px 13px);box-shadow:27px 0 #B3262E}
        .world-avatar-card[data-avatar="cowok-kemeja"] .world-avatar-legs{top:88px;left:18px;width:48px;height:27px;border-radius:5px;background:#4F78B0}
        .world-avatar-card[data-avatar="cowok-kemeja"] .world-avatar-shoes{top:118px;left:14px;background:#E6D8C3;box-shadow:30px 0 #E6D8C3;border-bottom:3px solid #B83228}
        .world-avatar-card[data-avatar="petualang-flanel"] .world-avatar-head{left:18px;width:48px;height:46px;border-radius:12px;background:#D8A982}
        .world-avatar-card[data-avatar="petualang-flanel"] .world-avatar-head::before{position:absolute;content:"";left:5px;top:17px;width:33px;height:8px;border:2px solid #111820;border-radius:5px;background:#2A4D9B;box-shadow:17px 0 0 -2px #2A4D9B}
        .world-avatar-card[data-avatar="petualang-flanel"] .world-avatar-hair{top:-1px;left:14px;width:56px;height:31px;border-radius:20px 20px 12px 12px;background:#D9A441;box-shadow:-5px 25px 0 -3px #B9822C,8px 26px 0 -3px #D9A441,28px 25px 0 -3px #B9822C}
        .world-avatar-card[data-avatar="petualang-flanel"] .world-avatar-shirt{top:49px;left:12px;width:60px;height:43px;border-radius:9px;background:#8E949B}
        .world-avatar-card[data-avatar="petualang-flanel"] .world-avatar-vest{z-index:2;top:51px;left:13px;width:26px;height:38px;border-radius:4px;background:repeating-linear-gradient(90deg,#B3262E 0 8px,#1A1A1A 8px 11px,#EDEDED 11px 13px);box-shadow:29px 0 #B3262E}
        .world-avatar-card[data-avatar="petualang-flanel"] .world-avatar-legs{top:88px;left:16px;width:52px;height:27px;border-radius:5px;background:#4F78B0}
        .world-avatar-card[data-avatar="petualang-flanel"] .world-avatar-shoes{top:118px;left:13px;background:#E6D8C3;box-shadow:32px 0 #E6D8C3;border-bottom:3px solid #B83228}
        .world-avatar-card[data-avatar="chibi-halus"] .world-avatar-head{left:16px;top:6px;width:58px;height:58px;border-radius:48% 48% 46% 46%;background:#D8A982;box-shadow:inset 0 -3px 0 rgba(132,75,48,.12)}
        .world-avatar-card[data-avatar="chibi-halus"] .world-avatar-head::before{position:absolute;content:"";left:12px;top:26px;width:9px;height:12px;border-radius:50%;background:#382B35;box-shadow:24px 0 #382B35,3px -3px 0 -2px #fff,27px -3px 0 -2px #fff}
        .world-avatar-card[data-avatar="chibi-halus"] .world-avatar-head::after{position:absolute;content:"";left:25px;top:41px;width:10px;height:6px;border-bottom:2px solid #382B35;border-radius:0 0 50% 50%;box-shadow:-15px -1px 0 -2px #EE9CA7,15px -1px 0 -2px #EE9CA7}
        .world-avatar-card[data-avatar="chibi-halus"] .world-avatar-hair{z-index:2;top:3px;left:13px;width:63px;height:32px;border-radius:30px 30px 13px 13px;background:#5A3A24;box-shadow:-4px 24px 0 -4px #5A3A24,12px 25px 0 -3px #382316,37px 24px 0 -4px #5A3A24}
        .world-avatar-card[data-avatar="chibi-halus"] .world-avatar-shirt{top:61px;left:17px;width:56px;height:41px;border-radius:17px 17px 13px 13px;background:#C9B6F2}
        .world-avatar-card[data-avatar="chibi-halus"] .world-avatar-vest{z-index:2;top:81px;left:31px;width:28px;height:10px;border-radius:4px 4px 8px 8px;background:#B39DE3}
        .world-avatar-card[data-avatar="chibi-halus"] .world-avatar-legs{top:98px;left:23px;width:45px;height:27px;border-radius:8px 8px 11px 11px;background:#E9D9BE}
        .world-avatar-card[data-avatar="chibi-halus"] .world-avatar-shoes{top:119px;left:15px;width:27px;height:15px;border-radius:10px 10px 6px 6px;background:#F2F2F2;box-shadow:31px 0 #F2F2F2;border-bottom:3px solid #D8D8D8}
        .world-avatar-card[data-avatar="chibi-kucing"] .world-avatar-head{left:16px;top:6px;width:58px;height:58px;border-radius:48% 48% 46% 46%;background:#D8A982}
        .world-avatar-card[data-avatar="chibi-kucing"] .world-avatar-head::before{position:absolute;content:"";left:12px;top:26px;width:9px;height:12px;border-radius:50%;background:#382B35;box-shadow:24px 0 #382B35,3px -3px 0 -2px #fff,27px -3px 0 -2px #fff}
        .world-avatar-card[data-avatar="chibi-kucing"] .world-avatar-head::after{position:absolute;content:"";left:25px;top:41px;width:10px;height:6px;border-bottom:2px solid #382B35;border-radius:0 0 50% 50%;box-shadow:-15px -1px 0 -2px #EE9CA7,15px -1px 0 -2px #EE9CA7}
        .world-avatar-card[data-avatar="chibi-kucing"] .world-avatar-hair{z-index:3;top:3px;left:13px;width:63px;height:34px;border-radius:30px 30px 13px 13px;background:#2B1B17;box-shadow:-12px 33px 0 -3px #2B1B17,9px 37px 0 -3px #17110F,42px 33px 0 -3px #2B1B17}
        .world-avatar-card[data-avatar="chibi-kucing"] .world-avatar-shirt{z-index:1;top:61px;left:17px;width:56px;height:41px;border-radius:17px 17px 13px 13px;background:#EDEDED}
        .world-avatar-card[data-avatar="chibi-kucing"] .world-avatar-vest{z-index:2;top:64px;left:28px;width:34px;height:8px;border-radius:50%;background:#D5D5D5}
        .world-avatar-card[data-avatar="chibi-kucing"] .world-avatar-legs{top:98px;left:23px;width:45px;height:27px;border-radius:8px 8px 11px 11px;background:#E6E6E6}
        .world-avatar-card[data-avatar="chibi-kucing"] .world-avatar-shoes{top:119px;left:15px;width:27px;height:15px;border-radius:10px 10px 6px 6px;background:#F2EEE6;box-shadow:31px 0 #F2EEE6;border-bottom:3px solid #CFCFCF}
        .world-avatar-cat-ears{position:absolute;z-index:5;top:-9px;left:12px;width:60px;height:28px}
        .world-avatar-cat-ears::before,.world-avatar-cat-ears::after{position:absolute;content:"";top:0;width:19px;height:27px;border-radius:45% 45% 15% 15%;background:linear-gradient(135deg,#F4A3C0 0 37%,#2A2A2E 39%);clip-path:polygon(50% 0,100% 100%,0 100%)}
        .world-avatar-cat-ears::before{left:3px;transform:rotate(-13deg)}
        .world-avatar-cat-ears::after{right:3px;transform:rotate(13deg)}
        .world-avatar-cat-headset{position:absolute;z-index:4;top:1px;left:14px;width:56px;height:28px;border:4px solid #2A2A2E;border-bottom:0;border-radius:30px 30px 0 0}
        .world-avatar-pick{min-height:43px;margin-top:12px;border:0;border-radius:13px;background:linear-gradient(135deg,#29cda9,#16a991);color:#fff;font:900 11px var(--font-display,'Orbitron'),sans-serif;cursor:pointer}
        .world-avatar-pick:focus-visible,.world-avatar-change:focus-visible{outline:3px solid #ffbc58;outline-offset:3px}
        .world-avatar-change{display:flex;justify-content:center;align-items:center;width:100%;min-height:44px;margin-top:14px;border:2px solid #cce4f4;border-radius:14px;background:#f5fbff;color:#456b94;font:800 10px var(--font-display,'Orbitron'),sans-serif;cursor:pointer}
        .world-rules{display:grid;gap:11px;margin:16px 0 0;padding:14px;border:1px dashed #bfd7ea;border-radius:17px;background:#f5fbff}
        .world-rule{display:grid;grid-template-columns:27px 1fr;align-items:start;gap:8px;color:#607b9c;font-size:11px;font-weight:650;line-height:1.45}
        .world-rule-icon{display:grid;place-items:center;width:25px;height:25px;border-radius:9px;background:#e2f3ff;font-size:14px}
        .world-rule strong{color:#3f628d}
        .world-start-button{display:flex;justify-content:center;align-items:center;gap:10px;width:100%;min-height:54px;margin-top:15px;border:0;border-radius:17px;background:linear-gradient(135deg,#29cda9,#16a991);color:#fff;font:900 12px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.04em;box-shadow:0 6px 0 #168d7d,0 10px 20px rgba(28,174,148,.2);cursor:pointer;transition:transform .15s,filter .15s}
        .world-start-button:hover{transform:translateY(-2px);filter:brightness(1.05)}
        .world-start-button:active{transform:translateY(3px);box-shadow:0 3px 0 #168d7d}
        .world-start-button:focus-visible,.world-island-card:focus-visible,.world-start-back:focus-visible,.world-avatar-card:focus-visible{outline:3px solid #ffbc58;outline-offset:3px}
        @media(max-width:600px){.world-top{align-items:flex-start}.world-brand{gap:7px}.world-title{font-size:clamp(11px,3.2vw,17px)}.world-subtitle{display:none}.world-brand-mark{width:34px;height:34px}.world-back{min-height:36px;padding:7px 9px;font-size:9px}.world-score{min-height:36px;padding:7px 10px;font-size:11px}.world-radar{top:68px;right:10px;width:122px;padding:7px 6px}.world-radar-map{width:104px;height:104px}.world-bottom{bottom:102px;max-width:calc(100vw - 26px);font-size:10px}.world-mobile-controls{width:120px;height:120px;left:max(12px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom))}.world-jump{right:max(14px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));width:58px;height:58px}}
        @media(orientation:landscape) and (max-height:520px){.world-mobile-controls{width:108px;height:108px;left:max(12px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom))}.world-mobile-controls:before{inset:22%}.world-stick-knob{width:42px;height:42px}.world-jump{right:max(16px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));width:54px;height:54px}.world-bottom{bottom:max(10px,env(safe-area-inset-bottom));padding:8px 11px;font-size:10px}}
        @media(pointer:coarse) and (orientation:landscape) and (max-height:520px){.world-radar{top:68px;right:max(10px,env(safe-area-inset-right));width:112px;gap:3px;padding:6px;border-radius:14px}.world-radar-title{font-size:8px}.world-radar-map{width:92px;height:92px}.world-radar-legend{gap:6px;font-size:8px}.world-radar-legend i{width:6px;height:6px}.world-jump{top:206px;right:max(10px,env(safe-area-inset-right));bottom:auto;width:42px;height:42px;font-size:8px}}
        @media(max-width:760px){.world-start-screen{place-items:start center;padding:10px}.world-start-content{margin:auto}.world-start-top{margin-bottom:10px}.world-start-heading{margin-bottom:12px}.world-start-mark{width:40px;height:40px;margin-bottom:7px;border-radius:14px}.world-start-mark svg{width:22px;height:22px}.world-start-title{font-size:clamp(22px,6vw,34px)}.world-start-subtitle{margin-top:7px;font-size:11px}.world-lobby{grid-template-columns:1fr;gap:11px}.world-lobby-panel{padding:15px;border-radius:20px}.world-lobby-panel h2{font-size:13px}.world-lobby-intro{margin-bottom:12px;font-size:11px}.world-rules{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px;padding:10px}.world-rule{font-size:10px}.world-start-button{min-height:44px;margin-top:10px}.world-avatar-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;margin-bottom:10px}.world-avatar-card{padding:8px;border-radius:13px}.world-avatar-preview{height:96px;border-radius:10px}.world-avatar-doll{transform:scale(.68)}.world-avatar-title{margin:7px 0 2px;font-size:11px}.world-avatar-description{font-size:9px;line-height:1.25}.world-avatar-pick{min-height:36px;margin-top:7px;border-radius:10px;font-size:9px}}
        @media(pointer:coarse) and (orientation:landscape) and (max-height:520px){.world-start-screen{padding:7px}.world-start-top{margin-bottom:5px}.world-start-back{min-height:32px;padding:5px 9px;font-size:8px}.world-start-badge{padding:5px 8px;font-size:8px}.world-start-heading{margin-bottom:7px}.world-start-mark{display:none}.world-start-title{font-size:22px}.world-start-subtitle{margin-top:4px;font-size:9px}.world-avatar-grid{grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:6px;margin-bottom:5px}.world-avatar-card{padding:6px;border-radius:11px}.world-avatar-preview{height:76px}.world-avatar-doll{transform:scale(.54)}.world-avatar-title{margin:5px 0 1px;font-size:9px}.world-avatar-description{font-size:8px}.world-avatar-pick{min-height:30px;margin-top:5px;padding:4px;font-size:8px}}
        @media(max-width:390px){.world-island-grid{gap:7px}.world-island-card{grid-template-columns:34px minmax(0,1fr);gap:7px;min-height:66px;padding:8px}.world-island-emoji{width:34px;height:34px;font-size:21px}.world-island-name{font-size:9px}.world-island-description{font-size:9px}.world-start-badge{font-size:9px;padding:7px 9px}}
        @media(prefers-reduced-motion:reduce){.world-answer:hover{transform:none}.world-radar-treasure{animation:none}}
      `}</style>
      <div ref={hostRef} className="absolute inset-0">
        {gameStarted && avatarLoading && (
          <div className="world-avatar-loading" role="status" aria-live="polite">
            <span>MEMUAT AVATAR {avatarBuildProgress}%</span>
          </div>
        )}
        {!gameStarted && (
          <section className="world-start-screen" aria-labelledby="world-start-title">
            <div className="world-start-content">
              <div className="world-start-top">
                <button
                  className="world-start-back"
                  onClick={() => navigate(-1)}
                  aria-label="Kembali ke halaman sebelumnya"
                >
                  <ArrowLeft size={15} /> {avatarPickerOpen ? "MENU" : "PILIH AVATAR"}
                </button>
                <div className="world-start-badge"><Sparkles size={14} /> PETUALANGAN BELAJAR</div>
              </div>
              <header className="world-start-heading">
                <div className="world-start-mark"><Sparkles size={28} /></div>
                <h1 className="world-start-title" id="world-start-title">NUMATIK WORLD</h1>
                <p className="world-start-subtitle">{avatarPickerOpen ? "Pilih teman untuk menemani petualanganmu!" : `Pilih pulau, jelajahi dunia, dan cari ${TREASURE_COUNT} harta karun! ✨`}</p>
              </header>
              {avatarPickerOpen ? (
                <section aria-labelledby="world-avatar-title">
                  <div className="world-avatar-grid">
                    {AVATAR_PICKER_PRESETS.filter((preset) => SHOW_TEST_AVATARS || preset.id !== "cewek-halus").map((preset) => (
                      <article
                        key={preset.id}
                        className="world-avatar-card"
                        data-avatar={preset.id}
                        data-selected={selectedAvatarId === preset.id}
                      >
                        <div className="world-avatar-preview" aria-hidden="true">
                          <div className="world-avatar-doll">
                            <span className="world-avatar-hair" />
                            {preset.id === "chibi-kucing" && <><span className="world-avatar-cat-ears" /><span className="world-avatar-cat-headset" /></>}
                            <span className="world-avatar-head" />
                            {preset.id === "cewek-streetwear" && <span className="world-avatar-beanie" />}
                            <span className="world-avatar-shirt" />
                            <span className="world-avatar-vest" />
                            <span className="world-avatar-legs" />
                            <span className="world-avatar-shoes" />
                            {preset.id === "kacamata-hitam" && <><span className="world-avatar-glasses" /><span className="world-avatar-gum" /></>}
                          </div>
                        </div>
                        <h2 className="world-avatar-title" id={preset.id === "anak-cokelat" ? "world-avatar-title" : undefined}>
                          {preset.name}{preset.id === "cewek-halus" && <span className="world-avatar-beta">Uji</span>}
                        </h2>
                        <span className="world-avatar-description">{preset.description}</span>
                        <button className="world-avatar-pick" type="button" aria-pressed={selectedAvatarId === preset.id} onClick={() => selectAvatar(preset.id)}>
                          {selectedAvatarId === preset.id ? "PILIH AVATAR INI" : "PILIH"}
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              ) : (
              <div className="world-lobby">
                <section className="world-lobby-panel" aria-labelledby="world-rules-title">
                  <h2 id="world-rules-title">CARA BERMAIN</h2>
                  <p className="world-lobby-intro">Siap jadi penjelajah cilik? Ikuti aturan mudah ini!</p>
                  <div className="world-rules">
                    <div className="world-rule"><span className="world-rule-icon">🕹️</span><span><strong>Jelajahi pulau</strong><br />WASD / tombol arah untuk bergerak, seret layar untuk melihat.</span></div>
                    <div className="world-rule"><span className="world-rule-icon">🦘</span><span><strong>Melompat</strong><br />Tekan SPACE atau tombol LOMPAT.</span></div>
                    <div className="world-rule"><span className="world-rule-icon">🧰</span><span><strong>Temukan harta karun</strong><br />Dekati peti harta untuk membuka soal matematika.</span></div>
                    <div className="world-rule"><span className="world-rule-icon">⭐</span><span><strong>Kumpulkan harta</strong><br />Jawab soal dengan benar untuk mendapatkan harta. Ada {TREASURE_COUNT} harta karun!</span></div>
                  </div>
                </section>
                <section className="world-lobby-panel" aria-labelledby="world-island-title">
                  <h2 id="world-island-title">PILIH PULAU PETUALANGAN</h2>
                  <p className="world-lobby-intro">Setiap pulau punya suasana dan kejutan yang berbeda.</p>
                  <div className="world-island-grid">
                    {ISLANDS.map((island) => (
                      <button
                        key={island.id}
                        className="world-island-card"
                        type="button"
                        aria-pressed={selectedIsland === island.id}
                        onClick={() => setSelectedIsland(island.id)}
                      >
                        <span className="world-island-emoji" aria-hidden="true">{island.emoji}</span>
                        <span>
                          <span className="world-island-name">{island.name}</span>
                          <span className="world-island-description">{island.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <button className="world-avatar-change" type="button" onClick={() => setAvatarPickerOpen(true)}>
                    GANTI AVATAR · {AVATAR_PRESETS.find((preset) => preset.id === selectedAvatarId)?.name}
                  </button>
                  <button className="world-start-button" type="button" onClick={startAdventure}>
                    <Sparkles size={17} /> MULAI PETUALANGAN <span aria-hidden="true">→</span>
                  </button>
                </section>
              </div>
              )}
            </div>
          </section>
        )}
        {gameStarted && !question && (
          <div className="world-hud">
            <header className="world-top">
              <div className="world-brand">
                <button className="world-back" onClick={restartAdventure} aria-label="Kembali ke pemilihan pulau">
                  <ArrowLeft size={15} /> PILIH PULAU
                </button>
                <div className="world-brand-mark"><img src="/logo-numatik.png" alt="Logo Numatik" /></div>
                <div>
                  <div className="world-title">NUMATIK WORLD</div>
                  <div className="world-subtitle">{ISLANDS.find(({ id }) => id === selectedIsland)?.emoji} {ISLANDS.find(({ id }) => id === selectedIsland)?.name} · cari {TREASURE_COUNT} harta karun!</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="world-music-toggle" type="button" onClick={toggleWorldMusic} aria-label={musicPlaying ? "Matikan musik" : "Nyalakan musik"} aria-pressed={musicPlaying}>
                  {musicPlaying ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  MUSIK {musicPlaying ? "ON" : "OFF"}
                </button>
                <div className="world-score" aria-live="polite">🧰 HARTA {treasuresFound}/{TREASURE_COUNT} · {score} POIN</div>
              </div>
            </header>
            {musicError && <div className="world-music-error" role="status">{musicError}</div>}
            <aside className="world-radar" aria-label="Radar lokasi harta karun">
              <span className="world-radar-title">RADAR HARTA</span>
              <svg className="world-radar-map" viewBox="0 0 120 120" role="img" aria-label={`Peta lokasi pemain dan ${TREASURE_COUNT - treasuresFound} harta karun tersisa`}>
                <circle className="world-radar-grid" cx="60" cy="60" r="48" />
                <circle className="world-radar-grid" cx="60" cy="60" r="32" />
                <circle className="world-radar-grid" cx="60" cy="60" r="16" />
                <path className="world-radar-grid" d="M12 60h96M60 12v96" />
                {TREASURE_POSITIONS.map(([x, z], index) => {
                  if (collectedTreasureIds.includes(index)) return null;
                  const position = toRadarCoordinates(x, z);
                  return <circle key={index} className="world-radar-treasure" cx={position.x} cy={position.y} r="3.3" aria-label={`Harta ${index + 1}`} />;
                })}
                <circle ref={radarPlayerRef} className="world-radar-player" cx={toRadarCoordinates(0, 43).x} cy={toRadarCoordinates(0, 43).y} r="4" />
              </svg>
              <div className="world-radar-legend" aria-hidden="true">
                <span><i /> Harta</span>
                <span><i className="world-radar-player-key" /> Kamu</span>
              </div>
            </aside>
            <div className="world-bottom">
              {mobile ? <>Gunakan analog untuk bergerak &nbsp; <kbd>LOMPAT</kbd> &nbsp; seret layar untuk melihat</> : <>Jelajahi pulau &nbsp; <kbd>W A S D</kbd> bergerak &nbsp; <kbd>SPACE</kbd> lompat &nbsp; seret layar untuk melihat</>}
            </div>
            {mobile && (
              <>
                <div
                  className="world-mobile-controls"
                  aria-label="Analog untuk bergerak"
                  role="application"
                  onPointerDown={startMovementStick}
                  onPointerMove={updateMovementStick}
                  onPointerUp={stopMovementStick}
                  onPointerCancel={stopMovementStick}
                  onLostPointerCapture={stopMovementStick}
                >
                  <span
                    className="world-stick-knob"
                    style={{
                      left: `calc(50% + ${movementStick.x * 36}px)`,
                      top: `calc(50% + ${movementStick.y * 36}px)`,
                    }}
                  />
                </div>
                <button className="world-jump" onPointerDown={() => { jumpRequestedRef.current = true; }}>LOMPAT</button>
              </>
            )}
          </div>
        )}
        {DEBUG_PANEL && gameStarted && !debugPanelOpen && (
          <button className="world-debug-reopen" type="button" onClick={() => setDebugPanelOpen(true)}>Buka Uji Avatar</button>
        )}
        {DEBUG_PANEL && gameStarted && debugPanelOpen && (
          <aside className="world-debug-panel" aria-label="Panel uji avatar">
            <div className="world-debug-title">
              <span>UJI AVATAR · {selectedAvatarId}</span>
              <button className="world-debug-button" type="button" onClick={closeDebugPanel}>Tutup</button>
            </div>
            <div className="world-debug-counts">
              SkinnedMesh: {debugStats.skinnedMeshes} · Mesh: {debugStats.meshes} · Draw call avatar: {debugStats.drawCalls}
            </div>
            <div className="world-debug-group">
              <strong>Bayangan (Normal mengembalikan pengaturan asli)</strong>
              <div className="world-debug-choice-row three">
                <button className="world-debug-button" type="button" aria-pressed={debugOptions.avatarShadows === "on"} onClick={() => cycleDebugShadow("avatarShadows")}>
                  Avatar: {debugOptions.avatarShadows === "normal" ? "Normal" : debugOptions.avatarShadows.toUpperCase()}
                </button>
                <button className="world-debug-button" type="button" aria-pressed={debugOptions.sceneShadows === "on"} onClick={() => cycleDebugShadow("sceneShadows")}>
                  ShadowMap: {debugOptions.sceneShadows === "normal" ? "Normal" : debugOptions.sceneShadows.toUpperCase()}
                </button>
                <button className="world-debug-button" type="button" onClick={resetDebugOptions}>Pulihkan semua</button>
              </div>
            </div>
            <div className="world-debug-group">
              <strong>Sisi permukaan tubuh</strong>
              <div className="world-debug-choice-row">
                {([
                  ["original", "Normal"],
                  ["front", "Front"],
                  ["back", "Back"],
                  ["double", "Double"],
                ] as const).map(([side, label]) => (
                  <button key={side} className="world-debug-button" type="button" aria-pressed={debugOptions.bodySide === side} onClick={() => setDebugOptions((current) => ({ ...current, bodySide: side }))}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="world-debug-group">
              <strong>Arah tetap (gerak dinonaktifkan)</strong>
              <div className="world-debug-choice-row">
                {([
                  ["left", "Kiri"],
                  ["right", "Kanan"],
                  ["front", "Depan"],
                  ["back", "Belakang"],
                ] as const).map(([facing, label]) => (
                  <button key={facing} className="world-debug-button" type="button" aria-pressed={debugOptions.fixedFacing === facing} onClick={() => setDebugOptions((current) => ({ ...current, fixedFacing: facing }))}>
                    {label}
                  </button>
                ))}
              </div>
              <button className="world-debug-button" type="button" aria-pressed={debugOptions.fixedFacing === null} onClick={() => setDebugOptions((current) => ({ ...current, fixedFacing: null }))}>
                Arah normal
              </button>
            </div>
            <div className="world-debug-buttons">
              {debugPanelToggles.map(({ key, label }) => (
                <button
                  key={key}
                  className="world-debug-button"
                  type="button"
                  aria-pressed={debugOptions[key]}
                  onClick={() => toggleDebugOption(key)}
                >
                  {label}: {debugOptions[key] ? "ON" : "OFF"}
                </button>
              ))}
              <button className="world-debug-button" type="button" disabled>Foot-lock / IK: tidak tersedia</button>
            </div>
            <div className="world-debug-phase">
              <strong>Bekukan animasi pada fase</strong>
              <div className="world-debug-phase-buttons">
                {DEBUG_PANEL_PHASES.map((phase) => (
                  <button
                    key={phase}
                    type="button"
                    aria-pressed={debugOptions.freezePhase === phase}
                    onClick={() => setDebugOptions((current) => ({ ...current, freezePhase: phase }))}
                  >
                    {phase.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={debugOptions.freezePhase === null}
                  onClick={() => setDebugOptions((current) => ({ ...current, freezePhase: null }))}
                >
                  Langsung
                </button>
              </div>
            </div>
            <details className="world-debug-objects">
              <summary>Objek Mesh visible ({debugStats.skinnedMeshes + debugStats.meshes})</summary>
              <ul className="world-debug-object-list">
                {debugStats.objects.map((object, index) => (
                  <li className="world-debug-object" key={`${object.name}-${index}`}>
                    <strong>{object.name} · {object.type}</strong>
                    <span>castShadow: {object.castShadow} · receiveShadow: {object.receiveShadow}</span>
                    <span>material: {object.material} · transparent: {object.transparent} · depthWrite: {object.depthWrite} · side: {object.side}</span>
                  </li>
                ))}
                {debugStats.objects.length === 0 && <li className="world-debug-object">Belum ada mesh visible.</li>}
              </ul>
            </details>
          </aside>
        )}
        {gameComplete && (
          <div className="world-question-layer is-complete">
            <section className="world-question-card world-complete-card" role="dialog" aria-modal="true" aria-labelledby="world-complete-title">
              <div className="world-complete-sparkles" aria-hidden="true">✦ ✧ ✦</div>
              <div className="world-complete-kicker">🎉 PETUALANGAN SELESAI · {ISLANDS.find(({ id }) => id === selectedIsland)?.name.toUpperCase() ?? "PULAU"}</div>
              <div className="world-complete-medal" aria-hidden="true">{treasureRank.emoji}</div>
              <h2 className="world-question-title" id="world-complete-title">{treasureRank.title}</h2>
              <p className="world-complete-copy">{treasureRank.description}</p>
              <div className="world-complete-chests" role="img" aria-label={`${firstTryCorrectCount} dari ${TREASURE_COUNT} peti dijawab benar pada percobaan pertama`}>
                {Array.from({ length: TREASURE_COUNT }, (_, index) => (
                  <span key={index} className={`world-complete-chest${index < firstTryCorrectCount ? " is-earned" : ""}`} aria-hidden="true">
                    {index < firstTryCorrectCount ? "🪙" : "🔒"}
                  </span>
                ))}
              </div>
              <div className="world-complete-score">
                <span>POIN HARTA<br />TERKUMPUL</span>
                <strong>{score}</strong>
              </div>
              <div className="world-complete-stats">
                <div className="world-complete-stat"><strong>{firstTryCorrectCount}/{TREASURE_COUNT}</strong>BENAR SEKALI COBA</div>
                <div className="world-complete-stat"><strong>{wrongAnswerCount}</strong>JAWABAN KELIRU</div>
              </div>
              <button className="world-start-button" type="button" onClick={restartAdventure}>MAIN LAGI</button>
            </section>
          </div>
        )}
      </div>
      {question && (
        <div className="world-question-layer">
          <section className="world-question-card" role="dialog" aria-modal="true" aria-labelledby="world-question-title">
            <div className="world-question-kicker">🧰 HARTA KARUN</div>
            <h2 className="world-question-title" id="world-question-title">Jawab untuk mendapatkan harta!</h2>
            <div className="world-question-prompt">{question.prompt}</div>
            <button className="world-music-toggle" type="button" onClick={toggleWorldMusic} aria-label={musicPlaying ? "Matikan musik" : "Nyalakan musik"} aria-pressed={musicPlaying}>
              {musicPlaying ? <Volume2 size={16} /> : <VolumeX size={16} />}
              MUSIK {musicPlaying ? "ON" : "OFF"}
            </button>
            {musicError && <div className="world-feedback is-wrong" role="status">{musicError}</div>}
            <div className="world-answer-grid">
              {question.options.map((option) => (
                <button key={option} className="world-answer" disabled={questionResolved} onClick={() => answerQuestion(option)}>{option}</button>
              ))}
            </div>
            <div className={`world-feedback${answerOutcome ? ` is-${answerOutcome}` : ""}`} role="status" aria-live="polite">{answerFeedback}</div>
            {questionResolved && (
              <button className="world-start-button" type="button" onClick={continueAfterAnswer}>
                {treasuresFound >= TREASURE_COUNT ? "LIHAT HASIL" : "LANJUTKAN"}
              </button>
            )}
          </section>
        </div>
      )}
    </main>
  );
};

export default NumatikWorldPage;
