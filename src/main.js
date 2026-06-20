import './style.css';
import Matter from 'matter-js';
import { saveScore, getTopScores, createRoom, joinRoom, listenToRoom, updateRoomState, sendPunishment } from './firebase.js';

// --- Audio System (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playDropSound() {
  if(audioCtx.state === 'suspended') return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
  gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.1);
}

function playMergeSound(tier) {
  if(audioCtx.state === 'suspended') return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = 'triangle';
  const freq = 300 + (tier * 40);
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);
}

let bgmGain = null;
let bgmInterval = null;
function startBGM() {
  if(audioCtx.state === 'suspended') audioCtx.resume();
  if(bgmInterval) return;
  
  bgmGain = audioCtx.createGain();
  bgmGain.gain.value = 0.05; 
  bgmGain.connect(audioCtx.destination);
  
  const notes = [261.63, 329.63, 392.00, 523.25]; // C E G C
  let noteIdx = 0;
  
  bgmInterval = setInterval(() => {
    if(isGameOver) return;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = notes[noteIdx];
    
    const noteGain = audioCtx.createGain();
    noteGain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    noteGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);
    
    osc.connect(noteGain);
    noteGain.connect(bgmGain);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 1.5);
    
    noteIdx = (noteIdx + 1) % notes.length;
  }, 2000);
}

// --- Game Configuration & State ---
let GAME_WIDTH = Math.min(window.innerWidth, 600);
let GAME_HEIGHT = window.innerHeight;
const WALL_THICKNESS = 60;
const TOP_LIMIT = GAME_HEIGHT * 0.15; 

const scaleFactor = GAME_WIDTH / 400;

// Fruit configurations (13 tiers)
const FRUITS = [
  { name: "Arándano", radius: 12 * scaleFactor, color: '#4d4dff', emoji: '🫐', points: 1 },
  { name: "Cereza", radius: 18 * scaleFactor, color: '#ff4d4d', emoji: '🍒', points: 3 },
  { name: "Fresa", radius: 26 * scaleFactor, color: '#ff8888', emoji: '🍓', points: 6 },
  { name: "Uva", radius: 36 * scaleFactor, color: '#8a2be2', emoji: '🍇', points: 10 },
  { name: "Limón", radius: 46 * scaleFactor, color: '#fffacd', emoji: '🍋', points: 15 },
  { name: "Mandarina", radius: 58 * scaleFactor, color: '#ffa500', emoji: '🍊', points: 21 },
  { name: "Naranja", radius: 72 * scaleFactor, color: '#ff8c00', emoji: '🟠', points: 28 },
  { name: "Manzana", radius: 88 * scaleFactor, color: '#dc143c', emoji: '🍎', points: 36 },
  { name: "Durazno", radius: 105 * scaleFactor, color: '#ffb6c1', emoji: '🍑', points: 45 },
  { name: "Coco", radius: 125 * scaleFactor, color: '#ffffff', emoji: '🥥', points: 55 },
  { name: "Piña", radius: 150 * scaleFactor, color: '#ffe4b5', emoji: '🍍', points: 66 },
  { name: "Melón", radius: 175 * scaleFactor, color: '#90ee90', emoji: '🍈', points: 78 },
  { name: "Sandía", radius: 205 * scaleFactor, color: '#228b22', emoji: '🍉', points: 100 },
];

let engine, render, runner;
let currentScore = 0;
let nextFruitTier = 0;
let isGameOver = false;
let isDropping = false;

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
const nextFruitNameEl = document.getElementById('next-fruit-name');
const gameOverScreen = document.getElementById('game-over-screen');
const startScreen = document.getElementById('start-screen');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-button');
const gameContainer = document.getElementById('game-container');

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
  engine = Matter.Engine.create();
  
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
    render: { fillStyle: '#ffb6c1', lineWidth: 0, strokeStyle: 'transparent' }
  };
  
  const ground = Matter.Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT + WALL_THICKNESS / 2, GAME_WIDTH + WALL_THICKNESS * 2, WALL_THICKNESS, wallOptions);
  const leftWall = Matter.Bodies.rectangle(0 - WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, wallOptions);
  const rightWall = Matter.Bodies.rectangle(GAME_WIDTH + WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, wallOptions);

  Matter.World.add(engine.world, [ground, leftWall, rightWall]);
  Matter.Events.on(engine, 'collisionStart', handleCollisions);

  setupInput();
  setupMultiplayerUI();

  Matter.Render.run(render);
  runner = Matter.Runner.create();
  Matter.Runner.run(runner, engine);
  Matter.Events.on(render, 'afterRender', gameLoop);
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
    if(success) {
      multiplayerLobby.classList.add('hidden');
      waitingRoom.classList.remove('hidden');
      roomCodeDisplay.innerText = roomCode;
      
      // Listen for player 2
      unsubscribeRoom = listenToRoom(roomCode, (data) => {
        if (data.status === 'playing') {
          startGame();
        }
      });
    }
  });

  joinRoomBtn.addEventListener('click', async () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if(code.length !== 4) return alert("Código inválido");
    
    joinRoomBtn.innerText = 'Uniéndose...';
    roomCode = code;
    isPlayer1 = false;
    isMultiplayer = true;
    
    const success = await joinRoom(code);
    if(success) {
      // Room joined, start game and listen
      startGame();
    } else {
      alert("No se encontró la sala o ya está llena.");
      joinRoomBtn.innerText = 'Unirse a Sala';
    }
  });
}

function startGame() {
  if(audioCtx.state === 'suspended') audioCtx.resume();
  startScreen.classList.add('hidden');
  
  if (isMultiplayer) {
    opponentScoreContainer.classList.remove('hidden');
    // Start listening to score and punishments
    if(unsubscribeRoom) unsubscribeRoom();
    unsubscribeRoom = listenToRoom(roomCode, (data) => {
      const opponentData = isPlayer1 ? data.player2 : data.player1;
      const myData = isPlayer1 ? data.player1 : data.player2;
      
      if (opponentData) {
        opponentScoreEl.innerText = opponentData.score;
      }
      if (myData && myData.punishments > localPunishmentCount) {
        // We received new punishments!
        const newPunishments = myData.punishments - localPunishmentCount;
        pendingPunishments += newPunishments;
        localPunishmentCount = myData.punishments;
      }
    });
  }

  resetGame();
}

// --- Game Logic ---

function resetGame() {
  isGameOver = false;
  currentScore = 0;
  pendingPunishments = 0;
  updateScore();
  
  const bodies = Matter.Composite.allBodies(engine.world);
  const fruitsToRemove = bodies.filter(b => b.fruitTier !== undefined || b.isRock);
  Matter.World.remove(engine.world, fruitsToRemove);
  
  gameOverScreen.classList.add('hidden');
  rollNextFruit();
  startBGM();
}

function rollNextFruit() {
  nextFruitTier = Math.floor(Math.random() * 5); // Drops tier 0 to 4
  const next = FRUITS[nextFruitTier];
  
  nextFruitNameEl.innerText = next.name;
  
  nextPreviewEl.innerHTML = '';
  const previewCanvas = document.createElement('canvas');
  const size = next.radius * 2;
  previewCanvas.width = size;
  previewCanvas.height = size;
  const ctx = previewCanvas.getContext('2d');
  
  ctx.translate(size/2, size/2);
  ctx.beginPath();
  ctx.arc(0, 0, next.radius, 0, 2 * Math.PI);
  ctx.fillStyle = next.color;
  ctx.fill();
  
  ctx.font = `${next.radius * 1.2}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(next.emoji, 0, 0);
  
  nextPreviewEl.appendChild(previewCanvas);
}

function updateScore() {
  scoreEl.innerText = currentScore;
  if (isMultiplayer) {
    updateRoomState(roomCode, isPlayer1, { score: currentScore });
  }
}

function dropFruit(x) {
  if (isGameOver || isDropping) return;
  
  // If we have pending punishments, drop a rock instead!
  if (pendingPunishments > 0) {
    dropRock(x);
    pendingPunishments--;
    return;
  }
  
  const fruitConfig = FRUITS[nextFruitTier];
  const spawnX = Math.max(fruitConfig.radius, Math.min(x, GAME_WIDTH - fruitConfig.radius));
  
  const body = Matter.Bodies.circle(spawnX, TOP_LIMIT, fruitConfig.radius, {
    restitution: 0.2,
    friction: 0.1,
    render: { fillStyle: fruitConfig.color, lineWidth: 0, strokeStyle: 'transparent' },
  });

  body.fruitTier = nextFruitTier;
  Matter.World.add(engine.world, body);
  playDropSound();
  
  isDropping = true;
  setTimeout(() => {
    isDropping = false;
    rollNextFruit();
  }, 1000);
}

function dropRock(x) {
  const radius = 30 * scaleFactor;
  const spawnX = Math.max(radius, Math.min(x, GAME_WIDTH - radius));
  const body = Matter.Bodies.circle(spawnX, TOP_LIMIT, radius, {
    restitution: 0.05,
    friction: 0.5,
    density: 0.005, // heavy
    render: { fillStyle: '#7f8c8d', lineWidth: 0, strokeStyle: 'transparent' },
  });
  body.isRock = true;
  Matter.World.add(engine.world, body);
  playDropSound();
  
  isDropping = true;
  setTimeout(() => {
    isDropping = false;
  }, 500);
}

function handleCollisions(event) {
  const pairs = event.pairs;

  for (let i = 0; i < pairs.length; i++) {
    const bodyA = pairs[i].bodyA;
    const bodyB = pairs[i].bodyB;

    if (bodyA.fruitTier !== undefined && bodyB.fruitTier !== undefined) {
      if (bodyA.fruitTier === bodyB.fruitTier) {
        if (bodyA.fruitTier === FRUITS.length - 1) continue; // Max tier

        const isAInWorld = Matter.Composite.get(engine.world, bodyA.id, 'body');
        const isBInWorld = Matter.Composite.get(engine.world, bodyB.id, 'body');
        
        if (isAInWorld && isBInWorld) {
          const nextTier = bodyA.fruitTier + 1;
          const newFruitConfig = FRUITS[nextTier];
          
          const newX = (bodyA.position.x + bodyB.position.x) / 2;
          const newY = (bodyA.position.y + bodyB.position.y) / 2;

          Matter.World.remove(engine.world, [bodyA, bodyB]);

          const newBody = Matter.Bodies.circle(newX, newY, newFruitConfig.radius, {
            restitution: 0.2,
            friction: 0.1,
            render: { fillStyle: newFruitConfig.color, lineWidth: 0, strokeStyle: 'transparent' }
          });
          newBody.fruitTier = nextTier;

          Matter.World.add(engine.world, newBody);
          playMergeSound(nextTier);
          
          currentScore += newFruitConfig.points;
          updateScore();

          // PUNISHMENT LOGIC: If tier is >= 7 (Apple or above)
          if (isMultiplayer && nextTier >= 7) {
            sendPunishment(roomCode, isPlayer1);
          }
        }
      }
    }
  }
}

function gameLoop() {
  const context = render.context;
  const bodies = Matter.Composite.allBodies(engine.world);

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    
    if (body.fruitTier !== undefined) {
      const config = FRUITS[body.fruitTier];
      context.save();
      context.translate(body.position.x, body.position.y);
      context.rotate(body.angle);
      
      // Emoji
      context.font = `${config.radius * 1.2}px Arial`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(config.emoji, 0, 0);
      
      // Cute face
      context.fillStyle = '#4a2511'; 
      const eyeOffset = config.radius * 0.35;
      const eyeSize = config.radius * 0.08 + 1;
      
      context.beginPath();
      context.arc(-eyeOffset, -eyeOffset * 0.1, eyeSize, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(eyeOffset, -eyeOffset * 0.1, eyeSize, 0, Math.PI * 2);
      context.fill();
      
      context.fillStyle = 'rgba(255, 120, 150, 0.4)';
      context.beginPath();
      context.arc(-eyeOffset * 1.3, eyeOffset * 0.3, eyeSize * 1.8, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(eyeOffset * 1.3, eyeOffset * 0.3, eyeSize * 1.8, 0, Math.PI * 2);
      context.fill();
      
      context.strokeStyle = '#4a2511';
      context.lineWidth = Math.max(1.5, config.radius * 0.06);
      context.lineCap = 'round';
      context.beginPath();
      
      if (body.fruitTier === FRUITS.length - 1) { // Sandía
        context.arc(0, eyeOffset * 0.2, eyeOffset * 0.5, 0, Math.PI);
        context.stroke();
        context.fillStyle = '#ff7777';
        context.fill();
      } else {
        context.arc(0, eyeOffset * 0.1, eyeOffset * 0.6, 0.1, Math.PI - 0.1);
        context.stroke();
      }
      
      // Removed the large white halo, added tiny specular highlight instead
      context.fillStyle = 'rgba(255, 255, 255, 0.6)';
      context.beginPath();
      context.arc(-config.radius * 0.4, -config.radius * 0.4, config.radius * 0.1, 0, 2 * Math.PI);
      context.fill();

      context.restore();
    } else if (body.isRock) {
      // Draw angry rock
      context.save();
      context.translate(body.position.x, body.position.y);
      context.rotate(body.angle);
      const r = body.circleRadius;
      
      context.fillStyle = '#4a2511'; 
      context.beginPath();
      context.arc(-r*0.3, -r*0.1, r*0.1, 0, Math.PI*2);
      context.arc(r*0.3, -r*0.1, r*0.1, 0, Math.PI*2);
      context.fill();
      
      // Angry eyebrows
      context.strokeStyle = '#4a2511';
      context.lineWidth = r*0.1;
      context.beginPath();
      context.moveTo(-r*0.5, -r*0.4);
      context.lineTo(-r*0.1, -r*0.2);
      context.stroke();
      context.beginPath();
      context.moveTo(r*0.5, -r*0.4);
      context.lineTo(r*0.1, -r*0.2);
      context.stroke();

      // Frown
      context.beginPath();
      context.arc(0, r*0.4, r*0.2, Math.PI, 0);
      context.stroke();

      context.restore();
    }
    
    if (!isGameOver && (body.fruitTier !== undefined || body.isRock) && body.position.y < TOP_LIMIT && body.velocity.y > -0.5 && body.velocity.y < 0.5) {
      if (body.speed < 1) {
        triggerGameOver();
      }
    }
  }
  
  if (!isGameOver) {
    context.beginPath();
    context.moveTo(0, TOP_LIMIT);
    context.lineTo(GAME_WIDTH, TOP_LIMIT);
    context.strokeStyle = 'rgba(255, 105, 180, 0.5)';
    context.lineWidth = 2;
    context.setLineDash([10, 10]);
    context.stroke();
    context.setLineDash([]);
  }
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

  if (isMultiplayer && unsubscribeRoom) {
    // Keep listening or clean up? Let's clean up
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

function setupInput() {
  gameContainer.addEventListener('mousedown', (e) => {
    const rect = gameContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    dropFruit(x);
  });
  
  gameContainer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const rect = gameContainer.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    dropFruit(x);
  }, { passive: false });

  restartBtn.addEventListener('click', () => {
    window.location.reload(); // Reload to return to main menu cleanly
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

// Start
init();
