import './style.css';
import Matter from 'matter-js';
import { saveScore, getTopScores } from './firebase.js';

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
  bgmGain.gain.value = 0.05; // Very soft background
  bgmGain.connect(audioCtx.destination);
  
  // Relaxing chord progression notes
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
// Dynamically size based on screen, capped at 600px width
let GAME_WIDTH = Math.min(window.innerWidth, 600);
let GAME_HEIGHT = window.innerHeight;
const WALL_THICKNESS = 60;
const TOP_LIMIT = GAME_HEIGHT * 0.15; // Top limit is 15% from the top

// Calculate a scale factor to make fruits fit nicely regardless of screen width
const scaleFactor = GAME_WIDTH / 400;

// Fruit configurations (tier 0 to 10)
const FRUITS = [
  { name: "Cereza", radius: 15 * scaleFactor, color: '#ff4d4d', emoji: '🍒', points: 1 },
  { name: "Fresa", radius: 25 * scaleFactor, color: '#ff8888', emoji: '🍓', points: 3 },
  { name: "Uva", radius: 35 * scaleFactor, color: '#8a2be2', emoji: '🍇', points: 6 },
  { name: "Mandarina", radius: 45 * scaleFactor, color: '#ffa500', emoji: '🍊', points: 10 },
  { name: "Naranja", radius: 60 * scaleFactor, color: '#ff8c00', emoji: '🟠', points: 15 },
  { name: "Manzana", radius: 75 * scaleFactor, color: '#dc143c', emoji: '🍎', points: 21 },
  { name: "Pera", radius: 95 * scaleFactor, color: '#fada5e', emoji: '🍐', points: 28 },
  { name: "Durazno", radius: 115 * scaleFactor, color: '#ffb6c1', emoji: '🍑', points: 36 },
  { name: "Piña", radius: 140 * scaleFactor, color: '#ffe4b5', emoji: '🍍', points: 45 },
  { name: "Melón", radius: 170 * scaleFactor, color: '#90ee90', emoji: '🍈', points: 55 },
  { name: "Sandía", radius: 200 * scaleFactor, color: '#228b22', emoji: '🍉', points: 66 },
];

let engine, render, runner;
let currentScore = 0;
let nextFruitTier = 0;
let isGameOver = false;
let isDropping = false;

// DOM Elements
const scoreEl = document.getElementById('score');
const nextPreviewEl = document.getElementById('next-fruit-preview');
const nextFruitNameEl = document.getElementById('next-fruit-name');
const gameOverScreen = document.getElementById('game-over-screen');
const startScreen = document.getElementById('start-screen');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-button');
const startGameBtn = document.getElementById('start-game-btn');
const gameContainer = document.getElementById('game-container');

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

  // Create Boundaries (Left, Right, Bottom) with transparent stroke
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

  Matter.Render.run(render);
  runner = Matter.Runner.create();
  Matter.Runner.run(runner, engine);
  Matter.Events.on(render, 'afterRender', gameLoop);

  // Don't start until user clicks Start (Audio context requires user gesture)
}

// --- Game Logic ---

function resetGame() {
  isGameOver = false;
  currentScore = 0;
  updateScore();
  
  // Remove only the fruits, keep the walls
  const bodies = Matter.Composite.allBodies(engine.world);
  const fruitsToRemove = bodies.filter(b => b.fruitTier !== undefined);
  Matter.World.remove(engine.world, fruitsToRemove);
  
  gameOverScreen.classList.add('hidden');
  rollNextFruit();
  startBGM();
}

function rollNextFruit() {
  nextFruitTier = Math.floor(Math.random() * 5);
  const next = FRUITS[nextFruitTier];
  
  nextFruitNameEl.innerText = next.name;
  
  nextPreviewEl.innerHTML = '';
  const previewCanvas = document.createElement('canvas');
  const size = next.radius * 2;
  previewCanvas.width = size;
  previewCanvas.height = size;
  const ctx = previewCanvas.getContext('2d');
  
  // Draw preview face
  ctx.translate(size/2, size/2);
  ctx.beginPath();
  ctx.arc(0, 0, next.radius, 0, 2 * Math.PI);
  ctx.fillStyle = next.color;
  ctx.fill();
  
  ctx.font = `${next.radius * 1.2}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(next.emoji, 0, 0);
  
  ctx.beginPath();
  ctx.arc(-next.radius * 0.3, -next.radius * 0.3, next.radius * 0.25, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fill();
  
  nextPreviewEl.appendChild(previewCanvas);
}

function updateScore() {
  scoreEl.innerText = currentScore;
}

function dropFruit(x) {
  if (isGameOver || isDropping) return;
  
  const fruitConfig = FRUITS[nextFruitTier];
  const spawnX = Math.max(fruitConfig.radius, Math.min(x, GAME_WIDTH - fruitConfig.radius));
  
  const body = Matter.Bodies.circle(spawnX, TOP_LIMIT, fruitConfig.radius, {
    restitution: 0.2,
    friction: 0.1,
    render: {
      fillStyle: fruitConfig.color,
      lineWidth: 0,
      strokeStyle: 'transparent'
    },
    label: `fruit-${nextFruitTier}`
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
            render: { fillStyle: newFruitConfig.color, lineWidth: 0, strokeStyle: 'transparent' },
            label: `fruit-${nextTier}`
          });
          newBody.fruitTier = nextTier;

          Matter.World.add(engine.world, newBody);
          playMergeSound(nextTier);
          
          currentScore += newFruitConfig.points;
          updateScore();
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
      
      // Draw the original fruit emoji
      context.font = `${config.radius * 1.2}px Arial`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(config.emoji, 0, 0);
      
      // Draw a subtle highlight (gloss) over the emoji
      context.beginPath();
      context.arc(-config.radius * 0.3, -config.radius * 0.3, config.radius * 0.25, 0, 2 * Math.PI);
      context.fillStyle = 'rgba(255, 255, 255, 0.35)';
      context.fill();

      // Draw cute face on top of the fruit
      context.fillStyle = '#4a2511'; 
      const eyeOffset = config.radius * 0.35;
      const eyeSize = config.radius * 0.08 + 1.5;
      
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
      
      if (body.fruitTier === 10) {
        context.arc(0, eyeOffset * 0.2, eyeOffset * 0.5, 0, Math.PI);
        context.stroke();
        context.fillStyle = '#ff7777';
        context.fill();
      } else if (body.fruitTier === 0) {
        context.arc(0, eyeOffset * 0.2, eyeOffset * 0.3, 0.2, Math.PI - 0.2);
        context.stroke();
      } else {
        context.arc(0, eyeOffset * 0.1, eyeOffset * 0.6, 0.1, Math.PI - 0.1);
        context.stroke();
      }
      
      context.restore();
    }
    
    if (!isGameOver && body.fruitTier !== undefined && body.position.y < TOP_LIMIT && body.velocity.y > -0.5 && body.velocity.y < 0.5) {
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
  finalScoreEl.innerText = currentScore;
  
  document.getElementById('submit-score-section').style.display = 'flex';
  document.getElementById('player-name').value = '';
  const submitBtn = document.getElementById('submit-score-btn');
  submitBtn.disabled = false;
  submitBtn.innerText = 'Guardar Puntaje';
  
  gameOverScreen.classList.remove('hidden');
  loadLeaderboard();
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
  startGameBtn.addEventListener('click', () => {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    startScreen.classList.add('hidden');
    resetGame();
  });

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
    resetGame();
  });
  
  document.getElementById('submit-score-btn').addEventListener('click', async () => {
    const nameInput = document.getElementById('player-name');
    const btn = document.getElementById('submit-score-btn');
    const name = nameInput.value.trim();
    
    if (!name) {
      alert('Por favor, ingresa tu nombre');
      return;
    }
    
    btn.disabled = true;
    btn.innerText = 'Guardando...';
    
    const success = await saveScore(name, currentScore);
    if (success) {
      document.getElementById('submit-score-section').style.display = 'none';
      await loadLeaderboard();
    } else {
      alert('Error al guardar el puntaje. Revisa la conexión.');
      btn.disabled = false;
      btn.innerText = 'Guardar Puntaje';
    }
  });
}

// Start
init();
