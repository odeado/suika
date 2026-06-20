import './style.css';
import Matter from 'matter-js';
import { saveScore, getTopScores } from './firebase.js';

// --- Game Configuration & State ---
const GAME_WIDTH = 400;
const GAME_HEIGHT = 600;
const WALL_THICKNESS = 60;
const TOP_LIMIT = 100; // y-coordinate limit for Game Over

// Fruit configurations (tier 0 to 10)
const FRUITS = [
  { radius: 15, color: '#ff0000', emoji: '🍒', points: 1 },    // 0: Cherry
  { radius: 25, color: '#ff8888', emoji: '🍓', points: 3 },    // 1: Strawberry
  { radius: 35, color: '#800080', emoji: '🍇', points: 6 },    // 2: Grape
  { radius: 45, color: '#ffa500', emoji: '🍊', points: 10 },   // 3: Dekopon
  { radius: 60, color: '#ff8c00', emoji: '🟠', points: 15 },   // 4: Orange
  { radius: 75, color: '#ff0000', emoji: '🍎', points: 21 },   // 5: Apple
  { radius: 95, color: '#fada5e', emoji: '🍐', points: 28 },   // 6: Pear
  { radius: 115, color: '#ffb6c1', emoji: '🍑', points: 36 },  // 7: Peach
  { radius: 140, color: '#ffe4b5', emoji: '🍍', points: 45 },  // 8: Pineapple
  { radius: 170, color: '#90ee90', emoji: '🍈', points: 55 },  // 9: Melon
  { radius: 200, color: '#006400', emoji: '🍉', points: 66 },  // 10: Watermelon
];

let engine, render, runner;
let currentScore = 0;
let nextFruitTier = 0;
let isGameOver = false;
let isDropping = false;

// DOM Elements
const scoreEl = document.getElementById('score');
const nextPreviewEl = document.getElementById('next-fruit-preview');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-button');
const gameContainer = document.getElementById('game-container');

// --- Initialization ---
function init() {
  // Setup Matter.js modules
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

  // Create Boundaries (Left, Right, Bottom)
  const wallOptions = { 
    isStatic: true,
    render: { fillStyle: '#8d6e63' }
  };
  
  const ground = Matter.Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT + WALL_THICKNESS / 2, GAME_WIDTH + WALL_THICKNESS * 2, WALL_THICKNESS, wallOptions);
  const leftWall = Matter.Bodies.rectangle(0 - WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, wallOptions);
  const rightWall = Matter.Bodies.rectangle(GAME_WIDTH + WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, wallOptions);

  Matter.World.add(engine.world, [ground, leftWall, rightWall]);

  // Handle Collisions (Merging)
  Matter.Events.on(engine, 'collisionStart', handleCollisions);

  // Setup Interaction
  setupInput();

  // Start the engine and renderer
  Matter.Render.run(render);
  runner = Matter.Runner.create();
  Matter.Runner.run(runner, engine);

  // Start Game Loop (for custom rendering like emojis and game over checks)
  Matter.Events.on(render, 'afterRender', gameLoop);

  // Initial State
  resetGame();
}

// --- Game Logic ---

function resetGame() {
  Matter.World.clear(engine.world);
  Matter.Engine.clear(engine);
  Matter.World.add(engine.world, [
    Matter.Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT + WALL_THICKNESS / 2, GAME_WIDTH + WALL_THICKNESS * 2, WALL_THICKNESS, { isStatic: true, render: { fillStyle: '#8d6e63' } }),
    Matter.Bodies.rectangle(0 - WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, { isStatic: true, render: { fillStyle: '#8d6e63' } }),
    Matter.Bodies.rectangle(GAME_WIDTH + WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, { isStatic: true, render: { fillStyle: '#8d6e63' } })
  ]);
  
  currentScore = 0;
  isGameOver = false;
  updateScore();
  gameOverScreen.classList.add('hidden');
  rollNextFruit();
}

function rollNextFruit() {
  // Randomly pick one of the first 5 fruits (tiers 0 to 4)
  nextFruitTier = Math.floor(Math.random() * 5);
  const next = FRUITS[nextFruitTier];
  
  nextPreviewEl.innerHTML = '';
  const previewDiv = document.createElement('div');
  previewDiv.className = 'fruit-preview-circle';
  previewDiv.style.width = `${next.radius}px`;
  previewDiv.style.height = `${next.radius}px`;
  previewDiv.style.backgroundColor = next.color;
  previewDiv.innerText = next.emoji;
  previewDiv.style.fontSize = `${next.radius * 0.7}px`;
  
  nextPreviewEl.appendChild(previewDiv);
}

function updateScore() {
  scoreEl.innerText = currentScore;
}

function dropFruit(x) {
  if (isGameOver || isDropping) return;
  
  const fruitConfig = FRUITS[nextFruitTier];
  
  // Constrain x so it doesn't spawn inside a wall
  const spawnX = Math.max(fruitConfig.radius, Math.min(x, GAME_WIDTH - fruitConfig.radius));
  
  const body = Matter.Bodies.circle(spawnX, TOP_LIMIT, fruitConfig.radius, {
    restitution: 0.2,
    friction: 0.1,
    render: {
      fillStyle: fruitConfig.color,
    },
    label: `fruit-${nextFruitTier}`
  });

  // Assign tier to the body for merging logic
  body.fruitTier = nextFruitTier;

  Matter.World.add(engine.world, body);
  
  // Prevent spamming drops
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

    // Check if both are fruits and have the same tier
    if (bodyA.fruitTier !== undefined && bodyB.fruitTier !== undefined) {
      if (bodyA.fruitTier === bodyB.fruitTier) {
        
        // Prevent merging max tier (watermelon)
        if (bodyA.fruitTier === FRUITS.length - 1) continue;

        // Ensure we only process this pair once by removing them
        // if they are still in the world
        const isAInWorld = Matter.Composite.get(engine.world, bodyA.id, 'body');
        const isBInWorld = Matter.Composite.get(engine.world, bodyB.id, 'body');
        
        if (isAInWorld && isBInWorld) {
          const nextTier = bodyA.fruitTier + 1;
          const newFruitConfig = FRUITS[nextTier];
          
          // Calculate midpoint for spawn
          const newX = (bodyA.position.x + bodyB.position.x) / 2;
          const newY = (bodyA.position.y + bodyB.position.y) / 2;

          // Remove old bodies
          Matter.World.remove(engine.world, [bodyA, bodyB]);

          // Create new merged body
          const newBody = Matter.Bodies.circle(newX, newY, newFruitConfig.radius, {
            restitution: 0.2,
            friction: 0.1,
            render: { fillStyle: newFruitConfig.color },
            label: `fruit-${nextTier}`
          });
          newBody.fruitTier = nextTier;

          Matter.World.add(engine.world, newBody);
          
          // Add score
          currentScore += newFruitConfig.points;
          updateScore();
        }
      }
    }
  }
}

function gameLoop() {
  if (isGameOver) return;

  const context = render.context;
  const bodies = Matter.Composite.allBodies(engine.world);

  // Custom Rendering for Cute Faces
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
      context.fillStyle = '#4a2511'; // Dark brown for eyes/mouth
      const eyeOffset = config.radius * 0.35;
      const eyeSize = config.radius * 0.08 + 1.5;
      
      // Left eye
      context.beginPath();
      context.arc(-eyeOffset, -eyeOffset * 0.1, eyeSize, 0, Math.PI * 2);
      context.fill();
      
      // Right eye
      context.beginPath();
      context.arc(eyeOffset, -eyeOffset * 0.1, eyeSize, 0, Math.PI * 2);
      context.fill();
      
      // Blush
      context.fillStyle = 'rgba(255, 120, 150, 0.4)';
      context.beginPath();
      context.arc(-eyeOffset * 1.3, eyeOffset * 0.3, eyeSize * 1.8, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(eyeOffset * 1.3, eyeOffset * 0.3, eyeSize * 1.8, 0, Math.PI * 2);
      context.fill();
      
      // Smile (a little arc)
      context.strokeStyle = '#4a2511';
      context.lineWidth = Math.max(1.5, config.radius * 0.06);
      context.lineCap = 'round';
      context.beginPath();
      
      // Watermelon gets a big open mouth
      if (body.fruitTier === 10) {
        context.arc(0, eyeOffset * 0.2, eyeOffset * 0.5, 0, Math.PI);
        context.stroke();
        context.fillStyle = '#ff7777';
        context.fill();
      } else if (body.fruitTier === 0) {
        // Cherry gets a small cute mouth
        context.arc(0, eyeOffset * 0.2, eyeOffset * 0.3, 0.2, Math.PI - 0.2);
        context.stroke();
      } else {
        // Default smile
        context.arc(0, eyeOffset * 0.1, eyeOffset * 0.6, 0.1, Math.PI - 0.1);
        context.stroke();
      }
      
      context.restore();
    }
    
    // Game Over Check: If any stationary fruit is above the TOP_LIMIT line
    if (body.fruitTier !== undefined && body.position.y < TOP_LIMIT && body.velocity.y > -0.5 && body.velocity.y < 0.5) {
      // Small grace period check to ensure it's not just bouncing
      if (body.speed < 1) {
        triggerGameOver();
      }
    }
  }
  
  // Draw Top Limit Line (Danger Line)
  context.beginPath();
  context.moveTo(0, TOP_LIMIT);
  context.lineTo(GAME_WIDTH, TOP_LIMIT);
  context.strokeStyle = 'rgba(255, 0, 0, 0.5)';
  context.setLineDash([10, 10]);
  context.stroke();
  context.setLineDash([]);
}

function triggerGameOver() {
  if (isGameOver) return;
  isGameOver = true;
  finalScoreEl.innerText = currentScore;
  
  // Reset submission UI
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
    li.innerHTML = `<span>#${index + 1} ${scoreObj.name}</span> <span>${scoreObj.score}</span>`;
    listEl.appendChild(li);
  });
}

function setupInput() {
  // Handle mouse click or touch on the game container
  gameContainer.addEventListener('mousedown', (e) => {
    const rect = gameContainer.getBoundingClientRect();
    const scale = rect.width / GAME_WIDTH;
    const x = (e.clientX - rect.left) / scale;
    dropFruit(x);
  });
  
  gameContainer.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent scrolling
    const rect = gameContainer.getBoundingClientRect();
    const scale = rect.width / GAME_WIDTH;
    const x = (e.touches[0].clientX - rect.left) / scale;
    dropFruit(x);
  }, { passive: false });

  restartBtn.addEventListener('click', resetGame);
  
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
