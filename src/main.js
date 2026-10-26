import './style.css';
import Matter from 'matter-js';
import { saveScore, getTopScores, createRoom, joinRoom, listenToRoom, updateRoomState, sendPunishment } from './firebase.js';

// --- Audio System (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playDropSound(isAnimal = false) {
  if (audioCtx.state === 'suspended') return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  if (isAnimal) {
    // Cute high-pitch animal squeak/pop
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.05);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.1);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  } else {
    // Juicy fruit bloop
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(560, now + 0.06);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.12);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  }
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

function playMergeSound(tier, isAnimal = false) {
  if (audioCtx.state === 'suspended') return;
  const now = audioCtx.currentTime;
  
  const baseFreq = 340 + Math.min(tier, 15) * 45;
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc1.type = isAnimal ? 'triangle' : 'sine';
  osc1.frequency.setValueAtTime(baseFreq, now);
  osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.22);
  
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(baseFreq * 2, now);
  osc2.frequency.exponentialRampToValueAtTime(baseFreq * 2.5, now + 0.25);
  
  gain.gain.setValueAtTime(0.22, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  
  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.3);
  osc2.stop(now + 0.3);
}

function playImpactSound(intensity = 1) {
  if (audioCtx.state === 'suspended') return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
  
  const vol = Math.min(0.12, 0.03 * intensity);
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.08);
}

let bgmGain = null;
let bgmInterval = null;
function startBGM() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (bgmInterval) return;
  
  bgmGain = audioCtx.createGain();
  bgmGain.gain.value = 0.04;
  bgmGain.connect(audioCtx.destination);
  
  const chords = [
    [261.63, 329.63, 392.00, 523.25], // C
    [220.00, 261.63, 329.63, 440.00], // Am
    [174.61, 220.00, 261.63, 349.23], // F
    [196.00, 246.94, 293.66, 392.00]  // G
  ];
  let chordIdx = 0;
  
  bgmInterval = setInterval(() => {
    if (isGameOver) return;
    const currentChord = chords[chordIdx];
    currentChord.forEach((note, i) => {
      const osc = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = note;
      
      const startTime = audioCtx.currentTime + i * 0.06;
      noteGain.gain.setValueAtTime(0.03, startTime);
      noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.4);
      
      osc.connect(noteGain);
      noteGain.connect(bgmGain);
      osc.start(startTime);
      osc.stop(startTime + 1.4);
    });
    chordIdx = (chordIdx + 1) % chords.length;
  }, 2200);
}

// --- Layout & Container Configuration ---
let GAME_WIDTH = Math.min(window.innerWidth, 500);
let GAME_HEIGHT = window.innerHeight;

// Boundaries inside the canvas
const BOX_PADDING_X = Math.max(16, GAME_WIDTH * 0.05);
const BOX_LEFT = BOX_PADDING_X;
const BOX_RIGHT = GAME_WIDTH - BOX_PADDING_X;
const BOX_WIDTH = BOX_RIGHT - BOX_LEFT;
const BOX_BOTTOM = GAME_HEIGHT - Math.max(22, GAME_HEIGHT * 0.04);
const TOP_LIMIT = GAME_HEIGHT * 0.22;
const AIM_Y = TOP_LIMIT - 36;
const WALL_THICKNESS = 60;

const scaleFactor = Math.min(1.15, Math.max(0.75, BOX_WIDTH / 360));

// --- THEME DEFINITIONS ---
const THEME_FRUITS = [
  { name: "Arándano", radius: 13 * scaleFactor, color: '#3b82f6', points: 1 },
  { name: "Cereza", radius: 17 * scaleFactor, color: '#f43f5e', points: 3 },
  { name: "Fresa", radius: 23 * scaleFactor, color: '#fb7185', points: 6 },
  { name: "Uva", radius: 29 * scaleFactor, color: '#a855f7', points: 10 },
  { name: "Limón", radius: 36 * scaleFactor, color: '#eab308', points: 15 },
  { name: "Mandarina", radius: 44 * scaleFactor, color: '#f97316', points: 21 },
  { name: "Naranja", radius: 53 * scaleFactor, color: '#ea580c', points: 28 },
  { name: "Manzana", radius: 63 * scaleFactor, color: '#84cc16', points: 36 },
  { name: "Durazno", radius: 74 * scaleFactor, color: '#f472b6', points: 45 },
  { name: "Pitahaya", radius: 85 * scaleFactor, color: '#ec4899', points: 55 },
  { name: "Coco", radius: 96 * scaleFactor, color: '#b45309', points: 66 },
  { name: "Piña", radius: 108 * scaleFactor, color: '#f59e0b', points: 78 },
  { name: "Melón", radius: 120 * scaleFactor, color: '#10b981', points: 90 },
  { name: "Sandía", radius: 134 * scaleFactor, color: '#16a34a', points: 110 },
  { name: "Aguacate", radius: 142 * scaleFactor, color: '#84cc16', points: 140 },
  { name: "Plátano", radius: 149 * scaleFactor, color: '#fde047', points: 175 },
  { name: "Kiwi", radius: 155 * scaleFactor, color: '#65a30d', points: 215 },
  { name: "Hongo", radius: 161 * scaleFactor, color: '#ef4444', points: 260 },
  { name: "Flor", radius: 167 * scaleFactor, color: '#f472b6', points: 310 },
  { name: "Estrella", radius: 173 * scaleFactor, color: '#eab308', points: 370 },
];

const THEME_ANIMALS = [
  { name: "Huevo", radius: 12 * scaleFactor, color: '#fef3c7', points: 1 },
  { name: "Pollito", radius: 16 * scaleFactor, color: '#fde047', points: 3 },
  { name: "Conejito", radius: 22 * scaleFactor, color: '#ffffff', points: 6 },
  { name: "Gallina", radius: 29 * scaleFactor, color: '#b45309', points: 10 },
  { name: "Chanchito", radius: 37 * scaleFactor, color: '#f472b6', points: 15 },
  { name: "Perrito Husky", radius: 46 * scaleFactor, color: '#334155', points: 21 },
  { name: "Ovejita", radius: 56 * scaleFactor, color: '#f8fafc', points: 28 },
  { name: "Vaquita", radius: 68 * scaleFactor, color: '#ffffff', points: 36 },
  { name: "Caballito", radius: 80 * scaleFactor, color: '#92400e', points: 45 },
  { name: "Alpaca", radius: 93 * scaleFactor, color: '#fef9c3', points: 55 },
  { name: "Osito", radius: 107 * scaleFactor, color: '#78350f', points: 66 },
  { name: "Leoncito", radius: 121 * scaleFactor, color: '#f59e0b', points: 78 },
  { name: "Elefantito", radius: 135 * scaleFactor, color: '#94a3b8', points: 95 },
  { name: "Ballenita", radius: 148 * scaleFactor, color: '#3b82f6', points: 120 },
];

// Active Theme state
let currentTheme = localStorage.getItem('suika_theme') || 'fruits'; // 'fruits' | 'animals'
function getActiveItems() {
  return currentTheme === 'animals' ? THEME_ANIMALS : THEME_FRUITS;
}

let engine, render, runner;
let currentScore = 0;
let nextFruitTier = 0;
let isGameOver = false;
let isDropping = false;

// Aiming & Input State
let isPointerDown = false;
let aimX = GAME_WIDTH / 2;
let targetAimX = GAME_WIDTH / 2;

// Particles & VFX System
const particles = [];
const shockwaves = [];
const floatingTexts = [];

// Multiplayer State
let isMultiplayer = false;
let roomCode = null;
let isPlayer1 = false;
let unsubscribeRoom = null;
let pendingPunishments = 0;
let localPunishmentCount = 0;

// DOM Elements
const scoreEl = document.getElementById('score');
const nextPreviewEl = document.getElementById('next-fruit-preview');
const gameOverScreen = document.getElementById('game-over-screen');
const startScreen = document.getElementById('start-screen');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-button');
const gameContainer = document.getElementById('game-container');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeToggleIcon = document.getElementById('theme-toggle-icon');
const themeToggleLabel = document.getElementById('theme-toggle-label');

// Multiplayer DOM
const playSoloBtn = document.getElementById('play-solo-btn');
const playMultiBtn = document.getElementById('play-multi-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const backToMenuBtn = document.getElementById('back-to-menu-btn');
const modeSelection = document.getElementById('mode-selection');
const multiplayerLobby = document.getElementById('multiplayer-lobby');
const waitingRoom = document.getElementById('waiting-room');
const roomCodeDisplay = document.getElementById('room-code-display');
const opponentScoreContainer = document.getElementById('opponent-score-container');
const opponentScoreEl = document.getElementById('opponent-score');

// --- Initialization ---
function init() {
  applyThemeUI();

  engine = Matter.Engine.create({
    positionIterations: 8,
    velocityIterations: 8,
  });
  
  render = Matter.Render.create({
    element: gameContainer,
    engine: engine,
    options: {
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      wireframes: false,
      background: 'transparent'
    }
  });

  const wallOptions = { 
    isStatic: true,
    render: { visible: false },
    restitution: 0.2,
    friction: 0.1
  };
  
  const ground = Matter.Bodies.rectangle(
    (BOX_LEFT + BOX_RIGHT) / 2, 
    BOX_BOTTOM + WALL_THICKNESS / 2, 
    BOX_WIDTH + WALL_THICKNESS * 2, 
    WALL_THICKNESS, 
    wallOptions
  );
  
  const leftWall = Matter.Bodies.rectangle(
    BOX_LEFT - WALL_THICKNESS / 2, 
    (TOP_LIMIT + BOX_BOTTOM) / 2, 
    WALL_THICKNESS, 
    BOX_BOTTOM - TOP_LIMIT + WALL_THICKNESS, 
    wallOptions
  );
  
  const rightWall = Matter.Bodies.rectangle(
    BOX_RIGHT + WALL_THICKNESS / 2, 
    (TOP_LIMIT + BOX_BOTTOM) / 2, 
    WALL_THICKNESS, 
    BOX_BOTTOM - TOP_LIMIT + WALL_THICKNESS, 
    wallOptions
  );

  Matter.World.add(engine.world, [ground, leftWall, rightWall]);
  Matter.Events.on(engine, 'collisionStart', handleCollisions);

  setupInput();
  setupMultiplayerUI();
  setupThemeControls();

  Matter.Render.run(render);
  runner = Matter.Runner.create();
  Matter.Runner.run(runner, engine);
  Matter.Events.on(render, 'afterRender', gameLoop);
}

// --- Theme Management ---
function applyThemeUI() {
  document.body.className = `theme-${currentTheme}`;
  localStorage.setItem('suika_theme', currentTheme);

  if (themeToggleIcon && themeToggleLabel) {
    if (currentTheme === 'fruits') {
      themeToggleIcon.innerText = '🐮';
      themeToggleLabel.innerText = 'Granja';
    } else {
      themeToggleIcon.innerText = '🍉';
      themeToggleLabel.innerText = 'Frutas';
    }
  }

  // Update Start screen active card
  const fruitCard = document.getElementById('select-theme-fruits');
  const animalCard = document.getElementById('select-theme-animals');
  if (fruitCard && animalCard) {
    fruitCard.classList.toggle('active', currentTheme === 'fruits');
    animalCard.classList.toggle('active', currentTheme === 'animals');
  }
}

function switchTheme(newTheme) {
  if (currentTheme === newTheme) return;
  currentTheme = newTheme;
  applyThemeUI();
  rollNextFruit();
}

function setupThemeControls() {
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const target = currentTheme === 'fruits' ? 'animals' : 'fruits';
      switchTheme(target);
    });
  }

  const fruitCard = document.getElementById('select-theme-fruits');
  const animalCard = document.getElementById('select-theme-animals');
  if (fruitCard) {
    fruitCard.addEventListener('click', () => switchTheme('fruits'));
  }
  if (animalCard) {
    animalCard.addEventListener('click', () => switchTheme('animals'));
  }
}

// --- Multiplayer Logic ---
function setupMultiplayerUI() {
  playSoloBtn.addEventListener('click', () => {
    isMultiplayer = false;
    startGame();
  });

  playMultiBtn.addEventListener('click', () => {
    modeSelection.classList.add('hidden');
    multiplayerLobby.classList.remove('hidden');
  });

  backToMenuBtn.addEventListener('click', () => {
    multiplayerLobby.classList.add('hidden');
    modeSelection.classList.remove('hidden');
  });

  createRoomBtn.addEventListener('click', async () => {
    roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    isPlayer1 = true;
    isMultiplayer = true;
    
    createRoomBtn.innerText = 'Creando...';
    const success = await createRoom(roomCode);
    if (success) {
      multiplayerLobby.classList.add('hidden');
      waitingRoom.classList.remove('hidden');
      roomCodeDisplay.innerText = roomCode;
      
      unsubscribeRoom = listenToRoom(roomCode, (data) => {
        if (data.status === 'playing') {
          startGame();
        }
      });
    }
  });

  joinRoomBtn.addEventListener('click', async () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length !== 4) return alert("Código inválido");
    
    joinRoomBtn.innerText = 'Uniéndose...';
    roomCode = code;
    isPlayer1 = false;
    isMultiplayer = true;
    
    const success = await joinRoom(code);
    if (success) {
      startGame();
    } else {
      alert("No se encontró la sala o ya está llena.");
      joinRoomBtn.innerText = 'Unirse a Sala';
    }
  });
}

function startGame() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  startScreen.classList.add('hidden');
  
  if (isMultiplayer) {
    opponentScoreContainer.classList.remove('hidden');
    if (unsubscribeRoom) unsubscribeRoom();
    unsubscribeRoom = listenToRoom(roomCode, (data) => {
      if (data.status === 'player1_lost' && !isPlayer1) {
        triggerWin();
        return;
      }
      if (data.status === 'player2_lost' && isPlayer1) {
        triggerWin();
        return;
      }

      const opponentData = isPlayer1 ? data.player2 : data.player1;
      const myData = isPlayer1 ? data.player1 : data.player2;
      
      if (opponentData) {
        opponentScoreEl.innerText = opponentData.score;
      }
      if (myData && myData.punishments > localPunishmentCount) {
        const newPunishments = myData.punishments - localPunishmentCount;
        pendingPunishments += newPunishments;
        localPunishmentCount = myData.punishments;
      }
    });
  }

  resetGame();
}

function resetGame() {
  isGameOver = false;
  currentScore = 0;
  pendingPunishments = 0;
  updateScore();
  
  const bodies = Matter.Composite.allBodies(engine.world);
  const itemsToRemove = bodies.filter(b => b.fruitTier !== undefined || b.isRock);
  Matter.World.remove(engine.world, itemsToRemove);
  
  gameOverScreen.classList.add('hidden');
  rollNextFruit();
  startBGM();
}

function rollNextFruit() {
  const activeItems = getActiveItems();
  nextFruitTier = Math.floor(Math.random() * Math.min(5, activeItems.length));
  
  nextPreviewEl.innerHTML = '';
  const previewCanvas = document.createElement('canvas');
  const boxSize = 60; 
  previewCanvas.width = boxSize;
  previewCanvas.height = boxSize;
  const ctx = previewCanvas.getContext('2d');
  
  ctx.translate(boxSize / 2, boxSize / 2);
  const next = activeItems[nextFruitTier];
  
  const maxR = (boxSize / 2) - 6;
  const scale = next.radius > maxR ? maxR / next.radius : 1;
  ctx.scale(scale, scale);
  
  if (currentTheme === 'animals') {
    drawChubbyAnimal(ctx, nextFruitTier, next.radius);
  } else {
    drawJuicyFruit(ctx, nextFruitTier, next.radius);
  }
  
  nextPreviewEl.appendChild(previewCanvas);
}

function updateScore() {
  scoreEl.innerText = currentScore;
  if (isMultiplayer) {
    updateRoomState(roomCode, isPlayer1, { score: currentScore });
  }
}

// --- Drop & Collision Logic ---
function dropCurrentItem() {
  if (isGameOver || isDropping) return;
  
  const activeItems = getActiveItems();
  const config = activeItems[nextFruitTier] || activeItems[0];
  const spawnX = Math.max(BOX_LEFT + config.radius + 2, Math.min(aimX, BOX_RIGHT - config.radius - 2));
  
  if (pendingPunishments > 0) {
    dropRock(spawnX);
    pendingPunishments--;
    return;
  }
  
  const body = Matter.Bodies.circle(spawnX, AIM_Y + 10, config.radius, {
    restitution: 0.22,
    friction: 0.12,
    render: { visible: false },
  });

  body.fruitTier = nextFruitTier;
  body.themeAtSpawn = currentTheme;
  body.spawnTime = performance.now();
  body.squashFactor = 0.2;
  body.squashAngle = Math.PI / 2;
  body.blinkTimer = Math.random() * 200 + 100;
  
  Matter.World.add(engine.world, body);
  playDropSound(currentTheme === 'animals');
  
  isDropping = true;
  setTimeout(() => {
    isDropping = false;
    rollNextFruit();
  }, 650);
}

function dropRock(x) {
  const radius = 28 * scaleFactor;
  const spawnX = Math.max(BOX_LEFT + radius + 2, Math.min(x, BOX_RIGHT - radius - 2));
  const body = Matter.Bodies.circle(spawnX, AIM_Y + 10, radius, {
    restitution: 0.05,
    friction: 0.5,
    density: 0.006,
    render: { visible: false },
  });
  body.isRock = true;
  Matter.World.add(engine.world, body);
  playImpactSound(2.5);
  
  isDropping = true;
  setTimeout(() => {
    isDropping = false;
  }, 500);
}

function handleCollisions(event) {
  const pairs = event.pairs;
  const activeItems = getActiveItems();

  for (let i = 0; i < pairs.length; i++) {
    const bodyA = pairs[i].bodyA;
    const bodyB = pairs[i].bodyB;

    // Elastic squash on collision
    const relSpeed = Matter.Vector.magnitude(Matter.Vector.sub(bodyA.velocity, bodyB.velocity));
    if (relSpeed > 1.8) {
      const impactAngle = Math.atan2(bodyB.position.y - bodyA.position.y, bodyB.position.x - bodyA.position.x);
      if (bodyA.fruitTier !== undefined) {
        bodyA.squashFactor = Math.min(0.35, relSpeed * 0.035);
        bodyA.squashAngle = impactAngle;
        bodyA.squashPhase = 0;
      }
      if (bodyB.fruitTier !== undefined) {
        bodyB.squashFactor = Math.min(0.35, relSpeed * 0.035);
        bodyB.squashAngle = impactAngle + Math.PI / 2;
        bodyB.squashPhase = 0;
      }
      if (relSpeed > 3.5) playImpactSound(relSpeed * 0.2);
    }

    // Merge logic
    if (bodyA.fruitTier !== undefined && bodyB.fruitTier !== undefined) {
      if (bodyA.fruitTier === bodyB.fruitTier) {
        if (bodyA.fruitTier === activeItems.length - 1) continue;

        const isAInWorld = Matter.Composite.get(engine.world, bodyA.id, 'body');
        const isBInWorld = Matter.Composite.get(engine.world, bodyB.id, 'body');
        
        if (isAInWorld && isBInWorld) {
          const nextTier = bodyA.fruitTier + 1;
          const newConfig = activeItems[nextTier];
          
          const newX = (bodyA.position.x + bodyB.position.x) / 2;
          const newY = (bodyA.position.y + bodyB.position.y) / 2;

          Matter.World.remove(engine.world, [bodyA, bodyB]);

          const newBody = Matter.Bodies.circle(newX, newY, newConfig.radius, {
            restitution: 0.22,
            friction: 0.12,
            render: { visible: false }
          });
          newBody.fruitTier = nextTier;
          newBody.themeAtSpawn = currentTheme;
          newBody.spawnTime = performance.now();
          newBody.blinkTimer = Math.random() * 200 + 100;

          Matter.World.add(engine.world, newBody);
          playMergeSound(nextTier, currentTheme === 'animals');
          
          spawnMergeVFX(newX, newY, newConfig);
          
          currentScore += newConfig.points;
          updateScore();

          if (isMultiplayer && nextTier >= 7) {
            sendPunishment(roomCode, isPlayer1);
          }
        }
      }
    }
  }
}

// --- Particle & VFX Engine ---
function spawnMergeVFX(x, y, config) {
  // 1. Shockwave Ring
  shockwaves.push({
    x, y,
    radius: config.radius * 0.6,
    maxRadius: config.radius * 2.2,
    alpha: 0.9,
    color: currentTheme === 'animals' ? '#fef08a' : '#ffffff'
  });

  // 2. Cloud Puffs / Wool Feathers
  const puffColors = currentTheme === 'animals'
    ? ['#fef08a', '#fde047', '#fed7aa', '#f8fafc', '#bbf7d0']
    : ['#f472b6', '#fb7185', '#fda4af', '#fbcfe8', '#a7f3d0'];

  for (let i = 0; i < 14; i++) {
    const angle = (Math.PI * 2 * i) / 14 + (Math.random() - 0.5) * 0.4;
    const speed = Math.random() * 3.5 + 2.0;
    particles.push({
      type: 'puff',
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      size: Math.random() * 12 + 10,
      color: puffColors[Math.floor(Math.random() * puffColors.length)],
      alpha: 0.95,
      life: 0,
      maxLife: Math.random() * 18 + 24
    });
  }

  // 3. Stars / Leaves
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1.5;
    particles.push({
      type: 'sparkle',
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2.5,
      rot: Math.random() * Math.PI,
      vRot: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 7 + 5,
      color: currentTheme === 'animals' ? '#fbbf24' : '#4ade80',
      alpha: 1,
      life: 0,
      maxLife: Math.random() * 20 + 25
    });
  }

  // 4. Floating +Points Text
  floatingTexts.push({
    x, y: y - config.radius * 0.5,
    text: `+${config.points}`,
    color: config.color,
    alpha: 1,
    scale: 0.5,
    life: 0,
    maxLife: 45
  });
}

function updateAndDrawVFX(ctx) {
  // Shockwaves
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.radius += (s.maxRadius - s.radius) * 0.18;
    s.alpha *= 0.88;
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${s.alpha})`;
    ctx.lineWidth = 4 * s.alpha;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();

    if (s.alpha < 0.05) shockwaves.splice(i, 1);
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life++;
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.94;
    p.vy = p.vy * 0.94 + 0.12;
    p.alpha = Math.max(0, 1 - p.life / p.maxLife);

    ctx.save();
    ctx.globalAlpha = p.alpha;
    
    if (p.type === 'puff') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - (p.life / p.maxLife) * 0.3), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'sparkle') {
      ctx.translate(p.x, p.y);
      p.rot += p.vRot;
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      const r = p.size;
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.quadraticCurveTo(0, 0, 0, r);
      ctx.quadraticCurveTo(0, 0, -r, 0);
      ctx.quadraticCurveTo(0, 0, 0, -r);
      ctx.fill();
    }
    ctx.restore();

    if (p.life >= p.maxLife) particles.splice(i, 1);
  }

  // Floating text
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.life++;
    ft.y -= 1.2;
    ft.scale = Math.min(1.2, ft.scale + 0.1);
    ft.alpha = Math.max(0, 1 - ft.life / ft.maxLife);

    ctx.save();
    ctx.globalAlpha = ft.alpha;
    ctx.translate(ft.x, ft.y);
    ctx.scale(ft.scale, ft.scale);
    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeText(ft.text, 0, 0);
    ctx.fillStyle = currentTheme === 'animals' ? '#b45309' : '#ea580c';
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();

    if (ft.life >= ft.maxLife) floatingTexts.splice(i, 1);
  }
}

// --- Container Rendering: Glass (Fruits) vs Rustic Wood (Animals) ---
function drawContainer(ctx) {
  ctx.save();

  if (currentTheme === 'animals') {
    // 3D Rustic Farm Wooden Pen (Matching the screenshots!)
    const postWidth = 18;
    const postHeight = BOX_BOTTOM - TOP_LIMIT + 20;

    // Soft grassy transparent back
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(BOX_LEFT, TOP_LIMIT, BOX_WIDTH, BOX_BOTTOM - TOP_LIMIT);

    // Left Wooden Beam Post
    drawWoodPost(ctx, BOX_LEFT - postWidth / 2, TOP_LIMIT - 10, postWidth, postHeight);
    // Right Wooden Beam Post
    drawWoodPost(ctx, BOX_RIGHT - postWidth / 2, TOP_LIMIT - 10, postWidth, postHeight);

    // Bottom Wooden Sill/Beam
    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(BOX_LEFT - 8, BOX_BOTTOM - 4, BOX_WIDTH + 16, 18, 6);
    ctx.fill();
    ctx.stroke();

    // Wood plank highlight
    ctx.fillStyle = 'rgba(254, 215, 170, 0.35)';
    ctx.fillRect(BOX_LEFT - 4, BOX_BOTTOM - 2, BOX_WIDTH + 8, 4);

  } else {
    // 3D Glass Box (Crystal Aquarium)
    const boxHeight = BOX_BOTTOM - TOP_LIMIT;
    const grad = ctx.createLinearGradient(0, TOP_LIMIT, 0, BOX_BOTTOM);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
    grad.addColorStop(0.8, 'rgba(255, 255, 255, 0.08)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(BOX_LEFT, TOP_LIMIT, BOX_WIDTH, boxHeight);

    // 3D Top Rim
    const rimDepth = 22;
    ctx.beginPath();
    ctx.moveTo(BOX_LEFT, TOP_LIMIT);
    ctx.lineTo(BOX_LEFT + rimDepth, TOP_LIMIT - rimDepth * 0.7);
    ctx.lineTo(BOX_RIGHT + rimDepth, TOP_LIMIT - rimDepth * 0.7);
    ctx.lineTo(BOX_RIGHT, TOP_LIMIT);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 3D Right Outer Wall
    ctx.beginPath();
    ctx.moveTo(BOX_RIGHT, TOP_LIMIT);
    ctx.lineTo(BOX_RIGHT + rimDepth, TOP_LIMIT - rimDepth * 0.7);
    ctx.lineTo(BOX_RIGHT + rimDepth, BOX_BOTTOM - rimDepth * 0.7);
    ctx.lineTo(BOX_RIGHT, BOX_BOTTOM);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Front Glass Bevels
    ctx.beginPath();
    ctx.moveTo(BOX_LEFT, TOP_LIMIT);
    ctx.lineTo(BOX_LEFT, BOX_BOTTOM);
    ctx.lineTo(BOX_RIGHT, BOX_BOTTOM);
    ctx.lineTo(BOX_RIGHT, TOP_LIMIT);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    ctx.shadowBlur = 8;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 8;
    ctx.stroke();
  }

  // Danger Line (Pulsing near TOP_LIMIT)
  if (!isGameOver) {
    const pulse = 0.5 + Math.sin(Date.now() * 0.005) * 0.35;
    ctx.beginPath();
    ctx.moveTo(BOX_LEFT + 6, TOP_LIMIT);
    ctx.lineTo(BOX_RIGHT - 6, TOP_LIMIT);
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = currentTheme === 'animals' ? `rgba(217, 119, 6, ${pulse})` : `rgba(244, 63, 94, ${pulse})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawWoodPost(ctx, x, y, w, h) {
  ctx.save();
  // Main post
  const woodGrad = ctx.createLinearGradient(x, 0, x + w, 0);
  woodGrad.addColorStop(0, '#78350f');
  woodGrad.addColorStop(0.35, '#b45309');
  woodGrad.addColorStop(0.7, '#d97706');
  woodGrad.addColorStop(1, '#92400e');
  
  ctx.fillStyle = woodGrad;
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();

  // Beveled top cap
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.moveTo(x - 3, y);
  ctx.lineTo(x + w / 2, y - 8);
  ctx.lineTo(x + w + 3, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// --- Aiming Guide & Hovering Item ---
function drawAimingGuide(ctx) {
  if (isGameOver || isDropping) return;

  const activeItems = getActiveItems();
  const currentConfig = activeItems[nextFruitTier] || activeItems[0];
  const clampedAimX = Math.max(BOX_LEFT + currentConfig.radius + 2, Math.min(aimX, BOX_RIGHT - currentConfig.radius - 2));
  
  // Find obstacle/highest item underneath
  const bodies = Matter.Composite.allBodies(engine.world);
  let stopY = BOX_BOTTOM;
  for (let b of bodies) {
    if (b.fruitTier !== undefined || b.isRock) {
      const dx = Math.abs(b.position.x - clampedAimX);
      const r = (b.circleRadius || 30);
      if (dx < r + currentConfig.radius) {
        const topOfItem = b.position.y - r;
        if (topOfItem > AIM_Y && topOfItem < stopY) {
          stopY = topOfItem;
        }
      }
    }
  }

  ctx.save();
  // 1. Dashed Aim Line
  ctx.beginPath();
  ctx.moveTo(clampedAimX, AIM_Y + currentConfig.radius);
  ctx.lineTo(clampedAimX, stopY);
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = currentTheme === 'animals' ? 'rgba(251, 191, 36, 0.95)' : 'rgba(254, 240, 138, 0.9)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(234, 179, 8, 0.6)';
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.setLineDash([]);

  // Landing ghost target circle
  ctx.beginPath();
  ctx.arc(clampedAimX, stopY - currentConfig.radius * 0.3, currentConfig.radius * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(254, 240, 138, 0.35)';
  ctx.fill();

  // 2. Hovering Item at top of container
  const bobbing = Math.sin(Date.now() * 0.006) * 3;
  ctx.translate(clampedAimX, AIM_Y + bobbing);
  
  if (currentTheme === 'animals') {
    drawChubbyAnimal(ctx, nextFruitTier, currentConfig.radius);
  } else {
    drawJuicyFruit(ctx, nextFruitTier, currentConfig.radius);
  }

  ctx.restore();
}

// ==========================================
// THEME 1: FRUTAS 3D CRISTAL RENDERER
// ==========================================
function drawJuicyFruit(ctx, tier, radius, options = {}) {
  const config = THEME_FRUITS[tier] || THEME_FRUITS[0];
  const r = radius;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = Math.max(4, r * 0.2);
  ctx.shadowOffsetY = Math.max(2, r * 0.1);

  const bodyGrad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.08, 0, 0, r);
  const tierGradients = [
    ['#93c5fd', '#3b82f6', '#1d4ed8', '#172554'], // 0. Arándano
    ['#fca5a5', '#f43f5e', '#be123c', '#881337'], // 1. Cereza
    ['#fecdd3', '#fb7185', '#e11d48', '#9f1239'], // 2. Fresa
    ['#e9d5ff', '#c084fc', '#9333ea', '#581c87'], // 3. Uva
    ['#fef9c3', '#facc15', '#ca8a04', '#713f12'], // 4. Limón
    ['#ffedd5', '#fb923c', '#ea580c', '#9a3412'], // 5. Mandarina
    ['#fed7aa', '#f97316', '#c2410c', '#7c2d12'], // 6. Naranja
    ['#ecfccb', '#a3e635', '#65a30d', '#365314'], // 7. Manzana Verde
    ['#fce7f3', '#f472b6', '#db2777', '#831843'], // 8. Durazno
    ['#fdf2f8', '#ec4899', '#be185d', '#70072b'], // 9. Pitahaya
    ['#fef3c7', '#d97706', '#92400e', '#451a03'], // 10. Coco
    ['#fef08a', '#eab308', '#ca8a04', '#713f12'], // 11. Piña
    ['#d1fae5', '#34d399', '#059669', '#064e3b'], // 12. Melón
    ['#bbf7d0', '#22c55e', '#15803d', '#14532d'], // 13. Sandía
  ];

  const colors = tierGradients[tier] || ['#fef08a', config.color, '#ea580c', '#7c2d12'];
  bodyGrad.addColorStop(0, colors[0]);
  bodyGrad.addColorStop(0.55, colors[1]);
  bodyGrad.addColorStop(0.9, colors[2]);
  bodyGrad.addColorStop(1, colors[3]);

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  drawFruitDetails(ctx, tier, r);
  drawAnimeFace(ctx, tier, r, options.blink);

  // Glossy Specular Arc
  ctx.save();
  ctx.beginPath();
  ctx.rotate(-Math.PI / 4.2);
  ctx.ellipse(-r * 0.35, -r * 0.42, r * 0.45, r * 0.2, 0, 0, Math.PI * 2);
  const specGrad = ctx.createLinearGradient(-r * 0.35, -r * 0.65, -r * 0.35, -r * 0.22);
  specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.88)');
  specGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
  specGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = specGrad;
  ctx.fill();
  ctx.restore();

  // Secondary sparkle dot
  ctx.beginPath();
  ctx.arc(-r * 0.52, -r * 0.2, Math.max(1.8, r * 0.08), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fill();

  ctx.restore();
}

function drawFruitDetails(ctx, tier, r) {
  if (tier === 5) {
    // Mandarina: 5-point star calyx with leaves on top
    ctx.save();
    ctx.translate(0, -r * 0.92);
    ctx.fillStyle = '#4ade80';
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.16, r * 0.07, r * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (tier === 7) {
    // Green Apple: wood stem + leaf
    ctx.save();
    ctx.translate(0, -r * 0.9);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-r * 0.08, -r * 0.25, -r * 0.04, -r * 0.35);
    ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.ellipse(r * 0.15, -r * 0.22, r * 0.16, r * 0.09, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (tier === 8) {
    // Peach: cleft & leaves
    ctx.save();
    ctx.strokeStyle = 'rgba(190, 24, 93, 0.4)';
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.85, -Math.PI * 0.6, -Math.PI * 0.4);
    ctx.stroke();
    ctx.translate(-r * 0.6, r * 0.65);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.18, r * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (tier === 9) {
    // Dragonfruit: green scales
    ctx.save();
    ctx.fillStyle = '#4ade80';
    const scaleAngles = [-Math.PI * 0.8, -Math.PI * 0.2, -Math.PI * 0.5, Math.PI * 0.75, Math.PI * 0.25];
    scaleAngles.forEach(ang => {
      ctx.save();
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85);
      ctx.quadraticCurveTo(-r * 0.14, -r * 1.08, 0, -r * 1.22);
      ctx.quadraticCurveTo(r * 0.14, -r * 1.08, 0, -r * 0.85);
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();
  } else if (tier === 13) {
    // Watermelon: dark green stripes
    ctx.save();
    ctx.strokeStyle = 'rgba(20, 83, 45, 0.65)';
    ctx.lineWidth = r * 0.12;
    ctx.lineCap = 'round';
    for (let offset = -0.6; offset <= 0.6; offset += 0.3) {
      ctx.beginPath();
      const x = r * offset;
      ctx.moveTo(x, -Math.sqrt(r * r - x * x));
      ctx.quadraticCurveTo(x + r * 0.1, 0, x, Math.sqrt(r * r - x * x));
      ctx.stroke();
    }
    ctx.restore();
  } else if (tier === 2) {
    // Strawberry: golden seeds + leafy crown
    ctx.save();
    ctx.fillStyle = 'rgba(254, 240, 138, 0.75)';
    [[-0.4, -0.3], [0.4, -0.3], [0, -0.1], [-0.5, 0.2], [0.5, 0.2], [0, 0.4]].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.ellipse(r * sx, r * sy, r * 0.04, r * 0.07, Math.PI / 8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#22c55e';
    ctx.translate(0, -r * 0.9);
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(i * r * 0.12, 0, r * 0.08, r * 0.18, (i * Math.PI) / 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ==========================================
// THEME 2: GRANJA KAWAII ANIMAL RENDERER
// ==========================================
function drawChubbyAnimal(ctx, tier, radius, options = {}) {
  const r = radius;
  ctx.save();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
  ctx.shadowBlur = Math.max(3, r * 0.18);
  ctx.shadowOffsetY = Math.max(2, r * 0.08);

  // 0: Huevo (Egg)
  if (tier === 0) {
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.88, r * 1.05, 0, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.7, '#fef3c7');
    grad.addColorStop(1, '#fde68a');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    drawBasicAnimalFace(ctx, r, { blush: true, isBlinking: options.blink });
  }

  // 1: Pollito (Baby Chick)
  else if (tier === 1) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#fef9c3');
    grad.addColorStop(0.7, '#fde047');
    grad.addColorStop(1, '#eab308');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Little wings on sides
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.ellipse(-r * 0.88, r * 0.1, r * 0.22, r * 0.35, -Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(r * 0.88, r * 0.1, r * 0.22, r * 0.35, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();

    // Cute orange beak
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(-r * 0.14, r * 0.06);
    ctx.lineTo(r * 0.14, r * 0.06);
    ctx.lineTo(0, r * 0.24);
    ctx.closePath();
    ctx.fill();

    drawBasicAnimalFace(ctx, r, { eyesOnly: true, isBlinking: options.blink });
  }

  // 2: Conejito (White Bunny)
  else if (tier === 2) {
    // Upright bunny ears
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    [-r * 0.35, r * 0.35].forEach(ex => {
      ctx.beginPath();
      ctx.ellipse(ex, -r * 0.95, r * 0.2, r * 0.45, (ex < 0 ? -0.1 : 0.1), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Pink inner ear
      ctx.fillStyle = '#fbcfe8';
      ctx.beginPath();
      ctx.ellipse(ex, -r * 0.95, r * 0.1, r * 0.32, (ex < 0 ? -0.1 : 0.1), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
    });

    // Body
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.85, '#f8fafc');
    grad.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Pink nose
    ctx.fillStyle = '#f472b6';
    ctx.beginPath();
    ctx.arc(0, r * 0.08, r * 0.08, 0, Math.PI * 2);
    ctx.fill();

    drawBasicAnimalFace(ctx, r, { blush: true, isBlinking: options.blink });
  }

  // 3: Gallina (Hen)
  else if (tier === 3) {
    // Red comb on top
    ctx.fillStyle = '#ef4444';
    [-r * 0.2, 0, r * 0.2].forEach((cx, idx) => {
      ctx.beginPath();
      ctx.arc(cx, -r * 0.95, r * (idx === 1 ? 0.22 : 0.16), 0, Math.PI * 2);
      ctx.fill();
    });

    // Body
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#d97706');
    grad.addColorStop(0.7, '#b45309');
    grad.addColorStop(1, '#78350f');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Yellow beak & red wattle
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.28, r * 0.1, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, r * 0.06);
    ctx.lineTo(r * 0.15, r * 0.06);
    ctx.lineTo(0, r * 0.22);
    ctx.closePath();
    ctx.fill();

    drawBasicAnimalFace(ctx, r, { eyesOnly: true, isBlinking: options.blink });
  }

  // 4: Chanchito (Piglet)
  else if (tier === 4) {
    // Floppy ears
    ctx.fillStyle = '#f472b6';
    [-r * 0.7, r * 0.7].forEach(ex => {
      ctx.beginPath();
      ctx.ellipse(ex, -r * 0.65, r * 0.26, r * 0.36, (ex < 0 ? -0.4 : 0.4), 0, Math.PI * 2);
      ctx.fill();
    });

    // Body
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#fce7f3');
    grad.addColorStop(0.7, '#f472b6');
    grad.addColorStop(1, '#db2777');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Pig snout
    ctx.fillStyle = '#ec4899';
    ctx.strokeStyle = '#be185d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.15, r * 0.34, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Nostrils
    ctx.fillStyle = '#9d174d';
    [-r * 0.12, r * 0.12].forEach(nx => {
      ctx.beginPath();
      ctx.ellipse(nx, r * 0.15, r * 0.05, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    drawBasicAnimalFace(ctx, r, { blush: true, isBlinking: options.blink });
  }

  // 5: Perrito Husky (Husky Dog)
  else if (tier === 5) {
    // Pointed ears
    [-r * 0.55, r * 0.55].forEach(ex => {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.2, -r * 0.6);
      ctx.lineTo(ex, -r * 1.15);
      ctx.lineTo(ex + r * 0.2, -r * 0.6);
      ctx.closePath();
      ctx.fill();
      // Pink inner ear
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.1, -r * 0.65);
      ctx.lineTo(ex, -r * 1.0);
      ctx.lineTo(ex + r * 0.1, -r * 0.65);
      ctx.closePath();
      ctx.fill();
    });

    // Dark grey/black head
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#334155';
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Husky white face mask
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.18, r * 0.75, r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();

    // Forehead white blaze
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.7);
    ctx.lineTo(-r * 0.16, r * 0.05);
    ctx.lineTo(r * 0.16, r * 0.05);
    ctx.closePath();
    ctx.fill();

    // Black nose & smile
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.06, r * 0.12, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tongue
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(0, r * 0.26, r * 0.09, 0, Math.PI);
    ctx.fill();

    drawBasicAnimalFace(ctx, r, { eyesOnly: true, isBlinking: options.blink });
  }

  // 6: Ovejita (Sheep)
  else if (tier === 6) {
    // Cloud of fluffy wool puffs all around
    ctx.fillStyle = '#f8fafc';
    const puffCount = 10;
    for (let i = 0; i < puffCount; i++) {
      const ang = (Math.PI * 2 * i) / puffCount;
      const px = Math.cos(ang) * (r * 0.78);
      const py = Math.sin(ang) * (r * 0.78);
      ctx.beginPath();
      ctx.arc(px, py, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }

    // Inner body
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = '#f1f5f9';
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Face oval
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.06, r * 0.48, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    // Drooping ears
    [-r * 0.55, r * 0.55].forEach(ex => {
      ctx.beginPath();
      ctx.ellipse(ex, -r * 0.05, r * 0.22, r * 0.12, (ex < 0 ? 0.3 : -0.3), 0, Math.PI * 2);
      ctx.fill();
    });

    drawBasicAnimalFace(ctx, r * 0.85, { blush: true, isBlinking: options.blink });
  }

  // 7: Vaquita (Cow)
  else if (tier === 7) {
    // Little horns
    ctx.fillStyle = '#fde047';
    [-r * 0.4, r * 0.4].forEach(hx => {
      ctx.beginPath();
      ctx.ellipse(hx, -r * 0.88, r * 0.12, r * 0.22, (hx < 0 ? -0.3 : 0.3), 0, Math.PI * 2);
      ctx.fill();
    });

    // White body
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Dairy black patches
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(-r * 0.55, -r * 0.35, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.6, r * 0.25, r * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Pink cow muzzle
    ctx.fillStyle = '#fbcfe8';
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.22, r * 0.45, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Nostrils
    ctx.fillStyle = '#db2777';
    [-r * 0.15, r * 0.15].forEach(nx => {
      ctx.beginPath();
      ctx.ellipse(nx, r * 0.22, r * 0.06, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    drawBasicAnimalFace(ctx, r, { eyesOnly: true, isBlinking: options.blink });
  }

  // 8: Caballito (Horse)
  else if (tier === 8) {
    // Dark mane on top
    ctx.fillStyle = '#451a03';
    [-r * 0.2, 0, r * 0.2].forEach(mx => {
      ctx.beginPath();
      ctx.ellipse(mx, -r * 0.92, r * 0.14, r * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Chestnut brown body
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#b45309');
    grad.addColorStop(0.7, '#92400e');
    grad.addColorStop(1, '#78350f');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // White star blaze on forehead
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.25, r * 0.14, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Soft muzzle
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.22, r * 0.42, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nostrils
    ctx.fillStyle = '#78350f';
    [-r * 0.16, r * 0.16].forEach(nx => {
      ctx.beginPath();
      ctx.arc(nx, r * 0.22, r * 0.06, 0, Math.PI * 2);
      ctx.fill();
    });

    drawBasicAnimalFace(ctx, r, { eyesOnly: true, isBlinking: options.blink });
  }

  // 9+: Generic Chubby Animals (Alpaca, Bear, Lion, etc.)
  else {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const config = THEME_ANIMALS[tier] || THEME_ANIMALS[0];
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.7, config.color);
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Cute ears
    [-r * 0.65, r * 0.65].forEach(ex => {
      ctx.fillStyle = config.color;
      ctx.beginPath();
      ctx.arc(ex, -r * 0.65, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    });

    drawBasicAnimalFace(ctx, r, { blush: true, isBlinking: options.blink });
  }

  // Specular sheen for cute 3D toy look
  ctx.save();
  ctx.beginPath();
  ctx.rotate(-Math.PI / 4.2);
  ctx.ellipse(-r * 0.32, -r * 0.45, r * 0.4, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawBasicAnimalFace(ctx, r, { blush = false, eyesOnly = false, isBlinking = false } = {}) {
  const eyeOffset = r * 0.32;
  const eyeY = -r * 0.08;
  const eyeR = Math.max(2.5, r * 0.1);

  ctx.save();

  if (blush) {
    ctx.fillStyle = 'rgba(244, 114, 182, 0.55)';
    [-eyeOffset * 1.35, eyeOffset * 1.35].forEach(bx => {
      ctx.beginPath();
      ctx.ellipse(bx, eyeY + eyeR * 1.6, eyeR * 1.4, eyeR * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Eyes
  if (isBlinking) {
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.lineCap = 'round';
    [-eyeOffset, eyeOffset].forEach(ex => {
      ctx.beginPath();
      ctx.arc(ex, eyeY, eyeR, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    });
  } else {
    [-eyeOffset, eyeOffset].forEach(ex => {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeR, eyeR * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      // Catchlights
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - eyeR * 0.3, eyeY - eyeR * 0.35, eyeR * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + eyeR * 0.35, eyeY + eyeR * 0.35, eyeR * 0.22, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Cute mouth if not eyesOnly
  if (!eyesOnly) {
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = Math.max(1.8, r * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, eyeY + eyeR * 1.8, r * 0.12, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }

  ctx.restore();
}

function drawAnimeFace(ctx, tier, r, isBlinking = false) {
  const eyeOffset = r * 0.32;
  const eyeY = -r * 0.06;
  const eyeR = Math.max(2.5, r * 0.11);

  ctx.save();
  const blushY = eyeY + eyeR * 1.6;
  const blushOffset = eyeOffset * 1.35;
  const blushR = Math.max(3, r * 0.16);

  ctx.fillStyle = 'rgba(255, 105, 180, 0.45)';
  ctx.beginPath();
  ctx.ellipse(-blushOffset, blushY, blushR * 1.2, blushR * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(blushOffset, blushY, blushR * 1.2, blushR * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(219, 39, 119, 0.6)';
  ctx.lineWidth = Math.max(1, r * 0.04);
  [-blushOffset, blushOffset].forEach(bx => {
    ctx.beginPath();
    ctx.moveTo(bx - blushR * 0.4, blushY - blushR * 0.4);
    ctx.lineTo(bx - blushR * 0.1, blushY + blushR * 0.4);
    ctx.moveTo(bx, blushY - blushR * 0.4);
    ctx.lineTo(bx + blushR * 0.3, blushY + blushR * 0.4);
    ctx.stroke();
  });

  if (isBlinking || tier === 5) {
    ctx.strokeStyle = '#261208';
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-eyeOffset, eyeY, eyeR * 1.1, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(eyeOffset, eyeY, eyeR * 1.1, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else {
    [-eyeOffset, eyeOffset].forEach(ex => {
      ctx.fillStyle = '#261208';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeR, eyeR * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - eyeR * 0.3, eyeY - eyeR * 0.35, eyeR * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + eyeR * 0.35, eyeY + eyeR * 0.35, eyeR * 0.22, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  ctx.strokeStyle = '#261208';
  ctx.lineWidth = Math.max(1.8, r * 0.06);
  ctx.lineCap = 'round';
  const mouthY = eyeY + eyeR * 1.3;
  
  if (tier === 7 || tier === 13 || tier >= 8) {
    ctx.beginPath();
    ctx.arc(0, mouthY, r * 0.16, 0.1, Math.PI - 0.1);
    ctx.fillStyle = '#be185d';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, mouthY + r * 0.06, r * 0.09, 0, Math.PI);
    ctx.fillStyle = '#f472b6';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, mouthY - r * 0.02, r * 0.13, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }

  ctx.restore();
}

// --- Main Game Loop ---
function gameLoop() {
  const context = render.context;
  const bodies = Matter.Composite.allBodies(engine.world);
  const activeItems = getActiveItems();

  aimX += (targetAimX - aimX) * 0.35;

  // 1. Draw Container (Glass Box or Rustic Wooden Pen)
  drawContainer(context);

  // 2. Draw Aiming Guide & Hovering Item
  drawAimingGuide(context);

  // 3. Draw All Dynamic Bodies
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    
    if (body.fruitTier !== undefined) {
      const config = activeItems[body.fruitTier] || activeItems[0];
      context.save();
      context.translate(body.position.x, body.position.y);
      context.rotate(body.angle);
      
      // Elastic squash & stretch
      if (body.squashFactor && body.squashFactor > 0.005) {
        body.squashPhase = (body.squashPhase || 0) + 0.35;
        const decay = Math.exp(-body.squashPhase * 0.45);
        const deformation = body.squashFactor * Math.sin(body.squashPhase) * decay;
        context.rotate(body.squashAngle - body.angle);
        context.scale(1 + deformation, 1 - deformation);
        context.rotate(-(body.squashAngle - body.angle));
        if (decay < 0.03) body.squashFactor = 0;
      }

      // Elastic spawn bounce on merge
      if (body.spawnTime) {
        const elapsed = performance.now() - body.spawnTime;
        if (elapsed < 380) {
          const t = elapsed / 380;
          const bounceScale = 1 + 0.38 * Math.sin(t * Math.PI * 2.2) * (1 - t);
          context.scale(bounceScale, bounceScale);
        }
      }

      // Blinking
      body.blinkTimer = (body.blinkTimer || 100) - 1;
      let isBlinking = false;
      if (body.blinkTimer <= 0) {
        isBlinking = true;
        if (body.blinkTimer < -6) {
          body.blinkTimer = Math.random() * 240 + 120;
        }
      }

      // Render according to active theme
      if (currentTheme === 'animals') {
        drawChubbyAnimal(context, body.fruitTier, config.radius, { blink: isBlinking });
      } else {
        drawJuicyFruit(context, body.fruitTier, config.radius, { blink: isBlinking });
      }

      context.restore();

    } else if (body.isRock) {
      // 3D Polished Granite Rock
      context.save();
      context.translate(body.position.x, body.position.y);
      context.rotate(body.angle);
      const r = body.circleRadius;
      
      const rockGrad = context.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      rockGrad.addColorStop(0, '#94a3b8');
      rockGrad.addColorStop(0.7, '#475569');
      rockGrad.addColorStop(1, '#1e293b');
      
      context.beginPath();
      context.arc(0, 0, r, 0, Math.PI * 2);
      context.fillStyle = rockGrad;
      context.fill();
      
      context.fillStyle = '#0f172a';
      context.beginPath();
      context.arc(-r * 0.3, -r * 0.05, r * 0.1, 0, Math.PI * 2);
      context.arc(r * 0.3, -r * 0.05, r * 0.1, 0, Math.PI * 2);
      context.fill();
      
      context.strokeStyle = '#0f172a';
      context.lineWidth = r * 0.1;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(-r * 0.45, -r * 0.35);
      context.lineTo(-r * 0.12, -r * 0.18);
      context.moveTo(r * 0.45, -r * 0.35);
      context.lineTo(r * 0.12, -r * 0.18);
      context.stroke();

      context.restore();
    }
    
    // Check Game Over
    if (!isGameOver && (body.fruitTier !== undefined || body.isRock) && body.position.y < TOP_LIMIT + 10 && body.velocity.y > -0.5 && body.velocity.y < 0.5) {
      if (body.speed < 0.8 && performance.now() - (body.spawnTime || 0) > 1200) {
        triggerGameOver();
      }
    }
  }

  // 4. Draw VFX
  updateAndDrawVFX(context);
}

function triggerGameOver() {
  if (isGameOver) return;
  isGameOver = true;
  document.getElementById('game-over-title').innerText = isMultiplayer ? "¡Perdiste!" : "¡Juego Terminado!";
  finalScoreEl.innerText = currentScore;
  
  document.getElementById('submit-score-section').style.display = 'flex';
  document.getElementById('player-name').value = '';
  const submitBtn = document.getElementById('submit-score-btn');
  submitBtn.disabled = false;
  submitBtn.innerText = 'Guardar Puntaje';
  
  gameOverScreen.classList.remove('hidden');
  loadLeaderboard();

  if (isMultiplayer) {
    updateRoomState(roomCode, isPlayer1, {}, isPlayer1 ? 'player1_lost' : 'player2_lost');
    if (unsubscribeRoom) {
      unsubscribeRoom();
      unsubscribeRoom = null;
    }
  }
}

function triggerWin() {
  if (isGameOver) return;
  isGameOver = true;
  document.getElementById('game-over-title').innerText = "¡Ganaste! 🎉";
  finalScoreEl.innerText = currentScore;
  
  document.getElementById('submit-score-section').style.display = 'flex';
  document.getElementById('player-name').value = '';
  const submitBtn = document.getElementById('submit-score-btn');
  submitBtn.disabled = false;
  submitBtn.innerText = 'Guardar Puntaje';
  
  gameOverScreen.classList.remove('hidden');
  loadLeaderboard();

  if (isMultiplayer && unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
}

async function loadLeaderboard() {
  const listEl = document.getElementById('leaderboard-list');
  listEl.innerHTML = '<li>Cargando...</li>';
  
  const topScores = await getTopScores(5);
  listEl.innerHTML = '';
  
  if (topScores.length === 0) {
    listEl.innerHTML = '<li>Aún no hay puntajes</li>';
    return;
  }
  
  topScores.forEach((scoreObj, index) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>#${index + 1} <b>${scoreObj.name}</b></span> <span>${scoreObj.score}</span>`;
    listEl.appendChild(li);
  });
}

// --- Interactive Aim & Drop Controls ---
function setupInput() {
  function getXFromEvent(e) {
    const rect = gameContainer.getBoundingClientRect();
    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
    return clientX - rect.left;
  }

  gameContainer.addEventListener('mousedown', (e) => {
    isPointerDown = true;
    targetAimX = getXFromEvent(e);
  });

  gameContainer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isPointerDown = true;
    targetAimX = getXFromEvent(e);
  }, { passive: false });

  window.addEventListener('mousemove', (e) => {
    if (isPointerDown) {
      targetAimX = getXFromEvent(e);
    }
  });

  window.addEventListener('touchmove', (e) => {
    if (isPointerDown) {
      targetAimX = getXFromEvent(e);
    }
  }, { passive: false });

  window.addEventListener('mouseup', () => {
    if (isPointerDown) {
      isPointerDown = false;
      dropCurrentItem();
    }
  });

  window.addEventListener('touchend', () => {
    if (isPointerDown) {
      isPointerDown = false;
      dropCurrentItem();
    }
  });

  restartBtn.addEventListener('click', () => {
    window.location.reload();
  });
  
  document.getElementById('submit-score-btn').addEventListener('click', async () => {
    const nameInput = document.getElementById('player-name');
    const btn = document.getElementById('submit-score-btn');
    const name = nameInput.value.trim();
    
    if (!name) return alert('Por favor, ingresa tu nombre');
    
    btn.disabled = true;
    btn.innerText = 'Guardando...';
    
    const success = await saveScore(name, currentScore);
    if (success) {
      document.getElementById('submit-score-section').style.display = 'none';
      await loadLeaderboard();
    } else {
      alert('Error al guardar el puntaje.');
      btn.disabled = false;
      btn.innerText = 'Guardar Puntaje';
    }
  });
}

// Start Game
init();
