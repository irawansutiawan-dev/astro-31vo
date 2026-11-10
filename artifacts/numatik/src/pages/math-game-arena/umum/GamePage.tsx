import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import {
  Crosshair,
  Hand,
  HeartPulse,
  Keyboard,
  MapPin,
  Package,
  Shield,
  Trophy,
} from "lucide-react";
import type { QuizQuestion } from "@/components/MeteorShootingGame";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type MoveInput = { x: number; y: number };
type QualitySetting = "low" | "medium" | "high";
type BrightnessSetting = "normal" | "bright" | "very-bright";
type WeaponId = "rifle" | "pistol";
type GamePhase = "combat" | "supply" | "treasure" | "treasure-complete" | "paused" | "arena-select" | "gameover" | "complete";
type ArenaId = "training" | "ruins" | "arctic" | "jungle";
type SupplyQuestion = { prompt: string; answer: string; options: string[] };
type SoundCue = "rifle" | "pistol" | "hit" | "headshot" | "enemy" | "wave" | "correct" | "wrong" | "gameover" | "reload" | "empty" | "step";
type EnemyVoiceKind = "scream" | "death" | "hurt";
type ImpactSurface = "wall" | "metal" | "ground";
type StrikeSoundBufferKey =
  | "rifleShot"
  | "pistolShot"
  | "reload"
  | "headshotScream1"
  | "headshotScream2"
  | "headshotScream3"
  | "headshotHit"
  | "enemyDeath";
type WeaponAmmo = { magazine: number; reserve: number };
type AmmoLoadout = Record<WeaponId, WeaponAmmo>;
type RadarContact = { id: number; x: number; y: number };
type KillFeedItem = { id: number; label: string; headshot: boolean };
type DamageDirection = { id: number; angle: number };
type BoxInstanceSpec = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  solid?: boolean;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  color?: THREE.ColorRepresentation;
};
type QualityCounts = Record<QualitySetting, number>;
type SoldierMode = "patrol" | "chase" | "attack" | "cover" | "dead";
type SoldierState = {
  group: THREE.Group;
  parts: THREE.Mesh[];
  headParts: THREE.Mesh[];
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  rifle: THREE.Group;
  muzzleFlash: THREE.Mesh;
  spawnX: number;
  spawnZ: number;
  patrolPoints: THREE.Vector3[];
  patrolIndex: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  mode: SoldierMode;
  nextSenseAt: number;
  canSeePlayer: boolean;
  lastSeenAt: number;
  lastKnownPlayer: THREE.Vector3;
  nextShotAt: number;
  nextCoverAt: number;
  coverUntil: number;
  coverTarget: THREE.Vector3 | null;
  path: THREE.Vector3[];
  pathIndex: number;
  nextPathAt: number;
  pathTarget: THREE.Vector3;
  muzzleFlashUntil: number;
  recoilUntil: number;
  deathStartedAt: number;
  deathDirection: number;
  phase: number;
  voicePitch: number;
};
type TreasureChest = {
  group: THREE.Group;
  collected: boolean;
  phase: number;
};
type HitFeedback = { id: number; damage: number; headshot: boolean; eliminated: boolean };
type EnemyScreamVariant = { pitch: number; duration: number; formants: [number, number, number] };

const createInitialAmmo = (): AmmoLoadout => ({
  rifle: { magazine: 30, reserve: 120 },
  pistol: { magazine: 12, reserve: 48 },
});
const WEAPON_CONFIG: Record<WeaponId, {
  label: string;
  magazineSize: number;
  fireInterval: number;
  bodyDamage: number;
  headDamage: number;
  reloadDuration: number;
  baseSpread: number;
}> = {
  rifle: {
    label: "SENAPAN SERBU",
    magazineSize: 30,
    fireInterval: 112,
    bodyDamage: 30,
    headDamage: 80,
    reloadDuration: 1450,
    baseSpread: 0.0026,
  },
  pistol: {
    label: "PISTOL SEMI-AUTO",
    magazineSize: 12,
    fireInterval: 290,
    bodyDamage: 42,
    headDamage: 88,
    reloadDuration: 1080,
    baseSpread: 0.0042,
  },
};
const STARTING_ENEMIES = 10;
const TREASURE_COUNT = 5;
const TREASURE_CORRECT_POINTS = 20;
const TREASURE_WRONG_POINTS = 0;
const TREASURE_RANKS = [
  { title: "PANTANG MENYERAH", emoji: "🌱", description: "Misi harta selesai! Terus asah insting dan strategi berhitungmu." },
  { title: "CALON PENJELAJAH", emoji: "🧭", description: "Operasi sukses! Kamu sudah punya bekal untuk jadi pemburu harta elite." },
  { title: "PETUALANG TANGGUH", emoji: "🗺️", description: "Tangguh di medan tempur, gigih memecahkan soal. Semua peti berhasil diamankan!" },
  { title: "PEMBURU ANDAL", emoji: "🔎", description: "Bidikanmu tepat dan hitunganmu tajam—tinggal selangkah dari sempurna!" },
  { title: "PENJELAJAH EMAS", emoji: "🏅", description: "Operasi nyaris sempurna! Hampir semua peti terbuka tanpa kesalahan." },
  { title: "LEGENDA HARTA", emoji: "👑", description: "Sempurna, Komandan! Semua peti terbuka dengan jawaban benar sejak percobaan pertama." },
] as const;
const GUNFIRE_ALERT_RADIUS = 36;
const ARENAS: Array<{
  id: ArenaId;
  name: string;
  subtitle: string;
  description: string;
  terrain: string;
  tactic: string;
  icon: string;
  horizon: string;
  midday: string;
  zenith: string;
  ground: string;
  road: string;
  clearing: string;
  concrete: string;
  metal: string;
  accent: string;
  sunlight: string;
  dust: string;
}> = [
  {
    id: "training",
    name: "Kamp Garuda",
    subtitle: "Pangkalan latihan gurun",
    description: "Bunker, menara pengawas, dan lapangan terbuka.",
    terrain: "Gurun · Jarak menengah",
    tactic: "Manfaatkan bunker dan menara untuk mengatur jalur pandang.",
    icon: "🪖",
    horizon: "#66594d",
    midday: "#ad8060",
    zenith: "#394955",
    ground: "#97856b",
    road: "#77756d",
    clearing: "#b8a276",
    concrete: "#b7b1a2",
    metal: "#929d9d",
    accent: "#d7a65a",
    sunlight: "#ffbd78",
    dust: "#d8bd8b",
  },
  {
    id: "ruins",
    name: "Kota Runtuh",
    subtitle: "Zona urban pascakonflik",
    description: "Kabut debu, beton retak, dan cahaya kota yang padam.",
    terrain: "Urban · Banyak sudut",
    tactic: "Bergerak dari reruntuhan ke reruntuhan agar tidak terbuka.",
    icon: "🏙️",
    horizon: "#514b49",
    midday: "#967b70",
    zenith: "#28323c",
    ground: "#77716c",
    road: "#55585a",
    clearing: "#91877b",
    concrete: "#777b7b",
    metal: "#737b80",
    accent: "#ff8b52",
    sunlight: "#ff9b69",
    dust: "#c5a995",
  },
  {
    id: "arctic",
    name: "Pangkalan Arktik",
    subtitle: "Pos terdepan di tundra beku",
    description: "Hamparan salju, kabut dingin, dan baja berselimut es.",
    terrain: "Salju · Pandangan luas",
    tactic: "Gunakan gundukan es sebagai perlindungan saat melintasi salju.",
    icon: "❄️",
    horizon: "#8299a8",
    midday: "#c5d9e3",
    zenith: "#526b82",
    ground: "#d5e0df",
    road: "#9eafb5",
    clearing: "#edf2e8",
    concrete: "#bccbd0",
    metal: "#8da8b2",
    accent: "#68e5f5",
    sunlight: "#c7efff",
    dust: "#d9f1fb",
  },
  {
    id: "jungle",
    name: "Rimba Liar",
    subtitle: "Garis depan hutan tropis",
    description: "Tanah lembap, kanopi lebat, dan suasana hijau berkabut.",
    terrain: "Hutan · Jarak dekat",
    tactic: "Dekati musuh melalui perlindungan rimba dan awasi sisi arena.",
    icon: "🌿",
    horizon: "#465e4d",
    midday: "#849b67",
    zenith: "#233b35",
    ground: "#596d43",
    road: "#4b5140",
    clearing: "#80905a",
    concrete: "#787d65",
    metal: "#737c61",
    accent: "#c6dc62",
    sunlight: "#d2df83",
    dust: "#b2c47d",
  },
];
const BEST_SCORE_KEY = "numatik-strike-best-score";
const TOUCH_LOOK_SENSITIVITY_KEY = "numatik-strike-touch-look-sensitivity";
const TOUCH_LOOK_MODE_KEY = "numatik-strike-touch-look-mode";
const ENEMY_SCREAMS_KEY = "numatik-strike-enemy-screams";
const HAPTICS_ENABLED_KEY = "numatik-strike-haptics";
const STRIKE_SOUND_FILES: Record<StrikeSoundBufferKey, string> = {
  rifleShot: "rifle_shot.mp3",
  pistolShot: "pistol_shot.mp3",
  reload: "reload.mp3",
  headshotScream1: "headshot_scream_1.mp3",
  headshotScream2: "headshot_scream_2.mp3",
  headshotScream3: "headshot_scream_3.mp3",
  headshotHit: "headshot_1.mp3",
  enemyDeath: "enemy_death.mp3",
};
const DEFAULT_TOUCH_LOOK_SENSITIVITY = 1.2;
type TouchLookMode = "swipe" | "right-stick";
const ENEMY_SCREAM_VARIANTS: EnemyScreamVariant[] = [
  { pitch: 194, duration: 0.36, formants: [690, 1160, 2460] },
  { pitch: 210, duration: 0.41, formants: [760, 1290, 2700] },
  { pitch: 226, duration: 0.47, formants: [650, 1080, 2380] },
  { pitch: 202, duration: 0.39, formants: [720, 1370, 2820] },
];
const QUALITY_FOG: Record<QualitySetting, { near: number; far: number }> = {
  low: { near: 30, far: 124 },
  medium: { near: 36, far: 145 },
  high: { near: 40, far: 160 },
};
const BRIGHTNESS_PRESETS: Record<BrightnessSetting, { label: string; exposure: number; hemisphereIntensity: number }> = {
  normal: { label: "Normal", exposure: 1.42, hemisphereIntensity: 3.6 },
  bright: { label: "Terang", exposure: 1.55, hemisphereIntensity: 4.1 },
  "very-bright": { label: "Sangat Terang", exposure: 1.68, hemisphereIntensity: 4.6 },
};
const createSupplyQuestion = (waveNumber: number): SupplyQuestion => {
  const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  let prompt: string;
  let answer: number;

  if (waveNumber === 1) {
    const left = randomInt(3, 12);
    const right = randomInt(2, 9);
    prompt = `${left} + ${right} = ?`;
    answer = left + right;
  } else if (waveNumber === 2) {
    const left = randomInt(24, 75);
    const right = randomInt(8, left - 2);
    prompt = `${left} − ${right} = ?`;
    answer = left - right;
  } else if (waveNumber === 3) {
    const left = randomInt(3, 9);
    const right = randomInt(4, 12);
    prompt = `${left} × ${right} = ?`;
    answer = left * right;
  } else if (waveNumber === 4) {
    const left = randomInt(11, 24);
    const right = randomInt(4, 9);
    prompt = `${left} × ${right} = ?`;
    answer = left * right;
  } else if (waveNumber === 5) {
    const divisor = randomInt(3, 10);
    const quotient = randomInt(4, 12);
    prompt = `${divisor * quotient} ÷ ${divisor} = ?`;
    answer = quotient;
  } else if (waveNumber === 6) {
    const divisor = randomInt(6, 15);
    const quotient = randomInt(8, 20);
    prompt = `${divisor * quotient} ÷ ${divisor} = ?`;
    answer = quotient;
  } else if (waveNumber < 10) {
    const left = randomInt(7, 12 + waveNumber);
    const right = randomInt(3, 9);
    const extra = randomInt(4, 18);
    prompt = waveNumber % 2
      ? `${left} × ${right} + ${extra} = ?`
      : `(${left} + ${extra}) × ${right} = ?`;
    answer = waveNumber % 2 ? left * right + extra : (left + extra) * right;
  } else {
    const percent = [20, 25, 50][randomInt(0, 2)];
    const base = 100 * (1 + Math.floor((waveNumber - 10) / 2));
    prompt = `${percent}% dari ${base} = ?`;
    answer = (percent / 100) * base;
  }

  const candidates = new Set<number>([answer]);
  for (const offset of [2, -2, 5, -5, 10, -10, 1, -1, 12, -12]) {
    const candidate = answer + offset;
    if (candidate >= 0) candidates.add(candidate);
    if (candidates.size >= 4) break;
  }
  const options = [...candidates].slice(0, 4);
  for (let index = options.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    [options[index], options[swapIndex]] = [options[swapIndex], options[index]];
  }
  return { prompt, answer: String(answer), options: options.map(String) };
};
const createTreasureQuestion = (questionNumber: number, questions?: QuizQuestion[]): SupplyQuestion => {
  const question = questions?.[questionNumber - 1];
  if (!question) return createSupplyQuestion(questionNumber);
  return {
    prompt: question.question,
    answer: question.options[question.correctIndex] ?? "",
    options: question.options,
  };
};
const QUALITY_PIXEL_RATIOS: Record<QualitySetting, number> = { low: 1, medium: 1.5, high: 2 };
const getQualityPixelRatio = (quality: QualitySetting) => (
  Math.min(window.devicePixelRatio || 1, QUALITY_PIXEL_RATIOS[quality])
);

const GamePage = ({
  treasureQuestions,
  backPath = "/math-game-arena/umum",
}: {
  treasureQuestions?: QuizQuestion[];
  backPath?: string;
} = {}) => {
  const navigate = useNavigate();
  const mountRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);
  const [selectedArena, setSelectedArena] = useState<ArenaId>("training");
  const [pendingArena, setPendingArena] = useState<ArenaId>("training");
  const arenaPickerReturnPhase = useRef<GamePhase>("arena-select");
  const hasStartedGame = useRef(false);
  const [mobile, setMobile] = useState(false);
  const mobileRef = useRef(mobile);
  const [quality, setQuality] = useState<QualitySetting>("medium");
  const qualityRef = useRef<QualitySetting>("medium");
  const [brightness, setBrightness] = useState<BrightnessSetting>("normal");
  const brightnessRef = useRef<BrightnessSetting>("normal");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [touchLookSensitivity, setTouchLookSensitivity] = useState(DEFAULT_TOUCH_LOOK_SENSITIVITY);
  const touchLookSensitivityRef = useRef(DEFAULT_TOUCH_LOOK_SENSITIVITY);
  const [touchLookMode, setTouchLookMode] = useState<TouchLookMode>(() => {
    try {
      return window.localStorage.getItem(TOUCH_LOOK_MODE_KEY) === "right-stick" ? "right-stick" : "swipe";
    } catch {
      return "swipe";
    }
  });
  const touchLookModeRef = useRef<TouchLookMode>(touchLookMode);
  const [rightLookStick, setRightLookStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const cameraFovRef = useRef(72);
  const [showTurnAroundButton, setShowTurnAroundButton] = useState(true);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const hemisphereLightRef = useRef<THREE.HemisphereLight | null>(null);
  const sunlightRef = useRef<THREE.DirectionalLight | null>(null);
  const [joystick, setJoystick] = useState<MoveInput>({ x: 0, y: 0 });
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [bestScore, setBestScore] = useState(0);
  const [enemyCount, setEnemyCount] = useState(0);
  const [treasuresFound, setTreasuresFound] = useState(0);
  const treasuresFoundRef = useRef(0);
  const [treasureCorrectAnswers, setTreasureCorrectAnswers] = useState(0);
  const treasureCorrectAnswersRef = useRef(0);
  const [treasureWrongAnswers, setTreasureWrongAnswers] = useState(0);
  const treasureWrongAnswersRef = useRef(0);
  const [treasureQuizScore, setTreasureQuizScore] = useState(0);
  const treasureQuizScoreRef = useRef(0);
  const treasureQuestionsRef = useRef(treasureQuestions);
  treasureQuestionsRef.current = treasureQuestions;
  const treasureFirstAttemptRef = useRef(true);
  const [wave, setWave] = useState(1);
  const waveRef = useRef(1);
  const [playerHealth, setPlayerHealth] = useState(100);
  const playerHealthRef = useRef(100);
  const [playerArmor, setPlayerArmor] = useState(0);
  const playerArmorRef = useRef(0);
  const [gamePhase, setGamePhase] = useState<GamePhase>("arena-select");
  const gamePhaseRef = useRef<GamePhase>("arena-select");
  const [supplyQuestion, setSupplyQuestion] = useState<SupplyQuestion | null>(null);
  const supplyQuestionRef = useRef<SupplyQuestion | null>(null);
  const [supplyMessage, setSupplyMessage] = useState<string | null>(null);
  const supplyResolvedRef = useRef(false);
  const activeTreasureRef = useRef<TreasureChest | null>(null);
  const [treasureAnswerCorrect, setTreasureAnswerCorrect] = useState<boolean | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const muteWarningLoggedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const [audioState, setAudioState] = useState("belum aktif");
  const [enemyScreamsEnabled, setEnemyScreamsEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(ENEMY_SCREAMS_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const enemyScreamsEnabledRef = useRef(enemyScreamsEnabled);
  const [hapticsEnabled, setHapticsEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(HAPTICS_ENABLED_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const hapticsEnabledRef = useRef(hapticsEnabled);
  const [hitFeedback, setHitFeedback] = useState<HitFeedback | null>(null);
  const hitFeedbackIdRef = useRef(0);
  const hitFeedbackTimeoutRef = useRef<number | null>(null);
  const [activeWeapon, setActiveWeapon] = useState<WeaponId>("rifle");
  const activeWeaponRef = useRef<WeaponId>("rifle");
  const [ammo, setAmmo] = useState<AmmoLoadout>(createInitialAmmo);
  const ammoRef = useRef<AmmoLoadout>(ammo);
  const [aiming, setAiming] = useState(false);
  const aimingRef = useRef(false);
  const [sprinting, setSprinting] = useState(false);
  const sprintingRef = useRef(false);
  const reloadingRef = useRef(false);
  const [isReloading, setIsReloading] = useState(false);
  const [crosshairGap, setCrosshairGap] = useState(4);
  const [radarContacts, setRadarContacts] = useState<RadarContact[]>([]);
  const [radarTreasureContacts, setRadarTreasureContacts] = useState<RadarContact[]>([]);
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);
  const [damageFlashId, setDamageFlashId] = useState(0);
  const [incomingDirection, setIncomingDirection] = useState<DamageDirection | null>(null);
  const damageDirectionIdRef = useRef(0);
  const damageDirectionTimeoutRef = useRef<number | null>(null);
  const killFeedIdRef = useRef(0);
  const killFeedTimeoutsRef = useRef<number[]>([]);
  const fireRef = useRef<(() => void) | null>(null);
  const unlockAudioRef = useRef<(() => void) | null>(null);
  const swapWeaponRef = useRef<(() => void) | null>(null);
  const reloadWeaponRef = useRef<(() => void) | null>(null);
  const pauseGameRef = useRef<(() => void) | null>(null);
  const resumeGameRef = useRef<(() => void) | null>(null);
  const restartGameRef = useRef<(() => void) | null>(null);
  const answerSupplyRef = useRef<((answer: string) => void) | null>(null);
  const nextWaveRef = useRef<(() => void) | null>(null);
  const soundRef = useRef<((cue: SoundCue) => void) | null>(null);
  const firingRef = useRef(false);
  const keys = useRef<Record<string, boolean>>({});
  const jumpRequested = useRef(false);
  const moveInput = useRef<MoveInput>({ x: 0, y: 0 });
  const lookDelta = useRef<MoveInput>({ x: 0, y: 0 });
  const lookPointers = useRef(new Map<number, { x: number; y: number; lastAt: number }>());
  const rightLookPointer = useRef<{ id: number; originX: number; originY: number } | null>(null);
  const rightLookInput = useRef<MoveInput>({ x: 0, y: 0 });
  const joystickPointer = useRef<number | null>(null);
  const firePointers = useRef(new Set<number>());
  const sprintPointers = useRef(new Set<number>());
  const turnAroundPointer = useRef<number | null>(null);
  const turnAroundRequested = useRef(false);
  const turnAroundAnimating = useRef(false);
  const [mobileSprintHeld, setMobileSprintHeld] = useState(false);

  const applyBrightnessSetting = (nextBrightness: BrightnessSetting) => {
    brightnessRef.current = nextBrightness;
    const preset = BRIGHTNESS_PRESETS[nextBrightness];
    if (rendererRef.current) rendererRef.current.toneMappingExposure = preset.exposure;
    if (hemisphereLightRef.current) hemisphereLightRef.current.intensity = preset.hemisphereIntensity;
  };

  const applyQualitySetting = (nextQuality: QualitySetting) => {
    qualityRef.current = nextQuality;
    const renderer = rendererRef.current;
    const shadowsEnabled = nextQuality === "high" && !mobileRef.current;
    if (renderer) {
      renderer.setPixelRatio(getQualityPixelRatio(nextQuality));
      renderer.shadowMap.enabled = shadowsEnabled;
      renderer.shadowMap.needsUpdate = true;
    }
    const sunlight = sunlightRef.current;
    if (sunlight) {
      sunlight.castShadow = shadowsEnabled;
      if (shadowsEnabled) sunlight.shadow.mapSize.set(1024, 1024);
      sunlight.shadow.camera.left = -70;
      sunlight.shadow.camera.right = 70;
      sunlight.shadow.camera.top = 70;
      sunlight.shadow.camera.bottom = -70;
      sunlight.shadow.camera.near = 0.5;
      sunlight.shadow.camera.far = 150;
      sunlight.shadow.bias = -0.0005;
      sunlight.shadow.normalBias = 0.025;
      sunlight.shadow.camera.updateProjectionMatrix();
    }
    const scene = sceneRef.current;
    if (scene) {
      const fog = QUALITY_FOG[nextQuality];
      const arena = ARENAS.find((candidate) => candidate.id === selectedArena) ?? ARENAS[0]!;
      scene.fog = new THREE.Fog(arena.horizon, fog.near, fog.far);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object.userData.strikeShadowEligible) {
          object.castShadow = shadowsEnabled;
          object.receiveShadow = shadowsEnabled;
        }
        if (object.userData.strikeShadowReceiver) object.receiveShadow = shadowsEnabled;
      });
    }
  };

  useEffect(() => {
    const updateMobile = () => {
      const isMobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760;
      const wasMobile = mobileRef.current;
      mobileRef.current = isMobile;
      setMobile(isMobile);
      if (wasMobile !== isMobile) applyQualitySetting(qualityRef.current);
    };
    updateMobile();
    try {
      const saved = Number(window.localStorage.getItem(BEST_SCORE_KEY));
      if (Number.isFinite(saved) && saved > 0) setBestScore(saved);
    } catch {
      setBestScore(0);
    }
    try {
      const savedSensitivity = Number(window.localStorage.getItem(TOUCH_LOOK_SENSITIVITY_KEY));
      if (Number.isFinite(savedSensitivity) && savedSensitivity >= 0.5 && savedSensitivity <= 3) {
        touchLookSensitivityRef.current = savedSensitivity;
        setTouchLookSensitivity(savedSensitivity);
      }
    } catch {
      // Sensitivity remains at its default when local storage is unavailable.
    }
    window.addEventListener("resize", updateMobile);
    return () => window.removeEventListener("resize", updateMobile);
  }, []);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    const arena = ARENAS.find((candidate) => candidate.id === selectedArena) ?? ARENAS[0]!;

    let teardown: (() => void) | undefined;
    const initFrame = window.requestAnimationFrame(() => {
      if (!host.isConnected) return;

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      } catch (error) {
        console.error("Numatik Strike gagal membuat WebGLRenderer:", error);
        const fallback = document.createElement("div");
        fallback.className = "strike-render-error";
        const message = document.createElement("div");
        message.textContent = "Perangkat ini belum mendukung arena 3D.";
        const detail = document.createElement("small");
        detail.textContent = (error instanceof Error ? error.message : String(error)).slice(0, 240);
        fallback.append(message, detail);
        host.replaceChildren(fallback);
        return;
      }
    rendererRef.current = renderer;
    renderer.setPixelRatio(getQualityPixelRatio(qualityRef.current));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = BRIGHTNESS_PRESETS[brightnessRef.current].exposure;
    renderer.domElement.className = "strike-canvas";
    renderer.domElement.setAttribute("aria-label", "Arena Numatik Strike");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const initialFog = QUALITY_FOG[qualityRef.current];
    scene.background = new THREE.Color(arena.horizon);
    scene.fog = new THREE.Fog(arena.horizon, initialFog.near, initialFog.far);
    let baseCameraFov = window.matchMedia("(orientation: landscape)").matches ? 84 : 72;
    const camera = new THREE.PerspectiveCamera(baseCameraFov, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 180);
    const rendererSize = new THREE.Vector2();
    const player = new THREE.Group();
    player.position.set(0, 1.65, 51);
    scene.add(player);
    player.add(camera);

    const hemisphereLight = new THREE.HemisphereLight(
      0x84909a,
      0x635749,
      BRIGHTNESS_PRESETS[brightnessRef.current].hemisphereIntensity,
    );
    hemisphereLightRef.current = hemisphereLight;
    scene.add(hemisphereLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.48));
    const keyLight = new THREE.DirectionalLight(arena.sunlight, 3.6);
    keyLight.position.set(-32, 42, -24);
    keyLight.castShadow = false;
    keyLight.shadow.camera.left = -70;
    keyLight.shadow.camera.right = 70;
    keyLight.shadow.camera.top = 70;
    keyLight.shadow.camera.bottom = -70;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 150;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.025;
    sunlightRef.current = keyLight;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(arena.accent, 0.7);
    fillLight.position.set(28, 18, 34);
    scene.add(fillLight);

    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const contactShadowCanvas = document.createElement("canvas");
    contactShadowCanvas.width = 128;
    contactShadowCanvas.height = 128;
    const contactShadowContext = contactShadowCanvas.getContext("2d");
    if (!contactShadowContext) throw new Error("Canvas 2D tidak tersedia untuk bayangan arena.");
    const contactGradient = contactShadowContext.createRadialGradient(64, 64, 8, 64, 64, 64);
    contactGradient.addColorStop(0, "rgba(48,36,23,0.58)");
    contactGradient.addColorStop(0.48, "rgba(48,36,23,0.29)");
    contactGradient.addColorStop(1, "rgba(48,36,23,0)");
    contactShadowContext.fillStyle = contactGradient;
    contactShadowContext.fillRect(0, 0, 128, 128);
    const contactShadowTexture = new THREE.CanvasTexture(contactShadowCanvas);
    contactShadowTexture.colorSpace = THREE.SRGBColorSpace;
    textures.push(contactShadowTexture);
    const contactShadowMaterial = new THREE.MeshBasicMaterial({
      map: contactShadowTexture,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      toneMapped: false,
    });
    materials.push(contactShadowMaterial);
    const contactShadowGeometry = new THREE.PlaneGeometry(1, 1);
    const material = (color: string, roughness = 0.72, metalness = 0.15) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      materials.push(mat);
      return mat;
    };
    let textureSeed = 23817;
    const textureRandom = () => {
      textureSeed = (textureSeed * 1664525 + 1013904223) >>> 0;
      return textureSeed / 4294967296;
    };
    const createSurfaceTexture = (base: string, kind: "concrete" | "wood" | "metal" | "earth") => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D tidak tersedia untuk tekstur arena.");
      context.fillStyle = base;
      context.fillRect(0, 0, 128, 128);
      for (let index = 0; index < 850; index += 1) {
        const shade = textureRandom() > 0.52 ? 255 : 0;
        context.globalAlpha = 0.025 + textureRandom() * 0.11;
        context.fillStyle = `rgb(${shade},${shade},${shade})`;
        const size = 1 + textureRandom() * (kind === "wood" ? 3 : 2);
        context.fillRect(textureRandom() * 128, textureRandom() * 128, size, size);
      }
      context.globalAlpha = 1;
      if (kind === "wood") {
        for (let index = 0; index < 14; index += 1) {
          const y = textureRandom() * 128;
          context.globalAlpha = 0.08 + textureRandom() * 0.12;
          context.strokeStyle = index % 2 ? "#d5b17d" : "#33291d";
          context.lineWidth = 1 + textureRandom() * 2;
          context.beginPath();
          context.moveTo(0, y);
          context.bezierCurveTo(40, y - 5, 82, y + 5, 128, y - 2);
          context.stroke();
        }
      } else if (kind === "concrete") {
        for (let index = 0; index < 7; index += 1) {
          const x = textureRandom() * 128;
          const y = textureRandom() * 128;
          context.globalAlpha = 0.16;
          context.strokeStyle = index % 2 ? "#302e2b" : "#c2b9a8";
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + (textureRandom() - 0.5) * 15, y + 5 + textureRandom() * 13);
          context.lineTo(x + (textureRandom() - 0.5) * 18, y + 14 + textureRandom() * 18);
          context.stroke();
        }
      } else if (kind === "metal") {
        for (let index = 0; index < 30; index += 1) {
          const x = textureRandom() * 128;
          const y = textureRandom() * 128;
          context.globalAlpha = 0.1 + textureRandom() * 0.16;
          context.strokeStyle = index % 2 ? "#d7d1c3" : "#321f19";
          context.lineWidth = 1 + textureRandom() * 2;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + 2 + textureRandom() * 10, y - 1 + textureRandom() * 2);
          context.stroke();
        }
      } else {
        for (let index = 0; index < 13; index += 1) {
          context.globalAlpha = 0.08 + textureRandom() * 0.1;
          context.fillStyle = index % 2 ? "#332b24" : "#a48b69";
          context.beginPath();
          context.ellipse(
            textureRandom() * 128,
            textureRandom() * 128,
            4 + textureRandom() * 15,
            2 + textureRandom() * 8,
            textureRandom() * Math.PI,
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      }
      context.globalAlpha = 1;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(kind === "earth" ? 2 : 1, kind === "earth" ? 2 : 1);
      textures.push(texture);
      return texture;
    };
    const floorMat = material("#ffffff", 0.96, 0.02);
    const roadMat = material("#ffffff", 0.94, 0.04);
    const openZoneMat = material("#ffffff", 0.98, 0.01);
    const perimeterMat = material("#ffffff", 0.92, 0.08);
    const bunkerMat = material("#ffffff", 0.9, 0.05);
    const bunkerRoofMat = material("#ffffff", 0.88, 0.12);
    const lowWallMat = material("#ffffff", 0.94, 0.02);
    const crateMat = material("#ffffff", 0.88, 0.08);
    const crateMetalMat = material("#ffffff", 0.58, 0.42);
    const towerMat = material("#ffffff", 0.7, 0.22);
    const steelDetailMat = material("#ffffff", 0.56, 0.42);
    const sandbagMat = material("#ffffff", 0.98, 0.01);
    const tireMat = material("#414644", 0.94, 0.01);
    const vehicleMat = material("#ffffff", 0.83, 0.18);
    const windowMat = new THREE.MeshStandardMaterial({
      color: "#55636a",
      roughness: 0.24,
      metalness: 0.38,
      transparent: true,
      opacity: 0.68,
      flatShading: true,
    });
    materials.push(windowMat);
    const puddleMat = material("#ffffff", 0.34, 0.28);
    const groundDetailMat = material("#ffffff", 0.98, 0.01);
    const treasureWoodMat = material("#ffffff", 0.78, 0.08);
    const treasureGoldMat = material("#e8b83f", 0.24, 0.78);
    const treasureCoinMat = material("#ffd84c", 0.22, 0.82);
    const treasureGlowMat = new THREE.MeshBasicMaterial({
      color: "#ffc94d",
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: arena.accent, toneMapped: false });
    const darkInsetMat = material("#343a3b", 0.8, 0.14);
    materials.push(glowMat, treasureGlowMat);
    const searchlightBeamMat = new THREE.MeshBasicMaterial({
      color: arena.accent,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    materials.push(searchlightBeamMat);
    floorMat.map = createSurfaceTexture(arena.ground, "earth");
    roadMat.map = createSurfaceTexture(arena.road, "earth");
    openZoneMat.map = createSurfaceTexture(arena.clearing, "earth");
    perimeterMat.map = createSurfaceTexture(arena.concrete, "concrete");
    bunkerMat.map = createSurfaceTexture(arena.concrete, "concrete");
    bunkerRoofMat.map = createSurfaceTexture(arena.metal, "concrete");
    lowWallMat.map = bunkerMat.map;
    crateMat.map = createSurfaceTexture("#c3a77a", "wood");
    crateMetalMat.map = createSurfaceTexture(arena.metal, "metal");
    towerMat.map = createSurfaceTexture(arena.metal, "metal");
    steelDetailMat.map = createSurfaceTexture(arena.metal, "metal");
    sandbagMat.map = createSurfaceTexture("#bdb18b", "earth");
    vehicleMat.map = createSurfaceTexture("#909384", "metal");
    puddleMat.map = createSurfaceTexture("#758285", "earth");
    groundDetailMat.map = floorMat.map;
    treasureWoodMat.map = createSurfaceTexture("#79502f", "wood");
    treasureGoldMat.map = createSurfaceTexture("#d5aa45", "metal");
    floorMat.map.repeat.set(12, 12);
    roadMat.map.repeat.set(12, 12);
    openZoneMat.map.repeat.set(8, 8);
    [
      floorMat, roadMat, openZoneMat, perimeterMat, bunkerMat, bunkerRoofMat,
      lowWallMat, crateMat, crateMetalMat, towerMat, steelDetailMat, sandbagMat, vehicleMat,
      puddleMat, groundDetailMat,
    ].forEach((mat) => { mat.needsUpdate = true; });
    const camoPalettes = [
      { base: "#69745b", colors: ["#4d5845", "#8d8968", "#354037"] },
      { base: "#9a8d6b", colors: ["#6f7055", "#c2ad7b", "#4d503f"] },
      { base: "#68706e", colors: ["#42494a", "#96978c", "#343b3e"] },
      { base: "#73775a", colors: ["#515942", "#a19a68", "#3a4639"] },
    ];
    const soldierCamoMaterials = camoPalettes.map(({ base, colors }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D tidak tersedia untuk tekstur seragam.");
      context.fillStyle = base;
      context.fillRect(0, 0, 128, 128);
      for (let index = 0; index < 44; index += 1) {
        const x = textureRandom() * 128;
        const y = textureRandom() * 128;
        const width = 8 + textureRandom() * 21;
        const height = 4 + textureRandom() * 12;
        context.fillStyle = colors[Math.floor(textureRandom() * colors.length)] ?? base;
        context.beginPath();
        context.moveTo(x - width * 0.45, y);
        context.bezierCurveTo(
          x - width * 0.48, y - height * 0.78,
          x + width * 0.35, y - height * 0.62,
          x + width * 0.5, y - height * 0.08,
        );
        context.bezierCurveTo(
          x + width * 0.42, y + height * 0.7,
          x - width * 0.35, y + height * 0.82,
          x - width * 0.45, y,
        );
        context.fill();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.push(texture);
      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.91,
        metalness: 0.02,
      });
      materials.push(mat);
      return mat;
    });
    const soldierVestMat = material("#424a40", 0.86, 0.08);
    const soldierHelmetMat = material("#59664f", 0.82, 0.12);
    const soldierSkinMat = material("#b68d6f", 0.88, 0.01);
    const soldierBootMat = material("#333633", 0.82, 0.12);
    const soldierGearMat = material("#343a35", 0.88, 0.06);
    const soldierGloveMat = material("#292f2c", 0.9, 0.04);
    const soldierMaskMat = material("#252c29", 0.95, 0.01);
    const soldierWeaponMat = material("#282d2c", 0.72, 0.22);
    const soldierMetalMat = material("#454c49", 0.34, 0.72);
    const playerGunMat = material("#2b3231", 0.74, 0.18);
    const playerGunMetalMat = material("#3e4847", 0.33, 0.76);
    const playerGunAccentMat = material("#756a4d", 0.58, 0.28);
    const playerGloveMat = material("#292f2c", 0.9, 0.04);
    const playerSleeveMat = soldierCamoMaterials[0]!;
    const enemyTracerMat = new THREE.LineBasicMaterial({ color: "#ff604d", transparent: true, opacity: 0.84 });
    const muzzleFlashMat = new THREE.MeshBasicMaterial({ color: "#ffd59a", toneMapped: false });
    const playerMuzzleMat = new THREE.MeshBasicMaterial({ color: "#ffbd55", toneMapped: false });
    const sparkMat = new THREE.LineBasicMaterial({ color: "#ffd27a", transparent: true, opacity: 0.95 });
    materials.push(enemyTracerMat, muzzleFlashMat, playerMuzzleMat, sparkMat);

    const addViewPart = (
      parent: THREE.Object3D,
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const playerSleeveGeometry = new THREE.CylinderGeometry(0.12, 0.16, 0.54, 8);
    const playerHandGeometry = new THREE.SphereGeometry(0.13, 10, 8);
    const addViewArm = (
      parent: THREE.Object3D,
      start: THREE.Vector3,
      end: THREE.Vector3,
    ) => {
      const direction = end.clone().sub(start);
      const sleeve = addViewPart(
        parent,
        playerSleeveGeometry,
        playerSleeveMat,
        (start.x + end.x) / 2,
        (start.y + end.y) / 2,
        (start.z + end.z) / 2,
      );
      sleeve.scale.y = direction.length() / 0.54;
      sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      const hand = addViewPart(parent, playerHandGeometry, playerGloveMat, end.x, end.y, end.z);
      hand.scale.set(0.9, 0.76, 1.12);
    };
    const rifleView = new THREE.Group();
    camera.add(rifleView);
    const sightLensMat = material("#56645f", 0.24, 0.48);
    addViewPart(rifleView, new THREE.BoxGeometry(0.18, 0.15, 0.37), playerGunMat, 0, 0, 0.16);
    addViewPart(rifleView, new THREE.BoxGeometry(0.17, 0.15, 0.43), playerGunMetalMat, 0, 0.01, -0.24);
    addViewPart(rifleView, new THREE.BoxGeometry(0.15, 0.13, 0.36), playerGunMat, 0, 0.015, -0.59);
    addViewPart(rifleView, new THREE.BoxGeometry(0.12, 0.035, 0.47), playerGunMat, 0, 0.095, -0.38);
    const rifleOptic = addViewPart(rifleView, new THREE.CylinderGeometry(0.052, 0.052, 0.2, 14), playerGunMat, 0, 0.19, -0.4);
    rifleOptic.rotation.x = -Math.PI / 2;
    addViewPart(rifleView, new THREE.TorusGeometry(0.052, 0.012, 6, 16), playerGunMetalMat, 0, 0.19, -0.505);
    addViewPart(rifleView, new THREE.CircleGeometry(0.041, 16), sightLensMat, 0, 0.19, -0.514);
    addViewPart(rifleView, new THREE.BoxGeometry(0.075, 0.2, 0.08), playerGunMat, 0, -0.08, -0.5);
    addViewPart(rifleView, new THREE.BoxGeometry(0.13, 0.15, 0.12), playerGunMat, 0.16, -0.01, -0.59);
    const rifleBarrel = addViewPart(rifleView, new THREE.CylinderGeometry(0.023, 0.03, 0.42, 8), playerGunMetalMat, 0, 0.02, -0.87);
    rifleBarrel.rotation.x = -Math.PI / 2;
    addViewPart(rifleView, new THREE.BoxGeometry(0.12, 0.25, 0.13), playerGunMat, 0.035, -0.17, -0.13);
    addViewPart(rifleView, new THREE.BoxGeometry(0.11, 0.035, 0.42), playerGunMetalMat, 0, 0.105, -0.42);
    addViewPart(rifleView, new THREE.BoxGeometry(0.12, 0.09, 0.13), playerGunMetalMat, 0, 0.16, -0.37);
    addViewPart(rifleView, new THREE.BoxGeometry(0.19, 0.055, 0.12), playerGunAccentMat, 0, 0.12, -0.38);
    addViewPart(rifleView, new THREE.BoxGeometry(0.045, 0.12, 0.055), playerGunMetalMat, 0, 0.11, -0.72);
    addViewPart(rifleView, new THREE.CylinderGeometry(0.055, 0.055, 0.13, 8), playerGunMetalMat, 0, 0.02, -1.1).rotation.x = -Math.PI / 2;
    addViewPart(rifleView, new THREE.BoxGeometry(0.05, 0.07, 0.08), playerGunMetalMat, 0.12, 0.015, -0.24);
    addViewPart(rifleView, new THREE.TorusGeometry(0.075, 0.012, 5, 12), playerGunMat, 0.08, -0.11, -0.24);
    const rifleMagazineCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.025, -0.1, -0.24),
      new THREE.Vector3(-0.015, -0.2, -0.22),
      new THREE.Vector3(0.015, -0.32, -0.16),
      new THREE.Vector3(0.055, -0.4, -0.08),
    ]);
    addViewPart(rifleView, new THREE.TubeGeometry(rifleMagazineCurve, 10, 0.055, 6, false), playerGunMat, 0, 0, 0);
    const rifleFlash = addViewPart(rifleView, new THREE.ConeGeometry(0.07, 0.19, 8), playerMuzzleMat, 0, 0.02, -1.19);
    rifleFlash.rotation.x = -Math.PI / 2;
    rifleFlash.visible = false;
    addViewArm(rifleView, new THREE.Vector3(0.54, -0.52, 0.12), new THREE.Vector3(0.1, -0.18, -0.02));
    addViewArm(rifleView, new THREE.Vector3(-0.48, -0.53, -0.3), new THREE.Vector3(-0.12, -0.12, -0.42));
    rifleView.position.set(0.34, -0.3, -0.58);

    const pistolView = new THREE.Group();
    camera.add(pistolView);
    addViewPart(pistolView, new THREE.BoxGeometry(0.16, 0.13, 0.28), playerGunMat, 0, 0.025, -0.12);
    addViewPart(pistolView, new THREE.BoxGeometry(0.15, 0.07, 0.28), playerGunMetalMat, 0, 0.115, -0.13);
    const pistolBarrel = addViewPart(pistolView, new THREE.CylinderGeometry(0.022, 0.026, 0.18, 8), playerGunMetalMat, 0, 0.08, -0.34);
    pistolBarrel.rotation.x = -Math.PI / 2;
    addViewPart(pistolView, new THREE.BoxGeometry(0.13, 0.25, 0.14), playerGunMat, 0, -0.13, 0.025);
    addViewPart(pistolView, new THREE.BoxGeometry(0.12, 0.22, 0.105), playerGunMetalMat, 0, -0.245, 0.04);
    addViewPart(pistolView, new THREE.BoxGeometry(0.15, 0.022, 0.07), playerGunAccentMat, 0, 0.17, -0.13);
    addViewPart(pistolView, new THREE.BoxGeometry(0.04, 0.06, 0.04), playerGunMetalMat, 0, 0.18, -0.25);
    addViewPart(pistolView, new THREE.BoxGeometry(0.04, 0.055, 0.04), playerGunMetalMat, 0, 0.18, -0.01);
    addViewPart(pistolView, new THREE.BoxGeometry(0.13, 0.015, 0.22), playerGunMetalMat, 0, 0.16, -0.13);
    addViewPart(pistolView, new THREE.TorusGeometry(0.067, 0.011, 5, 12), playerGunMat, 0.07, -0.08, -0.12);
    const pistolFlash = addViewPart(pistolView, new THREE.ConeGeometry(0.06, 0.16, 8), playerMuzzleMat, 0, 0.08, -0.48);
    pistolFlash.rotation.x = -Math.PI / 2;
    pistolFlash.visible = false;
    addViewArm(pistolView, new THREE.Vector3(0.53, -0.53, 0.12), new THREE.Vector3(0.08, -0.17, -0.02));
    addViewArm(pistolView, new THREE.Vector3(-0.46, -0.53, -0.23), new THREE.Vector3(-0.04, -0.24, 0.06));
    pistolView.position.set(0.34, -0.32, -0.48);
    pistolView.visible = false;

    const skyGeometry = new THREE.SphereGeometry(145, 32, 20);
    const skyPositions = skyGeometry.getAttribute("position");
    const skyColors = new Float32Array(skyPositions.count * 3);
    const horizonColor = new THREE.Color(arena.horizon);
    const middayColor = new THREE.Color(arena.midday);
    const zenithColor = new THREE.Color(arena.zenith);
    const skyColor = new THREE.Color();
    for (let i = 0; i < skyPositions.count; i += 1) {
      const height = THREE.MathUtils.clamp(skyPositions.getY(i) / 145, 0, 1);
      if (height < 0.34) {
        skyColor.copy(horizonColor).lerp(middayColor, height / 0.34);
      } else {
        skyColor.copy(middayColor).lerp(zenithColor, (height - 0.34) / 0.66);
      }
      skyColors[i * 3] = skyColor.r;
      skyColors[i * 3 + 1] = skyColor.g;
      skyColors[i * 3 + 2] = skyColor.b;
    }
    skyGeometry.setAttribute("color", new THREE.Float32BufferAttribute(skyColors, 3));
    const skyMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    materials.push(skyMaterial);
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.renderOrder = -1;
    scene.add(sky);
    const sunGlowCanvas = document.createElement("canvas");
    sunGlowCanvas.width = 128;
    sunGlowCanvas.height = 128;
    const sunGlowContext = sunGlowCanvas.getContext("2d");
    if (!sunGlowContext) throw new Error("Canvas 2D tidak tersedia untuk cahaya matahari.");
    const sunGlow = sunGlowContext.createRadialGradient(64, 64, 5, 64, 64, 64);
    sunGlow.addColorStop(0, "rgba(255,198,128,0.82)");
    sunGlow.addColorStop(0.18, "rgba(239,145,79,0.43)");
    sunGlow.addColorStop(1, "rgba(224,169,112,0)");
    sunGlowContext.fillStyle = sunGlow;
    sunGlowContext.fillRect(0, 0, 128, 128);
    const sunGlowTexture = new THREE.CanvasTexture(sunGlowCanvas);
    sunGlowTexture.colorSpace = THREE.SRGBColorSpace;
    textures.push(sunGlowTexture);
    const sunGlowMaterial = new THREE.SpriteMaterial({
      map: sunGlowTexture,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    materials.push(sunGlowMaterial);
    const sunGlowSprite = new THREE.Sprite(sunGlowMaterial);
    sunGlowSprite.position.set(-25, 18, -58);
    sunGlowSprite.scale.set(34, 34, 1);
    scene.add(sunGlowSprite);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: "#f5c27e", fog: false, toneMapped: false });
    materials.push(sunMaterial);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(5.2, 28, 18), sunMaterial);
    sun.position.set(-25, 18, -58);
    scene.add(sun);
    const cloudCanvas = document.createElement("canvas");
    cloudCanvas.width = 256;
    cloudCanvas.height = 128;
    const cloudContext = cloudCanvas.getContext("2d");
    if (!cloudContext) throw new Error("Canvas 2D tidak tersedia untuk awan arena.");
    const cloudGradient = cloudContext.createRadialGradient(128, 70, 8, 128, 70, 112);
    cloudGradient.addColorStop(0, "rgba(103,108,105,0.72)");
    cloudGradient.addColorStop(0.48, "rgba(112,114,106,0.42)");
    cloudGradient.addColorStop(1, "rgba(90,94,91,0)");
    cloudContext.fillStyle = cloudGradient;
    cloudContext.beginPath();
    cloudContext.ellipse(128, 70, 112, 42, 0, 0, Math.PI * 2);
    cloudContext.ellipse(86, 61, 48, 29, -0.12, 0, Math.PI * 2);
    cloudContext.ellipse(164, 56, 54, 34, 0.1, 0, Math.PI * 2);
    cloudContext.fill();
    const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
    cloudTexture.colorSpace = THREE.SRGBColorSpace;
    textures.push(cloudTexture);
    const cloudMaterial = new THREE.SpriteMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    materials.push(cloudMaterial);
    [
      { x: -58, y: 30, z: -92, width: 29, height: 9 },
      { x: 15, y: 42, z: -120, width: 39, height: 11 },
      { x: 69, y: 27, z: -83, width: 25, height: 8 },
    ].forEach(({ x, y, z, width, height }) => {
      const cloud = new THREE.Sprite(cloudMaterial);
      cloud.position.set(x, y, z);
      cloud.scale.set(width, height, 1);
      scene.add(cloud);
    });
    const smokeCanvas = document.createElement("canvas");
    smokeCanvas.width = 128;
    smokeCanvas.height = 256;
    const smokeContext = smokeCanvas.getContext("2d");
    if (!smokeContext) throw new Error("Canvas 2D tidak tersedia untuk asap arena.");
    const smokeGradient = smokeContext.createLinearGradient(64, 0, 64, 256);
    smokeGradient.addColorStop(0, "rgba(91,94,89,0)");
    smokeGradient.addColorStop(0.28, "rgba(91,94,89,0.2)");
    smokeGradient.addColorStop(0.72, "rgba(91,94,89,0.34)");
    smokeGradient.addColorStop(1, "rgba(91,94,89,0)");
    smokeContext.fillStyle = smokeGradient;
    [
      [55, 55, 48, 48],
      [73, 92, 48, 56],
      [47, 133, 39, 48],
      [78, 177, 42, 59],
      [57, 214, 34, 37],
    ].forEach(([x, y, width, height]) => {
      smokeContext.beginPath();
      smokeContext.ellipse(x!, y!, width!, height!, 0, 0, Math.PI * 2);
      smokeContext.fill();
    });
    const smokeTexture = new THREE.CanvasTexture(smokeCanvas);
    smokeTexture.colorSpace = THREE.SRGBColorSpace;
    textures.push(smokeTexture);
    const smokeMaterial = new THREE.SpriteMaterial({
      map: smokeTexture,
      color: "#777a74",
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      fog: true,
      toneMapped: false,
    });
    materials.push(smokeMaterial);
    [
      { x: -47, z: -50, y: 9, width: 24, height: 20 },
      { x: 8, z: -57, y: 11, width: 27, height: 24 },
      { x: 53, z: -35, y: 10, width: 23, height: 22 },
      { x: 48, z: 47, y: 8, width: 21, height: 19 },
    ].forEach(({ x, z, y, width, height }, index) => {
      const smokeMapMaterial = smokeMaterial.clone();
      smokeMapMaterial.rotation = index % 2 ? 0.08 : -0.06;
      materials.push(smokeMapMaterial);
      const smoke = new THREE.Sprite(smokeMapMaterial);
      smoke.position.set(x, y, z);
      smoke.scale.set(width, height, 1);
      scene.add(smoke);
    });

    type CollisionBox = { x: number; z: number; width: number; depth: number };
    const solidObstacles: CollisionBox[] = [];
    const worldOccluders: THREE.Object3D[] = [];
    const tieredInstanceMeshes: Array<{ mesh: THREE.InstancedMesh; counts: QualityCounts }> = [];
    const instanceBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const addTieredInstances = (
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      specs: BoxInstanceSpec[],
      counts: QualityCounts,
    ) => {
      if (!specs.length) return;
      const solidSpecs = specs.filter((spec) => spec.solid);
      const decorativeSpecs = specs.filter((spec) => !spec.solid);
      const addBatch = (batchSpecs: BoxInstanceSpec[], batchCounts: QualityCounts, isSolid: boolean) => {
        if (!batchSpecs.length) return;
        const mesh = new THREE.InstancedMesh(geometry, mat, batchSpecs.length);
        mesh.userData.strikeShadowEligible = true;
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        const transform = new THREE.Object3D();
        batchSpecs.forEach((spec, index) => {
          transform.position.set(spec.x, spec.y, spec.z);
          transform.rotation.set(spec.rotX ?? 0, spec.rotY ?? 0, spec.rotZ ?? 0);
          transform.scale.set(spec.w, spec.h, spec.d);
          transform.updateMatrix();
          mesh.setMatrixAt(index, transform.matrix);
          mesh.setColorAt(index, new THREE.Color(spec.color ?? "#ffffff"));
          if (isSolid) {
            const cos = Math.abs(Math.cos(spec.rotY ?? 0));
            const sin = Math.abs(Math.sin(spec.rotY ?? 0));
            solidObstacles.push({
              x: spec.x,
              z: spec.z,
              width: spec.w * cos + spec.d * sin,
              depth: spec.w * sin + spec.d * cos,
            });
          }
        });
        mesh.count = batchCounts[qualityRef.current];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
        scene.add(mesh);
        if (isSolid) addContactShadows(batchSpecs);
        if (isSolid) worldOccluders.push(mesh);
        tieredInstanceMeshes.push({ mesh, counts: batchCounts });
      };
      if (solidSpecs.length) {
        const solidCount = solidSpecs.length;
        if (counts.low < solidCount) {
          throw new Error("Objek padat dekorasi melebihi batas instance kualitas rendah.");
        }
        addBatch(solidSpecs, tierCounts(solidCount, solidCount, solidCount), true);
      }
      if (decorativeSpecs.length) {
        const solidCount = solidSpecs.length;
        addBatch(
          decorativeSpecs,
          tierCounts(
            counts.low - solidCount,
            counts.medium - solidCount,
            counts.high - solidCount,
          ),
          false,
        );
      }
    };
    const addContactShadows = (specs: BoxInstanceSpec[]) => {
      const groundedSpecs = specs.filter((spec) => spec.y - spec.h / 2 <= 0.15);
      if (!groundedSpecs.length) return;
      const mesh = new THREE.InstancedMesh(contactShadowGeometry, contactShadowMaterial, groundedSpecs.length);
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const transform = new THREE.Object3D();
      groundedSpecs.forEach((spec, index) => {
        transform.position.set(spec.x, -0.032, spec.z);
        transform.rotation.set(-Math.PI / 2, spec.rotY ?? 0, 0);
        transform.scale.set(Math.max(1.25, spec.w * 1.38), Math.max(1.25, spec.d * 1.42), 1);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      mesh.renderOrder = 1;
      scene.add(mesh);
    };
    const addBoxInstances = (mat: THREE.Material, specs: BoxInstanceSpec[]) => {
      if (!specs.length) return;
      const mesh = new THREE.InstancedMesh(instanceBoxGeometry, mat, specs.length);
      mesh.userData.strikeShadowEligible = true;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const transform = new THREE.Object3D();
      specs.forEach((spec, index) => {
        transform.position.set(spec.x, spec.y, spec.z);
        transform.rotation.set(spec.rotX ?? 0, spec.rotY ?? 0, spec.rotZ ?? 0);
        transform.scale.set(spec.w, spec.h, spec.d);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        mesh.setColorAt(index, new THREE.Color(spec.color ?? "#ffffff"));
        if (spec.solid) {
          const cos = Math.abs(Math.cos(spec.rotY ?? 0));
          const sin = Math.abs(Math.sin(spec.rotY ?? 0));
          solidObstacles.push({
            x: spec.x,
            z: spec.z,
            width: spec.w * cos + spec.d * sin,
            depth: spec.w * sin + spec.d * cos,
          });
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      scene.add(mesh);
      addContactShadows(specs.filter((spec) => spec.solid));
      if (specs.some((spec) => spec.solid)) worldOccluders.push(mesh);
      return mesh;
    };

    const addBox = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.userData.strikeShadowEligible = true;
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    };
    const addGroundPatch = (w: number, d: number, mat: THREE.Material, x: number, z: number, y = -0.045) => {
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      patch.userData.strikeShadowReceiver = true;
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(x, y, z);
      scene.add(patch);
      return patch;
    };
    const addArenaBackdrop = () => {
      if (arena.id === "training") return;
      const landmarkMaterial = material(arena.concrete, 0.84, 0.12);
      const accentMaterial = new THREE.MeshBasicMaterial({ color: arena.accent, toneMapped: false });
      const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
      const coneGeometry = new THREE.ConeGeometry(1, 1, arena.id === "arctic" ? 6 : 7);
      const trunkGeometry = new THREE.CylinderGeometry(0.7, 1.1, 11, 7);
      materials.push(accentMaterial);
      const addMesh = (
        geometry: THREE.BufferGeometry,
        mat: THREE.Material,
        x: number,
        y: number,
        z: number,
        width: number,
        height: number,
        depth: number,
      ) => {
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.position.set(x, y, z);
        mesh.scale.set(width, height, depth);
        mesh.userData.strikeShadowEligible = true;
        scene.add(mesh);
      };
      if (arena.id === "ruins") {
        [-1, 1].forEach((side) => {
          [-43, -18, 12, 42].forEach((z, index) => {
            addMesh(
              boxGeometry,
              landmarkMaterial,
              side * 67,
              5 + (index % 2) * 2,
              z,
              8 + (index % 3) * 2,
              14 + (index % 2) * 6,
              13,
            );
            addMesh(boxGeometry, accentMaterial, side * 67, 8, z - 6.6, 2.4, 0.18, 0.12);
          });
        });
      } else if (arena.id === "arctic") {
        [-1, 1].forEach((side) => {
          [-44, -22, 8, 34, 50].forEach((z, index) => {
            const height = 7 + (index % 3) * 2;
            addMesh(
              coneGeometry,
              landmarkMaterial,
              side * 66,
              height / 2,
              z,
              3.2,
              height,
              3.2,
            );
          });
        });
      } else if (arena.id === "jungle") {
        [-1, 1].forEach((side) => {
          [-46, -26, 4, 30, 50].forEach((z, index) => {
            const x = side * 66;
            addMesh(trunkGeometry, landmarkMaterial, x, 5.5, z, 1, 1, 1);
            addMesh(coneGeometry, accentMaterial, x, 11 + (index % 2), z, 5.2, 8, 5.2);
          });
        });
      }
    };

    // A 120 x 120 daylight training zone with an open range, bunker corridor, crate yards, and watchtower.
    addArenaBackdrop();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), floorMat);
    floor.userData.strikeShadowReceiver = true;
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.09;
    scene.add(floor);
    addGroundPatch(22, 120, roadMat, 0, 0);
    addGroundPatch(52, 42, openZoneMat, 0, -8, -0.055);
    addGroundPatch(34, 34, roadMat, -34, -15);
    addGroundPatch(30, 34, roadMat, 37, -20);

    const boundaryWalls: BoxInstanceSpec[] = [
      { x: 0, y: 4.5, z: -60, w: 120, h: 9, d: 1.4, solid: true },
      { x: 0, y: 4.5, z: 60, w: 120, h: 9, d: 1.4, solid: true },
      { x: -60, y: 4.5, z: 0, w: 1.4, h: 9, d: 120, solid: true },
      { x: 60, y: 4.5, z: 0, w: 1.4, h: 9, d: 120, solid: true },
    ];
    addBoxInstances(perimeterMat, boundaryWalls);

    const bunkerWalls: BoxInstanceSpec[] = [
      { x: -46, y: 2.4, z: -15, w: 1.5, h: 4.8, d: 28, solid: true },
      { x: -22, y: 2.4, z: -15, w: 1.5, h: 4.8, d: 28, solid: true },
      { x: -34, y: 2.4, z: -29, w: 25, h: 4.8, d: 1.5, solid: true },
      { x: -41.75, y: 2.4, z: -1, w: 8.5, h: 4.8, d: 1.5, solid: true },
      { x: -26.25, y: 2.4, z: -1, w: 8.5, h: 4.8, d: 1.5, solid: true },
      { x: -38, y: 2.4, z: -21, w: 1.1, h: 4.8, d: 12, solid: true },
      { x: -30, y: 2.4, z: -10, w: 1.1, h: 4.8, d: 15, solid: true },
    ];
    addBoxInstances(bunkerMat, bunkerWalls);
    addBoxInstances(bunkerRoofMat, [
      { x: -41.5, y: 4.95, z: -15, w: 8.5, h: 0.3, d: 27 },
      { x: -26.5, y: 4.95, z: -15, w: 8.5, h: 0.3, d: 27 },
    ]);

    const lowWalls: BoxInstanceSpec[] = [
      { x: -12, y: 0.8, z: 4, w: 11, h: 1.6, d: 1.2, solid: true },
      { x: 12, y: 0.8, z: -2, w: 12, h: 1.6, d: 1.2, solid: true },
      { x: -1, y: 0.8, z: -17, w: 12, h: 1.6, d: 1.2, solid: true },
      { x: 20, y: 0.8, z: 12, w: 10, h: 1.6, d: 1.2, solid: true },
      { x: 5, y: 0.8, z: 28, w: 14, h: 1.6, d: 1.2, solid: true },
      { x: -27, y: 0.8, z: 13, w: 1.2, h: 1.6, d: 9, solid: true },
    ];
    addBoxInstances(lowWallMat, lowWalls);
    const arenaCover: BoxInstanceSpec[] = arena.id === "ruins"
      ? [
        { x: -10, y: 1.15, z: -38, w: 8, h: 2.3, d: 1.4, solid: true, rotY: -0.12, color: "#686d6e" },
        { x: 10, y: 1.15, z: -38, w: 8, h: 2.3, d: 1.4, solid: true, rotY: 0.12, color: "#85827a" },
        { x: 0, y: 0.95, z: -29, w: 1.4, h: 1.9, d: 7, solid: true, color: "#6b6a65" },
      ]
      : arena.id === "arctic"
        ? [
          { x: -10, y: 0.9, z: -38, w: 10, h: 1.8, d: 2.1, solid: true, color: "#e5eeee" },
          { x: 10, y: 0.9, z: -38, w: 10, h: 1.8, d: 2.1, solid: true, color: "#c5d9e3" },
          { x: 0, y: 0.75, z: -29, w: 2, h: 1.5, d: 8, solid: true, color: "#e5eeee" },
        ]
        : arena.id === "jungle"
          ? [
            { x: -10, y: 0.65, z: -38, w: 11, h: 1.3, d: 1.2, solid: true, rotY: -0.1, color: "#596d43" },
            { x: 10, y: 0.65, z: -38, w: 11, h: 1.3, d: 1.2, solid: true, rotY: 0.1, color: "#78804b" },
            { x: 0, y: 0.8, z: -29, w: 1.3, h: 1.6, d: 8, solid: true, color: "#626749" },
          ]
          : [];
    addBoxInstances(bunkerMat, arenaCover);

    let crateVariant = 0;
    const makeCrate = (x: number, y: number, z: number): BoxInstanceSpec => {
      const variants = [
        { w: 2.4, h: 2.5, d: 2.65 },
        { w: 2.72, h: 2.68, d: 2.38 },
        { w: 2.52, h: 2.58, d: 2.76 },
        { w: 2.78, h: 2.44, d: 2.5 },
      ];
      const colors = ["#d3c4a7", "#bcae91", "#d0c0a0", "#c8b99d"];
      const variant = crateVariant++;
      const size = variants[variant % variants.length];
      const rotation = [-0.18, 0.09, 0.22, -0.11][variant % 4];
      return {
        x, y, z, ...size, solid: true, rotY: rotation,
        color: colors[variant % colors.length],
      };
    };
    const crates: BoxInstanceSpec[] = [
      makeCrate(-19, 1.3, 20), makeCrate(-16, 1.3, 20), makeCrate(-19, 1.3, 23),
      makeCrate(-19, 3.9, 20), makeCrate(-16, 3.9, 23),
      makeCrate(18, 1.3, 20), makeCrate(21, 1.3, 20), makeCrate(18, 1.3, 23),
      makeCrate(21, 3.9, 20), makeCrate(18, 3.9, 23),
      makeCrate(-14, 1.3, -9), makeCrate(-11, 1.3, -9), makeCrate(-14, 3.9, -9),
      makeCrate(14, 1.3, -22), makeCrate(17, 1.3, -22), makeCrate(14, 1.3, -25),
      makeCrate(17, 3.9, -25), makeCrate(47, 1.3, 13), makeCrate(50, 1.3, 13),
    ];
    addBoxInstances(crateMat, crates.filter((_, index) => index % 4 !== 3));
    addBoxInstances(
      crateMetalMat,
      crates
        .filter((_, index) => index % 4 === 3)
        .map((crate, index) => ({
          ...crate,
          color: ["#d4d0c1", "#b7c0b9", "#c3b7a2", "#aab2aa", "#d0c5af"][index % 5],
        })),
    );

    const towerLegs: BoxInstanceSpec[] = [
      { x: 32, y: 7.5, z: -29, w: 0.9, h: 15, d: 0.9, solid: true },
      { x: 42, y: 7.5, z: -29, w: 0.9, h: 15, d: 0.9, solid: true },
      { x: 32, y: 7.5, z: -19, w: 0.9, h: 15, d: 0.9, solid: true },
      { x: 42, y: 7.5, z: -19, w: 0.9, h: 15, d: 0.9, solid: true },
    ];
    addBoxInstances(towerMat, towerLegs);
    const towerPlatform = { x: 37, y: 15, z: -24, width: 13, height: 0.9, depth: 13 };
    addBox(towerPlatform.width, towerPlatform.height, towerPlatform.depth, towerMat, towerPlatform.x, towerPlatform.y, towerPlatform.z);
    addBox(9, 0.7, 9, bunkerMat, 37, 19, -24);
    addBox(4.8, 3.2, 4.8, towerMat, 37, 17, -24);
    const towerPlatformTop = towerPlatform.y + towerPlatform.height / 2;
    const towerLadderWidth = 1.6;
    const towerLadderX = towerPlatform.x;
    const towerLadderRailZ = towerPlatform.z + towerPlatform.depth / 2 + 0.06;
    const towerLadderAccessZ = towerLadderRailZ + 1.05;
    const towerLadderRailSpecs: BoxInstanceSpec[] = [-1, 1].map((side) => ({
      x: towerLadderX + side * (towerLadderWidth / 2),
      y: towerPlatformTop / 2,
      z: towerLadderRailZ,
      w: 0.14,
      h: towerPlatformTop,
      d: 0.14,
    }));
    const towerLadderRungSpecs: BoxInstanceSpec[] = Array.from({ length: 20 }, (_, index) => ({
      x: towerLadderX,
      y: ((index + 1) / 21) * towerPlatformTop,
      z: towerLadderRailZ - 0.04,
      w: towerLadderWidth,
      h: 0.1,
      d: 0.12,
    }));

    const soldierSpawns: Array<[number, number]> = [
      // Bunker: ruang barat dan ceruk belakang.
      [-42, -8],
      [-33, -25],
      // Area menara, di luar kaki dan platformnya.
      [25, -35],
      [52, -30],
      // Area peti sisi barat dan timur.
      [-34, 20],
      [44, 18],
      // Area terbuka: sudut selatan dan utara.
      [-52, 47],
      [52, 47],
      [0, -49],
      [-48, -47],
    ];
    const currentQualityCounts: Record<QualitySetting, number> = {
      low: 156,
      medium: 230,
      high: 317,
    };
    const tierCounts = (low: number, medium: number, high: number): QualityCounts => ({
      low, medium, high,
    });
    let scenerySeed = 41821;
    const sceneryRandom = () => {
      scenerySeed = (scenerySeed * 1103515245 + 12345) >>> 0;
      return scenerySeed / 4294967296;
    };
    const dustCount = 120;
    const dustPositions = new Float32Array(dustCount * 3);
    const dustDrift = new Float32Array(dustCount);
    for (let index = 0; index < dustCount; index += 1) {
      dustPositions[index * 3] = ((index * 37.31) % 110) - 55;
      dustPositions[index * 3 + 1] = 1.4 + ((index * 13.77) % 10);
      dustPositions[index * 3 + 2] = ((index * 51.19) % 110) - 55;
      dustDrift[index] = 0.12 + (index % 7) * 0.035;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({
      color: arena.dust,
      size: 0.14,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      fog: true,
    });
    materials.push(dustMaterial);
    const dustField = new THREE.Points(dustGeometry, dustMaterial);
    dustField.frustumCulled = false;
    scene.add(dustField);
    const reservedDecorations: Array<{ x: number; z: number; width: number; depth: number }> = [];
    const towerLadderClearance = towerLadderWidth / 2 + 1.5;
    const findDecorationPosition = (width: number, depth: number) => {
      for (let attempt = 0; attempt < 1200; attempt += 1) {
        const side = sceneryRandom() < 0.5 ? -1 : 1;
        const x = side * (24 + sceneryRandom() * 30);
        const z = -34 + sceneryRandom() * 77;
        if (Math.abs(x) + width / 2 > 56 || Math.abs(z) + depth / 2 > 55) continue;
        if (Math.abs(x) < 23 || z < -35 || z > 43) continue;
        if (x * x + (z - 51) * (z - 51) < 15 * 15) continue;
        if (soldierSpawns.some(([spawnX, spawnZ]) => Math.hypot(x - spawnX, z - spawnZ) < 11)) continue;
        if (Math.hypot(x - towerLadderX, z - towerLadderAccessZ) <= towerLadderClearance + Math.hypot(width * 0.56, depth * 0.56)) continue;
        const overlapsExisting = solidObstacles.some((obstacle) => (
          Math.abs(x - obstacle.x) < width / 2 + obstacle.width / 2 + 0.7
          && Math.abs(z - obstacle.z) < depth / 2 + obstacle.depth / 2 + 0.7
        ));
        if (overlapsExisting) continue;
        const overlapsDecor = reservedDecorations.some((obstacle) => (
          Math.abs(x - obstacle.x) < width / 2 + obstacle.width / 2 + 0.55
          && Math.abs(z - obstacle.z) < depth / 2 + obstacle.depth / 2 + 0.55
        ));
        if (overlapsDecor) continue;
        reservedDecorations.push({ x, z, width, depth });
        return { x, z };
      }
      throw new Error("Tidak cukup ruang aman untuk dekorasi Numatik Strike.");
    };
    const addArenaObstacle = (
      geometry: THREE.BufferGeometry,
      obstacleMaterial: THREE.Material,
      x: number,
      y: number,
      z: number,
      width: number,
      height: number,
      depth: number,
      collisionWidth = width,
      collisionDepth = depth,
    ) => {
      const mesh = new THREE.Mesh(geometry, obstacleMaterial);
      mesh.position.set(x, y, z);
      mesh.scale.set(width, height, depth);
      mesh.userData.strikeShadowEligible = true;
      scene.add(mesh);
      worldOccluders.push(mesh);
      solidObstacles.push({ x, z, width: collisionWidth, depth: collisionDepth });
      addContactShadows([{
        x, y: height / 2, z, w: collisionWidth, h: height, d: collisionDepth, solid: true,
      }]);
      return mesh;
    };
    const addArenaDetail = (
      geometry: THREE.BufferGeometry,
      detailMaterial: THREE.Material,
      x: number,
      y: number,
      z: number,
      width: number,
      height: number,
      depth: number,
    ) => {
      const mesh = new THREE.Mesh(geometry, detailMaterial);
      mesh.position.set(x, y, z);
      mesh.scale.set(width, height, depth);
      mesh.userData.strikeShadowEligible = true;
      scene.add(mesh);
      return mesh;
    };
    const addArenaStructures = () => {
      if (arena.id === "training") return;
      const box = new THREE.BoxGeometry(1, 1, 1);
      const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
      const cone = new THREE.ConeGeometry(0.5, 1, arena.id === "arctic" ? 7 : 9);
      const rock = new THREE.DodecahedronGeometry(0.5, 1);
      const frameMat = material(arena.metal, 0.56, 0.42);
      const glassMat = new THREE.MeshStandardMaterial({
        color: arena.accent,
        emissive: arena.accent,
        emissiveIntensity: 0.24,
        roughness: 0.22,
        metalness: 0.45,
      });
      materials.push(glassMat);

      if (arena.id === "ruins") {
        const buildingMat = material("#77716c", 0.96, 0.02);
        const rubbleMat = material("#a18e7c", 0.98, 0.01);
        for (let index = 0; index < 4; index += 1) {
          const position = findDecorationPosition(13, 11);
          const width = index % 2 ? 9 : 12;
          const height = index % 2 ? 9 : 13;
          addArenaObstacle(box, buildingMat, position.x, height / 2, position.z, width, height, 7);
          for (let floor = 0; floor < 3; floor += 1) {
            for (let column = 0; column < 2; column += 1) {
              const windowX = position.x + (column ? 1 : -1) * width * 0.24;
              const windowY = 2.2 + floor * 3.1;
              addArenaDetail(box, glassMat, windowX, windowY, position.z + 3.56, 1.15, 1.05, 0.08);
              addArenaDetail(box, frameMat, windowX, windowY - 0.62, position.z + 3.62, 1.45, 0.12, 0.12);
            }
          }
          addArenaDetail(box, rubbleMat, position.x - width * 0.38, 0.55, position.z + 4.1, 3.2, 1.1, 2.6);
          addArenaDetail(box, rubbleMat, position.x + width * 0.4, 0.4, position.z - 3.8, 2.2, 0.8, 1.6);
        }
      } else if (arena.id === "arctic") {
        const baseMat = material("#8da8b2", 0.72, 0.18);
        const snowMat = material("#e2f1f0", 0.92, 0.02);
        for (let index = 0; index < 3; index += 1) {
          const position = findDecorationPosition(16, 12);
          const width = index === 1 ? 12 : 9;
          const depth = index === 1 ? 8 : 7;
          const height = index === 1 ? 5.2 : 4.4;
          addArenaObstacle(box, baseMat, position.x, height / 2, position.z, width, height, depth);
          addArenaDetail(box, snowMat, position.x, height + 0.16, position.z, width + 0.45, 0.32, depth + 0.45);
          addArenaDetail(box, glassMat, position.x, 2.4, position.z + depth / 2 + 0.06, 2.1, 1.1, 0.1);
          addArenaDetail(box, frameMat, position.x - width * 0.32, 1.2, position.z + depth / 2 + 0.12, 0.16, 2.4, 0.16);
          addArenaDetail(box, frameMat, position.x + width * 0.32, 1.2, position.z + depth / 2 + 0.12, 0.16, 2.4, 0.16);
          for (let drift = 0; drift < 2; drift += 1) {
            const offset = drift ? 1 : -1;
            addArenaDetail(
              cone,
              snowMat,
              position.x + offset * (width / 2 + 1.1),
              1.35,
              position.z - depth * 0.22,
              3.4,
              2.7,
              2.8,
            );
          }
        }
      } else if (arena.id === "jungle") {
        const trunkMat = material("#594535", 0.94, 0.01);
        const canopyMats = [
          material("#536d3f", 0.96, 0.01),
          material("#78934a", 0.96, 0.01),
          material("#3f6245", 0.96, 0.01),
        ];
        const vineMat = material("#a2a848", 0.9, 0.02);
        for (let index = 0; index < 9; index += 1) {
          const position = findDecorationPosition(9, 9);
          const trunkHeight = 7 + (index % 3);
          addArenaObstacle(cylinder, trunkMat, position.x, trunkHeight / 2, position.z, 1.25, trunkHeight, 1.25, 1.5, 1.5);
          addArenaDetail(
            cone,
            canopyMats[index % canopyMats.length]!,
            position.x,
            trunkHeight + 1,
            position.z,
            7 + (index % 2),
            7,
            7 + (index % 2),
          );
          addArenaDetail(cylinder, vineMat, position.x + 0.7, trunkHeight * 0.56, position.z + 0.35, 0.09, 3.8, 0.09);
        }
      }
    };
    addArenaStructures();
    const scatterSpecs = (
      count: number,
      width: number,
      depth: number,
      height: number,
      colorPalette: THREE.ColorRepresentation[],
      solidCount = 0,
      y = height / 2,
    ) => Array.from({ length: count }, (_, index) => {
      const position = findDecorationPosition(width, depth);
      return {
        x: position.x,
        y,
        z: position.z,
        w: width * (0.88 + sceneryRandom() * 0.24),
        h: height * (0.9 + sceneryRandom() * 0.2),
        d: depth * (0.88 + sceneryRandom() * 0.24),
        rotY: sceneryRandom() * Math.PI * 2,
        color: colorPalette[index % colorPalette.length],
        solid: index < solidCount,
      };
    });

    const framedCrates = crates.filter((_, index) => index % 5 !== 4);
    const crateFrameSpecs: BoxInstanceSpec[] = [];
    const frameCorners = [[-1, -1], [1, 1], [-1, 1], [1, -1]];
    for (let part = 0; part < 4; part += 1) {
      framedCrates.slice(0, 16).forEach((crate) => {
        const [cornerX, cornerZ] = frameCorners[part];
        const localX = cornerX * (crate.w / 2 - 0.06);
        const localZ = cornerZ * (crate.d / 2 - 0.06);
        const rotation = crate.rotY ?? 0;
        crateFrameSpecs.push({
          x: crate.x + localX * Math.cos(rotation) + localZ * Math.sin(rotation),
          y: crate.y,
          z: crate.z - localX * Math.sin(rotation) + localZ * Math.cos(rotation),
          w: 0.075,
          h: crate.h * 0.96,
          d: 0.075,
          rotY: rotation,
          color: "#b4a28a",
        });
      });
    }
    addTieredInstances(
      instanceBoxGeometry,
      steelDetailMat,
      crateFrameSpecs,
      tierCounts(32, 48, 64),
    );

    const bunkerDetails: BoxInstanceSpec[] = [
      { x: -37.35, y: 2.25, z: -0.12, w: 0.26, h: 4.5, d: 0.26 },
      { x: -30.65, y: 2.25, z: -0.12, w: 0.26, h: 4.5, d: 0.26 },
      { x: -34, y: 4.48, z: -0.12, w: 6.8, h: 0.26, d: 0.26 },
      { x: -34, y: 0.18, z: -0.12, w: 6.8, h: 0.36, d: 0.26 },
      { x: -43, y: 3.45, z: -29.78, w: 1.3, h: 0.16, d: 0.08 },
      { x: -26, y: 3.45, z: -29.78, w: 1.3, h: 0.16, d: 0.08 },
      { x: -45.18, y: 3.25, z: -24, w: 0.08, h: 0.15, d: 1.05 },
      { x: -45.18, y: 3.25, z: -16, w: 0.08, h: 0.15, d: 1.05 },
      { x: -45.18, y: 3.25, z: -8, w: 0.08, h: 0.15, d: 1.05 },
      { x: -22.82, y: 3.25, z: -24, w: 0.08, h: 0.15, d: 1.05 },
      { x: -22.82, y: 3.25, z: -16, w: 0.08, h: 0.15, d: 1.05 },
      { x: -22.82, y: 3.25, z: -8, w: 0.08, h: 0.15, d: 1.05 },
    ];
    addTieredInstances(
      instanceBoxGeometry,
      darkInsetMat,
      bunkerDetails,
      tierCounts(12, 12, 12),
    );

    const towerPlatformSouthRailZ = towerPlatform.z + towerPlatform.depth / 2 + 0.2;
    const towerPlatformSouthRailStartX = towerPlatform.x - 6;
    const towerPlatformSouthRailEndX = towerPlatform.x + 6;
    const towerPlatformOpeningStartX = towerLadderX - towerLadderWidth / 2 - 0.7;
    const towerPlatformOpeningEndX = towerLadderX + towerLadderWidth / 2 + 0.7;
    const towerPlatformSouthRailSpecs: BoxInstanceSpec[] = [
      {
        x: (towerPlatformSouthRailStartX + towerPlatformOpeningStartX) / 2,
        y: 15.8,
        z: towerPlatformSouthRailZ,
        w: towerPlatformOpeningStartX - towerPlatformSouthRailStartX,
        h: 0.2,
        d: 0.18,
      },
      {
        x: (towerPlatformOpeningEndX + towerPlatformSouthRailEndX) / 2,
        y: 15.8,
        z: towerPlatformSouthRailZ,
        w: towerPlatformSouthRailEndX - towerPlatformOpeningEndX,
        h: 0.2,
        d: 0.18,
      },
    ];
    const towerPlatformRailSpecs: BoxInstanceSpec[] = [
      { x: 37, y: 15.8, z: -30.2, w: 12, h: 0.2, d: 0.18 },
      ...towerPlatformSouthRailSpecs,
      { x: 30.7, y: 15.8, z: -24, w: 0.18, h: 0.2, d: 12 },
      { x: 43.3, y: 15.8, z: -24, w: 0.18, h: 0.2, d: 12 },
    ];
    const towerDetailSpecs: BoxInstanceSpec[] = [
      ...towerLadderRailSpecs,
      ...towerLadderRungSpecs,
      ...towerPlatformRailSpecs,
      { x: 34.2, y: 8.5, z: -28.1, w: 0.16, h: 13.2, d: 0.16, rotZ: 0.22 },
      { x: 39.8, y: 8.5, z: -28.1, w: 0.16, h: 13.2, d: 0.16, rotZ: -0.22 },
    ];
    addTieredInstances(
      instanceBoxGeometry,
      towerMat,
      towerDetailSpecs,
      tierCounts(8, 12, 29),
    );
    const barrierShape = new THREE.Shape();
    barrierShape.moveTo(-0.5, 0);
    barrierShape.lineTo(0.5, 0);
    barrierShape.lineTo(0.38, 0.55);
    barrierShape.lineTo(0.2, 1);
    barrierShape.lineTo(-0.2, 1);
    barrierShape.lineTo(-0.38, 0.55);
    barrierShape.closePath();
    const barrierGeometry = new THREE.ExtrudeGeometry(barrierShape, {
      depth: 1,
      bevelEnabled: false,
      steps: 1,
    });
    barrierGeometry.translate(0, -0.5, -0.5);
    const barriers = scatterSpecs(
      12,
      3.4,
      0.85,
      1.25,
      ["#d4c7b0", "#bfb39e", "#c9c0af"],
      6,
      0.62,
    );
    addTieredInstances(barrierGeometry, bunkerMat, barriers, tierCounts(6, 9, 12));

    const sandbagGeometry = new THREE.SphereGeometry(0.5, 8, 6);
    const sandbags = scatterSpecs(
      24,
      1.12,
      0.64,
      0.58,
      ["#d0c6a7", "#b7ae91", "#c4ba9f"],
      12,
      0.3,
    );
    addTieredInstances(sandbagGeometry, sandbagMat, sandbags, tierCounts(12, 18, 24));

    const drumGeometry = new THREE.CylinderGeometry(0.48, 0.48, 1, 10, 1);
    const drums = scatterSpecs(
      16,
      0.95,
      0.95,
      1.25,
      ["#9c6548", "#68756e", "#725a4c", "#80734f"],
      8,
      0.62,
    );
    addTieredInstances(drumGeometry, steelDetailMat, drums, tierCounts(8, 12, 16));

    const tireGeometry = new THREE.TorusGeometry(0.42, 0.16, 6, 10);
    const tires = scatterSpecs(
      20,
      1.2,
      1.2,
      1.15,
      ["#f1e9db", "#c4c2b8", "#d5d0c2"],
      10,
      0.56,
    ).map((spec) => ({ ...spec, rotX: Math.PI / 2 }));
    addTieredInstances(tireGeometry, tireMat, tires, tierCounts(10, 15, 20));

    const palletSpecs = scatterSpecs(
      16,
      2.2,
      1.35,
      0.3,
      ["#d3c1a0", "#bca783", "#c8b593"],
      8,
      0.16,
    );
    addTieredInstances(instanceBoxGeometry, crateMat, palletSpecs, tierCounts(8, 12, 16));

    const vehicleAnchors = [
      { x: -49, z: 0.5, rotation: 0.07 },
      { x: 49, z: 0.5, rotation: -0.09 },
    ];
    const vehicleBodies = vehicleAnchors.map(({ x, z, rotation }) => ({
      x, y: 0.74, z, w: 3.8, h: 1.25, d: 5.2, rotY: rotation, solid: true,
      color: "#777064",
    }));
    const vehicleHoods = vehicleAnchors.map(({ x, z, rotation }) => ({
      x, y: 0.94, z: z - 1.75, w: 3.55, h: 0.55, d: 1.55, rotY: rotation,
      rotZ: rotation > 0 ? -0.12 : 0.17,
      color: "#80684e",
    }));
    const vehicleRoofs = vehicleAnchors.map(({ x, z, rotation }) => ({
      x: x + (rotation > 0 ? 0.18 : -0.14), y: 1.95, z: z + 0.05,
      w: 2.35, h: 0.55, d: 2.45, rotY: rotation, rotZ: rotation > 0 ? 0.14 : -0.1,
      color: "#655b4d",
    }));
    const vehicleGlass = vehicleAnchors.map(({ x, z, rotation }) => ({
      x, y: 1.72, z: z - 1.2, w: 2.35, h: 0.65, d: 0.09, rotY: rotation,
      color: "#485052",
    }));
    const vehicleDamagePanels = vehicleAnchors.flatMap(({ x, z, rotation }) => (
      [-1, 1].map((side) => ({
        x: x + side * 1.84,
        y: 1.05,
        z: z + 0.12,
        w: 0.12,
        h: 0.72,
        d: 1.15,
        rotY: rotation,
        rotZ: side < 0 ? 0.16 : -0.13,
        color: side < 0 ? "#927150" : "#5b625b",
      }))
    ));
    const vehicleWheels = vehicleAnchors.flatMap(({ x, z, rotation }) => (
      [-1, 1].flatMap((sideX) => [-1, 1].map((sideZ) => ({
        x: x + sideX * 1.8,
        y: 0.48,
        z: z + sideZ * 1.55,
        w: 0.88,
        h: 0.42,
        d: 0.88,
        rotZ: Math.PI / 2,
        rotY: rotation,
        color: "#292b29",
      })))
    ));
    const vehicleWheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    addTieredInstances(instanceBoxGeometry, vehicleMat, vehicleBodies, tierCounts(2, 2, 2));
    addTieredInstances(instanceBoxGeometry, steelDetailMat, vehicleHoods, tierCounts(2, 2, 2));
    addTieredInstances(instanceBoxGeometry, vehicleMat, vehicleRoofs, tierCounts(2, 2, 2));
    addTieredInstances(instanceBoxGeometry, windowMat, vehicleGlass, tierCounts(2, 2, 2));
    addTieredInstances(instanceBoxGeometry, steelDetailMat, vehicleDamagePanels, tierCounts(4, 4, 4));
    addTieredInstances(vehicleWheelGeometry, tireMat, vehicleWheels, tierCounts(8, 8, 8));

    const fenceWireSpecs: BoxInstanceSpec[] = [
      { x: 0, y: 9.5, z: -59.15, w: 118, h: 0.035, d: 0.035 },
      { x: 0, y: 10.3, z: -59.15, w: 118, h: 0.035, d: 0.035 },
      { x: 0, y: 9.5, z: 59.15, w: 118, h: 0.035, d: 0.035 },
      { x: 0, y: 10.3, z: 59.15, w: 118, h: 0.035, d: 0.035 },
      { x: -59.15, y: 9.5, z: 0, w: 0.035, h: 0.035, d: 118 },
      { x: -59.15, y: 10.3, z: 0, w: 0.035, h: 0.035, d: 118 },
      { x: 59.15, y: 9.5, z: 0, w: 0.035, h: 0.035, d: 118 },
      { x: 59.15, y: 10.3, z: 0, w: 0.035, h: 0.035, d: 118 },
    ];
    addTieredInstances(instanceBoxGeometry, steelDetailMat, fenceWireSpecs, tierCounts(8, 8, 8));
    const fencePostSpecs = Array.from({ length: 16 }, (_, index) => {
      const edge = Math.floor(index / 4);
      const along = [-42, -14, 14, 42][index % 4];
      const point = edge === 0 ? { x: along, z: -59.1 }
        : edge === 1 ? { x: along, z: 59.1 }
          : edge === 2 ? { x: -59.1, z: along } : { x: 59.1, z: along };
      return { ...point, y: 10, w: 0.14, h: 2.1, d: 0.14, color: "#aaa99d" };
    });
    addTieredInstances(
      instanceBoxGeometry,
      steelDetailMat,
      fencePostSpecs,
      tierCounts(4, 10, 16),
    );

    const poleAnchors = [
      { x: -52, z: -31 },
      { x: 52, z: -31 },
      { x: -52, z: 31 },
      { x: 52, z: 31 },
    ];
    addTieredInstances(
      new THREE.CylinderGeometry(0.17, 0.24, 10, 7),
      towerMat,
      poleAnchors.map(({ x, z }) => ({ x, y: 5, z, w: 1, h: 1, d: 1 })),
      tierCounts(4, 4, 4),
    );
    addTieredInstances(
      instanceBoxGeometry,
      steelDetailMat,
      poleAnchors.map(({ x, z }) => ({ x, y: 10.05, z, w: 2.2, h: 0.16, d: 0.16 })),
      tierCounts(2, 4, 4),
    );
    const overheadWireSpecs: BoxInstanceSpec[] = [
      { x: 0, y: 11.2, z: -31, w: 104, h: 0.025, d: 0.025 },
      { x: 0, y: 11.2, z: 31, w: 104, h: 0.025, d: 0.025 },
      { x: -52, y: 11.2, z: 0, w: 0.025, h: 0.025, d: 62 },
      { x: 52, y: 11.2, z: 0, w: 0.025, h: 0.025, d: 62 },
    ];
    addTieredInstances(instanceBoxGeometry, steelDetailMat, overheadWireSpecs, tierCounts(0, 1, 4));
    const searchlightGeometry = new THREE.BoxGeometry(0.48, 0.35, 0.74);
    addTieredInstances(
      searchlightGeometry,
      glowMat,
      [
        { x: 32.7, y: 16.8, z: -24, w: 1, h: 1, d: 1 },
        { x: 41.3, y: 16.8, z: -24, w: 1, h: 1, d: 1 },
        { x: 37, y: 16.8, z: -28.3, w: 1, h: 1, d: 1, rotY: Math.PI / 2 },
        { x: 37, y: 16.8, z: -19.7, w: 1, h: 1, d: 1, rotY: Math.PI / 2 },
      ],
      tierCounts(0, 2, 4),
    );
    const searchlightBeamGeometry = new THREE.ConeGeometry(0.5, 1, 8, 1);
    addTieredInstances(
      searchlightBeamGeometry,
      searchlightBeamMat,
      [
        { x: 37, y: 9.3, z: -27, w: 13, h: 15, d: 13, rotX: 0.48 },
        { x: 37, y: 9.3, z: -21, w: 13, h: 15, d: 13, rotX: -0.48 },
        { x: 34, y: 9.3, z: -24, w: 13, h: 15, d: 13, rotZ: -0.48 },
        { x: 40, y: 9.3, z: -24, w: 13, h: 15, d: 13, rotZ: 0.48 },
      ],
      tierCounts(2, 3, 4),
    );

    const rockGeometry = new THREE.DodecahedronGeometry(0.5, 0);
    addTieredInstances(
      rockGeometry,
      groundDetailMat,
      scatterSpecs(20, 0.52, 0.48, 0.28, ["#a49780", "#c4b18b", "#776c5c"]),
      tierCounts(8, 14, 20),
    );
    addTieredInstances(
      instanceBoxGeometry,
      groundDetailMat,
      scatterSpecs(20, 0.14, 0.75, 0.16, ["#b29b72", "#766c59", "#c1aa7b"])
        .map((spec) => ({ ...spec, rotY: sceneryRandom() * Math.PI })),
      tierCounts(4, 12, 20),
    );
    addTieredInstances(
      instanceBoxGeometry,
      steelDetailMat,
      scatterSpecs(12, 0.52, 0.3, 0.28, ["#aba08c", "#7e7770", "#c4bba9"]),
      tierCounts(4, 8, 12),
    );
    const puddleGeometry = new THREE.PlaneGeometry(1, 1);
    addTieredInstances(
      puddleGeometry,
      puddleMat,
      scatterSpecs(8, 1.7, 1.05, 1.05, ["#9caaa5", "#b0b8b1", "#d0c6af"], 0, -0.038)
        .map((spec) => ({ ...spec, d: 0.012, rotX: -Math.PI / 2 })),
      tierCounts(4, 6, 8),
    );
    const actualQualityCounts = (Object.keys(currentQualityCounts) as QualitySetting[]).reduce(
      (result, selectedQuality) => {
        result[selectedQuality] = tieredInstanceMeshes.reduce(
          (count, entry) => count + entry.counts[selectedQuality],
          0,
        );
        return result;
      },
      {} as Record<QualitySetting, number>,
    );
    if (
      actualQualityCounts.low !== currentQualityCounts.low
      || actualQualityCounts.medium !== currentQualityCounts.medium
      || actualQualityCounts.high !== currentQualityCounts.high
    ) {
      throw new Error(`Jumlah instance dekorasi tidak sesuai batas kualitas: ${JSON.stringify(actualQualityCounts)}`);
    }

    const treasureChests: TreasureChest[] = [];
    const treasureChestTargets: THREE.Object3D[] = [];
    const treasureBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const treasureCoinGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.09, 20);
    const treasureRimGeometry = new THREE.TorusGeometry(0.19, 0.025, 6, 20);
    const treasureGlowRingGeometry = new THREE.TorusGeometry(1.55, 0.07, 8, 40);
    const treasureOuterGlowGeometry = new THREE.TorusGeometry(1.9, 0.035, 8, 40);
    const addChestPart = (
      group: THREE.Group,
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      position: [number, number, number],
      scale: [number, number, number],
      targetable = true,
    ) => {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      mesh.castShadow = true;
      mesh.userData.strikeShadowEligible = true;
      group.add(mesh);
      if (targetable) treasureChestTargets.push(mesh);
      return mesh;
    };
    for (let index = 0; index < TREASURE_COUNT; index += 1) {
      const position = findDecorationPosition(3, 2.4);
      const group = new THREE.Group();
      group.position.set(position.x, 0, position.z);
      scene.add(group);
      addChestPart(group, treasureBoxGeometry, treasureWoodMat, [0, 0.52, 0], [1.9, 0.95, 1.45]);
      addChestPart(group, treasureBoxGeometry, treasureWoodMat, [0, 1.12, -0.02], [2, 0.28, 1.52]);
      [-0.62, 0.62].forEach((bandX) => {
        addChestPart(group, treasureBoxGeometry, treasureGoldMat, [bandX, 0.55, 0.735], [0.13, 0.94, 0.045]);
      });
      addChestPart(group, treasureBoxGeometry, treasureGoldMat, [0, 0.99, 0.79], [0.36, 0.42, 0.09]);
      addChestPart(group, treasureBoxGeometry, treasureWoodMat, [0, 0.97, 0.845], [0.16, 0.1, 0.025], false);
      [-0.48, 0, 0.48].forEach((coinX, coinIndex) => {
        const height = 1.34 + (coinIndex === 1 ? 0.06 : 0);
        const coin = addChestPart(group, treasureCoinGeometry, treasureCoinMat, [coinX, height, -0.18], [1, 1, 1], false);
        coin.rotation.z = coinIndex === 1 ? -0.18 : 0.12;
        const rim = addChestPart(group, treasureRimGeometry, treasureGoldMat, [coinX, height + 0.05, -0.18], [1, 1, 1], false);
        rim.rotation.x = Math.PI / 2;
      });
      const innerGlow = addChestPart(group, treasureGlowRingGeometry, treasureGlowMat, [0, 0.035, 0], [1, 1, 1], false);
      innerGlow.rotation.x = Math.PI / 2;
      const outerGlow = addChestPart(group, treasureOuterGlowGeometry, treasureGlowMat, [0, 0.025, 0], [1, 1, 1], false);
      outerGlow.rotation.x = Math.PI / 2;
      const beacon = new THREE.PointLight("#ffc94d", 3.2, 13, 2);
      beacon.position.set(0, 1.6, 0);
      group.add(beacon);
      const shadow = new THREE.Mesh(contactShadowGeometry, contactShadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(0, -0.035, 0);
      shadow.scale.set(3.2, 2.7, 1);
      group.add(shadow);
      solidObstacles.push({ x: position.x, z: position.z, width: 2.05, depth: 1.6 });
      group.children.forEach((child) => {
        if (treasureChestTargets.includes(child)) worldOccluders.push(child);
      });
      treasureChests.push({ group, collected: false, phase: index * 0.9 });
    }

    const soldierGeometries = new Set<THREE.BufferGeometry>();
    const soldierGeometry = <T extends THREE.BufferGeometry>(geometry: T) => {
      soldierGeometries.add(geometry);
      return geometry;
    };
    type SoldierPartSpec = {
      geometry: THREE.BufferGeometry;
      materialIndex: number;
      position: [number, number, number];
      scale: [number, number, number];
      rotation: [number, number, number];
    };
    const soldierBoxGeometry = soldierGeometry(new THREE.BoxGeometry(1, 1, 1));
    const soldierSphereGeometry = soldierGeometry(new THREE.SphereGeometry(0.5, 18, 12));
    const soldierMaskGeometry = soldierGeometry(
      new THREE.SphereGeometry(0.5, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    );
    const soldierHelmetShellGeometry = soldierGeometry(
      new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    );
    const soldierCylinderGeometry = soldierGeometry(new THREE.CylinderGeometry(0.5, 0.5, 1, 14));
    const soldierTorusGeometry = soldierGeometry(new THREE.TorusGeometry(0.5, 0.08, 6, 20));
    const soldierMagazineCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.08, 0),
      new THREE.Vector3(0, -0.18, 0.02),
      new THREE.Vector3(0.03, -0.29, 0.08),
      new THREE.Vector3(0.065, -0.36, 0.14),
    ]);
    const soldierMagazineGeometry = soldierGeometry(new THREE.TubeGeometry(soldierMagazineCurve, 9, 0.055, 6, false));
    const soldierSlingCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.09, -0.06, -0.42),
      new THREE.Vector3(-0.24, -0.24, -0.2),
      new THREE.Vector3(-0.22, -0.28, 0.18),
      new THREE.Vector3(-0.08, -0.09, 0.48),
    ]);
    const soldierSlingGeometry = soldierGeometry(new THREE.TubeGeometry(soldierSlingCurve, 16, 0.025, 6, false));
    const muzzleFlashGeometry = soldierGeometry(new THREE.SphereGeometry(0.5, 12, 8));
    const soldierPart = (
      geometry: THREE.BufferGeometry,
      materialIndex: number,
      position: [number, number, number],
      scale: [number, number, number],
      rotation: [number, number, number] = [0, 0, 0],
    ): SoldierPartSpec => ({ geometry, materialIndex, position, scale, rotation });
    const mergeSoldierParts = (specs: SoldierPartSpec[]) => {
      const byMaterial = new Map<number, SoldierPartSpec[]>();
      specs.forEach((spec) => {
        const materialSpecs = byMaterial.get(spec.materialIndex) ?? [];
        materialSpecs.push(spec);
        byMaterial.set(spec.materialIndex, materialSpecs);
      });
      const materialGeometries: THREE.BufferGeometry[] = [];
      byMaterial.forEach((materialSpecs, materialIndex) => {
        const transformed = materialSpecs.map((spec) => {
          const geometry = spec.geometry.clone();
          geometry.clearGroups();
          geometry.applyMatrix4(new THREE.Matrix4().compose(
            new THREE.Vector3(...spec.position),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(...spec.rotation)),
            new THREE.Vector3(...spec.scale),
          ));
          return geometry;
        });
        const materialGeometry = mergeGeometries(transformed, false);
        transformed.forEach((geometry) => geometry.dispose());
        if (!materialGeometry) throw new Error("Geometri prajurit tidak dapat digabungkan.");
        materialGeometry.clearGroups();
        materialGeometry.addGroup(
          0,
          materialGeometry.index?.count ?? materialGeometry.getAttribute("position").count,
          materialIndex,
        );
        materialGeometries.push(materialGeometry);
      });
      const merged = mergeGeometries(materialGeometries, true);
      materialGeometries.forEach((geometry) => geometry.dispose());
      if (!merged) throw new Error("Mesh gabungan prajurit tidak dapat dibuat.");
      return soldierGeometry(merged);
    };
    const bodyGeometry = mergeSoldierParts([
      soldierPart(soldierSphereGeometry, 0, [0, 1.29, 0], [0.58, 0.76, 0.36]),
      soldierPart(soldierSphereGeometry, 1, [0, 1.31, 0.04], [0.66, 0.52, 0.42]),
      soldierPart(soldierSphereGeometry, 0, [-0.31, 1.54, 0], [0.26, 0.2, 0.3]),
      soldierPart(soldierSphereGeometry, 0, [0.31, 1.54, 0], [0.26, 0.2, 0.3]),
      soldierPart(soldierBoxGeometry, 2, [0, 1.01, 0.02], [0.64, 0.12, 0.42]),
      soldierPart(soldierBoxGeometry, 2, [0, 1.01, 0.245], [0.1, 0.075, 0.025]),
      soldierPart(soldierBoxGeometry, 1, [-0.22, 1.22, 0.25], [0.14, 0.17, 0.12]),
      soldierPart(soldierBoxGeometry, 1, [-0.07, 1.22, 0.25], [0.13, 0.17, 0.12]),
      soldierPart(soldierBoxGeometry, 1, [0.08, 1.22, 0.25], [0.13, 0.17, 0.12]),
      soldierPart(soldierBoxGeometry, 1, [0.22, 1.22, 0.25], [0.14, 0.17, 0.12]),
      soldierPart(soldierBoxGeometry, 2, [0, 1.48, -0.27], [0.48, 0.54, 0.22]),
      soldierPart(soldierBoxGeometry, 2, [-0.29, 1.45, -0.25], [0.13, 0.27, 0.21]),
      soldierPart(soldierBoxGeometry, 2, [0.29, 1.45, -0.25], [0.13, 0.27, 0.21]),
      soldierPart(soldierBoxGeometry, 2, [-0.2, 1.5, -0.12], [0.075, 0.45, 0.045], [0, 0, -0.2]),
      soldierPart(soldierBoxGeometry, 2, [0.2, 1.5, -0.12], [0.075, 0.45, 0.045], [0, 0, 0.2]),
      soldierPart(soldierBoxGeometry, 2, [-0.25, 1.49, 0.218], [0.13, 0.1, 0.025]),
      soldierPart(soldierBoxGeometry, 1, [-0.24, 1.35, 0.27], [0.13, 0.18, 0.11]),
      soldierPart(soldierBoxGeometry, 1, [0.24, 1.35, 0.27], [0.13, 0.18, 0.11]),
      soldierPart(soldierBoxGeometry, 2, [0.28, 1.43, -0.34], [0.16, 0.3, 0.12]),
      soldierPart(soldierCylinderGeometry, 1, [0.28, 1.43, -0.42], [0.09, 0.28, 0.09], [0, 0, Math.PI / 2]),
      soldierPart(soldierBoxGeometry, 2, [-0.19, 1.53, 0.39], [0.075, 0.48, 0.045], [0, 0, -0.36]),
      soldierPart(soldierBoxGeometry, 2, [0.19, 1.53, 0.39], [0.075, 0.48, 0.045], [0, 0, 0.36]),
      soldierPart(soldierBoxGeometry, 1, [0, 1.49, 0.435], [0.12, 0.14, 0.035]),
      soldierPart(soldierBoxGeometry, 2, [-0.37, 1.52, -0.22], [0.16, 0.3, 0.17]),
      soldierPart(soldierCylinderGeometry, 1, [-0.39, 1.78, -0.23], [0.018, 0.28, 0.018]),
    ]);
    const headGeometry = mergeSoldierParts([
      soldierPart(soldierCylinderGeometry, 0, [0, 1.72, 0], [0.14, 0.2, 0.14]),
      soldierPart(soldierSphereGeometry, 0, [0, 1.91, 0], [0.44, 0.48, 0.42]),
      soldierPart(soldierMaskGeometry, 2, [0, 1.9, 0.035], [0.44, 0.46, 0.425]),
      soldierPart(soldierHelmetShellGeometry, 1, [0, 2.12, 0], [0.58, 0.38, 0.58]),
      soldierPart(soldierBoxGeometry, 1, [0, 2.015, 0.035], [0.61, 0.06, 0.5]),
      soldierPart(soldierCylinderGeometry, 1, [-0.275, 2.01, 0.02], [0.16, 0.1, 0.16], [0, 0, Math.PI / 2]),
      soldierPart(soldierCylinderGeometry, 1, [0.275, 2.01, 0.02], [0.16, 0.1, 0.16], [0, 0, Math.PI / 2]),
      soldierPart(soldierTorusGeometry, 2, [0, 1.93, 0], [0.45, 0.45, 0.45], [Math.PI / 2, 0, 0]),
      soldierPart(soldierBoxGeometry, 2, [0, 1.98, 0.205], [0.38, 0.075, 0.04]),
      soldierPart(soldierBoxGeometry, 2, [-0.225, 1.98, 0.16], [0.11, 0.055, 0.04]),
      soldierPart(soldierBoxGeometry, 2, [0.225, 1.98, 0.16], [0.11, 0.055, 0.04]),
      soldierPart(soldierBoxGeometry, 2, [-0.13, 1.82, 0.13], [0.07, 0.17, 0.035], [0, 0, -0.25]),
      soldierPart(soldierBoxGeometry, 2, [0.13, 1.82, 0.13], [0.07, 0.17, 0.035], [0, 0, 0.25]),
      soldierPart(soldierSphereGeometry, 2, [-0.105, 1.99, 0.245], [0.09, 0.055, 0.035]),
      soldierPart(soldierSphereGeometry, 2, [0.105, 1.99, 0.245], [0.09, 0.055, 0.035]),
      soldierPart(soldierBoxGeometry, 1, [0, 2.31, -0.02], [0.12, 0.12, 0.12]),
    ]);
    const makeArmGeometry = (side: -1 | 1) => {
      const inward = side < 0 ? 1 : -1;
      const gloveZ = side < 0 ? 0.31 : -0.08;
      return mergeSoldierParts([
        soldierPart(soldierBoxGeometry, 0, [0, -0.15, 0], [0.23, 0.34, 0.25]),
        soldierPart(soldierBoxGeometry, 0, [inward * 0.1, -0.39, 0.15], [0.18, 0.34, 0.2], [0, 0, inward * 0.16]),
        soldierPart(soldierBoxGeometry, 1, [inward * 0.1, -0.38, 0.25], [0.19, 0.15, 0.065]),
        soldierPart(soldierSphereGeometry, 1, [inward * 0.13, -0.52, gloveZ], [0.16, 0.13, 0.18]),
      ]);
    };
    const leftArmGeometry = makeArmGeometry(-1);
    const rightArmGeometry = makeArmGeometry(1);
    const legGeometry = mergeSoldierParts([
      soldierPart(soldierBoxGeometry, 0, [0, -0.2, 0], [0.24, 0.43, 0.26]),
      soldierPart(soldierBoxGeometry, 0, [0, -0.56, 0.015], [0.21, 0.36, 0.23]),
      soldierPart(soldierBoxGeometry, 1, [0, -0.44, 0.14], [0.23, 0.16, 0.08]),
      soldierPart(soldierSphereGeometry, 1, [0, -0.43, 0.19], [0.16, 0.12, 0.07]),
      soldierPart(soldierBoxGeometry, 1, [0, -0.75, 0.015], [0.24, 0.13, 0.26]),
      soldierPart(soldierBoxGeometry, 1, [0, -0.85, 0.1], [0.29, 0.15, 0.42]),
    ]);
    const rifleGeometry = mergeSoldierParts([
      soldierPart(soldierBoxGeometry, 0, [0, 0, -0.39], [0.17, 0.15, 0.34]),
      soldierPart(soldierBoxGeometry, 1, [0, 0, -0.06], [0.18, 0.15, 0.43]),
      soldierPart(soldierBoxGeometry, 0, [0, 0.005, 0.34], [0.19, 0.16, 0.34]),
      soldierPart(soldierCylinderGeometry, 1, [0, 0.02, 0.7], [0.05, 0.58, 0.05], [Math.PI / 2, 0, 0]),
      soldierPart(soldierCylinderGeometry, 1, [0, 0.02, 1.02], [0.075, 0.16, 0.075], [Math.PI / 2, 0, 0]),
      soldierPart(soldierBoxGeometry, 0, [0.08, -0.17, -0.08], [0.12, 0.22, 0.13], [0.18, 0, -0.08]),
      soldierPart(soldierMagazineGeometry, 0, [0, -0.01, -0.12], [1, 1, 1]),
      soldierPart(soldierBoxGeometry, 1, [0, 0.115, -0.04], [0.12, 0.035, 0.48]),
      soldierPart(soldierBoxGeometry, 1, [0, 0.18, -0.28], [0.12, 0.11, 0.14]),
      soldierPart(soldierBoxGeometry, 1, [0, 0.19, -0.28], [0.19, 0.055, 0.12]),
      soldierPart(soldierBoxGeometry, 1, [0, 0.1, 0.55], [0.045, 0.12, 0.07]),
      soldierPart(soldierBoxGeometry, 1, [0, 0.09, -0.23], [0.045, 0.1, 0.07]),
      soldierPart(soldierTorusGeometry, 0, [0.08, -0.12, -0.07], [0.18, 0.16, 0.18]),
      soldierPart(soldierBoxGeometry, 1, [0.13, 0.015, -0.08], [0.05, 0.07, 0.08]),
      soldierPart(soldierCylinderGeometry, 1, [0, 0.19, -0.04], [0.06, 0.2, 0.06]),
      soldierPart(soldierTorusGeometry, 1, [0, 0.19, -0.04], [0.075, 0.075, 0.075], [Math.PI / 2, 0, 0]),
      soldierPart(soldierBoxGeometry, 0, [-0.11, -0.13, 0.32], [0.08, 0.16, 0.18]),
      soldierPart(soldierSlingGeometry, 0, [0, 0, 0], [1, 1, 1]),
    ]);

    const spawnsAreValid = soldierSpawns.length === STARTING_ENEMIES
      && soldierSpawns.every(([x, z], index) => (
        Math.hypot(x, z - 51) >= 40
        && !solidObstacles.some((obstacle) => (
          Math.abs(x - obstacle.x) < obstacle.width / 2 + 0.55
          && Math.abs(z - obstacle.z) < obstacle.depth / 2 + 0.55
        ))
        && soldierSpawns.slice(index + 1).every(([otherX, otherZ]) => (
          Math.hypot(x - otherX, z - otherZ) >= 15
        ))
      ));
    if (!spawnsAreValid) {
      throw new Error("Titik spawn musuh menabrak collider atau melanggar jarak aman.");
    }

    const soldiers: SoldierState[] = [];
    const createSoldier = (x: number, z: number, index: number): SoldierState => {
      const group = new THREE.Group();
      const parts: THREE.Mesh[] = [];
      const headParts: THREE.Mesh[] = [];
      const addMergedPart = (
        parent: THREE.Object3D,
        geometry: THREE.BufferGeometry,
        mats: THREE.Material[],
        targetable = true,
      ) => {
        const mesh = new THREE.Mesh(geometry, mats);
        parent.add(mesh);
        if (targetable) parts.push(mesh);
        return mesh;
      };
      const uniformMat = soldierCamoMaterials[Math.floor(Math.random() * soldierCamoMaterials.length)]
        ?? soldierCamoMaterials[0]!;
      addMergedPart(group, bodyGeometry, [uniformMat, soldierVestMat, soldierGearMat]);
      const head = addMergedPart(group, headGeometry, [
        soldierSkinMat,
        soldierHelmetMat,
        soldierMaskMat,
      ]);
      headParts.push(head);

      const leftArmPivot = new THREE.Group();
      leftArmPivot.position.set(-0.34, 1.46, 0);
      leftArmPivot.rotation.x = -0.52;
      group.add(leftArmPivot);
      addMergedPart(leftArmPivot, leftArmGeometry, [uniformMat, soldierGloveMat]);
      const rightArmPivot = new THREE.Group();
      rightArmPivot.position.set(0.34, 1.46, 0);
      rightArmPivot.rotation.x = -0.52;
      group.add(rightArmPivot);
      addMergedPart(rightArmPivot, rightArmGeometry, [uniformMat, soldierGloveMat]);

      const leftLegPivot = new THREE.Group();
      leftLegPivot.position.set(-0.16, 0.94, 0);
      group.add(leftLegPivot);
      addMergedPart(leftLegPivot, legGeometry, [uniformMat, soldierBootMat]);
      const rightLegPivot = new THREE.Group();
      rightLegPivot.position.set(0.16, 0.94, 0);
      group.add(rightLegPivot);
      addMergedPart(rightLegPivot, legGeometry, [uniformMat, soldierBootMat]);

      const rifle = new THREE.Group();
      rifle.position.set(0, 1.26, 0.18);
      group.add(rifle);
      addMergedPart(rifle, rifleGeometry, [soldierWeaponMat, soldierMetalMat]);
      const muzzleFlash = new THREE.Mesh(muzzleFlashGeometry, muzzleFlashMat);
      muzzleFlash.position.set(0, 0.02, 1.17);
      muzzleFlash.scale.set(0.22, 0.18, 0.36);
      rifle.add(muzzleFlash);
      muzzleFlash.visible = false;

      const patrolPoints = [
        new THREE.Vector3(x + (index % 2 ? 2 : -2), 0, z + 1.5),
        new THREE.Vector3(x + (index % 2 ? -2 : 2), 0, z + 2.8),
        new THREE.Vector3(x, 0, z - 2),
      ];
      group.position.set(x, 0, z);
      const firstPatrolPoint = patrolPoints[index % patrolPoints.length];
      group.lookAt(firstPatrolPoint.x, 0, firstPatrolPoint.z);
      scene.add(group);
      return {
        group, parts, headParts, leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot, rifle, muzzleFlash,
        spawnX: x, spawnZ: z, patrolPoints, patrolIndex: index % patrolPoints.length,
        health: 100, maxHealth: 100, alive: true, mode: "patrol", nextSenseAt: 0, canSeePlayer: false,
        lastSeenAt: 0, lastKnownPlayer: new THREE.Vector3(x, 0, z), nextShotAt: 0, nextCoverAt: 0,
        coverUntil: 0, coverTarget: null, path: [], pathIndex: 0, nextPathAt: 0,
        pathTarget: new THREE.Vector3(Number.POSITIVE_INFINITY, 0, Number.POSITIVE_INFINITY),
        muzzleFlashUntil: 0, recoilUntil: 0, deathStartedAt: 0, deathDirection: index % 2 ? -1 : 1,
        phase: index * 1.31,
        voicePitch: 0.92 + ((index * 7) % STARTING_ENEMIES) * 0.018,
      };
    };

    soldierSpawns.forEach(([x, z], index) => soldiers.push(createSoldier(x, z, index)));
    const combatTargets: THREE.Object3D[] = [
      floor,
      ...worldOccluders,
      ...soldiers.filter((soldier) => soldier.alive).map((soldier) => soldier.group),
    ];
    const setSoldierCombatTarget = (soldier: SoldierState, active: boolean) => {
      const existingIndex = combatTargets.indexOf(soldier.group);
      if (active && existingIndex < 0) combatTargets.push(soldier.group);
      else if (!active && existingIndex >= 0) combatTargets.splice(existingIndex, 1);
    };
    setEnemyCount(STARTING_ENEMIES);
    scoreRef.current = 0;
    setScore(0);
    treasuresFoundRef.current = 0;
    setTreasuresFound(0);
    treasureCorrectAnswersRef.current = 0;
    setTreasureCorrectAnswers(0);
    treasureWrongAnswersRef.current = 0;
    setTreasureWrongAnswers(0);
    treasureQuizScoreRef.current = 0;
    setTreasureQuizScore(0);
    treasureFirstAttemptRef.current = true;
    activeTreasureRef.current = null;
    treasureChests.forEach((chest) => {
      chest.collected = false;
      chest.group.visible = true;
    });
    treasureChestTargets.forEach((target) => {
      if (!worldOccluders.includes(target)) worldOccluders.push(target);
    });
    setWave(1);
    waveRef.current = 1;
    playerHealthRef.current = 100;
    setPlayerHealth(100);
    playerArmorRef.current = 0;
    setPlayerArmor(0);
    ammoRef.current = createInitialAmmo();
    setAmmo(ammoRef.current);
    activeWeaponRef.current = "rifle";
    setActiveWeapon("rifle");

    let yaw = 0;
    let pitch = 0;
    let turnAroundStartYaw = 0;
    let turnAroundStartedAt = 0;
    let verticalVelocity = 0;
    let playerGrounded = true;
    let playerOnTowerLadder = false;
    let frame = 0;
    let lastRenderAt = 0;
    let activeDecorationQuality = qualityRef.current;
    let previousTime = performance.now();
    let elapsed = 0;
    const lastShotAt: Record<WeaponId, number> = { rifle: Number.NEGATIVE_INFINITY, pistol: Number.NEGATIVE_INFINITY };
    let lastFootstepAt = 0;
    let lastCriticalHapticAt = 0;
    let weaponRecoilUntil = 0;
    let muzzleFlashUntil = 0;
    let cameraRecoil = 0;
    let reloadStartedAt = 0;
    let reloadEndsAt = 0;
    let reloading = false;
    let lastDamageAt = 0;
    let lastHealthUiAt = 0;
    let lastHudUiAt = 0;
    let healthWasDamaged = false;
    const raycaster = new THREE.Raycaster();
    raycaster.far = 155;
    const tracers: Array<{ line: THREE.Line | THREE.LineSegments; expiresAt: number; disposeMaterial: boolean }> = [];
    const sightRaycaster = new THREE.Raycaster();
    const voiceOcclusionRaycaster = new THREE.Raycaster();
    const playerLimit = 55;
    const worldCollisionRadius = 0.48;
    const playerOnlyTowerRailColliders: CollisionBox[] = [
      ...towerPlatformRailSpecs.map((rail) => ({
        x: rail.x,
        z: rail.z,
        width: rail.w,
        depth: rail.d,
      })),
    ];
    const playerCollisionObstacles = [...solidObstacles, ...playerOnlyTowerRailColliders];
    const getGroundHeight = (x: number, z: number) => {
      const insideTowerPlatform = (
        Math.abs(x - towerPlatform.x) <= towerPlatform.width / 2
        && Math.abs(z - towerPlatform.z) <= towerPlatform.depth / 2
      );
      return insideTowerPlatform ? towerPlatformTop : 0;
    };
    const maxStepUp = 0.6;
    const movePlayerTo = (nextX: number, nextZ: number) => {
      const collidesWithObstacle = (x: number, z: number) => playerCollisionObstacles.some(({ x: cx, z: cz, width, depth }) => (
        Math.abs(x - cx) < width / 2 + 0.45 && Math.abs(z - cz) < depth / 2 + 0.45
      ));
      const startX = player.position.x;
      const startZ = player.position.z;
      if (collidesWithObstacle(nextX, nextZ)) return;

      const startGround = getGroundHeight(startX, startZ);
      if (getGroundHeight(nextX, nextZ) - startGround <= maxStepUp) {
        player.position.x = nextX;
        player.position.z = nextZ;
        return;
      }

      let low = 0;
      let high = 1;
      for (let iteration = 0; iteration < 12; iteration += 1) {
        const fraction = (low + high) / 2;
        const candidateX = THREE.MathUtils.lerp(startX, nextX, fraction);
        const candidateZ = THREE.MathUtils.lerp(startZ, nextZ, fraction);
        if (
          !collidesWithObstacle(candidateX, candidateZ)
          && getGroundHeight(candidateX, candidateZ) - startGround <= maxStepUp
        ) {
          low = fraction;
        } else {
          high = fraction;
        }
      }
      if (low > 0.001) {
        player.position.x = THREE.MathUtils.lerp(startX, nextX, low);
        player.position.z = THREE.MathUtils.lerp(startZ, nextZ, low);
      }
    };
    const isBlocked = (x: number, z: number, radius = worldCollisionRadius) => solidObstacles.some(({ x: cx, z: cz, width, depth }) => (
      Math.abs(x - cx) < width / 2 + radius && Math.abs(z - cz) < depth / 2 + radius
    ));
    const hasLineOfSight = (origin: THREE.Vector3, target: THREE.Vector3) => {
      const direction = target.clone().sub(origin);
      const distance = direction.length();
      if (distance < 0.5) return true;
      sightRaycaster.set(origin, direction.normalize());
      sightRaycaster.far = distance - 0.35;
      return sightRaycaster.intersectObjects(worldOccluders, false).length === 0;
    };
    const coverCandidates: THREE.Vector3[] = [];
    const coverKeys = new Set<string>();
    solidObstacles.forEach((box) => {
      const points = [
        [box.x - box.width / 2 - 1.2, box.z],
        [box.x + box.width / 2 + 1.2, box.z],
        [box.x, box.z - box.depth / 2 - 1.2],
        [box.x, box.z + box.depth / 2 + 1.2],
      ];
      points.forEach(([x, z]) => {
        if (x < -playerLimit || x > playerLimit || z < -playerLimit || z > playerLimit || isBlocked(x, z)) return;
        const key = `${Math.round(x * 2)}:${Math.round(z * 2)}`;
        if (coverKeys.has(key)) return;
        coverKeys.add(key);
        coverCandidates.push(new THREE.Vector3(x, 0, z));
      });
    });
    const chooseCoverPoint = (soldier: SoldierState, target: THREE.Vector3) => {
      const origin = new THREE.Vector3(0, 1.45, 0);
      const targetEye = target.clone().setY(1.3);
      let best: THREE.Vector3 | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      coverCandidates.forEach((candidate) => {
        const distanceToSoldier = candidate.distanceTo(soldier.group.position);
        const distanceToPlayer = candidate.distanceTo(target);
        if (distanceToSoldier > 28 || distanceToPlayer < 5 || distanceToPlayer > 48) return;
        origin.set(candidate.x, 1.45, candidate.z);
        if (hasLineOfSight(origin, targetEye)) return;
        const score = distanceToSoldier + distanceToPlayer * 0.18;
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      });
      return best;
    };

    const gridStep = 3;
    const gridMin = -54;
    const gridCount = 37;
    const gridTotal = gridCount * gridCount;
    const cellIndex = (column: number, row: number) => row * gridCount + column;
    const cellCoordinates = (index: number) => ({ column: index % gridCount, row: Math.floor(index / gridCount) });
    const worldToCell = (value: number) => THREE.MathUtils.clamp(Math.round((value - gridMin) / gridStep), 0, gridCount - 1);
    const cellToWorld = (value: number) => gridMin + value * gridStep;
    const blockedCell = (column: number, row: number) => isBlocked(cellToWorld(column), cellToWorld(row), 0.62);
    const nearestOpenCell = (column: number, row: number) => {
      if (!blockedCell(column, row)) return { column, row };
      for (let radius = 1; radius <= 4; radius += 1) {
        let closest: { column: number; row: number } | null = null;
        let closestDistance = Number.POSITIVE_INFINITY;
        for (let dz = -radius; dz <= radius; dz += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const candidateX = column + dx;
            const candidateZ = row + dz;
            if (candidateX < 0 || candidateX >= gridCount || candidateZ < 0 || candidateZ >= gridCount) continue;
            if (blockedCell(candidateX, candidateZ)) continue;
            const distance = dx * dx + dz * dz;
            if (distance < closestDistance) {
              closest = { column: candidateX, row: candidateZ };
              closestDistance = distance;
            }
          }
        }
        if (closest) return closest;
      }
      return { column, row };
    };
    const findPath = (startX: number, startZ: number, goalX: number, goalZ: number) => {
      let start = nearestOpenCell(worldToCell(startX), worldToCell(startZ));
      const goal = nearestOpenCell(worldToCell(goalX), worldToCell(goalZ));
      const startIndex = cellIndex(start.column, start.row);
      const goalIndex = cellIndex(goal.column, goal.row);
      if (startIndex === goalIndex) {
        return [new THREE.Vector3(goalX, 0, goalZ)];
      }

      const costs = new Float32Array(gridTotal);
      costs.fill(Number.POSITIVE_INFINITY);
      const parents = new Int32Array(gridTotal);
      parents.fill(-1);
      const closed = new Uint8Array(gridTotal);
      const openFlags = new Uint8Array(gridTotal);
      const open = [startIndex];
      openFlags[startIndex] = 1;
      costs[startIndex] = 0;
      const heuristic = (column: number, row: number) => {
        const { column: goalColumn, row: goalRow } = cellCoordinates(goalIndex);
        const dx = Math.abs(goalColumn - column);
        const dz = Math.abs(goalRow - row);
        return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
      };
      let found = false;
      let examined = 0;
      while (open.length && examined < 520) {
        let bestPosition = 0;
        for (let i = 1; i < open.length; i += 1) {
          const current = cellCoordinates(open[i]);
          const best = cellCoordinates(open[bestPosition]);
          if (costs[open[i]] + heuristic(current.column, current.row) < costs[open[bestPosition]] + heuristic(best.column, best.row)) {
            bestPosition = i;
          }
        }
        const currentIndex = open.splice(bestPosition, 1)[0];
        openFlags[currentIndex] = 0;
        if (currentIndex === goalIndex) {
          found = true;
          break;
        }
        if (closed[currentIndex]) continue;
        closed[currentIndex] = 1;
        examined += 1;
        const current = cellCoordinates(currentIndex);
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dz) continue;
            const column = current.column + dx;
            const row = current.row + dz;
            if (column < 0 || column >= gridCount || row < 0 || row >= gridCount || blockedCell(column, row)) continue;
            if (dx && dz && (blockedCell(current.column + dx, current.row) || blockedCell(current.column, current.row + dz))) continue;
            const nextIndex = cellIndex(column, row);
            if (closed[nextIndex]) continue;
            const cost = costs[currentIndex] + (dx && dz ? Math.SQRT2 : 1);
            if (cost >= costs[nextIndex]) continue;
            costs[nextIndex] = cost;
            parents[nextIndex] = currentIndex;
            if (!openFlags[nextIndex]) {
              open.push(nextIndex);
              openFlags[nextIndex] = 1;
            }
          }
        }
      }
      if (!found) return [new THREE.Vector3(goalX, 0, goalZ)];
      const pathIndices: number[] = [];
      let currentIndex = goalIndex;
      while (currentIndex !== startIndex && currentIndex >= 0) {
        pathIndices.push(currentIndex);
        currentIndex = parents[currentIndex];
      }
      pathIndices.reverse();
      return pathIndices.map((index) => {
        const cell = cellCoordinates(index);
        return new THREE.Vector3(cellToWorld(cell.column), 0, cellToWorld(cell.row));
      });
    };
    const animateSoldierGait = (soldier: SoldierState, walking: boolean, dt: number, now: number) => {
      const blend = 1 - Math.exp(-dt * 12);
      const gait = now * 0.007 + soldier.phase;
      const legSwing = walking ? Math.sin(gait) * 0.3 : 0;
      const armSwing = walking ? Math.sin(gait) * 0.04 : 0;
      const armHold = -0.52;
      soldier.leftLegPivot.rotation.x = THREE.MathUtils.lerp(soldier.leftLegPivot.rotation.x, legSwing, blend);
      soldier.rightLegPivot.rotation.x = THREE.MathUtils.lerp(soldier.rightLegPivot.rotation.x, -legSwing, blend);
      soldier.leftArmPivot.rotation.x = THREE.MathUtils.lerp(soldier.leftArmPivot.rotation.x, armHold + armSwing, blend);
      soldier.rightArmPivot.rotation.x = THREE.MathUtils.lerp(soldier.rightArmPivot.rotation.x, armHold - armSwing, blend);
    };
    const moveSoldier = (soldier: SoldierState, target: THREE.Vector3, speed: number, dt: number, now: number) => {
      const distanceToTarget = Math.hypot(target.x - soldier.group.position.x, target.z - soldier.group.position.z);
      if (distanceToTarget < 0.65) {
        soldier.path = [];
        soldier.pathIndex = 0;
        soldier.pathTarget.copy(target);
        soldier.nextPathAt = now + 650;
        animateSoldierGait(soldier, false, dt, now);
        return false;
      }
      if (now >= soldier.nextPathAt || soldier.pathTarget.distanceToSquared(target) > 9) {
        soldier.path = findPath(soldier.group.position.x, soldier.group.position.z, target.x, target.z);
        soldier.pathIndex = 0;
        soldier.pathTarget.copy(target);
        soldier.nextPathAt = now + 650;
      }
      while (
        soldier.pathIndex < soldier.path.length &&
        Math.hypot(
          soldier.path[soldier.pathIndex].x - soldier.group.position.x,
          soldier.path[soldier.pathIndex].z - soldier.group.position.z,
        ) < 0.8
      ) soldier.pathIndex += 1;
      const waypoint = soldier.path[soldier.pathIndex];
      if (!waypoint) {
        animateSoldierGait(soldier, false, dt, now);
        return false;
      }
      const dx = waypoint.x - soldier.group.position.x;
      const dz = waypoint.z - soldier.group.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.001) {
        animateSoldierGait(soldier, false, dt, now);
        return false;
      }
      const step = Math.min(speed * dt, distance);
      const nextX = soldier.group.position.x + (dx / distance) * step;
      const nextZ = soldier.group.position.z + (dz / distance) * step;
      let moved = false;
      if (!isBlocked(nextX, soldier.group.position.z, 0.55)) {
        soldier.group.position.x = nextX;
        moved = true;
      }
      if (!isBlocked(soldier.group.position.x, nextZ, 0.55)) {
        soldier.group.position.z = nextZ;
        moved = true;
      }
      if (moved) soldier.group.lookAt(waypoint.x, soldier.group.position.y, waypoint.z);
      animateSoldierGait(soldier, moved, dt, now);
      return moved;
    };

    const updateAmmo = (next: AmmoLoadout) => {
      ammoRef.current = next;
      setAmmo(next);
    };
    const addKillFeed = (headshot: boolean) => {
      const id = ++killFeedIdRef.current;
      setKillFeed((current) => [{ id, label: headshot ? "HEADSHOT · PRAJURIT DIHABISI" : "PRAJURIT DIHABISI", headshot }, ...current].slice(0, 3));
      const timeout = window.setTimeout(() => {
        setKillFeed((current) => current.filter((item) => item.id !== id));
        killFeedTimeoutsRef.current = killFeedTimeoutsRef.current.filter((active) => active !== timeout);
      }, 3600);
      killFeedTimeoutsRef.current.push(timeout);
    };
    const setPhase = (next: GamePhase) => {
      gamePhaseRef.current = next;
      setGamePhase(next);
    };
    const addScore = (points: number) => {
      scoreRef.current += points;
      setScore(scoreRef.current);
    };
    type ActiveAudioVoice = { nodes: AudioNode[]; isScream: boolean };
    type PendingAudioSource = { source: AudioScheduledSourceNode; startsAt: number; stopsAt: number };
    const activeAudioVoices = new Set<ActiveAudioVoice>();
    const decodedSoundBuffers = new Map<StrikeSoundBufferKey, AudioBuffer>();
    const soundLoadAbortController = new AbortController();
    let enemyBreathBuffer: AudioBuffer | null = null;
    let gunNoiseBuffer: AudioBuffer | null = null;
    let gunImpulseBuffer: AudioBuffer | null = null;
    let compressor: DynamicsCompressorNode | null = null;
    let reverb: ConvolverNode | null = null;
    let bassShaper: WaveShaperNode | null = null;
    let resumePromise: Promise<void> | null = null;
    let soundLoadPromise: Promise<void> | null = null;
    let unlockBeepPlayed = false;
    let lastAudioWarning = "";
    let lastScreamVariant = -1;
    let lastRecordedScreamKey: StrikeSoundBufferKey | null = null;
    const getStrikeAudioContext = () => {
      const legacyWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
      const Context = window.AudioContext ?? legacyWindow.webkitAudioContext;
      if (!Context) {
        console.warn("Web Audio API tidak tersedia di perangkat ini.");
        return null;
      }
      const existingContext = audioContextRef.current;
      const context = existingContext && existingContext.state !== "closed"
        ? existingContext
        : new Context();
      audioContextRef.current = context;
      if (context !== existingContext) {
        const outputCompressor = context.createDynamicsCompressor();
        outputCompressor.threshold.setValueAtTime(-18, context.currentTime);
        outputCompressor.knee.setValueAtTime(16, context.currentTime);
        outputCompressor.ratio.setValueAtTime(6, context.currentTime);
        outputCompressor.attack.setValueAtTime(0.003, context.currentTime);
        outputCompressor.release.setValueAtTime(0.22, context.currentTime);
        const master = context.createGain();
        master.gain.setValueAtTime(mutedRef.current ? 0 : 0.82, context.currentTime);
        const convolver = context.createConvolver();
        const wetGain = context.createGain();
        wetGain.gain.setValueAtTime(0.9, context.currentTime);
        const shaper = context.createWaveShaper();
        const curve = new Float32Array(256);
        const normalizer = Math.tanh(1.45);
        for (let index = 0; index < curve.length; index += 1) {
          const input = (index * 2) / (curve.length - 1) - 1;
          curve[index] = Math.tanh(input * 1.45) / normalizer;
        }
        shaper.curve = curve;
        shaper.oversample = "2x";
        outputCompressor.connect(master);
        master.connect(context.destination);
        convolver.connect(wetGain);
        wetGain.connect(outputCompressor);
        shaper.connect(outputCompressor);
        masterGainRef.current = master;
        compressor = outputCompressor;
        reverb = convolver;
        bassShaper = shaper;
        const sampleCount = Math.max(1, Math.floor(context.sampleRate * 1.8));
        gunNoiseBuffer = context.createBuffer(1, sampleCount, context.sampleRate);
        const noiseSamples = gunNoiseBuffer.getChannelData(0);
        for (let index = 0; index < noiseSamples.length; index += 1) {
          noiseSamples[index] = Math.random() * 2 - 1;
        }
        const impulseLength = Math.max(1, Math.floor(context.sampleRate * 1.4));
        gunImpulseBuffer = context.createBuffer(2, impulseLength, context.sampleRate);
        for (let channel = 0; channel < gunImpulseBuffer.numberOfChannels; channel += 1) {
          const impulse = gunImpulseBuffer.getChannelData(channel);
          for (let index = 0; index < impulse.length; index += 1) {
            const decay = (1 - index / impulse.length) ** 2.8;
            impulse[index] = (Math.random() * 2 - 1) * decay * 0.72;
          }
        }
        convolver.buffer = gunImpulseBuffer;
        context.onstatechange = () => {
          if (audioContextRef.current !== context) return;
          setAudioState(context.state);
          console.log("audio state", context.state);
          if (context.state === "running") lastAudioWarning = "";
        };
        setAudioState(context.state);
        console.log("audio state", context.state);
      }
      return context;
    };
    const resumeStrikeAudio = async (context: AudioContext) => {
      if (context.state === "running") return true;
      const state = context.state as string;
      if (state === "closed") return false;
      if (lastAudioWarning !== state) {
        console.warn("AudioContext suspended; attempting resume", state);
        lastAudioWarning = state;
      }
      if (!resumePromise) {
        resumePromise = context.resume()
          .then(() => undefined)
          .catch((error: unknown) => {
            console.warn("AudioContext resume gagal:", error);
          })
          .finally(() => {
            resumePromise = null;
          });
      }
      await resumePromise;
      return context.state === "running";
    };
    const loadStrikeSoundFiles = (context: AudioContext) => {
      if (soundLoadPromise) return soundLoadPromise;
      soundLoadPromise = Promise.all(
        (Object.entries(STRIKE_SOUND_FILES) as Array<[StrikeSoundBufferKey, string]>).map(async ([key, filename]) => {
          const soundPath = `${import.meta.env.BASE_URL}sounds/${filename}`;
          try {
            const response = await fetch(soundPath, { signal: soundLoadAbortController.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const encodedAudio = await response.arrayBuffer();
            const decodedAudio = await context.decodeAudioData(encodedAudio);
            decodedSoundBuffers.set(key, decodedAudio);
            console.log("loaded sound buffer", filename);
          } catch (error) {
            if (!soundLoadAbortController.signal.aborted) {
              console.warn(`File suara ${filename} gagal dimuat; memakai suara sintesis.`, error);
            }
          }
        }),
      ).then(() => undefined);
      return soundLoadPromise;
    };
    const updateAudioListener = (context: AudioContext, position: THREE.Vector3, time: number) => {
      const listener = context.listener;
      const listenerQuaternion = camera.getWorldQuaternion(new THREE.Quaternion());
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(listenerQuaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(listenerQuaternion);
      listener.positionX.setValueAtTime(position.x, time);
      listener.positionY.setValueAtTime(position.y, time);
      listener.positionZ.setValueAtTime(position.z, time);
      listener.forwardX.setValueAtTime(forward.x, time);
      listener.forwardY.setValueAtTime(forward.y, time);
      listener.forwardZ.setValueAtTime(forward.z, time);
      listener.upX.setValueAtTime(up.x, time);
      listener.upY.setValueAtTime(up.y, time);
      listener.upZ.setValueAtTime(up.z, time);
    };
    const runWithAudio = (callback: (context: AudioContext) => void, waitForSoundFiles = false) => {
      if (mutedRef.current && !muteWarningLoggedRef.current) {
        console.warn("Suara dimatikan; masterGain berada di 0.");
        muteWarningLoggedRef.current = true;
      }
      let context: AudioContext | null;
      try {
        context = getStrikeAudioContext();
      } catch (error) {
        console.warn("Gagal membuat AudioContext:", error);
        return;
      }
      if (!context) return;
      void resumeStrikeAudio(context).then((ready) => {
        if (!ready || context.state === "closed") return;
        const soundFiles = loadStrikeSoundFiles(context);
        if (waitForSoundFiles) {
          void soundFiles.then(() => {
            if (!soundLoadAbortController.signal.aborted && context.state === "running") callback(context);
          });
        } else {
          callback(context);
        }
      }).catch((error: unknown) => {
        console.warn("Gagal menyiapkan suara:", error);
      });
    };
    const unlockAudio = () => {
      let context: AudioContext | null;
      try {
        context = getStrikeAudioContext();
      } catch (error) {
        console.warn("Gagal mengaktifkan audio:", error);
        return;
      }
      if (!context) return;
      void resumeStrikeAudio(context).then((ready) => {
        if (!ready || unlockBeepPlayed) return;
        unlockBeepPlayed = true;
        void loadStrikeSoundFiles(context);
        const time = context.currentTime;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(440, time);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.035, time + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
        oscillator.connect(gain);
        gain.connect(compressor!);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(time);
        oscillator.stop(time + 0.06);
      }).catch((error: unknown) => {
        console.warn("Audio unlock gagal:", error);
      });
    };
    unlockAudioRef.current = unlockAudio;
    const disconnectAudioNodes = (nodes: AudioNode[]) => {
      nodes.forEach((node) => {
        try {
          node.disconnect();
        } catch (error) {
          console.warn("Gagal melepas node audio:", error);
        }
      });
    };
    const scheduleVoice = (
      sources: PendingAudioSource[],
      nodes: AudioNode[],
      isScream = false,
    ) => {
      const screamCount = [...activeAudioVoices].filter((voice) => voice.isScream).length;
      if (activeAudioVoices.size >= 12 || (isScream && screamCount >= 2)) {
        console.warn(isScream && screamCount >= 2 ? "Batas dua teriakan aktif tercapai." : "Batas 12 voice audio tercapai.");
        disconnectAudioNodes(nodes);
        return false;
      }
      const voice: ActiveAudioVoice = { nodes, isScream };
      activeAudioVoices.add(voice);
      let remaining = sources.length;
      let schedulingFailed = false;
      sources.forEach(({ source, startsAt, stopsAt }) => {
        if (schedulingFailed) return;
        source.onended = () => {
          source.onended = null;
          remaining -= 1;
          if (remaining <= 0) {
            activeAudioVoices.delete(voice);
            disconnectAudioNodes(nodes);
          }
        };
        try {
          source.start(startsAt);
          source.stop(stopsAt);
        } catch (error) {
          schedulingFailed = true;
          console.warn("Gagal menjadwalkan suara:", error);
          activeAudioVoices.delete(voice);
          disconnectAudioNodes(nodes);
        }
      });
      return true;
    };
    const setEnvelope = (gain: GainNode, time: number, peak: number, duration: number, attack = 0.001) => {
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(peak, time + Math.min(attack, duration * 0.3));
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    };
    const createNoiseLayer = (
      context: AudioContext,
      time: number,
      duration: number,
      peak: number,
      filterType: BiquadFilterType,
      frequency: number,
      q: number,
      nodes: AudioNode[],
      sources: PendingAudioSource[],
      wetAmount = 0,
    ) => {
      const source = context.createBufferSource();
      source.buffer = gunNoiseBuffer;
      const filter = context.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(frequency, time);
      filter.Q.setValueAtTime(q, time);
      const gain = context.createGain();
      setEnvelope(gain, time, peak, duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(compressor!);
      nodes.push(source, filter, gain);
      if (wetAmount > 0 && reverb) {
        const send = context.createGain();
        send.gain.setValueAtTime(wetAmount, time);
        gain.connect(send);
        send.connect(reverb);
        nodes.push(send);
      }
      sources.push({ source, startsAt: time, stopsAt: time + duration });
      return gain;
    };
    const createOscillatorLayer = (
      context: AudioContext,
      time: number,
      duration: number,
      peak: number,
      type: OscillatorType,
      startFrequency: number,
      endFrequency: number,
      nodes: AudioNode[],
      sources: PendingAudioSource[],
      useBassShaper = false,
    ) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(startFrequency, time);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
      setEnvelope(gain, time, peak, duration);
      oscillator.connect(gain);
      if (useBassShaper && bassShaper) {
        gain.connect(bassShaper);
      } else {
        gain.connect(compressor!);
      }
      nodes.push(oscillator, gain);
      sources.push({ source: oscillator, startsAt: time, stopsAt: time + duration });
    };
    const playRecordedBuffer = (
      context: AudioContext,
      key: StrikeSoundBufferKey,
      options: {
        gain?: number;
        maxDuration?: number;
        wetAmount?: number;
        position?: THREE.Vector3;
        lowpassFrequency?: number;
        distanceGain?: number;
        isScream?: boolean;
      } = {},
    ) => {
      const buffer = decodedSoundBuffers.get(key);
      if (!buffer) return false;
      const time = context.currentTime;
      const playbackRate = 0.95 + Math.random() * 0.1;
      const duration = Math.min(buffer.duration / playbackRate, options.maxDuration ?? buffer.duration / playbackRate);
      if (!Number.isFinite(duration) || duration <= 0.02) {
        console.warn(`File suara ${STRIKE_SOUND_FILES[key]} memiliki durasi tidak valid.`);
        return false;
      }
      const peak = (options.gain ?? 0.76) * (0.94 + Math.random() * 0.12) * (options.distanceGain ?? 1);
      if (!Number.isFinite(peak) || peak <= 0) {
        console.warn(`Gain file suara ${STRIKE_SOUND_FILES[key]} tidak valid.`);
        return false;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(playbackRate, time);
      const gain = context.createGain();
      const attack = Math.min(0.004, duration * 0.2);
      const release = Math.max(time + attack, time + duration - 0.04);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(peak, time + attack);
      gain.gain.setValueAtTime(peak, release);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      source.connect(gain);
      const nodes: AudioNode[] = [source, gain];
      let output: AudioNode = gain;
      if (options.lowpassFrequency) {
        const lowpass = context.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.setValueAtTime(options.lowpassFrequency, time);
        lowpass.Q.value = 0.7;
        output.connect(lowpass);
        nodes.push(lowpass);
        output = lowpass;
      }
      if (options.position) {
        updateAudioListener(context, camera.getWorldPosition(new THREE.Vector3()), time);
        const panner = context.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 5;
        panner.maxDistance = 80;
        panner.rolloffFactor = 0.5;
        panner.positionX.setValueAtTime(options.position.x, time);
        panner.positionY.setValueAtTime(options.position.y, time);
        panner.positionZ.setValueAtTime(options.position.z, time);
        output.connect(panner);
        panner.connect(compressor!);
        nodes.push(panner);
      } else {
        output.connect(compressor!);
      }
      if (options.wetAmount && reverb) {
        const send = context.createGain();
        send.gain.setValueAtTime(options.wetAmount, time);
        gain.connect(send);
        send.connect(reverb);
        nodes.push(send);
      }
      scheduleVoice(
        [{ source, startsAt: time, stopsAt: time + duration }],
        nodes,
        options.isScream ?? false,
      );
      return true;
    };
    const playWeaponShot = (context: AudioContext, weapon: WeaponId) => {
      const recorded = playRecordedBuffer(context, "pistolShot", {
        gain: 0.82,
        wetAmount: 0.14,
        maxDuration: 1.5,
      });
      if (recorded) return;
      const time = context.currentTime;
      const jitter = 1 + (Math.random() * 2 - 1) * 0.07;
      const nodes: AudioNode[] = [];
      const sources: PendingAudioSource[] = [];
      if (weapon === "rifle") {
        createNoiseLayer(context, time, 0.06, 0.8 * jitter, "highpass", 220, 0.7, nodes, sources, 0.3);
        createNoiseLayer(context, time, 0.02, 0.46 * jitter, "bandpass", 3650 + Math.random() * 800, 0.8, nodes, sources, 0.3);
        createOscillatorLayer(context, time, 0.18, 0.34 * jitter, "sine", 170, 55, nodes, sources, true);
        createOscillatorLayer(context, time, 0.18, 0.2 * jitter, "triangle", 90, 40, nodes, sources, true);
        createNoiseLayer(context, time + 0.03, 0.008, 0.12 * jitter, "highpass", 2700, 1.2, nodes, sources, 0.12);
      } else {
        createNoiseLayer(context, time, 0.033, 0.67 * jitter, "highpass", 380, 0.8, nodes, sources, 0.18);
        createNoiseLayer(context, time, 0.018, 0.5 * jitter, "bandpass", 4300 + Math.random() * 400, 0.9, nodes, sources, 0.18);
        createOscillatorLayer(context, time, 0.1, 0.3 * jitter, "sine", 200, 80, nodes, sources);
        createNoiseLayer(context, time + 0.026, 0.007, 0.13 * jitter, "highpass", 3200, 1.2, nodes, sources, 0.08);
      }
      scheduleVoice(sources, nodes);
    };
    const playEnemyShot = (soldier: SoldierState, distance: number) => {
      runWithAudio((context) => {
        const time = context.currentTime;
        const position = soldier.muzzleFlash.getWorldPosition(new THREE.Vector3());
        const distantGain = Math.max(0.12, 1 - distance / 78);
        const distantCutoff = Math.max(850, 4600 - distance * 66);
        if (playRecordedBuffer(context, "rifleShot", {
          gain: 0.38,
          maxDuration: 1.05,
          position,
          lowpassFrequency: distantCutoff,
          distanceGain: distantGain,
        })) return;
        const listenerPosition = camera.getWorldPosition(new THREE.Vector3());
        updateAudioListener(context, listenerPosition, time);
        const nodes: AudioNode[] = [];
        const sources: PendingAudioSource[] = [];
        const source = context.createBufferSource();
        source.buffer = gunNoiseBuffer;
        const lowpass = context.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.setValueAtTime(Math.max(850, 4600 - distance * 66), time);
        const bandpass = context.createBiquadFilter();
        bandpass.type = "bandpass";
        bandpass.frequency.setValueAtTime(Math.max(700, 2700 - distance * 24), time);
        bandpass.Q.value = 0.8;
        const gain = context.createGain();
        const distanceGain = Math.max(0.12, 1 - distance / 78) * 0.34;
        setEnvelope(gain, time, distanceGain, 0.075);
        const panner = context.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 5;
        panner.maxDistance = 80;
        panner.rolloffFactor = 0.6;
        panner.positionX.setValueAtTime(position.x, time);
        panner.positionY.setValueAtTime(position.y, time);
        panner.positionZ.setValueAtTime(position.z, time);
        source.connect(lowpass);
        lowpass.connect(bandpass);
        bandpass.connect(gain);
        gain.connect(panner);
        panner.connect(compressor!);
        nodes.push(source, lowpass, bandpass, gain, panner);
        sources.push({ source, startsAt: time, stopsAt: time + 0.075 });
        scheduleVoice(sources, nodes);
      });
    };
    const playImpact = (surface: ImpactSurface) => {
      runWithAudio((context) => {
        const time = context.currentTime;
        const nodes: AudioNode[] = [];
        const sources: PendingAudioSource[] = [];
        const profile = surface === "metal"
          ? { duration: 0.045, peak: 0.28, filter: "bandpass" as const, frequency: 2350, q: 2.4 }
          : surface === "ground"
            ? { duration: 0.055, peak: 0.2, filter: "lowpass" as const, frequency: 850, q: 0.8 }
            : { duration: 0.05, peak: 0.23, filter: "bandpass" as const, frequency: 1450, q: 1.1 };
        createNoiseLayer(
          context, time, profile.duration, profile.peak, profile.filter, profile.frequency, profile.q, nodes, sources,
          surface === "metal" ? 0.08 : 0.025,
        );
        if (surface !== "ground") {
          createOscillatorLayer(context, time, 0.04, 0.09, "triangle", surface === "metal" ? 950 : 520, 180, nodes, sources);
        }
        scheduleVoice(sources, nodes);
      });
    };
    const playEnemyVoice = (soldier: SoldierState, kind: EnemyVoiceKind) => {
      if (!enemyScreamsEnabledRef.current) {
        if (kind === "scream") console.warn("Teriakan musuh dimatikan di pengaturan.");
        return;
      }
      runWithAudio((context) => {
        const isScream = kind === "scream";
        const time = context.currentTime;
        const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
        const sourcePosition = soldier.group.getWorldPosition(new THREE.Vector3());
        sourcePosition.y += 1.18;
        const towardSource = sourcePosition.clone().sub(cameraPosition);
        const distance = towardSource.length();
        let occluded = false;
        if (distance > 0.35) {
          voiceOcclusionRaycaster.set(cameraPosition, towardSource.normalize());
          voiceOcclusionRaycaster.far = distance - 0.3;
          occluded = voiceOcclusionRaycaster.intersectObjects(worldOccluders, false).length > 0;
        }
        const distanceGain = Math.max(0.24, 1 - distance / 80) * (occluded ? 0.45 : 1);
        if (isScream) {
          const recordedScreams: StrikeSoundBufferKey[] = [
            "headshotScream1", "headshotScream2", "headshotScream3",
          ].filter((key) => decodedSoundBuffers.has(key));
          if (recordedScreams.length > 0) {
            let recordedKey = recordedScreams[Math.floor(Math.random() * recordedScreams.length)];
            if (recordedScreams.length > 1 && recordedKey === lastRecordedScreamKey) {
              const previousIndex = recordedScreams.indexOf(recordedKey);
              recordedKey = recordedScreams[
                (previousIndex + 1 + Math.floor(Math.random() * (recordedScreams.length - 1)))
                % recordedScreams.length
              ];
            }
            if (playRecordedBuffer(context, recordedKey, {
              gain: 0.52,
              maxDuration: 0.8,
              position: sourcePosition,
              lowpassFrequency: Math.max(700, (7800 - distance * 118) * (occluded ? 0.42 : 1)),
              distanceGain,
              isScream: true,
            })) {
              lastRecordedScreamKey = recordedKey;
              console.log("play headshot scream", STRIKE_SOUND_FILES[recordedKey]);
              return;
            }
          }
        } else if (kind === "death" && playRecordedBuffer(context, "enemyDeath", {
          gain: 0.42,
          maxDuration: 0.8,
          position: sourcePosition,
          lowpassFrequency: Math.max(700, (7800 - distance * 118) * (occluded ? 0.42 : 1)),
          distanceGain,
        })) {
          return;
        }
        updateAudioListener(context, cameraPosition, time);
        let variant: EnemyScreamVariant | undefined;
        let variantIndex = -1;
        if (isScream) {
          variantIndex = Math.floor(Math.random() * ENEMY_SCREAM_VARIANTS.length);
          if (variantIndex === lastScreamVariant) {
            variantIndex = (variantIndex + 1 + Math.floor(Math.random() * (ENEMY_SCREAM_VARIANTS.length - 1)))
              % ENEMY_SCREAM_VARIANTS.length;
          }
          lastScreamVariant = variantIndex;
          variant = ENEMY_SCREAM_VARIANTS[variantIndex];
          console.log("play headshot scream", variantIndex);
        }
        const jitter = 0.92 + Math.random() * 0.16;
        const duration = isScream
          ? (variant?.duration ?? 0.4) * jitter
          : kind === "death" ? 0.25 : 0.1;
        const pitch = isScream
          ? THREE.MathUtils.clamp((variant?.pitch ?? 210) * soldier.voicePitch * jitter, 180, 260)
          : THREE.MathUtils.clamp((kind === "death" ? 218 : 224) * soldier.voicePitch, 180, 260);
        const formants = isScream
          ? (variant?.formants ?? [700, 1200, 2600])
          : kind === "death" ? [540, 980, 2050] : [430, 820, 1700];
        const oscillator = context.createOscillator();
        oscillator.type = "sawtooth";
        const voiceGain = context.createGain();
        const lowpass = context.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.setValueAtTime(Math.max(700, (7800 - distance * 118) * (occluded ? 0.42 : 1)), time);
        lowpass.Q.value = 0.65;
        const panner = context.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 5;
        panner.maxDistance = 80;
        panner.rolloffFactor = 0.5;
        panner.positionX.setValueAtTime(sourcePosition.x, time);
        panner.positionY.setValueAtTime(sourcePosition.y, time);
        panner.positionZ.setValueAtTime(sourcePosition.z, time);
        const formantFilters = formants.map((center, index) => {
          const filter = context.createBiquadFilter();
          filter.type = "bandpass";
          filter.Q.value = isScream ? 3.7 + index * 0.35 : 2.6;
          const shifted = center * (0.92 + Math.random() * 0.16);
          filter.frequency.setValueAtTime(shifted * 0.96, time);
          filter.frequency.linearRampToValueAtTime(shifted * 1.04, time + duration * 0.42);
          filter.frequency.linearRampToValueAtTime(shifted * 0.98, time + duration * 0.9);
          oscillator.connect(filter);
          filter.connect(voiceGain);
          return filter;
        });
        voiceGain.connect(lowpass);
        lowpass.connect(panner);
        panner.connect(compressor!);
        const nodes: AudioNode[] = [oscillator, voiceGain, lowpass, panner, ...formantFilters];
        const sources: PendingAudioSource[] = [{ source: oscillator, startsAt: time, stopsAt: time + duration }];
        if (isScream) {
          if (!enemyBreathBuffer) {
            const sampleCount = Math.max(1, Math.floor(context.sampleRate * 0.55));
            enemyBreathBuffer = context.createBuffer(1, sampleCount, context.sampleRate);
            const samples = enemyBreathBuffer.getChannelData(0);
            for (let index = 0; index < samples.length; index += 1) {
              samples[index] = (Math.random() * 2 - 1) * 0.65;
            }
          }
          const breath = context.createBufferSource();
          breath.buffer = enemyBreathBuffer;
          const breathFilter = context.createBiquadFilter();
          breathFilter.type = "bandpass";
          breathFilter.frequency.setValueAtTime(1750, time);
          breathFilter.frequency.linearRampToValueAtTime(2550, time + duration * 0.48);
          breathFilter.Q.value = 0.8;
          const breathGain = context.createGain();
          setEnvelope(breathGain, time, 0.085, duration * 0.88, 0.015);
          breath.connect(breathFilter);
          breathFilter.connect(breathGain);
          breathGain.connect(voiceGain);
          nodes.push(breath, breathFilter, breathGain);
          sources.push({ source: breath, startsAt: time, stopsAt: time + duration });
          const vibrato = context.createOscillator();
          vibrato.type = "sine";
          vibrato.frequency.value = 6;
          const vibratoDepth = context.createGain();
          vibratoDepth.gain.value = Math.min(5, pitch * 0.018);
          vibrato.connect(vibratoDepth);
          vibratoDepth.connect(oscillator.frequency);
          nodes.push(vibrato, vibratoDepth);
          sources.push({ source: vibrato, startsAt: time, stopsAt: time + duration });
        }
        const peak = (isScream ? 0.42 : kind === "death" ? 0.2 : 0.12) * distanceGain;
        setEnvelope(voiceGain, time, peak, duration, isScream ? 0.015 : 0.008);
        if (isScream) {
          oscillator.frequency.setValueAtTime(Math.max(180, pitch * 0.9), time);
          oscillator.frequency.linearRampToValueAtTime(Math.min(260, pitch * 1.1), time + duration * 0.2);
          oscillator.frequency.exponentialRampToValueAtTime(Math.max(180, pitch * 0.74), time + duration);
        } else {
          oscillator.frequency.setValueAtTime(pitch, time);
          oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(90, pitch * (kind === "death" ? 0.58 : 0.62)),
            time + duration,
          );
        }
        scheduleVoice(sources, nodes, isScream);
      });
    };
    const playSound = (cue: SoundCue) => {
      if (cue === "rifle" || cue === "pistol") {
        console.log("play shot", cue);
        runWithAudio((context) => playWeaponShot(context, cue));
        return;
      }
      runWithAudio((context) => {
        if (cue === "headshot" && playRecordedBuffer(context, "headshotHit", {
          gain: 0.88,
          wetAmount: 0.05,
        })) return;
        if (cue === "reload" && playRecordedBuffer(context, "reload", {
          gain: 0.72,
          maxDuration: 0.9,
          wetAmount: 0.08,
        })) return;
        const time = context.currentTime;
        const settings: Record<Exclude<SoundCue, "rifle" | "pistol">, [number, number, number, OscillatorType]> = {
          hit: [860, 0.055, 0.16, "triangle"],
          headshot: [1080, 0.18, 0.13, "sine"],
          enemy: [130, 0.08, 0.06, "sawtooth"],
          wave: [330, 0.2, 0.06, "sine"],
          correct: [720, 0.16, 0.065, "sine"],
          wrong: [145, 0.17, 0.045, "triangle"],
          gameover: [105, 0.48, 0.065, "sawtooth"],
          reload: [1800, 0.72, 0.16, "square"],
          empty: [1150, 0.018, 0.08, "square"],
          step: [105, 0.06, 0.045, "triangle"],
        };
        const [frequency, duration, volume, type] = settings[cue];
        const nodes: AudioNode[] = [];
        const sources: PendingAudioSource[] = [];
        if (cue === "reload") {
          [0, 0.28, 0.56].forEach((offset, index) => {
            createNoiseLayer(context, time + offset, index === 1 ? 0.012 : 0.009, 0.18, "highpass", 1700 + index * 550, 1.4, nodes, sources, 0.04);
          });
        } else if (cue === "step") {
          createNoiseLayer(context, time, 0.045, 0.05, "lowpass", 420, 0.7, nodes, sources);
          createOscillatorLayer(context, time, 0.06, volume, type, frequency, 55, nodes, sources);
        } else if (cue === "empty") {
          createNoiseLayer(context, time, duration, volume, "highpass", 2400, 1.2, nodes, sources);
        } else {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = type;
          oscillator.frequency.setValueAtTime(frequency, time);
          oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.48), time + duration);
          setEnvelope(gain, time, volume, duration, 0.012);
          oscillator.connect(gain);
          gain.connect(compressor!);
          nodes.push(oscillator, gain);
          sources.push({ source: oscillator, startsAt: time, stopsAt: time + duration });
        }
        scheduleVoice(sources, nodes);
      }, cue === "headshot");
    };
    soundRef.current = playSound;
    const hapticTimeouts: number[] = [];
    let lastWeaponHapticAt = 0;
    const hasTouchHaptics = () => (
      mobileRef.current
      && (navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches)
    );
    const playHapticImpact = async (style: ImpactStyle, fallback: number | number[]) => {
      try {
        await Haptics.impact({ style });
      } catch (error) {
        console.warn("Haptics native tidak tersedia; mencoba getar browser:", error);
        try {
          if (typeof navigator.vibrate === "function") navigator.vibrate(fallback);
        } catch (vibrationError) {
          console.warn("Getar browser tidak tersedia:", vibrationError);
        }
      }
    };
    const scheduleHaptic = (delay: number, callback: () => void) => {
      const timeout = window.setTimeout(() => {
        hapticTimeouts.splice(hapticTimeouts.indexOf(timeout), 1);
        if (gamePhaseRef.current === "combat" && hapticsEnabledRef.current && hasTouchHaptics()) callback();
      }, delay);
      hapticTimeouts.push(timeout);
    };
    const haptic = (kind: "rifle" | "pistol" | "reload" | "damage" | "kill" | "critical") => {
      if (!hapticsEnabledRef.current || gamePhaseRef.current !== "combat" || !hasTouchHaptics()) return;
      const now = performance.now();
      if (kind === "rifle" || kind === "pistol") {
        if (now - lastWeaponHapticAt < 83) return;
        lastWeaponHapticAt = now;
      }
      if (kind === "rifle") void playHapticImpact(ImpactStyle.Light, 17);
      else if (kind === "pistol") void playHapticImpact(ImpactStyle.Medium, 25);
      else if (kind === "damage") void playHapticImpact(ImpactStyle.Medium, 70);
      else if (kind === "kill") void playHapticImpact(ImpactStyle.Light, 30);
      else if (kind === "reload") {
        void playHapticImpact(ImpactStyle.Light, 12);
        scheduleHaptic(145, () => { void playHapticImpact(ImpactStyle.Light, 12); });
      } else {
        void playHapticImpact(ImpactStyle.Light, [12, 120, 12]);
        scheduleHaptic(170, () => { void playHapticImpact(ImpactStyle.Light, 12); });
      }
    };
    const pauseGame = () => {
      if (gamePhaseRef.current !== "combat") return;
      document.exitPointerLock?.();
      firingRef.current = false;
      firePointers.current.clear();
      sprintingRef.current = false;
      sprintPointers.current.clear();
      moveInput.current = { x: 0, y: 0 };
      lookDelta.current = { x: 0, y: 0 };
      keys.current = {};
      joystickPointer.current = null;
      lookPointers.current.clear();
      rightLookPointer.current = null;
      rightLookInput.current = { x: 0, y: 0 };
      setRightLookStick(null);
      turnAroundPointer.current = null;
      turnAroundRequested.current = false;
      turnAroundAnimating.current = false;
      setJoystick({ x: 0, y: 0 });
      setSprinting(false);
      aimingRef.current = false;
      setAiming(false);
      setMobileSprintHeld(false);
      setPhase("paused");
      if (audioContextRef.current?.state === "running") {
        void audioContextRef.current.suspend().catch((error: unknown) => {
          console.warn("AudioContext tidak dapat dijeda:", error);
        });
      }
    };
    const resumeGame = () => {
      if (gamePhaseRef.current !== "paused") return;
      setPhase("combat");
      const context = audioContextRef.current;
      if (context) void resumeStrikeAudio(context);
    };
    pauseGameRef.current = pauseGame;
    resumeGameRef.current = resumeGame;
    const persistBestScore = (finalScore: number) => {
      let previousBest = 0;
      try {
        const saved = Number(window.localStorage.getItem(BEST_SCORE_KEY));
        if (Number.isFinite(saved) && saved > 0) previousBest = saved;
        const nextBest = Math.max(previousBest, finalScore);
        window.localStorage.setItem(BEST_SCORE_KEY, String(nextBest));
        previousBest = nextBest;
      } catch {
        previousBest = Math.max(previousBest, finalScore);
      }
      setBestScore(previousBest);
    };
    const finishGame = (missionComplete = false) => {
      if (gamePhaseRef.current === "gameover" || gamePhaseRef.current === "complete") return;
      document.exitPointerLock?.();
      firingRef.current = false;
      sprintingRef.current = false;
      aimingRef.current = false;
      moveInput.current = { x: 0, y: 0 };
      lookDelta.current = { x: 0, y: 0 };
      keys.current = {};
      joystickPointer.current = null;
      lookPointers.current.clear();
      rightLookPointer.current = null;
      rightLookInput.current = { x: 0, y: 0 };
      setRightLookStick(null);
      firePointers.current.clear();
      sprintPointers.current.clear();
      turnAroundPointer.current = null;
      turnAroundRequested.current = false;
      turnAroundAnimating.current = false;
      setSprinting(false);
      setAiming(false);
      setMobileSprintHeld(false);
      reloading = false;
      reloadingRef.current = false;
      setIsReloading(false);
      setPhase(missionComplete ? "complete" : "gameover");
      persistBestScore(scoreRef.current);
      playSound("gameover");
    };
    const startReload = () => {
      if (gamePhaseRef.current !== "combat" || reloading || reloadingRef.current) return;
      const selected = activeWeaponRef.current;
      const config = WEAPON_CONFIG[selected];
      const currentAmmo = ammoRef.current[selected];
      if (currentAmmo.magazine >= config.magazineSize || currentAmmo.reserve <= 0) return;
      reloading = true;
      reloadingRef.current = true;
      reloadStartedAt = performance.now();
      reloadEndsAt = reloadStartedAt + config.reloadDuration;
      setIsReloading(true);
      firingRef.current = false;
      playSound("reload");
      haptic("reload");
    };
    const swapWeapon = () => {
      if (gamePhaseRef.current !== "combat") return;
      if (reloading) {
        reloading = false;
        reloadingRef.current = false;
        setIsReloading(false);
      }
      firingRef.current = false;
      const next: WeaponId = activeWeaponRef.current === "rifle" ? "pistol" : "rifle";
      activeWeaponRef.current = next;
      setActiveWeapon(next);
      rifleView.visible = next === "rifle";
      pistolView.visible = next === "pistol";
      aimingRef.current = false;
      setAiming(false);
    };
    const spawnWallSparks = (point: THREE.Vector3, normal: THREE.Vector3, now: number) => {
      const reference = Math.abs(normal.y) < 0.85 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const tangentA = new THREE.Vector3().crossVectors(normal, reference).normalize();
      const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();
      const vertices: number[] = [];
      for (let index = 0; index < 5; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const direction = normal.clone().multiplyScalar(0.65)
          .addScaledVector(tangentA, Math.cos(angle))
          .addScaledVector(tangentB, Math.sin(angle))
          .normalize();
        const start = point.clone().addScaledVector(normal, 0.012);
        const end = start.clone().addScaledVector(direction, 0.1 + Math.random() * 0.16);
        vertices.push(start.x, start.y, start.z, end.x, end.y, end.z);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      const spark = new THREE.LineSegments(geometry, sparkMat);
      spark.frustumCulled = false;
      scene.add(spark);
      tracers.push({ line: spark, expiresAt: now + 115, disposeMaterial: false });
    };
    const fire = () => {
      const now = performance.now();
      if (gamePhaseRef.current !== "combat" || reloading || now - lastShotAt[activeWeaponRef.current] < WEAPON_CONFIG[activeWeaponRef.current].fireInterval) return;
      const selected = activeWeaponRef.current;
      const config = WEAPON_CONFIG[selected];
      const currentAmmo = ammoRef.current[selected];
      if (currentAmmo.magazine <= 0) {
        playSound("empty");
        startReload();
        return;
      }
      lastShotAt[selected] = now;
      updateAmmo({
        ...ammoRef.current,
        [selected]: { ...currentAmmo, magazine: currentAmmo.magazine - 1 },
      });
      playSound(selected);
      haptic(selected);
      soldiers.forEach((soldier) => {
        if (!soldier.alive || soldier.mode !== "patrol") return;
        const distanceToShot = Math.hypot(
          soldier.group.position.x - player.position.x,
          soldier.group.position.z - player.position.z,
        );
        if (distanceToShot > GUNFIRE_ALERT_RADIUS) return;
        soldier.lastKnownPlayer.set(player.position.x, 0, player.position.z);
        soldier.lastSeenAt = now;
        soldier.mode = "chase";
        soldier.nextPathAt = 0;
      });

      const moving = Math.hypot(
        moveInput.current.x + ((keys.current.KeyD || keys.current.ArrowRight ? 1 : 0) - (keys.current.KeyA || keys.current.ArrowLeft ? 1 : 0)),
        moveInput.current.y + ((keys.current.KeyW || keys.current.ArrowUp ? 1 : 0) - (keys.current.KeyS || keys.current.ArrowDown ? 1 : 0)),
      ) > 0.1;
      const sprintingNow = sprintingRef.current || keys.current.ShiftLeft || keys.current.ShiftRight;
      const spreadScale = aimingRef.current ? 0.52 : sprintingNow ? 2.25 : moving ? 1.38 : 1;
      const spread = config.baseSpread * spreadScale * Math.sqrt(Math.random());
      const spreadAngle = Math.random() * Math.PI * 2;
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      raycaster.setFromCamera(new THREE.Vector2(
        Math.cos(spreadAngle) * spread * camera.aspect,
        Math.sin(spreadAngle) * spread,
      ), camera);
      const intersections = raycaster.intersectObjects(combatTargets, true);
      const firstHit = intersections[0];
      const hitSoldier = firstHit && soldiers.find((soldier) => (
        soldier.alive && soldier.parts.includes(firstHit.object as THREE.Mesh)
      ));
      const headshot = Boolean(hitSoldier && firstHit && hitSoldier.headParts.includes(firstHit.object as THREE.Mesh));
      const flash = selected === "rifle" ? rifleFlash : pistolFlash;
      const origin = flash.getWorldPosition(new THREE.Vector3());
      const endpoint = firstHit?.point ?? origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(34));
      const tracerGeometry = new THREE.BufferGeometry().setFromPoints([origin, endpoint]);
      const tracerMaterial = new THREE.LineBasicMaterial({
        color: hitSoldier ? (headshot ? "#ffd087" : "#ff7587") : "#6cf6ff",
        transparent: true,
        opacity: 0.92,
      });
      const tracer = new THREE.Line(tracerGeometry, tracerMaterial);
      scene.add(tracer);
      tracers.push({ line: tracer, expiresAt: now + 105, disposeMaterial: true });
      weaponRecoilUntil = now + 130;
      muzzleFlashUntil = now + 72;
      flash.visible = true;
      cameraRecoil = Math.min(0.13, cameraRecoil + (selected === "rifle" ? 0.012 : 0.021) * (aimingRef.current ? 1.18 : 1));

      if (firstHit && !hitSoldier) {
        const hitMesh = firstHit.object as THREE.Mesh;
        const material = hitMesh.material;
        const hitMaterials = Array.isArray(material) ? material : [material];
        const materialName = hitMaterials
          .map((entry) => entry.name.toLowerCase())
          .join(" ");
        const metalSurface = hitMaterials.some((entry) => (
          entry === steelDetailMat || entry === crateMetalMat || entry === vehicleMat || entry === towerMat
        )) || materialName.includes("steel") || materialName.includes("metal");
        const surface: ImpactSurface = firstHit.object === floor
          ? "ground"
          : metalSurface ? "metal" : "wall";
        playImpact(surface);
      }
      if (firstHit && worldOccluders.includes(firstHit.object)) {
        const normal = firstHit.face?.normal.clone().transformDirection(firstHit.object.matrixWorld) ?? new THREE.Vector3(0, 1, 0);
        spawnWallSparks(firstHit.point, normal, now);
      }
      if (hitSoldier) {
        const damage = Math.min(hitSoldier.health, headshot ? config.headDamage : config.bodyDamage);
        hitSoldier.health = Math.max(0, hitSoldier.health - damage);
        const eliminated = hitSoldier.health === 0;
        if (eliminated) {
          hitSoldier.alive = false;
          setSoldierCombatTarget(hitSoldier, false);
          hitSoldier.mode = "dead";
          hitSoldier.deathStartedAt = now;
          hitSoldier.muzzleFlash.visible = false;
          setEnemyCount((current) => Math.max(0, current - 1));
          addKillFeed(headshot);
        }
        addScore((headshot ? 120 : 30) + (eliminated ? 100 : 0));
        playSound(headshot ? "headshot" : "hit");
        playEnemyVoice(hitSoldier, headshot ? "scream" : eliminated ? "death" : "hurt");
        if (eliminated || headshot) haptic("kill");
        hitFeedbackIdRef.current += 1;
        setHitFeedback({ id: hitFeedbackIdRef.current, damage, headshot, eliminated });
        if (hitFeedbackTimeoutRef.current !== null) window.clearTimeout(hitFeedbackTimeoutRef.current);
        hitFeedbackTimeoutRef.current = window.setTimeout(() => setHitFeedback(null), 720);
      }
    };
    const reload = () => startReload();
    fireRef.current = fire;
    swapWeaponRef.current = swapWeapon;
    reloadWeaponRef.current = reload;
    let resizeFrame = 0;
    const onResize = () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        const bounds = host.getBoundingClientRect();
        const width = Math.round(bounds.width);
        const height = Math.round(bounds.height);
        if (!width || !height) return;
        renderer.getSize(rendererSize);
        const sizeChanged = rendererSize.x !== width || rendererSize.y !== height;
        const nextFov = window.matchMedia("(orientation: landscape)").matches ? 84 : 72;
        const fovChanged = baseCameraFov !== nextFov;
        const nextPixelRatio = getQualityPixelRatio(qualityRef.current);
        const pixelRatioChanged = renderer.getPixelRatio() !== nextPixelRatio;
        // Mobile browsers can report the old canvas buffer for one frame after rotation.
        // Always resync the drawing buffer and projection on orientation/viewport changes.
        baseCameraFov = nextFov;
        if (sizeChanged || fovChanged) camera.aspect = width / height;
        if (!aimingRef.current) camera.fov = baseCameraFov;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(nextPixelRatio);
    // Match NUMATIK WORLD: update both the WebGL buffer and canvas CSS size after rotation.
    renderer.setSize(width, height);
  });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      keys.current[event.code] = true;
      if (event.code === "KeyP" && !event.repeat) {
        if (gamePhaseRef.current === "combat") pauseGame();
        else if (gamePhaseRef.current === "paused") resumeGame();
        return;
      }
      if (gamePhaseRef.current !== "combat") return;
      if (event.code === "Space") {
        event.preventDefault();
        jumpRequested.current = true;
      }
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        sprintingRef.current = true;
        setSprinting(true);
        aimingRef.current = false;
        setAiming(false);
      }
      if (event.code === "KeyQ" && !event.repeat) swapWeapon();
      if (event.code === "KeyR" && !event.repeat) startReload();
      if (event.code === "KeyF" && !event.repeat) fire();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.current[event.code] = false;
      if ((event.code === "ShiftLeft" || event.code === "ShiftRight") && !keys.current.ShiftLeft && !keys.current.ShiftRight) {
        sprintingRef.current = false;
        setSprinting(false);
      }
    };
    const onLockChange = () => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      setLocked(isLocked);
      if (!isLocked) {
        firingRef.current = false;
        aimingRef.current = false;
        setAiming(false);
      }
    };
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw -= event.movementX * 0.0022;
      pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0022, -1.25, 1.25);
    };
    const onCanvasClick = () => {
      if (gamePhaseRef.current === "combat" && !mobileRef.current && renderer.domElement.requestPointerLock) {
        renderer.domElement.requestPointerLock();
      }
    };
    const onCanvasMouseDown = (event: MouseEvent) => {
      if (gamePhaseRef.current !== "combat") return;
      if (event.button === 0) {
        firingRef.current = true;
        fire();
      }
      if (event.button === 2) {
        event.preventDefault();
        aimingRef.current = true;
        setAiming(true);
      }
    };
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 0) firingRef.current = false;
      if (event.button === 2) {
        aimingRef.current = false;
        setAiming(false);
      }
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    const onWindowBlur = () => {
      keys.current = {};
      firingRef.current = false;
      sprintingRef.current = false;
      lookPointers.current.clear();
      rightLookPointer.current = null;
      rightLookInput.current = { x: 0, y: 0 };
      setSprinting(false);
      setMobileSprintHeld(false);
      aimingRef.current = false;
      setAiming(false);
      setRightLookStick(null);
      if (gamePhaseRef.current === "combat") pauseGame();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(host);
    onResize();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onWindowBlur);
      document.addEventListener("pointerdown", unlockAudio, true);
      document.addEventListener("touchstart", unlockAudio, true);
      document.addEventListener("click", unlockAudio, true);
    renderer.domElement.addEventListener("click", onCanvasClick);
    renderer.domElement.addEventListener("mousedown", onCanvasMouseDown);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);

    const shootSoldier = (soldier: SoldierState, now: number, target: THREE.Vector3) => {
      if (gamePhaseRef.current !== "combat") return;
      const accuracy = Math.min(0.82, 0.32 + (waveRef.current - 1) * 0.055);
      const hitsPlayer = Math.random() < accuracy;
      const impact = target.clone();
      const missRadius = Math.max(0.8, soldier.group.position.distanceTo(target) * (1 - accuracy) * 0.12);
      if (!hitsPlayer) {
        impact.x += (Math.random() - 0.5) * missRadius * 2;
        impact.y += (Math.random() - 0.5) * missRadius;
      }
      soldier.group.updateMatrixWorld(true);
      const origin = soldier.muzzleFlash.getWorldPosition(new THREE.Vector3());
      const shotDirection = impact.clone().sub(origin);
      const shotDistance = shotDirection.length();
      sightRaycaster.set(origin, shotDirection.normalize());
      sightRaycaster.far = shotDistance;
      const blocker = sightRaycaster.intersectObjects(worldOccluders, false)[0];
      const endpoint = blocker?.point ?? impact;
      const tracerGeometry = new THREE.BufferGeometry().setFromPoints([origin, endpoint]);
      const tracer = new THREE.Line(tracerGeometry, enemyTracerMat);
      scene.add(tracer);
      tracers.push({ line: tracer, expiresAt: now + 180, disposeMaterial: false });
      soldier.nextShotAt = now + Math.max(620, 1750 - waveRef.current * 42) + Math.random() * 420;
      soldier.muzzleFlashUntil = now + 90;
      soldier.recoilUntil = now + 150;
      soldier.muzzleFlash.visible = true;
      playEnemyShot(soldier, soldier.group.position.distanceTo(player.position));
      const dx = soldier.group.position.x - player.position.x;
      const dz = soldier.group.position.z - player.position.z;
      const forwardX = -Math.sin(yaw);
      const forwardZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      const relativeRight = dx * rightX + dz * rightZ;
      const relativeForward = dx * forwardX + dz * forwardZ;
      damageDirectionIdRef.current += 1;
      setIncomingDirection({
        id: damageDirectionIdRef.current,
        angle: Math.atan2(relativeRight, relativeForward) * (180 / Math.PI),
      });
      if (damageDirectionTimeoutRef.current !== null) window.clearTimeout(damageDirectionTimeoutRef.current);
      damageDirectionTimeoutRef.current = window.setTimeout(() => setIncomingDirection(null), 1050);
      if (hitsPlayer) {
        const damage = 9;
        const absorbed = Math.min(playerArmorRef.current, damage);
        playerArmorRef.current = Math.max(0, playerArmorRef.current - absorbed);
        setPlayerArmor(playerArmorRef.current);
        playerHealthRef.current = Math.max(0, playerHealthRef.current - (damage - absorbed));
        setPlayerHealth(Math.ceil(playerHealthRef.current));
        haptic("damage");
        lastDamageAt = now;
        healthWasDamaged = playerHealthRef.current > 0 && playerHealthRef.current < 100;
        setDamageFlashId((current) => current + 1);
        if (playerHealthRef.current <= 0) finishGame();
      }
    };

    const openSupplyDrop = () => {
      if (gamePhaseRef.current !== "combat") return;
      document.exitPointerLock?.();
      firingRef.current = false;
      sprintingRef.current = false;
      aimingRef.current = false;
      setSprinting(false);
      setAiming(false);
      setMobileSprintHeld(false);
      setPhase("supply");
      const question = createSupplyQuestion(waveRef.current);
      supplyQuestionRef.current = question;
      setSupplyQuestion(question);
      setSupplyMessage(null);
      supplyResolvedRef.current = false;
      playSound("wave");
    };
    const openTreasureQuestion = (chest: TreasureChest) => {
      if (gamePhaseRef.current !== "combat" || chest.collected) return;
      document.exitPointerLock?.();
      firingRef.current = false;
      sprintingRef.current = false;
      aimingRef.current = false;
      setSprinting(false);
      setAiming(false);
      setMobileSprintHeld(false);
      activeTreasureRef.current = chest;
      treasureFirstAttemptRef.current = true;
      setPhase("treasure");
      setTreasureAnswerCorrect(null);
      const question = createTreasureQuestion(Math.min(treasuresFoundRef.current + 1, TREASURE_COUNT), treasureQuestionsRef.current);
      supplyQuestionRef.current = question;
      setSupplyQuestion(question);
      setSupplyMessage(null);
      supplyResolvedRef.current = false;
      playSound("wave");
    };
    answerSupplyRef.current = (selectedAnswer: string) => {
      const question = supplyQuestionRef.current;
      if ((gamePhaseRef.current !== "supply" && gamePhaseRef.current !== "treasure") || supplyResolvedRef.current || !question) return;
      supplyResolvedRef.current = true;
      if (gamePhaseRef.current === "treasure") {
        const chest = activeTreasureRef.current;
        if (!chest) return;
        if (selectedAnswer === question.answer) {
          if (treasureFirstAttemptRef.current) {
            treasureCorrectAnswersRef.current += 1;
            setTreasureCorrectAnswers(treasureCorrectAnswersRef.current);
          }
          treasureQuizScoreRef.current += TREASURE_CORRECT_POINTS;
          setTreasureQuizScore(treasureQuizScoreRef.current);
          chest.collected = true;
          chest.group.visible = false;
          activeTreasureRef.current = null;
          const chestTargets = new Set(chest.group.children);
          for (let index = worldOccluders.length - 1; index >= 0; index -= 1) {
            if (chestTargets.has(worldOccluders[index]!)) worldOccluders.splice(index, 1);
          }
          treasuresFoundRef.current += 1;
          setTreasuresFound(treasuresFoundRef.current);
          addScore(TREASURE_CORRECT_POINTS);
          setSupplyMessage(`Benar! +${TREASURE_CORRECT_POINTS} poin. Peti ditemukan. ${TREASURE_COUNT - treasuresFoundRef.current} peti lagi.`);
          setTreasureAnswerCorrect(true);
          playSound("correct");
          if (treasuresFoundRef.current >= TREASURE_COUNT) setPhase("treasure-complete");
        } else {
          treasureFirstAttemptRef.current = false;
          treasureWrongAnswersRef.current += 1;
          setTreasureWrongAnswers(treasureWrongAnswersRef.current);
          addScore(TREASURE_WRONG_POINTS);
          setSupplyMessage(`Jawaban belum tepat. +${TREASURE_WRONG_POINTS} poin. Coba lagi untuk membuka peti.`);
          setTreasureAnswerCorrect(false);
          playSound("wrong");
        }
        return;
      }
      if (selectedAnswer === question.answer) {
        const reward = Math.floor(Math.random() * 3);
        if (reward === 0) {
          updateAmmo({
            rifle: { ...ammoRef.current.rifle, reserve: ammoRef.current.rifle.reserve + 30 },
            pistol: { ...ammoRef.current.pistol, reserve: ammoRef.current.pistol.reserve + 12 },
          });
          setSupplyMessage("Benar! Amunisi cadangan bertambah.");
        } else if (reward === 1) {
          playerHealthRef.current = 100;
          healthWasDamaged = false;
          setPlayerHealth(100);
          setSupplyMessage("Benar! HP dipulihkan penuh.");
        } else {
          playerArmorRef.current = Math.min(100, playerArmorRef.current + 40);
          setPlayerArmor(playerArmorRef.current);
          setSupplyMessage("Benar! Armor +40.");
        }
        playSound("correct");
      } else {
        setSupplyMessage("Belum tepat. Suplai ini tidak memberi bonus.");
        playSound("wrong");
      }
    };
    nextWaveRef.current = () => {
      if (gamePhaseRef.current === "treasure-complete") {
        if (soldiers.every((soldier) => !soldier.alive)) finishGame(true);
        else setPhase("combat");
        return;
      }
      if (gamePhaseRef.current !== "treasure" || !supplyResolvedRef.current) return;
      if (activeTreasureRef.current) {
        const question = createTreasureQuestion(Math.min(treasuresFoundRef.current + 1, TREASURE_COUNT), treasureQuestionsRef.current);
        supplyQuestionRef.current = question;
        setSupplyQuestion(question);
        setSupplyMessage(null);
        setTreasureAnswerCorrect(null);
        supplyResolvedRef.current = false;
        return;
      }
      supplyQuestionRef.current = null;
      setSupplyQuestion(null);
      setSupplyMessage(null);
      setTreasureAnswerCorrect(null);
      supplyResolvedRef.current = false;
      activeTreasureRef.current = null;
      if (treasuresFoundRef.current >= TREASURE_COUNT) {
        setPhase("treasure-complete");
      } else {
        setPhase("combat");
      }
    };
    let aimBlend = 0;
    const weaponPose = {
      rifle: {
        hip: new THREE.Vector3(0.34, -0.3, -0.58),
        aim: new THREE.Vector3(0.025, -0.13, -0.43),
      },
      pistol: {
        hip: new THREE.Vector3(0.34, -0.32, -0.48),
        aim: new THREE.Vector3(0.06, -0.16, -0.38),
      },
    };
    const radarRange = 58;
    const restartGame = () => {
      hasStartedGame.current = true;
      if (document.pointerLockElement) document.exitPointerLock?.();
      const now = performance.now();
      waveRef.current = 1;
      setWave(1);
      scoreRef.current = 0;
      setScore(0);
      setEnemyCount(STARTING_ENEMIES);
      treasuresFoundRef.current = 0;
      setTreasuresFound(0);
      treasureCorrectAnswersRef.current = 0;
      setTreasureCorrectAnswers(0);
      treasureWrongAnswersRef.current = 0;
      setTreasureWrongAnswers(0);
      treasureQuizScoreRef.current = 0;
      setTreasureQuizScore(0);
      treasureFirstAttemptRef.current = true;
      activeTreasureRef.current = null;
      treasureChests.forEach((chest) => {
        chest.collected = false;
        chest.group.visible = true;
      });
      treasureChestTargets.forEach((target) => {
        if (!worldOccluders.includes(target)) worldOccluders.push(target);
      });
      playerHealthRef.current = 100;
      setPlayerHealth(100);
      playerArmorRef.current = 0;
      setPlayerArmor(0);
      healthWasDamaged = false;
      lastDamageAt = 0;
      updateAmmo(createInitialAmmo());
      activeWeaponRef.current = "rifle";
      setActiveWeapon("rifle");
      rifleView.visible = true;
      pistolView.visible = false;
      aimingRef.current = false;
      setAiming(false);
      sprintingRef.current = false;
      setSprinting(false);
      setMobileSprintHeld(false);
      firingRef.current = false;
      firePointers.current.clear();
      sprintPointers.current.clear();
      joystickPointer.current = null;
      lookPointers.current.clear();
      rightLookPointer.current = null;
      rightLookInput.current = { x: 0, y: 0 };
      setRightLookStick(null);
      turnAroundPointer.current = null;
      turnAroundRequested.current = false;
      turnAroundAnimating.current = false;
      reloading = false;
      reloadingRef.current = false;
      setIsReloading(false);
      keys.current = {};
      jumpRequested.current = false;
      moveInput.current = { x: 0, y: 0 };
      lookDelta.current = { x: 0, y: 0 };
      setJoystick({ x: 0, y: 0 });
      setCrosshairGap(4);
      setHitFeedback(null);
      setDamageFlashId(0);
      setIncomingDirection(null);
      setKillFeed([]);
      setRadarContacts([]);
      setRadarTreasureContacts([]);
      supplyResolvedRef.current = false;
      setTreasureAnswerCorrect(null);
      supplyQuestionRef.current = null;
      setSupplyQuestion(null);
      setSupplyMessage(null);
      if (hitFeedbackTimeoutRef.current !== null) window.clearTimeout(hitFeedbackTimeoutRef.current);
      if (damageDirectionTimeoutRef.current !== null) window.clearTimeout(damageDirectionTimeoutRef.current);
      killFeedTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      killFeedTimeoutsRef.current = [];
      tracers.forEach(({ line, disposeMaterial }) => {
        scene.remove(line);
        line.geometry.dispose();
        if (disposeMaterial) (line.material as THREE.Material).dispose();
      });
      tracers.length = 0;
      yaw = 0;
      pitch = 0;
      verticalVelocity = 0;
      playerGrounded = true;
      playerOnTowerLadder = false;
      player.position.set(0, 1.65, 51);
      player.rotation.set(0, 0, 0);
      camera.rotation.set(0, 0, 0);
      camera.fov = baseCameraFov;
      cameraFovRef.current = baseCameraFov;
      camera.updateProjectionMatrix();
      cameraRecoil = 0;
      aimBlend = 0;
      elapsed = 0;
      lastShotAt.rifle = Number.NEGATIVE_INFINITY;
      lastShotAt.pistol = Number.NEGATIVE_INFINITY;
      muzzleFlashUntil = 0;
      rifleFlash.visible = false;
      pistolFlash.visible = false;
      soldiers.forEach((soldier, index) => {
        const active = index < STARTING_ENEMIES;
        soldier.health = soldier.maxHealth;
        soldier.alive = active;
        setSoldierCombatTarget(soldier, active);
        soldier.mode = active ? "patrol" : "dead";
        soldier.group.visible = active;
        soldier.group.position.set(soldier.spawnX, 0, soldier.spawnZ);
        soldier.group.rotation.set(0, 0, 0);
        soldier.patrolIndex = index % soldier.patrolPoints.length;
        const firstPatrolPoint = soldier.patrolPoints[soldier.patrolIndex];
        soldier.group.lookAt(firstPatrolPoint.x, 0, firstPatrolPoint.z);
        soldier.leftArmPivot.rotation.set(-0.52, 0, 0);
        soldier.rightArmPivot.rotation.set(-0.52, 0, 0);
        soldier.leftLegPivot.rotation.set(0, 0, 0);
        soldier.rightLegPivot.rotation.set(0, 0, 0);
        soldier.rifle.position.set(0, 1.26, 0.18);
        soldier.muzzleFlash.visible = false;
        soldier.nextSenseAt = 0;
        soldier.canSeePlayer = false;
        soldier.lastSeenAt = 0;
        soldier.lastKnownPlayer.set(soldier.spawnX, 0, soldier.spawnZ);
        soldier.nextShotAt = now + 950 + Math.random() * 500;
        soldier.nextCoverAt = 0;
        soldier.coverUntil = 0;
        soldier.coverTarget = null;
        soldier.path = [];
        soldier.pathIndex = 0;
        soldier.nextPathAt = 0;
        soldier.pathTarget.set(Number.POSITIVE_INFINITY, 0, Number.POSITIVE_INFINITY);
        soldier.muzzleFlashUntil = 0;
        soldier.recoilUntil = 0;
        soldier.deathStartedAt = now;
      });
      setPhase("combat");
      playSound("wave");
    };
    restartGameRef.current = restartGame;
    applyQualitySetting(qualityRef.current);
    applyBrightnessSetting(brightnessRef.current);

    const animate = (now: number) => {
      frame = window.requestAnimationFrame(animate);
      if (lastRenderAt && now - lastRenderAt < 1000 / 60) return;
      const dt = Math.min((now - previousTime) / 1000, 0.05);
      previousTime = now;
      lastRenderAt = now;
      const dustAttribute = dustGeometry.getAttribute("position") as THREE.BufferAttribute;
      for (let index = 0; index < dustCount; index += 1) {
        const x = dustAttribute.getX(index) + dustDrift[index]! * dt;
        const y = dustAttribute.getY(index) + dustDrift[index]! * 0.22 * dt;
        dustAttribute.setXYZ(
          index,
          x > 55 ? -55 : x,
          y > 11.5 ? 1.4 : y,
          dustAttribute.getZ(index),
        );
      }
      dustAttribute.needsUpdate = true;
      if (activeDecorationQuality !== qualityRef.current) {
        activeDecorationQuality = qualityRef.current;
        tieredInstanceMeshes.forEach(({ mesh, counts }) => {
          mesh.count = counts[activeDecorationQuality];
        });
      }
      treasureChests.forEach((chest) => {
        if (chest.collected) return;
        const pulse = 1 + Math.sin(now * 0.003 + chest.phase) * 0.08;
        chest.group.children.forEach((child) => {
          if (child instanceof THREE.PointLight) child.intensity = 2.6 + Math.sin(now * 0.003 + chest.phase) * 0.6;
          if (child instanceof THREE.Mesh && child.material === treasureGlowMat) child.scale.setScalar(pulse);
        });
      });
      if (gamePhaseRef.current !== "combat") {
        renderer.render(scene, camera);
        return;
      }
      elapsed += dt;
      const playerPosition = new THREE.Vector3(player.position.x, 0, player.position.z);
      const playerAimPoint = new THREE.Vector3(player.position.x, player.position.y - 0.35, player.position.z);
      soldiers.forEach((soldier) => {
        if (gamePhaseRef.current !== "combat") return;
        if (!soldier.alive) {
          const fallProgress = THREE.MathUtils.clamp((now - soldier.deathStartedAt) / 680, 0, 1);
          soldier.group.rotation.x = soldier.deathDirection * fallProgress * 1.16;
          soldier.group.position.y = -0.08 * fallProgress;
          return;
        }

        if (now >= soldier.muzzleFlashUntil) soldier.muzzleFlash.visible = false;
        soldier.rifle.position.z = -0.22 + (now < soldier.recoilUntil ? 0.1 : 0);
        const offsetToPlayer = playerPosition.clone().sub(soldier.group.position);
        const distanceToPlayer = offsetToPlayer.length();
        if (now >= soldier.nextSenseAt) {
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(soldier.group.quaternion);
          forward.y = 0;
          forward.normalize();
          const directionToPlayer = offsetToPlayer.clone().normalize();
          const inFieldOfView = soldier.mode !== "patrol" || forward.dot(directionToPlayer) > 0.24;
          const eye = soldier.group.position.clone().add(new THREE.Vector3(0, 1.48, 0));
          soldier.canSeePlayer = distanceToPlayer < 62 && inFieldOfView && hasLineOfSight(eye, playerAimPoint);
          soldier.nextSenseAt = now + 240;
          if (soldier.canSeePlayer) {
            soldier.lastSeenAt = now;
            soldier.lastKnownPlayer.copy(playerPosition);
            if (soldier.mode !== "cover" && soldier.mode !== "attack") {
              soldier.mode = "attack";
              soldier.nextCoverAt = now + 2600;
            }
          } else if (soldier.mode !== "cover") {
            if (soldier.lastSeenAt && now - soldier.lastSeenAt < 6500) {
              soldier.mode = "chase";
            } else if (soldier.mode !== "patrol") {
              soldier.mode = "patrol";
              soldier.coverTarget = null;
              soldier.nextPathAt = 0;
            }
          }
        }

        if (
          soldier.mode === "attack" &&
          now >= soldier.nextCoverAt &&
          distanceToPlayer > 11 &&
          distanceToPlayer < 48
        ) {
          soldier.nextCoverAt = now + 9000;
          const cover = chooseCoverPoint(soldier, playerPosition);
          if (cover) {
            soldier.mode = "cover";
            soldier.coverTarget = cover;
            soldier.coverUntil = now + 1750;
            soldier.nextPathAt = 0;
          }
        }

        if (soldier.mode === "patrol") {
          const patrolTarget = soldier.patrolPoints[soldier.patrolIndex];
          if (Math.hypot(patrolTarget.x - soldier.group.position.x, patrolTarget.z - soldier.group.position.z) < 1.3) {
            soldier.patrolIndex = (soldier.patrolIndex + 1) % soldier.patrolPoints.length;
            soldier.nextPathAt = 0;
          }
          moveSoldier(soldier, soldier.patrolPoints[soldier.patrolIndex], 1.35, dt, now);
        } else if (soldier.mode === "cover" && soldier.coverTarget) {
          const distanceToCover = Math.hypot(
            soldier.coverTarget.x - soldier.group.position.x,
            soldier.coverTarget.z - soldier.group.position.z,
          );
          if (distanceToCover > 1.15) {
            moveSoldier(soldier, soldier.coverTarget, 2.35, dt, now);
          } else {
            moveSoldier(soldier, soldier.group.position.clone(), 0, dt, now);
            soldier.group.lookAt(playerPosition.x, soldier.group.position.y, playerPosition.z);
            if (now >= soldier.coverUntil) {
              soldier.mode = "chase";
              soldier.coverTarget = null;
              soldier.lastKnownPlayer.copy(playerPosition);
              soldier.nextPathAt = 0;
            }
          }
        } else if (soldier.mode === "chase") {
          const distanceToLastSeen = Math.hypot(
            soldier.lastKnownPlayer.x - soldier.group.position.x,
            soldier.lastKnownPlayer.z - soldier.group.position.z,
          );
          if (distanceToLastSeen > 1.5) {
            moveSoldier(soldier, soldier.lastKnownPlayer, 2.6, dt, now);
          } else if (!soldier.canSeePlayer && now - soldier.lastSeenAt > 2800) {
            soldier.mode = "patrol";
            soldier.nextPathAt = 0;
          }
        } else if (soldier.mode === "attack") {
          if (distanceToPlayer > 15) {
            moveSoldier(soldier, playerPosition, 2.15, dt, now);
          } else {
            moveSoldier(soldier, soldier.group.position.clone(), 0, dt, now);
            soldier.group.lookAt(playerPosition.x, soldier.group.position.y, playerPosition.z);
          }
          const muzzleOrigin = soldier.group.position.clone().add(new THREE.Vector3(0, 1.48, 0));
          if (
            soldier.canSeePlayer &&
            distanceToPlayer < 58 &&
            now >= soldier.nextShotAt &&
            hasLineOfSight(muzzleOrigin, playerAimPoint)
          ) {
            shootSoldier(soldier, now, playerAimPoint);
          }
        }
      });
      if (gamePhaseRef.current !== "combat") {
        renderer.render(scene, camera);
        return;
      }
      if (soldiers.every((soldier) => !soldier.alive) && treasuresFoundRef.current >= TREASURE_COUNT) {
        finishGame(true);
        renderer.render(scene, camera);
        return;
      }
      for (let i = tracers.length - 1; i >= 0; i -= 1) {
        if (now < tracers[i].expiresAt) continue;
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        if (tracers[i].disposeMaterial) (tracers[i].line.material as THREE.Material).dispose();
        tracers.splice(i, 1);
      }
      if (turnAroundRequested.current) {
        turnAroundRequested.current = false;
        turnAroundStartYaw = yaw;
        turnAroundStartedAt = now;
      }
      if (turnAroundAnimating.current) {
        const progress = THREE.MathUtils.clamp((now - turnAroundStartedAt) / 200, 0, 1);
        const easeOut = 1 - (1 - progress) ** 3;
        yaw = turnAroundStartYaw + Math.PI * easeOut;
        lookDelta.current = { x: 0, y: 0 };
        if (progress >= 1) turnAroundAnimating.current = false;
      } else {
        if (lookDelta.current.x || lookDelta.current.y) {
          yaw -= lookDelta.current.x * 0.004;
          pitch = THREE.MathUtils.clamp(pitch - lookDelta.current.y * 0.004, -1.25, 1.25);
          lookDelta.current = { x: 0, y: 0 };
        }
        if (touchLookModeRef.current === "right-stick") {
          const sensitivityScale = touchLookSensitivityRef.current / DEFAULT_TOUCH_LOOK_SENSITIVITY;
          const zoomScale = THREE.MathUtils.clamp(cameraFovRef.current / 72, 0.5, 1);
          yaw -= rightLookInput.current.x * THREE.MathUtils.degToRad(270) * sensitivityScale * zoomScale * dt;
          pitch = THREE.MathUtils.clamp(
            pitch + rightLookInput.current.y * THREE.MathUtils.degToRad(120) * sensitivityScale * zoomScale * dt,
            -1.25,
            1.25,
          );
        }
      }
      const keysNow = keys.current;
      if (jumpRequested.current) {
        if (playerGrounded) {
          verticalVelocity = 7;
          playerGrounded = false;
        }
        jumpRequested.current = false;
      }
      const startGroundX = player.position.x;
      const startGroundZ = player.position.z;
      const groundBeforeMovement = getGroundHeight(startGroundX, startGroundZ);
      const inputX = (keysNow.KeyD || keysNow.ArrowRight ? 1 : 0) - (keysNow.KeyA || keysNow.ArrowLeft ? 1 : 0) + moveInput.current.x;
      const inputY = (keysNow.KeyW || keysNow.ArrowUp ? 1 : 0) - (keysNow.KeyS || keysNow.ArrowDown ? 1 : 0) + moveInput.current.y;
      const length = Math.hypot(inputX, inputY);
      const sprintActive = sprintingRef.current || keysNow.ShiftLeft || keysNow.ShiftRight;
      const nearTowerLadder = (
        Math.abs(player.position.x - towerLadderX) <= 1.2
        && Math.abs(player.position.z - towerLadderRailZ) <= 1.65
      );
      if (
        !playerOnTowerLadder
        && playerGrounded
        && nearTowerLadder
        && (
          (inputY > 0.1 && player.position.y <= 2.2 && player.position.z > towerLadderRailZ)
          || (inputY < -0.1 && player.position.y >= towerPlatformTop + 1.15 && player.position.z < towerLadderRailZ)
        )
      ) {
        playerOnTowerLadder = true;
        verticalVelocity = 0;
        player.position.x = towerLadderX;
        player.position.z = towerLadderAccessZ;
      }
      if (playerOnTowerLadder) {
        if (inputY > 0.1) player.position.y = Math.min(towerPlatformTop + 1.65, player.position.y + 5.2 * dt);
        if (inputY < -0.1) player.position.y = Math.max(1.65, player.position.y - 5.2 * dt);
        player.position.x = towerLadderX;
        verticalVelocity = 0;
        if (player.position.y >= towerPlatformTop + 1.65) {
          player.position.y = towerPlatformTop + 1.65;
          player.position.z = towerPlatform.z + towerPlatform.depth / 2 - 0.8;
          playerOnTowerLadder = false;
          playerGrounded = true;
        } else if (player.position.y <= 1.65) {
          player.position.y = 1.65;
          player.position.z = towerLadderAccessZ;
          playerOnTowerLadder = false;
          playerGrounded = true;
        } else {
          playerGrounded = false;
        }
      } else if (length > 0) {
        const speed = 7.2 * (sprintActive ? 1.62 : 1) * dt / Math.max(1, length);
        const dx = (Math.cos(yaw) * inputX - Math.sin(yaw) * inputY) * speed;
        const dz = (-Math.sin(yaw) * inputX - Math.cos(yaw) * inputY) * speed;
        const nextX = THREE.MathUtils.clamp(player.position.x + dx, -playerLimit, playerLimit);
        const nextZ = THREE.MathUtils.clamp(player.position.z + dz, -playerLimit, playerLimit);
        movePlayerTo(nextX, player.position.z);
        movePlayerTo(player.position.x, nextZ);
      }

      const groundAfterMovement = getGroundHeight(player.position.x, player.position.z);
      if (playerOnTowerLadder) {
        playerGrounded = false;
        verticalVelocity = 0;
      } else {
        if (playerGrounded && groundBeforeMovement - groundAfterMovement > maxStepUp) {
          playerGrounded = false;
        }

        if (playerGrounded) {
          const targetEyeHeight = groundAfterMovement + 1.65;
          player.position.y = THREE.MathUtils.lerp(
            player.position.y,
            targetEyeHeight,
            1 - Math.exp(-60 * dt),
          );
          if (Math.abs(targetEyeHeight - player.position.y) < 0.015) {
            player.position.y = targetEyeHeight;
          }
          verticalVelocity = 0;
        } else {
          verticalVelocity -= 18 * dt;
          player.position.y += verticalVelocity * dt;
          const groundEyeHeight = groundAfterMovement + 1.65;
          if (verticalVelocity <= 0 && player.position.y <= groundEyeHeight) {
            player.position.y = groundEyeHeight;
            verticalVelocity = 0;
            playerGrounded = true;
          }
        }
      }
      const nearbyChest = treasureChests.find((chest) => (
        !chest.collected
        && Math.hypot(chest.group.position.x - player.position.x, chest.group.position.z - player.position.z) < 3.1
      ));
      if (nearbyChest) openTreasureQuestion(nearbyChest);
      if (length > 0.1 && playerGrounded && now - lastFootstepAt >= (sprintActive ? 330 : 440)) {
        lastFootstepAt = now;
        playSound("step");
      }
      if (playerHealthRef.current <= 25 && now - lastCriticalHapticAt >= 1400) {
        lastCriticalHapticAt = now;
        haptic("critical");
      }
      player.rotation.y = yaw;
      const aimTarget = aimingRef.current && !sprintActive ? 1 : 0;
      aimBlend += (aimTarget - aimBlend) * (1 - Math.exp(-dt * 13));
      const targetFov = THREE.MathUtils.lerp(baseCameraFov, 46, aimBlend);
      if (Math.abs(camera.fov - targetFov) > 0.03) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
      cameraFovRef.current = camera.fov;
      cameraRecoil *= Math.exp(-dt * 8);
      camera.rotation.x = THREE.MathUtils.clamp(pitch + cameraRecoil, -1.25, 1.25);

      const selectedWeapon = activeWeaponRef.current;
      const selectedView = selectedWeapon === "rifle" ? rifleView : pistolView;
      const pose = weaponPose[selectedWeapon];
      const walkBob = length > 0.1 ? 1 : 0;
      const sway = walkBob * (sprintActive ? 0.022 : 0.013) * (1 - aimBlend * 0.8);
      const bob = walkBob * (sprintActive ? 0.028 : 0.016) * (1 - aimBlend * 0.8);
      const reloadProgress = reloading
        ? THREE.MathUtils.clamp((now - reloadStartedAt) / WEAPON_CONFIG[selectedWeapon].reloadDuration, 0, 1)
        : 0;
      const reloadDip = reloading ? Math.sin(reloadProgress * Math.PI) * 0.13 : 0;
      const recoilKick = now < weaponRecoilUntil ? 0.08 * (1 - (now - (weaponRecoilUntil - 130)) / 130) : 0;
      selectedView.position.set(
        THREE.MathUtils.lerp(pose.hip.x, pose.aim.x, aimBlend) + Math.sin(elapsed * 9) * sway,
        THREE.MathUtils.lerp(pose.hip.y, pose.aim.y, aimBlend) + Math.abs(Math.cos(elapsed * 9)) * bob - reloadDip,
        THREE.MathUtils.lerp(pose.hip.z, pose.aim.z, aimBlend) + recoilKick,
      );
      selectedView.rotation.set(
        reloading ? reloadProgress * 0.35 : 0,
        reloading ? Math.sin(reloadProgress * Math.PI) * 0.18 : 0,
        Math.sin(elapsed * 7) * sway * 0.7,
      );
      rifleFlash.visible = selectedWeapon === "rifle" && now < muzzleFlashUntil;
      pistolFlash.visible = selectedWeapon === "pistol" && now < muzzleFlashUntil;

      if (reloading && now >= reloadEndsAt) {
        const config = WEAPON_CONFIG[selectedWeapon];
        const current = ammoRef.current[selectedWeapon];
        const loaded = Math.min(config.magazineSize - current.magazine, current.reserve);
        updateAmmo({
          ...ammoRef.current,
          [selectedWeapon]: { magazine: current.magazine + loaded, reserve: current.reserve - loaded },
        });
        reloading = false;
        reloadingRef.current = false;
        setIsReloading(false);
      }
      if (gamePhaseRef.current === "combat" && firingRef.current && selectedWeapon === "rifle" && !reloading) fire();

      if (healthWasDamaged && playerHealthRef.current < 100 && now - lastDamageAt >= 4300) {
        playerHealthRef.current = Math.min(100, playerHealthRef.current + 8 * dt);
        if (now - lastHealthUiAt >= 110) {
          setPlayerHealth(Math.ceil(playerHealthRef.current));
          lastHealthUiAt = now;
        }
      } else if (playerHealthRef.current >= 100) {
        playerHealthRef.current = 100;
        healthWasDamaged = false;
      }

      if (now - lastHudUiAt >= 125) {
        const gap = aimingRef.current ? 1.5 : 4 + (walkBob ? 2.5 : 0) + (sprintActive ? 3.5 : 0) + (reloading ? 1.5 : 0);
        setCrosshairGap(gap);
        const forwardX = -Math.sin(yaw);
        const forwardZ = -Math.cos(yaw);
        const rightX = Math.cos(yaw);
        const rightZ = -Math.sin(yaw);
        const contacts = soldiers.filter((soldier) => soldier.alive).map((soldier, index) => {
          const dx = soldier.group.position.x - player.position.x;
          const dz = soldier.group.position.z - player.position.z;
          const rightDistance = dx * rightX + dz * rightZ;
          const forwardDistance = dx * forwardX + dz * forwardZ;
          let offsetX = (rightDistance / radarRange) * 42;
          let offsetY = (-forwardDistance / radarRange) * 42;
          const offsetLength = Math.hypot(offsetX, offsetY);
          if (offsetLength > 42) {
            offsetX = (offsetX / offsetLength) * 42;
            offsetY = (offsetY / offsetLength) * 42;
          }
          return { id: index, x: 50 + offsetX, y: 50 + offsetY };
        });
        const treasureContacts = treasureChests.filter((chest) => !chest.collected).map((chest, index) => {
          const dx = chest.group.position.x - player.position.x;
          const dz = chest.group.position.z - player.position.z;
          const rightDistance = dx * rightX + dz * rightZ;
          const forwardDistance = dx * forwardX + dz * forwardZ;
          let offsetX = (rightDistance / radarRange) * 42;
          let offsetY = (-forwardDistance / radarRange) * 42;
          const offsetLength = Math.hypot(offsetX, offsetY);
          if (offsetLength > 42) {
            offsetX = (offsetX / offsetLength) * 42;
            offsetY = (offsetY / offsetLength) * 42;
          }
          return { id: index, x: 50 + offsetX, y: 50 + offsetY };
        });
        setRadarContacts(contacts);
        setRadarTreasureContacts(treasureContacts);
        lastHudUiAt = now;
      }
      renderer.render(scene, camera);
    };
    frame = window.requestAnimationFrame(animate);

    teardown = () => {
      window.cancelAnimationFrame(frame);
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("pointerdown", unlockAudio, true);
      document.removeEventListener("touchstart", unlockAudio, true);
      document.removeEventListener("click", unlockAudio, true);
      document.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("click", onCanvasClick);
      renderer.domElement.removeEventListener("mousedown", onCanvasMouseDown);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      fireRef.current = null;
      swapWeaponRef.current = null;
      reloadWeaponRef.current = null;
      pauseGameRef.current = null;
      resumeGameRef.current = null;
      restartGameRef.current = null;
      answerSupplyRef.current = null;
      nextWaveRef.current = null;
      soundRef.current = null;
      unlockAudioRef.current = null;
      firingRef.current = false;
      firePointers.current.clear();
      sprintPointers.current.clear();
      lookPointers.current.clear();
      rightLookPointer.current = null;
      rightLookInput.current = { x: 0, y: 0 };
      joystickPointer.current = null;
      turnAroundPointer.current = null;
      turnAroundRequested.current = false;
      turnAroundAnimating.current = false;
      reloadingRef.current = false;
      if (rendererRef.current === renderer) rendererRef.current = null;
      if (sceneRef.current === scene) sceneRef.current = null;
      hemisphereLightRef.current = null;
      sunlightRef.current = null;
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
      if (hitFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(hitFeedbackTimeoutRef.current);
        hitFeedbackTimeoutRef.current = null;
      }
      if (damageDirectionTimeoutRef.current !== null) {
        window.clearTimeout(damageDirectionTimeoutRef.current);
        damageDirectionTimeoutRef.current = null;
      }
      killFeedTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      killFeedTimeoutsRef.current = [];
      hapticTimeouts.forEach((timeout) => window.clearTimeout(timeout));
      hapticTimeouts.length = 0;
      soundLoadAbortController.abort();
      decodedSoundBuffers.clear();
      activeAudioVoices.forEach((voice) => disconnectAudioNodes(voice.nodes));
      activeAudioVoices.clear();
      const audioContext = audioContextRef.current;
      audioContextRef.current = null;
      masterGainRef.current = null;
      if (audioContext) audioContext.onstatechange = null;
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close().catch((error: unknown) => {
          console.warn("AudioContext tidak dapat ditutup:", error);
        });
      }
      tracers.forEach(({ line, disposeMaterial }) => {
        scene.remove(line);
        line.geometry.dispose();
        if (disposeMaterial) (line.material as THREE.Material).dispose();
      });
      const disposedGeometries = new Set<THREE.BufferGeometry>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh && !disposedGeometries.has(object.geometry)) {
          object.geometry.dispose();
          disposedGeometries.add(object.geometry);
        }
      });
      soldierGeometries.forEach((geometry) => {
        if (disposedGeometries.has(geometry)) return;
        geometry.dispose();
        disposedGeometries.add(geometry);
      });
      materials.forEach((mat) => mat.dispose());
      textures.forEach((texture) => texture.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
    });

    return () => {
      window.cancelAnimationFrame(initFrame);
      teardown?.();
    };
  }, [selectedArena]);

  const updateJoystick = (event: PointerEvent<HTMLDivElement>) => {
    if (gamePhaseRef.current !== "combat") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.34);
    const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.34);
    const length = Math.max(1, Math.hypot(dx, dy));
    const next = { x: THREE.MathUtils.clamp(dx / length, -1, 1), y: THREE.MathUtils.clamp(-dy / length, -1, 1) };
    moveInput.current = next;
    setJoystick(next);
  };
  const clearJoystick = (event: PointerEvent<HTMLDivElement>) => {
    if (joystickPointer.current !== event.pointerId) return;
    joystickPointer.current = null;
    moveInput.current = { x: 0, y: 0 };
    setJoystick({ x: 0, y: 0 });
  };
  const onTouchLookStart = (event: PointerEvent<HTMLDivElement>) => {
    if (gamePhaseRef.current !== "combat") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (touchLookModeRef.current === "right-stick") {
      if (rightLookPointer.current) return;
      const rect = event.currentTarget.getBoundingClientRect();
      rightLookPointer.current = {
        id: event.pointerId,
        originX: event.clientX - rect.left,
        originY: event.clientY - rect.top,
      };
      rightLookInput.current = { x: 0, y: 0 };
      setRightLookStick({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        dx: 0,
        dy: 0,
      });
      return;
    }
    lookPointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      lastAt: event.timeStamp,
    });
  };
  const onTouchLookMove = (event: PointerEvent<HTMLDivElement>) => {
    if (gamePhaseRef.current !== "combat") return;
    if (touchLookModeRef.current === "right-stick") {
      const stick = rightLookPointer.current;
      if (!stick || stick.id !== event.pointerId) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const radius = 48;
      const rawX = (event.clientX - rect.left - stick.originX) / radius;
      const rawY = (event.clientY - rect.top - stick.originY) / radius;
      const length = Math.hypot(rawX, rawY);
      const limitedScale = length > 1 ? 1 / length : 1;
      const limitedX = rawX * limitedScale;
      const limitedY = rawY * limitedScale;
      const limitedLength = Math.hypot(limitedX, limitedY);
      const deadZone = 0.14;
      const activeMagnitude = limitedLength <= deadZone
        ? 0
        : (limitedLength - deadZone) / (1 - deadZone);
      const activeScale = limitedLength > 0 ? activeMagnitude / limitedLength : 0;
      rightLookInput.current = { x: limitedX * activeScale, y: -limitedY * activeScale };
      setRightLookStick({
        x: stick.originX,
        y: stick.originY,
        dx: limitedX * radius,
        dy: limitedY * radius,
      });
      return;
    }
    const touch = lookPointers.current.get(event.pointerId);
    if (!touch) return;
    const dx = event.clientX - touch.x;
    const dy = event.clientY - touch.y;
    const elapsedSeconds = Math.max((event.timeStamp - touch.lastAt) / 1000, 1 / 240);
    const swipeSpeed = Math.hypot(dx, dy) / elapsedSeconds;
    const accelerationProgress = THREE.MathUtils.clamp((swipeSpeed - 240) / 1200, 0, 1);
    const easedAcceleration = accelerationProgress * accelerationProgress * (3 - 2 * accelerationProgress);
    const acceleration = 1 + 0.8 * easedAcceleration;
    const zoomScale = THREE.MathUtils.clamp(cameraFovRef.current / 72, 0.5, 1);
    const lookScale = touchLookSensitivityRef.current * zoomScale * acceleration;
    touch.x = event.clientX;
    touch.y = event.clientY;
    touch.lastAt = event.timeStamp;
    if (!turnAroundAnimating.current) {
      lookDelta.current.x += dx * lookScale;
      lookDelta.current.y += dy * lookScale;
    }
  };
  const onTouchLookEnd = (event: PointerEvent<HTMLDivElement>) => {
    lookPointers.current.delete(event.pointerId);
    if (rightLookPointer.current?.id === event.pointerId) {
      rightLookPointer.current = null;
      rightLookInput.current = { x: 0, y: 0 };
      setRightLookStick(null);
    }
  };
  const onJoystickPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (gamePhaseRef.current !== "combat") return;
    joystickPointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystick(event);
  };
  const toggleAim = () => {
    if (gamePhaseRef.current !== "combat") return;
    if (!aimingRef.current && sprintingRef.current) {
      sprintingRef.current = false;
      setSprinting(false);
      setMobileSprintHeld(false);
      sprintPointers.current.clear();
    }
    const next = !aimingRef.current;
    aimingRef.current = next;
    setAiming(next);
  };
  const startMobileSprint = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (gamePhaseRef.current !== "combat") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    sprintPointers.current.add(event.pointerId);
    sprintingRef.current = true;
    setSprinting(true);
    setMobileSprintHeld(true);
    aimingRef.current = false;
    setAiming(false);
  };
  const stopMobileSprint = (event: PointerEvent<HTMLButtonElement>) => {
    sprintPointers.current.delete(event.pointerId);
    const stillHeld = sprintPointers.current.size > 0;
    sprintingRef.current = stillHeld;
    setSprinting(stillHeld);
    setMobileSprintHeld(stillHeld);
  };
  const startMobileFire = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (gamePhaseRef.current !== "combat") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    firePointers.current.add(event.pointerId);
    firingRef.current = true;
    fireRef.current?.();
  };
  const stopMobileFire = (event: PointerEvent<HTMLButtonElement>) => {
    firePointers.current.delete(event.pointerId);
    firingRef.current = firePointers.current.size > 0;
  };
  const startTurnAround = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (
      gamePhaseRef.current !== "combat"
      || turnAroundAnimating.current
      || turnAroundRequested.current
    ) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    turnAroundPointer.current = event.pointerId;
    turnAroundRequested.current = true;
    turnAroundAnimating.current = true;
  };
  const endTurnAround = (event: PointerEvent<HTMLButtonElement>) => {
    if (turnAroundPointer.current === event.pointerId) turnAroundPointer.current = null;
  };
  const updateTouchLookSensitivity = (value: number) => {
    const next = THREE.MathUtils.clamp(value, 0.5, 3);
    touchLookSensitivityRef.current = next;
    setTouchLookSensitivity(next);
    try {
      window.localStorage.setItem(TOUCH_LOOK_SENSITIVITY_KEY, String(next));
    } catch {
      // The control remains usable if local storage is unavailable.
    }
  };
  const updateTouchLookMode = (mode: TouchLookMode) => {
    touchLookModeRef.current = mode;
    setTouchLookMode(mode);
    lookPointers.current.clear();
    rightLookPointer.current = null;
    rightLookInput.current = { x: 0, y: 0 };
    setRightLookStick(null);
    try {
      window.localStorage.setItem(TOUCH_LOOK_MODE_KEY, mode);
    } catch {
      // The selected mode remains usable if local storage is unavailable.
    }
  };
  const renderTouchControlSettings = (idPrefix: string) => (
    <div className="strike-touch-settings">
      <div className="strike-sensitivity-control">
        <label className="strike-sensitivity-label" htmlFor={`${idPrefix}-touch-look-sensitivity`}>
          <span>Sensitivitas</span>
          <output>{touchLookSensitivity.toFixed(1)}×</output>
        </label>
        <input
          id={`${idPrefix}-touch-look-sensitivity`}
          type="range"
          min="0.5"
          max="3"
          step="0.1"
          value={touchLookSensitivity}
          aria-label="Sensitivitas geser kamera"
          onChange={(event) => updateTouchLookSensitivity(Number(event.currentTarget.value))}
        />
      </div>
      <label className="strike-look-mode">
        <span>Mode melihat</span>
        <select
          value={touchLookMode}
          onChange={(event) => updateTouchLookMode(event.currentTarget.value as TouchLookMode)}
          aria-label="Mode melihat"
        >
          <option value="swipe">Geser</option>
          <option value="right-stick">Joystick kanan</option>
        </select>
      </label>
      <label className="strike-turn-visibility">
        <input
          type="checkbox"
          checked={showTurnAroundButton}
          onChange={(event) => setShowTurnAroundButton(event.currentTarget.checked)}
        />
        <span>Tampilkan tombol Putar 180°</span>
      </label>
    </div>
  );
  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    if (!next) muteWarningLoggedRef.current = false;
    setMuted(next);
    const context = audioContextRef.current;
    const masterGain = masterGainRef.current;
    if (context && masterGain) {
      const time = context.currentTime;
      masterGain.gain.cancelScheduledValues(time);
      masterGain.gain.setTargetAtTime(next ? 0 : 0.82, time, 0.018);
    }
  };
  const toggleEnemyScreams = (enabled: boolean) => {
    enemyScreamsEnabledRef.current = enabled;
    setEnemyScreamsEnabled(enabled);
    try {
      window.localStorage.setItem(ENEMY_SCREAMS_KEY, String(enabled));
    } catch (error) {
      console.warn("Pengaturan teriakan tidak tersimpan:", error);
    }
  };
  const toggleHaptics = (enabled: boolean) => {
    hapticsEnabledRef.current = enabled;
    setHapticsEnabled(enabled);
    try {
      window.localStorage.setItem(HAPTICS_ENABLED_KEY, String(enabled));
    } catch (error) {
      console.warn("Pengaturan getar tidak tersimpan:", error);
    }
  };
  const openArenaPicker = () => {
    const currentPhase = gamePhaseRef.current;
    if (currentPhase !== "combat" && currentPhase !== "paused" && currentPhase !== "treasure-complete" && currentPhase !== "gameover" && currentPhase !== "complete") return;
    arenaPickerReturnPhase.current = currentPhase;
    setPendingArena(selectedArena);
    if (currentPhase === "combat") pauseGameRef.current?.();
    gamePhaseRef.current = "arena-select";
    setGamePhase("arena-select");
  };
  const closeArenaPicker = () => {
    if (arenaPickerReturnPhase.current === "combat") resumeGameRef.current?.();
    else {
      gamePhaseRef.current = arenaPickerReturnPhase.current;
      setGamePhase(arenaPickerReturnPhase.current);
    }
  };
  const applyArenaSelection = () => {
    if (pendingArena === selectedArena) {
      if (hasStartedGame.current) {
        restartGameRef.current?.();
        return;
      }
      hasStartedGame.current = true;
      gamePhaseRef.current = "combat";
      setGamePhase("combat");
      soundRef.current?.("wave");
      return;
    }
    hasStartedGame.current = true;
    scoreRef.current = 0;
    setScore(0);
    setEnemyCount(STARTING_ENEMIES);
    waveRef.current = 1;
    setWave(1);
    treasuresFoundRef.current = 0;
    setTreasuresFound(0);
    treasureCorrectAnswersRef.current = 0;
    setTreasureCorrectAnswers(0);
    treasureWrongAnswersRef.current = 0;
    setTreasureWrongAnswers(0);
    treasureQuizScoreRef.current = 0;
    setTreasureQuizScore(0);
    treasureFirstAttemptRef.current = true;
    activeTreasureRef.current = null;
    supplyResolvedRef.current = false;
    supplyQuestionRef.current = null;
    setSupplyQuestion(null);
    setSupplyMessage(null);
    setTreasureAnswerCorrect(null);
    playerHealthRef.current = 100;
    setPlayerHealth(100);
    playerArmorRef.current = 0;
    setPlayerArmor(0);
    aimingRef.current = false;
    setAiming(false);
    sprintingRef.current = false;
    setSprinting(false);
    firingRef.current = false;
    reloadingRef.current = false;
    setIsReloading(false);
    setHitFeedback(null);
    setDamageFlashId(0);
    setIncomingDirection(null);
    setKillFeed([]);
    setRadarContacts([]);
    setRadarTreasureContacts([]);
    ammoRef.current = createInitialAmmo();
    setAmmo(ammoRef.current);
    activeWeaponRef.current = "rifle";
    setActiveWeapon("rifle");
    gamePhaseRef.current = "combat";
    setGamePhase("combat");
    setSelectedArena(pendingArena);
  };
  const previewArena = ARENAS.find((arena) => arena.id === pendingArena) ?? ARENAS[0]!;
  const arenaPreviewStyle = {
    "--arena-horizon": previewArena.horizon,
    "--arena-midday": previewArena.midday,
    "--arena-accent": previewArena.accent,
    "--arena-ground": previewArena.ground,
  } as CSSProperties;
  const treasureRank = TREASURE_RANKS[treasureCorrectAnswers] ?? TREASURE_RANKS[0];

  return (
    <main className="strike-page">
      <style>{`
        .strike-page{position:fixed;inset:0;width:100%;height:100vh;height:100dvh;min-height:0;overflow:hidden;background:#07101d;color:#e9f6ff;font-family:var(--font-body,'Exo 2'),sans-serif;isolation:isolate}
        .strike-canvas{display:block;width:100%;height:100%;touch-action:none;outline:none}
        .strike-render-error{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.55rem;padding:2rem;color:#b7d8e5;text-align:center}
        .strike-render-error small{max-width:min(80vw,720px);color:#7895a4;font:400 11px/1.5 var(--font-body,'Exo 2'),sans-serif;overflow-wrap:anywhere}
        .strike-hud{position:absolute;z-index:2;inset:0;pointer-events:none}
        .strike-top{position:absolute;left:clamp(16px,4vw,48px);right:clamp(16px,4vw,48px);top:clamp(16px,3vh,30px);display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
        .strike-brand{display:flex;align-items:center;gap:12px}
        .strike-logo{display:block;flex:0 0 auto;width:76px;height:22px;overflow:hidden;opacity:.84;filter:drop-shadow(0 0 5px rgba(67,220,232,.12))}
        .strike-title{font:700 13px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.16em;color:#f1eee1}
        .strike-subtitle{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#b1aa91;margin-top:4px}
         .strike-header-actions{display:flex;align-items:center;gap:7px}
         .strike-status{font:500 10px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.1em;color:#c0c3a9;border:1px solid rgba(192,195,169,.25);background:rgba(12,16,15,.72);padding:9px 12px;white-space:nowrap}
         .strike-status span{color:rgba(144,203,218,.4);padding:0 4px}
        .strike-status i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#b4ca77;margin-right:8px;box-shadow:0 0 6px rgba(180,202,119,.7)}
         .strike-header-button{pointer-events:auto;min-height:36px;padding:7px 10px;border:1px solid rgba(178,171,139,.42);background:rgba(12,16,15,.9);color:#e5e0cc;font:600 8px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.08em;cursor:pointer}
         .strike-header-button:disabled{opacity:.46;cursor:not-allowed}
        .strike-quality-control{position:absolute;z-index:4;right:clamp(16px,4vw,48px);top:68px;pointer-events:auto}
        .strike-settings-toggle,.strike-settings-panel select{border:1px solid rgba(202,211,211,.32);background:rgba(19,31,38,.88);color:#eef7f7;font:600 8px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.08em;cursor:pointer}
        .strike-settings-toggle{padding:8px 10px;box-shadow:0 4px 14px rgba(16,28,34,.14)}
        .strike-settings-panel{position:absolute;top:calc(100% + 8px);right:0;width:min(248px,calc(100vw - 24px));padding:12px;border:1px solid rgba(202,211,211,.3);background:rgba(22,33,37,.94);box-shadow:0 12px 32px rgba(21,31,35,.22);backdrop-filter:blur(7px)}
        .strike-settings-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .strike-audio-state{margin-top:10px;color:#a8c5d0;font-size:10px}
        .strike-audio-settings{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;color:#c6dce4;font-size:10px}
        .strike-audio-settings input{accent-color:#43dce8}
        .strike-settings-row label,.strike-settings-panel legend{font:600 8px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.1em;color:#d7e4e4}
        .strike-settings-panel select{border-radius:2px;padding:6px 8px;font:500 10px var(--font-body,'Exo 2'),sans-serif;letter-spacing:0}
        .strike-settings-panel fieldset{margin:12px 0 0;padding:10px 0 0;border:0;border-top:1px solid rgba(202,211,211,.18)}
        .strike-settings-panel legend{padding:0 8px 0 0}
         .strike-touch-settings{margin-top:12px;padding-top:10px;border-top:1px solid rgba(202,211,211,.18)}
         .strike-sensitivity-control{display:grid;gap:7px}
         .strike-sensitivity-label{display:flex;justify-content:space-between;align-items:center;color:#d7e4e4;font:600 8px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.08em}
         .strike-sensitivity-label output{color:#73d9df;font:700 10px var(--font-display,'Orbitron'),sans-serif}
         .strike-sensitivity-control input{width:100%;accent-color:#43dce8;touch-action:pan-x}
         .strike-look-mode{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;color:#c6dce4;font-size:10px}
         .strike-look-mode select{border:1px solid rgba(202,211,211,.32);border-radius:2px;padding:6px 8px;background:rgba(19,31,38,.88);color:#eef7f7;font:500 10px var(--font-body,'Exo 2'),sans-serif}
         .strike-turn-visibility{display:flex;align-items:center;gap:8px;margin-top:10px;color:#c6dce4;font-size:10px}
         .strike-turn-visibility input{accent-color:#43dce8}
         @media(pointer:coarse),(max-width:759px){.strike-top{z-index:2}}
        .strike-brightness-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
        .strike-brightness-options button{min-height:34px;padding:5px 4px;border:1px solid rgba(202,211,211,.24);background:rgba(9,18,23,.74);color:#c7d6d8;font:500 8px var(--font-body,'Exo 2'),sans-serif;cursor:pointer}
        .strike-brightness-options button[aria-pressed="true"]{border-color:#f3d391;background:rgba(120,99,57,.35);color:#fff1c9}
        .strike-settings-toggle:focus-visible,.strike-settings-panel select:focus-visible,.strike-brightness-options button:focus-visible{outline:2px solid #8fe3ec;outline-offset:2px}
        .strike-atmosphere-vignette{position:absolute;z-index:0;inset:0;pointer-events:none;background:none}
         .strike-reticle{position:absolute;left:50%;top:50%;width:36px;height:36px;transform:translate(-50%,-50%);opacity:.78;transition:opacity .15s,filter .15s}
         .strike-reticle span{position:absolute;display:block;background:#e8e0c3;border-radius:1px;box-shadow:0 0 3px rgba(18,20,15,.8)}
         .strike-reticle .reticle-top,.strike-reticle .reticle-bottom{left:17px;width:2px;height:7px}
         .strike-reticle .reticle-top{top:0;transform:translateY(calc(-1 * var(--crosshair-gap)))}
         .strike-reticle .reticle-bottom{bottom:0;transform:translateY(var(--crosshair-gap))}
         .strike-reticle .reticle-left,.strike-reticle .reticle-right{top:17px;width:7px;height:2px}
         .strike-reticle .reticle-left{left:0;transform:translateX(calc(-1 * var(--crosshair-gap)))}
         .strike-reticle .reticle-right{right:0;transform:translateX(var(--crosshair-gap))}
         .strike-reticle .reticle-center{left:16px;top:16px;width:4px;height:4px;border-radius:50%}
         .strike-reticle.is-aiming{opacity:1;filter:drop-shadow(0 0 4px rgba(232,224,195,.72))}
         .strike-damage-vignette{position:absolute;z-index:1;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 40%,rgba(174,24,35,.5) 100%);animation:strike-damage-flash .58s ease-out both}
         @keyframes strike-damage-flash{0%{opacity:.9}100%{opacity:0}}
         .strike-direction{position:absolute;left:50%;top:50%;width:34px;height:38px;display:grid;place-items:center;color:#ff655d;filter:drop-shadow(0 0 8px rgba(255,72,64,.8));pointer-events:none;animation:strike-direction-pulse 1.05s ease-out both}
         .strike-direction svg{width:28px;height:32px;fill:rgba(255,74,69,.55);stroke:#ffd1ca;stroke-width:1.4}
         @keyframes strike-direction-pulse{0%{opacity:0;scale:.8}16%{opacity:1;scale:1.1}70%{opacity:.9;scale:1}100%{opacity:0;scale:.88}}
         .strike-radar{position:absolute;right:clamp(16px,4vw,48px);top:112px;width:112px;height:112px;border:1px solid rgba(173,180,146,.42);border-radius:50%;background:rgba(13,17,14,.82);box-shadow:inset 0 0 18px rgba(173,180,146,.08),0 8px 24px rgba(0,0,0,.3);overflow:hidden}
         .strike-radar svg{width:100%;height:100%}
         .strike-radar-ring{fill:none;stroke:rgba(173,180,146,.22);stroke-width:.7}
         .strike-radar-line{stroke:rgba(173,180,146,.16);stroke-width:.7}
         .strike-radar-sweep{fill:none;stroke:rgba(173,190,115,.17);stroke-width:14;stroke-dasharray:22 100;transform-origin:50px 50px;animation:str-radar-sweep 5s linear infinite}
         @keyframes str-radar-sweep{to{transform:rotate(360deg)}}
         .strike-radar-player{fill:#d7dfab;stroke:#f3f5dd;stroke-width:1}
         .strike-radar-enemy{fill:#ff514c;stroke:#ffc3a5;stroke-width:.8;filter:drop-shadow(0 0 2px #ff4d48)}
         .strike-radar-treasure{fill:#ffd75e;stroke:#fff1b7;stroke-width:.8;filter:drop-shadow(0 0 3px #ffbf3f);animation:str-radar-treasure-pulse 1.4s ease-in-out infinite}
         @keyframes str-radar-treasure-pulse{50%{opacity:.52}}
         .strike-radar-label{position:absolute;left:50%;top:-1px;transform:translateX(-50%);font:600 7px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.08em;color:#c4c6a9;text-shadow:0 1px 4px #06131a}
          .strike-health-panel,.strike-ammo-panel{position:absolute;bottom:82px;min-height:60px;padding:9px 11px;border:1px solid rgba(180,176,145,.28);background:rgba(12,16,15,.82);box-shadow:0 8px 24px rgba(0,0,0,.3);pointer-events:none}
         .strike-health-panel{left:clamp(16px,4vw,48px);width:210px}
         .strike-ammo-panel{right:clamp(16px,4vw,48px);width:220px;text-align:right}
         .strike-panel-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;font:600 8px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.12em;color:#c0b997}
         .strike-health-value{font:700 14px var(--font-display,'Orbitron'),sans-serif;color:#dffbf4}
         .strike-health-track,.strike-reload-track{height:5px;margin-top:7px;background:rgba(210,235,236,.13);overflow:hidden}
         .strike-health-fill{height:100%;background:linear-gradient(90deg,#28b997,#8df1bd);transition:width .18s}
         .strike-health-fill.is-low{background:linear-gradient(90deg,#e94b52,#ffb26f)}
          .strike-armor-heading{display:flex;justify-content:space-between;margin-top:5px;color:#91a9c7;font:600 7px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.09em}
          .strike-armor-track{height:4px;margin-top:4px;background:rgba(210,235,236,.13);overflow:hidden}
          .strike-armor-fill{height:100%;background:linear-gradient(90deg,#628be8,#b6d9ff);transition:width .18s}
         .strike-ammo-count{margin-top:4px;font:700 18px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.05em;color:#eefbfc}
         .strike-ammo-count small{font-size:11px;color:#7294a0}
         .strike-reload-track{height:2px;margin-top:5px}
         .strike-reload-fill{width:0;height:100%;background:#c2b774}
         .strike-reload-track.is-reloading .strike-reload-fill{animation:str-reload-progress 1.45s linear both}
         @keyframes str-reload-progress{from{width:0}to{width:100%}}
         .strike-feed{position:absolute;left:clamp(16px,4vw,48px);top:82px;width:min(250px,42vw);display:grid;gap:5px;pointer-events:none}
         .strike-feed-item{padding:6px 9px;border-left:2px solid #ff776b;background:linear-gradient(90deg,rgba(13,25,33,.83),rgba(13,25,33,.12));color:#e8f1ee;font:600 8px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.08em;animation:str-feed-in .18s ease-out both}
         .strike-feed-item.is-headshot{border-color:#ffd087;color:#ffdda5}
         @keyframes str-feed-in{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        .strike-hit-feedback{position:absolute;z-index:3;left:50%;top:50%;display:grid;justify-items:center;gap:10px;transform:translate(-50%,-50%);pointer-events:none;animation:strike-hit-pop .72s ease-out both}
        .strike-hit-marker{width:30px;height:30px;overflow:visible;filter:drop-shadow(0 0 5px rgba(66,238,187,.6))}
        .strike-hit-marker path{fill:none;stroke:#79f4c6;stroke-width:2.4;stroke-linecap:round}
        .strike-hit-number{padding:4px 8px;border:1px solid rgba(115,244,198,.55);background:rgba(5,20,25,.78);color:#a4ffda;font:700 10px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.08em;text-shadow:0 0 10px rgba(91,242,191,.55);white-space:nowrap}
        .strike-hit-feedback.is-headshot .strike-hit-marker path{stroke:#ffd087}
        .strike-hit-feedback.is-headshot .strike-hit-number{border-color:rgba(255,208,135,.65);color:#ffdda5;text-shadow:0 0 10px rgba(255,184,98,.55)}
        .strike-hit-feedback.is-eliminated .strike-hit-number{background:rgba(47,24,20,.86)}
        @keyframes strike-hit-pop{0%{opacity:0;transform:translate(-50%,-38%) scale(.78)}14%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}65%{opacity:1;transform:translate(-50%,-58%) scale(1)}100%{opacity:0;transform:translate(-50%,-86%) scale(.96)}}
        .strike-bottom{position:absolute;left:clamp(16px,4vw,48px);right:clamp(16px,4vw,48px);bottom:clamp(16px,3vh,30px);display:flex;align-items:flex-end;justify-content:space-between}
        .strike-hint{font-size:11px;color:rgba(207,231,239,.72);letter-spacing:.04em;line-height:1.8}
        .strike-hint b{font:600 9px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.1em;color:#83d9e1;margin-right:6px}
        .strike-lock{pointer-events:auto;border:1px solid rgba(60,220,233,.5);background:rgba(7,25,38,.84);color:#dffbff;padding:11px 16px;font:600 10px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.1em;cursor:pointer;transition:background .2s,border-color .2s}
        .strike-lock:hover{background:rgba(17,67,82,.88);border-color:#72f0f5}
         .strike-back{pointer-events:auto;display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(144,203,218,.24);background:rgba(5,16,28,.68);color:#c6e2ea;padding:9px 12px;font:600 9px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.08em;cursor:pointer}
         .strike-back:hover{border-color:rgba(60,220,233,.55);color:#e9fbff}
         .strike-phase-layer{position:absolute;z-index:6;inset:0;display:grid;place-items:center;padding:max(10px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:rgba(3,10,18,.78);backdrop-filter:blur(7px);pointer-events:auto;overflow:auto;overscroll-behavior:contain}
         .strike-phase-card{box-sizing:border-box;width:min(520px,calc(100% - 28px));max-height:calc(100% - 20px);overflow:auto;padding:clamp(14px,3.5vw,38px);border:1px solid rgba(92,220,230,.38);background:linear-gradient(145deg,rgba(9,28,42,.98),rgba(6,14,27,.98));box-shadow:0 24px 90px rgba(0,0,0,.42);text-align:center}
         @media (orientation:landscape) and (max-height:600px){
           .strike-phase-layer{padding:8px 12px}
           .strike-phase-card{width:min(760px,calc(100% - 24px));max-height:calc(100% - 16px);padding:12px 20px}
           .strike-phase-kicker{font-size:8px}
           .strike-phase-title{margin:6px 0;font-size:clamp(17px,3.5vw,24px)}
           .strike-phase-copy{margin:6px auto 10px;font-size:11px;line-height:1.35}
           .strike-math-question{margin:8px 0;font-size:clamp(24px,6vw,42px);line-height:1.08}
           .strike-answer-grid{gap:7px}
           .strike-answer-button{min-height:42px;padding:8px;font-size:clamp(14px,2.6vw,18px)}
           .strike-supply-result{min-height:18px;margin:7px 0;font-size:11px}
         }
         .strike-phase-card.is-treasure-results{position:relative;border-color:rgba(255,215,112,.7);background:radial-gradient(ellipse at 50% -10%,rgba(211,151,60,.2),transparent 48%),linear-gradient(150deg,rgba(13,31,45,.99),rgba(6,14,27,.99));box-shadow:0 0 0 1px rgba(255,215,112,.12),0 0 48px rgba(225,166,63,.13),0 24px 90px rgba(0,0,0,.58);animation:str-result-arrive .55s cubic-bezier(.18,.8,.24,1) both}
         @keyframes str-result-arrive{from{opacity:0;transform:translateY(18px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
         .strike-result-sparkles{margin:0 0 8px;color:#ffd77c;font-size:16px;letter-spacing:.55em}
         .strike-result-medal{display:grid;place-items:center;width:70px;height:70px;margin:12px auto;border:1px solid rgba(255,224,145,.9);border-radius:22px;background:linear-gradient(145deg,#ffe9a7,#e69c37);box-shadow:0 5px 0 #9c6226,0 0 32px rgba(255,194,81,.26);font-size:36px;transform:rotate(-5deg)}
         .strike-result-rank{margin:8px 0;color:#ffe29b;font:800 clamp(19px,4.8vw,27px) var(--font-display,'Orbitron'),sans-serif;letter-spacing:.07em;text-shadow:0 0 24px rgba(255,203,104,.28)}
         .strike-result-copy{max-width:430px;margin:0 auto 13px;color:#b1c9d0;font-size:13px;line-height:1.55}
         .strike-result-chests{display:flex;justify-content:center;gap:8px;margin:15px 0 18px}
         .strike-result-chest{display:grid;place-items:center;width:42px;height:42px;border:1px solid rgba(171,195,206,.24);border-radius:10px;background:rgba(3,14,24,.7);color:#78909a;font-size:20px;filter:grayscale(1);opacity:.58}
         .strike-result-chest.is-earned{border-color:rgba(255,214,105,.72);background:linear-gradient(145deg,rgba(255,221,127,.23),rgba(122,76,26,.27));color:#ffe59b;filter:none;opacity:1;box-shadow:inset 0 0 15px rgba(255,195,73,.1),0 0 12px rgba(255,195,73,.12);animation:str-chest-pop .35s ease-out both}
         @keyframes str-chest-pop{from{transform:translateY(5px) scale(.8)}to{transform:translateY(0) scale(1)}}
         .strike-phase-card.is-treasure-results .strike-score-summary{margin:17px 0}
         .strike-phase-card.is-treasure-results .strike-score-cell{border-color:rgba(255,220,145,.2);background:rgba(3,14,24,.64)}
         .strike-phase-card.is-treasure-results .strike-score-value{color:#fff0c4}
         .strike-phase-card.is-arena-picker{width:min(1080px,calc(100vw - 28px));max-height:calc(100dvh - 24px);padding:clamp(15px,2.4vw,27px);border-color:rgba(111,224,255,.55);background:radial-gradient(ellipse at 9% 0%,rgba(27,136,174,.22),transparent 40%),radial-gradient(ellipse at 100% 100%,rgba(112,61,198,.19),transparent 42%),linear-gradient(145deg,rgba(7,19,37,.98),rgba(8,12,27,.99));text-align:left}
         .strike-arena-menu-button{display:inline-flex;align-items:center;gap:7px;min-height:34px;margin:0 0 12px;padding:7px 11px;border:1px solid rgba(144,203,218,.35);border-radius:7px;background:rgba(5,16,28,.72);color:#c6e2ea;font:600 8px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.08em;cursor:pointer}
         .strike-arena-menu-button:hover{border-color:rgba(60,220,233,.7);background:rgba(17,67,82,.6);color:#e9fbff}
         .strike-arena-menu-button:focus-visible{outline:2px solid #8fe3ec;outline-offset:2px}
         .strike-briefing-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
         .strike-briefing-kicker{display:flex;align-items:center;gap:9px;color:#8cecff;font:700 9px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.2em}
         .strike-briefing-emblem{display:grid;width:35px;height:35px;place-items:center;border:1px solid rgba(98,228,255,.45);border-radius:11px;background:linear-gradient(145deg,rgba(30,186,222,.28),rgba(108,70,211,.25));color:#b4f7ff;box-shadow:0 0 24px rgba(43,194,228,.18)}
         .strike-briefing-count{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid rgba(173,146,255,.35);border-radius:999px;background:rgba(107,73,203,.16);color:#d5c7ff;font:600 8px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.08em}
         .strike-briefing-title{margin:0;color:#f5fbff;font:800 clamp(23px,4vw,36px) var(--font-display,'Orbitron'),sans-serif;letter-spacing:.08em;text-shadow:0 0 28px rgba(83,198,255,.22)}
         .strike-briefing-lead{margin:5px 0 0;color:#9bb2cb;font-size:12px}
         .strike-briefing-layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(270px,.85fr);gap:16px;align-items:stretch}
         .strike-arena-side{display:grid;gap:10px;align-content:start}
         .strike-arena-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
         .strike-arena-option{position:relative;display:flex;min-height:96px;flex-direction:column;justify-content:flex-end;overflow:hidden;padding:12px;border:1px solid color-mix(in srgb,var(--arena-accent) 32%,rgba(166,198,226,.25));border-radius:12px;background:radial-gradient(ellipse at 88% 8%,color-mix(in srgb,var(--arena-accent) 42%,transparent),transparent 52%),linear-gradient(145deg,color-mix(in srgb,var(--arena-horizon) 58%,#10182b),rgba(8,15,28,.98));color:#effcff;text-align:left;cursor:pointer;isolation:isolate;transition:transform .2s,border-color .2s,box-shadow .2s}
         .strike-arena-option:before{position:absolute;z-index:-1;right:-12px;top:-30px;width:78px;height:78px;border:1px solid color-mix(in srgb,var(--arena-accent) 45%,transparent);border-radius:50%;content:"";box-shadow:0 0 0 10px color-mix(in srgb,var(--arena-accent) 9%,transparent),0 0 0 22px color-mix(in srgb,var(--arena-accent) 6%,transparent)}
         .strike-arena-option:hover{transform:translateY(-2px);border-color:var(--arena-accent);box-shadow:0 8px 22px color-mix(in srgb,var(--arena-accent) 16%,transparent)}
         .strike-arena-option[aria-pressed=true]{border-color:var(--arena-accent);background:radial-gradient(ellipse at 86% 12%,color-mix(in srgb,var(--arena-accent) 58%,transparent),transparent 57%),linear-gradient(145deg,color-mix(in srgb,var(--arena-horizon) 75%,#10182b),rgba(8,15,28,.98));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--arena-accent) 44%,transparent),0 0 22px color-mix(in srgb,var(--arena-accent) 24%,transparent)}
         .strike-arena-option:focus-visible,.strike-phase-button:focus-visible{outline:2px solid #fff;outline-offset:3px}
         .strike-arena-icon{position:absolute;right:11px;top:8px;font-size:22px;filter:drop-shadow(0 3px 8px rgba(0,0,0,.4))}
         .strike-arena-selected{position:absolute;left:8px;top:8px;padding:4px 6px;border:1px solid color-mix(in srgb,var(--arena-accent) 70%,white);border-radius:999px;background:rgba(5,13,25,.62);color:#fff;font:700 6px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.1em}
         .strike-arena-name{display:block;font:700 9px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.045em}
         .strike-arena-subtitle{display:block;margin-top:4px;color:color-mix(in srgb,var(--arena-accent) 55%,#d9f5ff);font-size:9px;line-height:1.2}
         .strike-arena-description{display:none}
         .strike-arena-showcase{position:relative;min-height:232px;overflow:hidden;border:1px solid color-mix(in srgb,var(--arena-accent) 57%,rgba(157,201,232,.4));border-radius:16px;background:linear-gradient(180deg,var(--arena-horizon),var(--arena-midday) 64%,var(--arena-ground));box-shadow:0 12px 34px rgba(0,0,0,.26),inset 0 0 50px rgba(4,10,26,.28);isolation:isolate;animation:strike-preview-arrive .35s ease-out both}
         @keyframes strike-preview-arrive{from{opacity:.55;transform:scale(.985)}to{opacity:1;transform:scale(1)}}
         .strike-arena-showcase:before{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(5,13,31,.02),transparent 70%,rgba(7,11,24,.12)),radial-gradient(ellipse at 50% 100%,color-mix(in srgb,var(--arena-accent) 32%,transparent),transparent 67%);content:""}
         .strike-arena-sun{position:absolute;right:13%;top:13%;width:48px;height:48px;border-radius:50%;background:color-mix(in srgb,var(--arena-accent) 78%,white);box-shadow:0 0 25px color-mix(in srgb,var(--arena-accent) 78%,transparent),0 0 70px color-mix(in srgb,var(--arena-accent) 38%,transparent)}
         .strike-arena-ridge{position:absolute;right:-8%;bottom:22%;width:75%;height:44%;border-radius:55% 0 0;background:linear-gradient(140deg,color-mix(in srgb,var(--arena-ground) 60%,#151d35),color-mix(in srgb,var(--arena-horizon) 60%,#10172b));transform:rotate(-8deg)}
         .strike-arena-ridge:before{position:absolute;left:-32%;bottom:-18%;width:72%;height:74%;border-radius:50% 50% 0 0;background:linear-gradient(160deg,color-mix(in srgb,var(--arena-ground) 76%,#18243a),#101729);content:""}
         .strike-arena-silhouette{position:absolute;bottom:17%;left:50%;display:flex;align-items:flex-end;gap:9px;transform:translateX(-50%)}
         .strike-arena-silhouette i{display:block;width:clamp(24px,4vw,43px);height:clamp(42px,8vw,82px);border:1px solid color-mix(in srgb,var(--arena-accent) 50%,rgba(255,255,255,.22));border-radius:5px 5px 0 0;background:linear-gradient(135deg,color-mix(in srgb,var(--arena-horizon) 70%,#1b2435),rgba(7,13,24,.9));box-shadow:inset 0 0 15px color-mix(in srgb,var(--arena-accent) 16%,transparent)}
         .strike-arena-silhouette i:nth-child(2){height:clamp(56px,10vw,106px)}
         .strike-arena-silhouette i:nth-child(3){height:clamp(34px,6vw,65px)}
         .strike-arena-showcase.is-ruins .strike-arena-silhouette i{border-radius:0;background:linear-gradient(90deg,rgba(8,12,23,.9) 22%,color-mix(in srgb,var(--arena-accent) 38%,#10172b) 23% 29%,rgba(8,12,23,.9) 30%);clip-path:polygon(0 13%,15% 13%,15% 0,38% 0,38% 17%,64% 17%,64% 5%,100% 5%,100% 100%,0 100%)}
         .strike-arena-showcase.is-arctic .strike-arena-silhouette i{border-radius:45% 45% 0 0;background:linear-gradient(145deg,#d9f4ff,#587991 70%,#273c50)}
         .strike-arena-showcase.is-jungle .strike-arena-silhouette i{width:clamp(30px,5vw,52px);border:0;border-radius:48% 48% 12% 12%;background:linear-gradient(90deg,#263f31,#9cb85a 52%,#33472c);clip-path:polygon(50% 0,100% 46%,78% 46%,100% 73%,70% 73%,91% 100%,8% 100%,30% 73%,0 73%,24% 46%,0 46%)}
         .strike-arena-intel-column{display:grid;min-width:0;gap:9px;align-content:start}
         .strike-arena-location{position:absolute;left:15px;top:14px;display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:rgba(8,13,26,.48);color:#f7fbff;font:600 8px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.08em;backdrop-filter:blur(8px)}
         .strike-arena-preview-icon{position:absolute;right:17px;bottom:12px;font-size:42px;filter:drop-shadow(0 5px 12px rgba(0,0,0,.45))}
         .strike-arena-intel{padding:12px 14px;border:1px solid rgba(147,171,231,.18);border-radius:12px;background:linear-gradient(125deg,rgba(53,61,112,.25),rgba(20,29,53,.54))}
         .strike-arena-intel-label{display:flex;align-items:center;gap:6px;color:#9db6ff;font:700 8px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.14em}
         .strike-arena-intel h3{margin:7px 0 4px;color:#f3f5ff;font:700 14px var(--font-display,'Orbitron'),sans-serif}
         .strike-arena-intel p{margin:0;color:#c1cde0;font-size:11px;line-height:1.5}
         .strike-arena-tactic{display:flex;gap:8px;margin-top:9px;padding-top:9px;border-top:1px solid rgba(174,190,224,.13);color:#d7e5f7;font-size:10px;line-height:1.45}
         .strike-arena-tactic svg{flex:0 0 auto;color:var(--arena-accent)}
         .strike-rules{padding:12px;border:1px solid rgba(141,155,255,.24);border-radius:14px;background:linear-gradient(145deg,rgba(28,38,77,.48),rgba(11,20,39,.72));box-shadow:inset 0 1px rgba(255,255,255,.04)}
         .strike-rules-title{display:flex;align-items:center;gap:8px;margin:0 0 9px;color:#eef2ff;font:700 9px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.13em}
         .strike-rules-title svg{color:#c0a3ff}
         .strike-rules-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:0;padding:0;list-style:none}
         .strike-rule{display:flex;align-items:flex-start;gap:7px;padding:8px;border:1px solid rgba(169,188,225,.1);border-radius:9px;background:rgba(6,14,29,.48);color:#c0cee1;font-size:10px;line-height:1.4}
         .strike-rule svg{flex:0 0 auto;margin-top:1px;color:#8ee9ff}
         .strike-rule:nth-child(2) svg{color:#ffc86b}
         .strike-rule:nth-child(3) svg{color:#a7f28a}
         .strike-rule:nth-child(4) svg{color:#ff879d}
         .strike-rule:nth-child(5) svg{color:#c3a2ff}
         .strike-rule:nth-child(6) svg{color:#69e8db}
         .strike-arena-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:8px;margin-top:10px}
         .strike-arena-actions .strike-phase-button{min-height:46px;margin-top:0;border:1px solid rgba(96,235,255,.7);border-radius:10px;background:linear-gradient(105deg,#087ea0,#4957c9 58%,#853cca);box-shadow:0 8px 22px rgba(41,106,223,.27);font-size:10px}
         .strike-arena-actions .strike-phase-button:hover{filter:brightness(1.16)}
         .strike-arena-actions .strike-phase-button.is-secondary{border-color:rgba(179,197,225,.25);background:rgba(26,35,55,.8);box-shadow:none}
         .strike-phase-button:disabled{opacity:.5;cursor:wait}
         @media(max-width:740px){.strike-phase-card.is-arena-picker{overflow:auto}.strike-briefing-layout{grid-template-columns:1fr}.strike-arena-showcase{min-height:165px}.strike-arena-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.strike-arena-option{min-height:82px;padding:10px}.strike-rules{padding:10px}}
         @media(max-width:480px){.strike-briefing-head{margin-bottom:9px}.strike-briefing-emblem{width:29px;height:29px}.strike-briefing-title{font-size:21px}.strike-briefing-lead{font-size:10px}.strike-briefing-count{padding:6px 8px;font-size:7px}.strike-briefing-layout{gap:9px}.strike-arena-grid{gap:7px}.strike-arena-option{min-height:74px;padding:8px}.strike-arena-name{font-size:8px}.strike-arena-subtitle{font-size:8px}.strike-arena-icon{right:7px;top:5px;font-size:17px}.strike-arena-showcase{min-height:132px}.strike-arena-sun{width:34px;height:34px}.strike-arena-preview-icon{font-size:32px}.strike-arena-intel{padding:9px 10px}.strike-arena-intel h3{font-size:12px}.strike-arena-intel p{font-size:10px}.strike-rules-list{grid-template-columns:1fr 1fr;gap:5px}.strike-rule{gap:5px;padding:6px;font-size:9px}.strike-rule svg{width:13px;height:13px}.strike-arena-actions{gap:6px;margin-top:8px}.strike-arena-actions .strike-phase-button{min-height:41px;padding:8px 5px;font-size:8px}}
         .strike-phase-kicker{color:#73d9df;font:600 9px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.2em;text-transform:uppercase}
         .strike-phase-title{margin:10px 0 8px;color:#effcff;font:700 clamp(22px,5vw,30px) var(--font-display,'Orbitron'),sans-serif;letter-spacing:.09em}
         .strike-phase-copy{margin:0 auto 20px;max-width:420px;color:#a8c5d0;font-size:14px;line-height:1.6}
         .strike-math-question{margin:18px 0 22px;color:#fff;font:700 clamp(32px,8vw,52px) var(--font-display,'Orbitron'),sans-serif;letter-spacing:.06em}
         .strike-answer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
         .strike-answer-button,.strike-phase-button{min-height:58px;border:1px solid rgba(91,210,220,.45);background:rgba(15,45,60,.82);color:#effcff;font:700 17px var(--font-display,'Orbitron'),sans-serif;cursor:pointer;touch-action:manipulation}
         .strike-answer-button:hover,.strike-phase-button:hover{border-color:#82f3eb;background:rgba(21,82,91,.88)}
         .strike-answer-button:disabled{opacity:.56;cursor:default}
         .strike-phase-button{width:100%;margin-top:12px;padding:12px 16px;font-size:11px;letter-spacing:.1em}
         .strike-phase-button.is-secondary{border-color:rgba(170,194,206,.25);background:rgba(11,23,34,.82);color:#c6dce4}
         .strike-supply-result{min-height:26px;margin:18px 0 6px;color:#9ff2d6;font-size:14px;font-weight:700}
         .strike-score-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:22px 0}
         .strike-score-cell{padding:14px 8px;border:1px solid rgba(144,203,218,.2);background:rgba(3,14,24,.7)}
         .strike-score-label{color:#8bb1bf;font:600 8px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.12em}
         .strike-score-value{margin-top:7px;color:#f1ffff;font:700 22px var(--font-display,'Orbitron'),sans-serif}
        .strike-mobile-control{position:absolute;z-index:1;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none}
        .strike-stick{width:118px;height:118px;border:1px solid rgba(157,224,231,.32);border-radius:50%;background:rgba(9,24,38,.32);left:25px;bottom:34px;display:grid;place-items:center}
        .strike-stick:before{content:"";position:absolute;inset:13px;border:1px solid rgba(157,224,231,.14);border-radius:50%}
        .strike-knob{position:absolute;width:43px;height:43px;border:1px solid rgba(105,231,237,.72);border-radius:50%;background:rgba(28,122,137,.48);box-shadow:0 0 16px rgba(39,207,217,.18)}
          .strike-look{right:0;top:0;bottom:0;width:50%;z-index:0;pointer-events:auto;touch-action:none}
          .strike-right-look-stick{position:absolute;width:108px;height:108px;display:grid;place-items:center;transform:translate(-50%,-50%);border:1px solid rgba(157,224,231,.48);border-radius:50%;background:rgba(9,24,38,.56);pointer-events:none}
          .strike-right-look-stick:before{content:"";position:absolute;inset:13px;border:1px solid rgba(157,224,231,.2);border-radius:50%}
          .strike-right-look-knob{position:absolute;width:42px;height:42px;border:1px solid rgba(105,231,237,.82);border-radius:50%;background:rgba(28,122,137,.66);box-shadow:0 0 16px rgba(39,207,217,.24)}
         .strike-action{display:grid;place-items:center;border:1px solid rgba(105,210,220,.58);background:rgba(7,25,38,.88);color:#dffbff;font:700 8px var(--font-display,'Orbitron'),sans-serif;letter-spacing:.04em;box-shadow:0 5px 14px rgba(0,0,0,.24)}
         .strike-action:active,.strike-action.is-active{border-color:#70f2df;background:rgba(15,83,83,.92);color:#f1fffb}
         .strike-action:disabled{opacity:.4;filter:saturate(.45)}
         .strike-action small{font:500 6px var(--font-body,'Exo 2'),sans-serif;letter-spacing:.08em;color:#82aeba}
         .strike-jump{right:87px;bottom:26px;width:56px;height:56px;border-radius:50%}
         .strike-fire{right:18px;bottom:20px;width:62px;height:62px;border-radius:50%;border-color:rgba(255,102,124,.76);background:rgba(76,17,36,.9);color:#ffe5e9;font-size:9px}
         .strike-aim{right:18px;bottom:94px;width:62px;height:44px}
         .strike-reload{right:88px;bottom:94px;width:58px;height:44px}
         .strike-switch{right:152px;bottom:94px;width:58px;height:44px}
         .strike-sprint{left:145px;bottom:29px;width:62px;height:54px}
          .strike-turn{right:18px;top:50%;width:62px;height:46px;transform:translateY(-50%);border-radius:50%;font-size:7px}
         @media(max-width:600px){
           .strike-top{left:12px;right:12px;gap:7px}
           .strike-brand{gap:7px}
           .strike-back{padding:7px 8px;font-size:8px}
           .strike-logo{width:56px;height:17px}
           .strike-title{font-size:10px}
           .strike-subtitle{display:none}
           .strike-status{font-size:7px;padding:7px 6px;letter-spacing:.04em}
            .strike-header-actions{gap:4px}
            .strike-header-button{min-height:30px;padding:5px 6px;font-size:6px;letter-spacing:.04em}
            .strike-quality-control{top:62px;right:12px}
            .strike-settings-toggle{padding:6px 7px;font-size:7px}
            .strike-settings-panel{width:min(232px,calc(100vw - 24px));padding:10px}
           .strike-radar{right:13px;top:105px;width:92px;height:92px}
           .strike-feed{top:78px;left:12px;width:min(185px,49vw)}
           .strike-feed-item{padding:5px 7px;font-size:7px}
            .strike-health-panel,.strike-ammo-panel{bottom:162px;width:min(42vw,170px);min-height:60px;padding:7px 8px}
           .strike-health-panel{left:12px}
           .strike-ammo-panel{right:12px}
           .strike-panel-heading{font-size:7px;letter-spacing:.08em}
           .strike-health-value{font-size:12px}
           .strike-ammo-count{font-size:16px}
           .strike-ammo-count small{font-size:9px}
           .strike-bottom{bottom:12px}
           .strike-hint{max-width:48%;font-size:9px}
           .strike-stick{left:18px;bottom:22px;width:108px;height:108px}
            .strike-look{top:0;bottom:0}
           .strike-jump{right:87px;bottom:23px;width:56px;height:56px}
           .strike-fire{right:18px;bottom:20px;width:62px;height:62px}
           .strike-aim{right:18px;bottom:94px;width:62px;height:44px}
           .strike-reload{right:88px;bottom:94px;width:58px;height:44px}
           .strike-switch{right:152px;bottom:94px;width:58px;height:44px}
           .strike-sprint{left:145px;bottom:29px;width:62px;height:54px}
  .strike-turn{right:14px;width:58px;height:44px}
  }
@media (orientation: landscape) and (max-height: 700px){
 .strike-radar{top:82px;right:14px;width:72px;height:72px}
    .strike-radar-label{font-size:6px}
  }
  @media(max-width:380px){
           .strike-logo{width:46px;height:14px}
           .strike-brand{gap:5px}
           .strike-title{font-size:9px}
           .strike-status{font-size:6px;padding:6px 5px}
            .strike-header-actions{gap:3px}
            .strike-header-button{padding:5px 4px;font-size:5px}
           .strike-switch{right:145px;width:52px}
           .strike-sprint{left:132px;width:56px}
         }
         @media(orientation:landscape) and (max-height:500px){
           .strike-stick{left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));width:100px;height:100px}
         }
        @media(orientation:landscape) and (max-height:700px){.strike-phase-layer{padding:6px 10px}.strike-phase-card:not(.is-arena-picker){width:min(420px,calc(100% - 20px));max-height:calc(100% - 12px);padding:6px 10px;border-radius:14px;overflow:hidden}.strike-question-kicker{font-size:8px}.strike-phase-title{margin:4px 0;font-size:clamp(15px,3.2vw,20px)}.strike-math-question{margin:3px 0 5px;font-size:clamp(18px,4.8vw,28px)}.strike-answer-grid{gap:6px}.strike-answer-button{min-height:30px;padding:4px 6px;font-size:clamp(12px,2.1vw,15px)}.strike-feedback{min-height:14px;margin-top:5px;font-size:10px}}
        @media(prefers-reduced-motion:reduce){.strike-lock{transition:none}.strike-phase-card.is-treasure-results,.strike-result-chest.is-earned{animation:none}}
      `}</style>
      <div ref={mountRef} className="absolute inset-0" />
      <div className="strike-hud">
        <div className="strike-atmosphere-vignette" aria-hidden="true" />
        <header className="strike-top">
          <div className="strike-brand">
            <button
              className="strike-back"
              onClick={openArenaPicker}
              disabled={gamePhase !== "combat" && gamePhase !== "paused" && gamePhase !== "treasure-complete" && gamePhase !== "gameover" && gamePhase !== "complete"}
              aria-label="Pilih lokasi atau tempat perang"
              title="Pilih lokasi perang"
            >
              <MapPin size={14} /> PILIH LOKASI
            </button>
            <svg className="strike-logo" viewBox="188 414 648 160" role="img" aria-label="Logo Numatik">
              <defs>
                <filter id="numatik-hud-ink" colorInterpolationFilters="sRGB" x="-10%" y="-10%" width="120%" height="120%">
                  <feColorMatrix values="0 0 0 0 0.38 0 0 0 0 0.81 0 0 0 0 0.86 -0.2126 -0.7152 -0.0722 0 1" />
                </filter>
              </defs>
              <image href="/logo-numatik.png" x="0" y="0" width="1024" height="1024" preserveAspectRatio="xMidYMid meet" filter="url(#numatik-hud-ink)" />
            </svg>
            <div><div className="strike-title">STRIKE</div><div className="strike-subtitle">{ARENAS.find((arena) => arena.id === selectedArena)?.name} · Misi 5 peti</div></div>
          </div>
          <div className="strike-header-actions">
            <div className="strike-status" role="status" aria-live="polite">
              <i />MUSUH {enemyCount}/{STARTING_ENEMIES} <span>·</span> PETI {treasuresFound}/{TREASURE_COUNT} <span>·</span> SKOR {String(score).padStart(3, "0")}
            </div>
            <button
              className="strike-header-button"
              onClick={() => pauseGameRef.current?.()}
              disabled={gamePhase !== "combat"}
              aria-label="Jeda permainan"
            >JEDA</button>
            <button
              className="strike-header-button"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? "Aktifkan suara" : "Matikan suara"}
            >{muted ? "SUARA MATI" : "SUARA AKTIF"}</button>
          </div>
        </header>
        {damageFlashId > 0 && <div key={damageFlashId} className="strike-damage-vignette" aria-hidden="true" />}
        {incomingDirection && (
          <div
            key={incomingDirection.id}
            className="strike-direction"
            style={{ transform: `translate(-50%,-50%) rotate(${incomingDirection.angle}deg) translateY(-min(31vh,250px))` }}
            aria-label="Arah tembakan musuh"
          >
            <svg viewBox="0 0 32 36" aria-hidden="true"><path d="M16 1 29 34 16 27 3 34Z" /></svg>
          </div>
        )}
        {hitFeedback && (
          <div
            key={hitFeedback.id}
            className={`strike-hit-feedback${hitFeedback.headshot ? " is-headshot" : ""}${hitFeedback.eliminated ? " is-eliminated" : ""}`}
            role="status"
            aria-live="polite"
          >
            <svg className="strike-hit-marker" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M4 4l7 7m10 10l7 7M28 4l-7 7M11 21l-7 7" />
            </svg>
            <span className="strike-hit-number">
              −{hitFeedback.damage}
              {hitFeedback.headshot ? " · HEADSHOT" : ""}
              {hitFeedback.eliminated ? " · ELIMINATED" : ""}
            </span>
          </div>
        )}
        {killFeed.length > 0 && (
          <div className="strike-feed" role="log" aria-live="polite" aria-label="Kill feed">
            {killFeed.map((item) => (
              <div key={item.id} className={`strike-feed-item${item.headshot ? " is-headshot" : ""}`}>{item.label}</div>
            ))}
          </div>
        )}
        <div className="strike-quality-control">
          <button
            className="strike-settings-toggle"
            type="button"
            aria-expanded={settingsOpen}
            aria-controls="strike-settings-panel"
            onClick={() => setSettingsOpen((open) => !open)}
          >PENGATURAN</button>
          <section
            className="strike-settings-panel"
            id="strike-settings-panel"
            aria-label="Pengaturan permainan"
            hidden={!settingsOpen}
          >
            <div className="strike-settings-row">
              <label htmlFor="strike-quality">KUALITAS</label>
              <select
                id="strike-quality"
                value={quality}
                onChange={(event) => {
                  const nextQuality = event.target.value as QualitySetting;
                  setQuality(nextQuality);
                  applyQualitySetting(nextQuality);
                }}
              >
                <option value="low">Rendah</option>
                <option value="medium">Sedang</option>
                <option value="high">Tinggi</option>
              </select>
            </div>
            <div className="strike-audio-state" role="status">Audio: {audioState}</div>
            <label className="strike-audio-settings">
              <span>Teriakan musuh</span>
              <input
                type="checkbox"
                checked={enemyScreamsEnabled}
                onChange={(event) => toggleEnemyScreams(event.currentTarget.checked)}
              />
            </label>
            <label className="strike-audio-settings">
              <span>Getar</span>
              <input
                type="checkbox"
                checked={hapticsEnabled}
                onChange={(event) => toggleHaptics(event.currentTarget.checked)}
              />
            </label>
            <fieldset>
              <legend>Kecerahan</legend>
              <div className="strike-brightness-options" role="group" aria-label="Kecerahan">
                {(Object.keys(BRIGHTNESS_PRESETS) as BrightnessSetting[]).map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={brightness === level}
                    onClick={() => {
                      setBrightness(level);
                      applyBrightnessSetting(level);
                    }}
                  >{BRIGHTNESS_PRESETS[level].label}</button>
                ))}
              </div>
            </fieldset>
            {mobile && renderTouchControlSettings("settings")}
          </section>
        </div>
        <div className="strike-radar" aria-label="Radar musuh dan peti harta karun">
          <span className="strike-radar-label">RADAR</span>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="strike-radar-sweep" cx="50" cy="50" r="40" />
            <circle className="strike-radar-ring" cx="50" cy="50" r="44" />
            <circle className="strike-radar-ring" cx="50" cy="50" r="27" />
            <circle className="strike-radar-ring" cx="50" cy="50" r="11" />
            <path className="strike-radar-line" d="M50 6v88M6 50h88" />
            {radarContacts.map((contact) => (
              <circle key={contact.id} className="strike-radar-enemy" cx={contact.x} cy={contact.y} r="2.6" />
            ))}
            {radarTreasureContacts.map((contact) => (
              <circle key={`treasure-${contact.id}`} className="strike-radar-treasure" cx={contact.x} cy={contact.y} r="3.2" />
            ))}
            <path className="strike-radar-player" d="M50 43 46 56 50 53 54 56Z" />
          </svg>
        </div>
        <section className="strike-health-panel" aria-label={`HP ${playerHealth} persen, armor ${playerArmor} persen`}>
          <div className="strike-panel-heading"><span>VITAL · HP</span><span className="strike-health-value">{playerHealth}%</span></div>
          <div className="strike-health-track">
            <div className={`strike-health-fill${playerHealth <= 30 ? " is-low" : ""}`} style={{ width: `${playerHealth}%` }} />
          </div>
          <div className="strike-armor-heading"><span>ARMOR</span><span>{playerArmor}%</span></div>
          <div className="strike-armor-track"><div className="strike-armor-fill" style={{ width: `${playerArmor}%` }} /></div>
        </section>
        <section className="strike-ammo-panel" aria-label={`${WEAPON_CONFIG[activeWeapon].label}, magazen ${ammo[activeWeapon].magazine}, cadangan ${ammo[activeWeapon].reserve}`}>
          <div className="strike-panel-heading">
            <span>{WEAPON_CONFIG[activeWeapon].label}</span>
            <span>{isReloading ? "ISI ULANG" : aiming ? "BIDIK" : sprinting ? "SPRINT" : "SIAP"}</span>
          </div>
          <div className="strike-ammo-count">{ammo[activeWeapon].magazine}<small> / {ammo[activeWeapon].reserve}</small></div>
          <div className={`strike-reload-track${isReloading ? " is-reloading" : ""}`}>
            <div className="strike-reload-fill" style={{ animationDuration: `${WEAPON_CONFIG[activeWeapon].reloadDuration}ms` }} />
          </div>
        </section>
        <div
          className={`strike-reticle${aiming ? " is-aiming" : ""}`}
          style={{ "--crosshair-gap": `${crosshairGap}px` } as CSSProperties}
          aria-hidden="true"
        >
          <span className="reticle-top" /><span className="reticle-right" />
          <span className="reticle-bottom" /><span className="reticle-left" />
          <span className="reticle-center" />
        </div>
        {!mobile && <footer className="strike-bottom">
          <div className="strike-hint">
            <b>W A S D</b> gerak &nbsp; <b>SHIFT</b> sprint &nbsp; <b>Q</b> ganti senjata &nbsp; <b>P</b> jeda<br />
            <b>KLIK KIRI</b> tembak otomatis &nbsp; <b>KLIK KANAN</b> bidik &nbsp; <b>R</b> isi ulang &nbsp; <b>SPACE</b> lompat
          </div>
          <button className="strike-lock" onClick={() => {
            unlockAudioRef.current?.();
            const canvas = mountRef.current?.querySelector("canvas");
            canvas?.requestPointerLock?.();
          }}>{locked ? "MOUSE TERKUNCI · KLIK KIRI TEMBAK" : "KLIK UNTUK MULAI · KLIK KIRI TEMBAK"}</button>
        </footer>}
        {mobile && <>
          <div
            className="strike-mobile-control strike-stick"
            aria-label="Joystick gerak"
            onPointerDown={onJoystickPointerDown}
            onPointerMove={(event) => { if (joystickPointer.current === event.pointerId) updateJoystick(event); }}
            onPointerUp={clearJoystick}
            onPointerCancel={clearJoystick}
            onLostPointerCapture={clearJoystick}
          >
            <span className="strike-knob" style={{ transform: `translate(${joystick.x * 29}px, ${-joystick.y * 29}px)` }} />
          </div>
          <div
            className="strike-mobile-control strike-look"
            aria-label={touchLookMode === "swipe" ? "Geser untuk melihat" : "Joystick kanan untuk melihat"}
            onPointerDown={onTouchLookStart}
            onPointerMove={onTouchLookMove}
            onPointerUp={onTouchLookEnd}
            onPointerCancel={onTouchLookEnd}
            onLostPointerCapture={onTouchLookEnd}
          >
            {touchLookMode === "right-stick" && rightLookStick && (
              <div
                className="strike-right-look-stick"
                style={{ left: rightLookStick.x, top: rightLookStick.y }}
                aria-hidden="true"
              >
                <span
                  className="strike-right-look-knob"
                  style={{ transform: `translate(${rightLookStick.dx}px, ${rightLookStick.dy}px)` }}
                />
              </div>
            )}
          </div>
          {showTurnAroundButton && (
            <button
              className="strike-mobile-control strike-action strike-turn"
              onPointerDown={startTurnAround}
              onPointerUp={endTurnAround}
              onPointerCancel={endTurnAround}
              onLostPointerCapture={endTurnAround}
              aria-label="Putar kamera 180 derajat"
            >PUTAR<small>180°</small></button>
          )}
          <button
            className="strike-mobile-control strike-jump"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              jumpRequested.current = true;
            }}
            aria-label="Lompat"
          >LOMPAT</button>
          <button
            className="strike-mobile-control strike-fire"
            onPointerDown={startMobileFire}
            onPointerUp={stopMobileFire}
            onPointerCancel={stopMobileFire}
            onLostPointerCapture={stopMobileFire}
            aria-label="Tembak prajurit"
          >TEMBAK</button>
          <button
            className={`strike-mobile-control strike-action strike-aim${aiming ? " is-active" : ""}`}
            onClick={toggleAim}
            aria-label={aiming ? "Matikan bidik" : "Bidik"}
            aria-pressed={aiming}
          >BIDIK</button>
          <button
            className="strike-mobile-control strike-action strike-reload"
            onClick={() => reloadWeaponRef.current?.()}
            aria-label="Isi ulang magazen"
            disabled={isReloading || ammo[activeWeapon].magazine >= WEAPON_CONFIG[activeWeapon].magazineSize || ammo[activeWeapon].reserve <= 0}
          >ISI ULANG</button>
          <button
            className="strike-mobile-control strike-action strike-switch"
            onClick={() => swapWeaponRef.current?.()}
            aria-label={`Ganti senjata ke ${activeWeapon === "rifle" ? "pistol" : "senapan serbu"}`}
          >GANTI<small>Q</small></button>
          <button
            className={`strike-mobile-control strike-action strike-sprint${mobileSprintHeld ? " is-active" : ""}`}
            onPointerDown={startMobileSprint}
            onPointerUp={stopMobileSprint}
            onPointerCancel={stopMobileSprint}
            onLostPointerCapture={stopMobileSprint}
            aria-label="Sprint"
            aria-pressed={mobileSprintHeld}
          >LARI</button>
        </>}
        {(gamePhase === "supply" || gamePhase === "treasure") && supplyQuestion && (
          <div className="strike-phase-layer">
            <section className="strike-phase-card" role="dialog" aria-modal="true" aria-labelledby="strike-supply-title">
              <div className="strike-phase-kicker">
                {gamePhase === "treasure" ? `Misi peti harta karun · peti ${Math.min(treasuresFound + 1, TREASURE_COUNT)} dari ${TREASURE_COUNT}` : `Wave ${wave} selesai · supply drop`}
              </div>
              <h2 className="strike-phase-title" id="strike-supply-title">
                {gamePhase === "treasure" ? "JAWAB UNTUK MEMBUKA PETI" : "JAWAB UNTUK MEMBUKA SUPLAI"}
              </h2>
              <p className="strike-phase-copy">
                {gamePhase === "treasure"
                  ? "Temukan semua 5 peti yang ditandai di radar. Jawab soal matematika untuk membuka setiap peti."
                  : "Pilih jawaban yang benar. Hadiah benar berupa amunisi, HP penuh, atau armor."}
              </p>
              <div className="strike-math-question" aria-label={`Soal: ${supplyQuestion.prompt}`}>{supplyQuestion.prompt}</div>
              <div className="strike-answer-grid">
                {supplyQuestion.options.map((option) => (
                  <button
                    key={option}
                    className="strike-answer-button"
                    onClick={() => answerSupplyRef.current?.(option)}
                    disabled={supplyMessage !== null}
                    aria-label={`Jawaban ${option}`}
                  >{option}</button>
                ))}
              </div>
              <div className="strike-supply-result" role="status" aria-live="polite">{supplyMessage}</div>
              {supplyMessage !== null && (
                <button className="strike-phase-button" onClick={() => nextWaveRef.current?.()}>
                  {gamePhase === "treasure"
                    ? treasureAnswerCorrect
                      ? treasuresFound >= TREASURE_COUNT && enemyCount === 0 ? "SELESAIKAN MISI" : "LANJUTKAN MISI"
                      : "COBA LAGI"
                    : `LANJUT KE WAVE ${wave + 1}`}
                </button>
              )}
            </section>
          </div>
        )}
        {gamePhase === "arena-select" && (
          <div className="strike-phase-layer">
            <section
              className="strike-phase-card is-arena-picker"
              role="dialog"
              aria-modal="true"
              aria-labelledby="strike-arena-title"
              aria-describedby="strike-arena-lead"
            >
              <button
                className="strike-arena-menu-button"
                type="button"
                onClick={() => navigate(-1)}
              >KEMBALI KE MENU</button>
              <header className="strike-briefing-head">
                <div className="strike-briefing-kicker">
                  <span className="strike-briefing-emblem"><Crosshair size={19} /></span>
                  BRIEFING NUMATIK STRIKE
                </div>
                <span className="strike-briefing-count"><MapPin size={13} /> {ARENAS.length} MEDAN OPERASI</span>
              </header>
              <h2 className="strike-briefing-title" id="strike-arena-title">PILIH MEDAN TEMPUR</h2>
              <p className="strike-briefing-lead" id="strike-arena-lead">Pilih lokasi, pelajari taktik, lalu pimpin operasi.</p>
              <div className="strike-briefing-layout">
                <div className="strike-arena-side">
                  <div className="strike-arena-grid" role="group" aria-label="Pilihan lokasi perang">
                    {ARENAS.map((arena) => (
                      <button
                        key={arena.id}
                        className="strike-arena-option"
                        type="button"
                        style={{
                          "--arena-accent": arena.accent,
                          "--arena-horizon": arena.horizon,
                        } as CSSProperties}
                        aria-pressed={pendingArena === arena.id}
                        onClick={() => setPendingArena(arena.id)}
                      >
                        {pendingArena === arena.id && <span className="strike-arena-selected">DIPILIH</span>}
                        <span className="strike-arena-icon" aria-hidden="true">{arena.icon}</span>
                        <span className="strike-arena-name">{arena.name}</span>
                        <span className="strike-arena-subtitle">{arena.terrain}</span>
                      </button>
                    ))}
                  </div>
                  <section className="strike-rules" aria-labelledby="strike-rules-title">
                    <h3 className="strike-rules-title" id="strike-rules-title"><Shield size={15} /> PERATURAN OPERASI</h3>
                    <ul className="strike-rules-list">
                      <li className="strike-rule"><Trophy size={15} /><span>Kalahkan 10 musuh dan temukan 5 peti untuk menuntaskan misi.</span></li>
                      <li className="strike-rule"><Crosshair size={15} /><span>Dekati peti lalu jawab soal matematika untuk membukanya.</span></li>
                      <li className="strike-rule"><Package size={15} /><span>Selesaikan soal supply drop untuk mendapat amunisi, HP, atau armor.</span></li>
                      <li className="strike-rule"><HeartPulse size={15} /><span>Jaga HP tetap di atas nol, berlindung, dan isi ulang senjata.</span></li>
                      <li className="strike-rule"><Keyboard size={15} /><span>Laptop: WASD gerak · mouse bidik · klik kiri tembak · R isi ulang · Q senjata · P jeda.</span></li>
                      <li className="strike-rule"><Hand size={15} /><span>Layar sentuh: joystick untuk bergerak, tombol aksi untuk bertempur.</span></li>
                    </ul>
                  </section>
                </div>
                <aside className="strike-arena-intel-column" style={arenaPreviewStyle}>
                  <div
                    key={previewArena.id}
                    className={`strike-arena-showcase is-${previewArena.id}`}
                    role="img"
                    aria-label={`Pratinjau suasana ${previewArena.name}`}
                  >
                    <span className="strike-arena-sun" />
                    <span className="strike-arena-location"><MapPin size={12} /> PRATINJAU MEDAN</span>
                    <span className="strike-arena-ridge" />
                    <span className="strike-arena-silhouette" aria-hidden="true"><i /><i /><i /></span>
                    <span className="strike-arena-preview-icon" aria-hidden="true">{previewArena.icon}</span>
                  </div>
                  <section className="strike-arena-intel" aria-live="polite">
                    <div className="strike-arena-intel-label"><Crosshair size={13} /> INTEL MEDAN</div>
                    <h3>{previewArena.name}</h3>
                    <p>{previewArena.subtitle}. {previewArena.description}</p>
                    <div className="strike-arena-tactic"><Shield size={15} /><span><strong>Taktik:</strong> {previewArena.tactic}</span></div>
                  </section>
                </aside>
              </div>
              <div className="strike-arena-actions">
                <button className="strike-phase-button" onClick={applyArenaSelection}>
                  {hasStartedGame.current
                    ? pendingArena === selectedArena ? "MULAI ULANG MISI" : "PILIH ARENA & MULAI"
                    : `MULAI OPERASI · ${previewArena.name.toUpperCase()}`}
                </button>
                {hasStartedGame.current && (
                  <button className="strike-phase-button is-secondary" onClick={closeArenaPicker}>BATAL</button>
                )}
              </div>
            </section>
          </div>
        )}
        {gamePhase === "paused" && (
          <div className="strike-phase-layer">
            <section className="strike-phase-card" role="dialog" aria-modal="true" aria-labelledby="strike-pause-title">
              <div className="strike-phase-kicker">Permainan dijeda</div>
              <h2 className="strike-phase-title" id="strike-pause-title">PAUSE</h2>
              <p className="strike-phase-copy">Skor saat ini: {score}. Lanjutkan permainan atau kembali ke menu.</p>
              <div className="strike-audio-state" role="status">Audio: {audioState}</div>
              {mobile && renderTouchControlSettings("pause")}
              <button className="strike-phase-button is-secondary" onClick={openArenaPicker}>PILIH LOKASI PERANG</button>
              <button className="strike-phase-button" onClick={() => resumeGameRef.current?.()}>LANJUT BERMAIN</button>
              <button className="strike-phase-button is-secondary" onClick={() => navigate(-1)}>KEMBALI KE MENU</button>
            </section>
          </div>
        )}
        {gamePhase === "treasure-complete" && (
          <div className="strike-phase-layer">
            <section className="strike-phase-card is-treasure-results" role="dialog" aria-modal="true" aria-labelledby="strike-treasure-complete-title">
              <div className="strike-result-sparkles" aria-hidden="true">✦ ✧ ✦</div>
              <div className="strike-phase-kicker">DEBRIEF OPERASI · SELURUH PETI DIAMANKAN</div>
              <div className="strike-result-medal" aria-hidden="true">{treasureRank.emoji}</div>
              <h2 className="strike-result-rank" id="strike-treasure-complete-title">{treasureRank.title}</h2>
              <p className="strike-result-copy">{treasureRank.description}</p>
              <div className="strike-result-chests" role="img" aria-label={`${treasureCorrectAnswers} dari ${TREASURE_COUNT} peti dijawab benar pada percobaan pertama`}>
                {Array.from({ length: TREASURE_COUNT }, (_, index) => (
                  <span key={index} className={`strike-result-chest${index < treasureCorrectAnswers ? " is-earned" : ""}`} aria-hidden="true">
                    {index < treasureCorrectAnswers ? "🪙" : "🔒"}
                  </span>
                ))}
              </div>
              <div className="strike-score-summary">
                <div className="strike-score-cell">
                  <div className="strike-score-label">SKOR PERTANYAAN</div>
                  <div className="strike-score-value">{treasureQuizScore} / {TREASURE_COUNT * TREASURE_CORRECT_POINTS}</div>
                </div>
                <div className="strike-score-cell">
                  <div className="strike-score-label">BENAR PERTAMA KALI</div>
                  <div className="strike-score-value">{treasureCorrectAnswers} / {TREASURE_COUNT}</div>
                </div>
                <div className="strike-score-cell">
                  <div className="strike-score-label">JAWABAN SALAH · {TREASURE_WRONG_POINTS} POIN</div>
                  <div className="strike-score-value">{treasureWrongAnswers}</div>
                </div>
                <div className="strike-score-cell">
                  <div className="strike-score-label">SKOR TOTAL OPERASI</div>
                  <div className="strike-score-value">{score}</div>
                </div>
              </div>
              <button className="strike-phase-button" onClick={() => nextWaveRef.current?.()}>
                {enemyCount === 0 ? "SELESAIKAN MISI" : "LANJUTKAN OPERASI"}
              </button>
              <button className="strike-phase-button is-secondary" onClick={openArenaPicker}>PILIH LOKASI</button>
            </section>
          </div>
        )}
        {(gamePhase === "gameover" || gamePhase === "complete") && (
          <div className="strike-phase-layer">
            <section className="strike-phase-card" role="dialog" aria-modal="true" aria-labelledby="strike-gameover-title">
              <div className="strike-phase-kicker">
                {gamePhase === "complete" ? "Semua musuh dikalahkan dan 5 peti ditemukan" : "Operasi berakhir"}
              </div>
              <h2 className="strike-phase-title" id="strike-gameover-title">
                {gamePhase === "complete" ? "Misi Selesai" : "GAME OVER"}
              </h2>
              <div className="strike-score-summary">
                <div className="strike-score-cell"><div className="strike-score-label">SKOR</div><div className="strike-score-value">{score}</div></div>
                <div className="strike-score-cell"><div className="strike-score-label">SKOR TERTINGGI</div><div className="strike-score-value">{bestScore}</div></div>
              </div>
              <button className="strike-phase-button" onClick={() => restartGameRef.current?.()}>MAIN LAGI</button>
              <button className="strike-phase-button is-secondary" onClick={openArenaPicker}>PILIH LOKASI PERANG</button>
              <button className="strike-phase-button is-secondary" onClick={() => navigate(-1)}>KEMBALI KE MENU</button>
            </section>
          </div>
        )}
      </div>
    </main>
  );
};

export default GamePage;
