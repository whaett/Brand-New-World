// ==========================================
// KONFIGURACJA I STAŁE GRY (BRAND NEW WORLD v1.5)
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const VERSION = "1.5";
const SCALE = 2.5; 
const TILE_SIZE = 20; 

const MAP_WIDTH = 1650;
const MAP_HEIGHT = 240;
const SEA_LEVEL = 64;

// Wymiary małego świata (Żołądka Czerwia)
const STOMACH_WIDTH = 38;
const STOMACH_HEIGHT = 24;

// Zbalansowana, żwawsza fizyka (stałe tempo)
const GRAVITY = 0.185; 
const MAX_FALL_SPEED = 13; 
const CAMERA_SPEED = 0.125; 
const REGEN_TIME = 160; 

const HOTBAR_SLOTS = 5;
const MAX_HOTBAR_SLOTS = 5;
const INV_SLOTS = 20;

const BLOCKS = { 
    AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, WOOD: 4, LEAVES: 5, DIAMOND: 6, 
    SAND: 7, CACTUS: 8, WATER: 9, KELP: 10, CORAL_PINK: 11, CORAL_CYAN: 12, CORAL_GOLD: 13,
    FLESH: 14, BONE: 15, ACID: 16, STOMACH_WALL: 17, OPUNTIA: 18
};

const BLOCK_NAMES = {
    [BLOCKS.DIRT]: "Ziemia",
    [BLOCKS.GRASS]: "Trawa",
    [BLOCKS.STONE]: "Kamień",
    [BLOCKS.WOOD]: "Drewno",
    [BLOCKS.LEAVES]: "Liście",
    [BLOCKS.DIAMOND]: "Diament",
    [BLOCKS.SAND]: "Piasek",
    [BLOCKS.CACTUS]: "Kaktus",
    [BLOCKS.WATER]: "Woda",
    [BLOCKS.KELP]: "Wodorosty",
    [BLOCKS.CORAL_PINK]: "Różowy Koral",
    [BLOCKS.CORAL_CYAN]: "Błękitny Koral",
    [BLOCKS.CORAL_GOLD]: "Złoty Koral",
    [BLOCKS.FLESH]: "Tkanka Żołądka",
    [BLOCKS.BONE]: "Kość",
    [BLOCKS.ACID]: "Kwas Żołądkowy",
    [BLOCKS.STOMACH_WALL]: "Ściana Żołądka",
    [BLOCKS.OPUNTIA]: "Owoc Opuncji"
};

const COLORS = {
    [BLOCKS.AIR]: '#87CEEB', 
    [BLOCKS.DIRT]: '#8B4513', 
    [BLOCKS.GRASS]: '#228B22',
    [BLOCKS.STONE]: '#808080', 
    [BLOCKS.WOOD]: '#8B5A2B', 
    [BLOCKS.LEAVES]: '#006400', 
    [BLOCKS.DIAMOND]: '#00FFFF',
    [BLOCKS.SAND]: '#F4A460', 
    [BLOCKS.CACTUS]: '#2E8B57',
    [BLOCKS.WATER]: 'rgba(28, 118, 214, 0.55)',
    [BLOCKS.KELP]: '#1E7A3A',
    [BLOCKS.CORAL_PINK]: '#FF5C8A',
    [BLOCKS.CORAL_CYAN]: '#00D2FF',
    [BLOCKS.CORAL_GOLD]: '#FFB703',
    [BLOCKS.FLESH]: '#9B2226',
    [BLOCKS.BONE]: '#E9D8A6',
    [BLOCKS.ACID]: 'rgba(132, 204, 22, 0.78)',
    [BLOCKS.STOMACH_WALL]: '#3B0910',
    [BLOCKS.OPUNTIA]: '#E11D48'
};

// Przyspieszone, dobrze wyważone czasy kopania bloków (v1.5)
const BLOCK_HARDNESS = {
    [BLOCKS.AIR]: 0, 
    [BLOCKS.WATER]: 0,
    [BLOCKS.ACID]: 0,
    [BLOCKS.KELP]: 7,
    [BLOCKS.LEAVES]: 9, 
    [BLOCKS.DIRT]: 17, 
    [BLOCKS.GRASS]: 17,
    [BLOCKS.SAND]: 17, 
    [BLOCKS.FLESH]: 17,
    [BLOCKS.CACTUS]: 21, 
    [BLOCKS.CORAL_PINK]: 25,
    [BLOCKS.CORAL_CYAN]: 25,
    [BLOCKS.CORAL_GOLD]: 25,
    [BLOCKS.WOOD]: 36, 
    [BLOCKS.BONE]: 40,
    [BLOCKS.STONE]: 75, 
    [BLOCKS.DIAMOND]: 125,
    [BLOCKS.STOMACH_WALL]: 999999,
    [BLOCKS.OPUNTIA]: 7
};

// Stan globalny wejścia, czatu, komend i gry
let playerNick = "";
let isMultiplayerMode = false;
let isPlaying = false;
let isCommandOpen = false;
let systemMessage = "";
let systemMessageColor = "#ffffff";
let systemMessageTimer = 0;

let mouseX = 0, mouseY = 0;
let isClicking = false, isRightClicking = false;
let buildTimer = 0;
let pvpHitCooldown = 0;
let miningX = -1, miningY = -1, miningProgress = 0, pickaxeSwing = 0;
let globalTick = 0;
const keys = {};

// ==========================================
// CYKL DNIA I NOCY (PORY DNIA ZMIENIAJĄCE SIĘ CO KILKA MINUT)
// ==========================================
// Pełny cykl dobowy (24h w grze) trwa 6 minut (360 sekund), czyli nowa pora dnia nastaje co ok. 1.5 minuty!
const DAY_CYCLE_DURATION_MS = 360 * 1000;
let worldTime = 0.34; // Start ok. godziny 08:10 rano (słoneczny poranek/dzień)
let lastTimeUpdateMs = performance.now();
let currentDayPhaseName = 'day'; // 'sunrise' | 'day' | 'sunset' | 'night'

function getDayPhaseId(t) {
    if (t >= 0.21 && t < 0.31) return 'sunrise';
    if (t >= 0.31 && t < 0.69) return 'day';
    if (t >= 0.69 && t < 0.81) return 'sunset';
    return 'night';
}

function getDayPhaseDisplayInfo(t) {
    let totalMinutes = Math.floor(((t % 1 + 1) % 1) * 24 * 60);
    let hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    let mm = String(totalMinutes % 60).padStart(2, '0');
    let clockStr = `${hh}:${mm}`;
    let phase = getDayPhaseId(t);
    if (phase === 'sunrise') return { icon: '🌅', label: 'Wschód słońca', clock: clockStr, color: '#fb923c' };
    if (phase === 'day')     return { icon: '☀️', label: 'Dzień',         clock: clockStr, color: '#fde047' };
    if (phase === 'sunset')  return { icon: '🌇', label: 'Zachód słońca', clock: clockStr, color: '#f97316' };
    return { icon: '🌙', label: 'Noc', clock: clockStr, color: '#93c5fd' };
}

function showSystemNotification(msg, color = "#ffeb3b", duration = 210, alsoLogToChat = true) {
    systemMessage = msg;
    systemMessageColor = color;
    systemMessageTimer = duration;
    if (alsoLogToChat && typeof addChatMessage === 'function') {
        let msgType = 'system';
        if (color === '#ff5252' || color === '#ef4444') msgType = 'error';
        else if (color === '#4caf50' || color === '#22c55e') msgType = 'success';
        addChatMessage(null, msg, msgType);
    }
}
