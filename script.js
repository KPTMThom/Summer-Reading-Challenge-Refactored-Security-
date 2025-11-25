/* ========= CONFIG ========= */
const SUPABASE_URL = 'https://hfugnpqguidgosxyuioj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdWducHFndWlkZ29zeHl1aW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NjE3ODAsImV4cCI6MjA3ODAzNzc4MH0.eawP-KaZTXOAE_OSYeJR6Ds_c6aKsqOsXo_EGifgtrU';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const COMMUNITY_GOAL = 2_000_000;
let currentUser = null;
let stopwatchInterval = null;
let startTime = null;

/* ========= UTILS ========= */
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/* ========= SUPABASE DATA FUNCTIONS ========= */
async function getUserDataById(uuid) {
  const { data, error } = await supabase
    .from('Userdetails')
    .select('*')
    .eq('id', uuid)
    .single();
  if (error) throw error;
  return data;
}

async function getUserLogsById(userId) {
  const { data, error } = await supabase
    .from('loghistory')
    .select('minutes_logged, time_logged')
    .eq('user_id', userId)
    .order("time_logged", { ascending: false });
  if (error) throw error;
  return data;
}

async function getAllUsers() {
  const { data, error } = await supabase.from('Userdetails').select('user_name, minutes_logged');
  if (error) throw error;
  return data;
}

async function getAllLogs() {
  const { data, error } = await supabase.from('loghistory').select('minutes_logged');
  if (error) throw error;
  return data;
}

async function logReadingMinutes(user, minutes, bookTitle) {
  const { error } = await supabase.from('loghistory').insert([{
    user_id: user.id,
    minutes_logged: minutes,
    book_title: bookTitle,
    time_logged: new Date().toISOString()
  }]);
  
  if (error) {
    throw error;
  }
  await loadDashboard();
}

/* ========= RENDER UI FUNCTIONS ========= */
function renderWelcome(user) {
  document.getElementById('profileInitial').textContent = user.user_name[0].toUpperCase();
  document.getElementById('welcomeMessage').textContent = `Hi, ${user.user_name}! 👋`;
}

function renderUserMinutes(total) {
  document.getElementById('userMinutes').textContent = total.toLocaleString();
}

function renderLeaderboard(users) {
  const container = document.getElementById('leaderboardContainer');
  container.innerHTML = '';
  if (!users.length) return (container.textContent = 'No data yet.');

  users
    .sort((a, b) => b.minutes_logged - a.minutes_logged)
    .slice(0, 10)
    .forEach((user, index) => {
      const bar = document.createElement('div');
      bar.classList.add('leaderboard-bar');
      // Added rank number for neatness
      bar.innerHTML = `
        <span style="font-weight:bold; margin-right:10px; color:var(--primary); width:20px;">#${index+1}</span>
        <div class="leaderboard-profile">${user.user_name[0].toUpperCase()}</div>
        <div class="leaderboard-label">${user.user_name}</div>
        <div style="flex-grow:1; text-align:right; font-weight:bold; color:var(--primary-dark);">${user.minutes_logged} min</div>
      `;
      container.appendChild(bar);
    });
}

function renderProgressBar(total) {
  const fill = document.getElementById('progressFill');
  const text = document.getElementById('progressText');
  const percent = Math.min((total / COMMUNITY_GOAL) * 100, 100);
  
  fill.style.width = `${percent}%`;
  text.textContent = `${total.toLocaleString()} / ${COMMUNITY_GOAL.toLocaleString()} minutes (${percent.toFixed(1)}%)`;
}

/* ========= READING STREAK ========= */
async function loadReadingStreak() {
  if (!currentUser) return;
  const logs = await getUserLogsById(currentUser.id);

  const streakEl = document.getElementById("readingStreakDisplay");
  const highScoreEl = document.getElementById("dailyHighScoreDisplay");

  if (!logs || logs.length === 0) {
    streakEl.textContent = "0 Days";
    highScoreEl.textContent = "Daily Best: 0 min";
    return;
  }

  let dayTotals = {};
  logs.forEach(l => {
    const day = new Date(l.time_logged).toISOString().slice(0, 10);
    dayTotals[day] = (dayTotals[day] || 0) + l.minutes_logged;
  });

  const highScore = Math.max(...Object.values(dayTotals));
  highScoreEl.textContent = "Daily Best: " + highScore + " min";

  const days = Object.keys(dayTotals).sort().reverse();
  const today = new Date();
  const latestDay = new Date(days[0]);
  const THIRTY_TWO_HOURS = 32 * 60 * 60 * 1000;

  if (today - latestDay > THIRTY_TWO_HOURS) {
    streakEl.textContent = "0 Days";
    return;
  }

  let streak = 1;
  const daysBetween = (a, b) => {
    const d1 = new Date(a);
    const d2 = new Date(b);
    return Math.round((d1 - d2) / (24 * 60 * 60 * 1000));
  };

  for (let i = 1; i < days.length; i++) {
    if (daysBetween(days[i - 1], days[i]) === 1) streak++;
    else break;
  }

  streakEl.textContent = `${streak} Days 🔥`;
}

/* ========= DASHBOARD LOGIC ========= */
async function loadDashboard() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return (window.location.href = 'login.html');

  currentUser = await getUserDataById(user.id);
  if (!currentUser) {
    console.error("No user details found.");
    return (window.location.href = 'login.html');
  }

  renderWelcome(currentUser);

  const userLogs = await getUserLogsById(currentUser.id);
  const totalUserMinutes = userLogs.reduce((s, e) => s + e.minutes_logged, 0);
  renderUserMinutes(totalUserMinutes);

  await supabase
    .from('Userdetails')
    .update({ minutes_logged: totalUserMinutes })
    .eq('id', currentUser.id);

  const allUsers = await getAllUsers();
  renderLeaderboard(allUsers);

  const allLogs = await getAllLogs();
  const totalCommunityMinutes = allLogs.reduce((s, e) => s + e.minutes_logged, 0);
  renderProgressBar(totalCommunityMinutes);

  await loadBingo();
  await loadReadingStreak();
}

/* ========= NEW BINGO LOGIC ========= */
const BINGO_SIZE = 5;
let bingoData = [];
let userBingoState = Array(BINGO_SIZE).fill(null).map(() => Array(BINGO_SIZE).fill(false));
let BINGO_WIN_BONUS = 20;
let currentBingoIndex = null; // Tracks which bingo square is currently opened in modal

// Helper to create short 1-2 word titles from long descriptions
// YOU MAY NEED TO ADJUST THESE KEYWORDS BASED ON YOUR DATABASE CONTENT
function getShortBingoTitle(description) {
    const text = description.toLowerCase();
    if (text.includes("comic") || text.includes("graphic")) return "Comic Book";
    if (text.includes("mystery")) return "Mystery";
    if (text.includes("fantasy")) return "Fantasy";
    if (text.includes("sci-fi") || text.includes("science fiction")) return "Sci-Fi";
    if (text.includes("non-fiction") || text.includes("fact")) return "Non-Fiction";
    if (text.includes("animal")) return "Animal Book";
    if (text.includes("friend")) return "Read to Friend";
    if (text.includes("outside")) return "Read Outside";
    if (text.includes("bed")) return "Read in Bed";
    if (text.includes("series")) return "Start Series";
    if (text.includes("new author")) return "New Author";
    if (text.includes("blue cover")) return "Blue Cover";
    if (text.includes("red cover")) return "Red Cover";
    if (text.includes("minutes")) return "Read 20 Mins";
    // Fallback: grab first two words if no keywords match
    const words = description.split(" ");
    return words.slice(0, 2).join(" ");
}


async function getBingoData() {
  const { data, error } = await supabase.from("bingochallenges").select("*");
  if (error) throw error;
  return data;
}

async function getUserBingoState(userId) {
  const { data, error } = await supabase.from("user_bingo_state").select("*").eq("user_id", userId);
  if (error) throw error;
  
  const state = Array(BINGO_SIZE).fill(null).map(() => Array(BINGO_SIZE).fill(false));
  if (data) {
    data.forEach(row => {
      const r = Math.floor(row.bingo_index / BINGO_SIZE);
      const c = row.bingo_index % BINGO_SIZE;
      state[r][c] = row.completed;
    });
  }
  return state;
}

function renderBingoBoard(challenges) {
  const board = document.getElementById("bingoBoard");
  board.innerHTML = "";
  bingoData = challenges;

  challenges.forEach((item, index) => {
    const cell = document.createElement("div");
    cell.id = `bingo-cell-${index}`; // Add ID for easy finding later
    const span = document.createElement("span");
    
    // Use the new short title generator
    span.textContent = getShortBingoTitle(item.challenge);
    cell.appendChild(span);

    const row = Math.floor(index / BINGO_SIZE);
    const col = index % BINGO_SIZE;

    if (userBingoState[row][col]) cell.classList.add("completed");

    // Open Modal on click instead of immediately processing
    cell.addEventListener("click", () => openBingoModal(index));
    board.appendChild(cell);
  });
}

// --- Modal Functions ---

function openBingoModal(index) {
    currentBingoIndex = index;
    const challenge = bingoData[index];
    const row = Math.floor(index / BINGO_SIZE);
    const col = index % BINGO_SIZE;
    const isCompleted = userBingoState[row][col];

    const modal = document.getElementById('bingoModal');
    const title = document.getElementById('modalTitle');
    const desc = document.getElementById('modalDescription');
    const confirmBtn = document.getElementById('modalConfirmBtn');

    // Set modal content based on state
    if (isCompleted) {
        title.textContent = "Completed Challenge!";
        desc.textContent = `You have already completed: "${challenge.challenge}". Do you want to unmark it?`;
        confirmBtn.textContent = "Unmark Challenge ↩️";
        confirmBtn.classList.remove('btn-primary');
        confirmBtn.classList.add('btn-secondary'); // Use secondary color for unmarking
    } else {
        title.textContent = getShortBingoTitle(challenge.challenge);
        desc.textContent = challenge.challenge; // Show full description here
        desc.innerHTML += `<br><br><strong>Bonus: +${challenge.bonus_minutes} mins</strong>`;
        confirmBtn.textContent = "I Did It! ✅";
        confirmBtn.classList.remove('btn-secondary');
        confirmBtn.classList.add('btn-primary');
    }
    
    modal.classList.remove('hidden');
}

function closeBingoModal() {
    document.getElementById('bingoModal').classList.add('hidden');
    currentBingoIndex = null;
}

// Called when "I Did It" or "Unmark" is clicked in modal
async function processBingoAction() {
    if (currentBingoIndex === null) return;
    
    const index = currentBingoIndex;
    closeBingoModal(); // Close modal first

    const cell = document.getElementById(`bingo-cell-${index}`);
    const row = Math.floor(index / BINGO_SIZE);
    const col = index % BINGO_SIZE;
    const bonus = bingoData[index].bonus_minutes;
    const challengeName = bingoData[index].challenge;

    const prevState = JSON.parse(JSON.stringify(userBingoState));
    const wasCompleted = userBingoState[row][col];
    const newCompleted = !wasCompleted;

    // Optimistic UI update
    userBingoState[row][col] = newCompleted;
    cell.classList.toggle("completed", newCompleted);

    const hadBingoBefore = checkAnyBingo(prevState);
    const hasBingoAfter = checkAnyBingo(userBingoState);

    if (!hadBingoBefore && hasBingoAfter) launchConfetti();

    try {
        // Database updates (same as before)
        const { data: existing } = await supabase
        .from("user_bingo_state")
        .select("*")
        .eq("user_id", currentUser.id)
        .eq("bingo_index", index)
        .limit(1);

        if (existing && existing.length > 0) {
        await supabase
            .from("user_bingo_state")
            .update({
            completed: newCompleted,
            completed_at: newCompleted ? new Date().toISOString() : null
            })
            .eq("user_id", currentUser.id)
            .eq("bingo_index", index);
        } else {
        await supabase.from("user_bingo_state").insert([{
            user_id: currentUser.id,
            bingo_index: index,
            completed: true,
            completed_at: new Date().toISOString()
        }]);
        }

        await logReadingMinutes(
        currentUser,
        newCompleted ? bonus : -bonus,
        `${newCompleted ? "Bingo" : "Unmark Bingo"}: ${challengeName}`
        );

        if (!hadBingoBefore && hasBingoAfter) {
        await logReadingMinutes(currentUser, BINGO_WIN_BONUS, "Bingo Board Win");
        }
        if (hadBingoBefore && !hasBingoAfter) {
        await logReadingMinutes(currentUser, -BINGO_WIN_BONUS, "Bingo Board Win Reverted");
        }

    } catch (err) {
        console.error(err);
        // Revert UI if error
        userBingoState[row][col] = wasCompleted;
        cell.classList.toggle("completed", wasCompleted);
        alert("Error saving bingo state. Please try again.");
    }
}

function checkAnyBingo(state) {
  for (let r = 0; r < BINGO_SIZE; r++) if (state[r].every(v => v)) return true;
  for (let c = 0; c < BINGO_SIZE; c++) if (state.every(row => row[c])) return true;
  if (state.every((row, i) => row[i])) return true;
  if (state.every((row, i) => row[BINGO_SIZE - 1 - i])) return true;
  return false;
}

async function loadBingo() {
  try {
    const data = await getBingoData();
    if (!data || data.length < 25) return;

    BINGO_WIN_BONUS = data.find(d => d.type === "win_bonus")?.bonus_minutes || 20;
    userBingoState = await getUserBingoState(currentUser.id);
    renderBingoBoard(data.slice(0, 25));
  } catch (err) {
    console.error("Error loading bingo:", err);
  }
}

/* ========= CONFETTI ========= */
const confettiCanvas = document.getElementById("confettiCanvas");
const ctx = confettiCanvas.getContext("2d");

function resizeConfetti() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
resizeConfetti();
window.addEventListener("resize", resizeConfetti);

function launchConfetti() {
  const confetti = [];
  // Updated confetti colors to match new theme
  const colors = ["#0288D1", "#F57C00", "#43A047", "#FFD600", "#E1F5FE"];
  const duration = 2500;
  const endTime = Date.now() + duration;

  for (let i = 0; i < 150; i++) {
    confetti.push({
      x: Math.random() * confettiCanvas.width,
      y: Math.random() * confettiCanvas.height - confettiCanvas.height,
      w: Math.random() * 8 + 5,
      h: Math.random() * 10 + 5,
      c: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * 4 + 4,
      rotation: Math.random() * 360,
      vrot: Math.random() * 10 - 5
    });
  }

  function animate() {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    let active = false;

    confetti.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vrot;

      if (p.y < confettiCanvas.height) active = true;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (active || Date.now() < endTime) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }
  animate();
}

/* ========= EVENT LISTENERS ========= */
document.getElementById('profileIcon').addEventListener('click', e => {
  e.stopPropagation();
  const dropdown = document.getElementById('profileDropdown');
  dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
});

document.addEventListener('click', e => {
  if (!document.getElementById('profileIcon').contains(e.target))
    document.getElementById('profileDropdown').style.display = 'none';
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
});

// Bingo Modal Listeners
document.getElementById('modalCancelBtn').addEventListener('click', closeBingoModal);
document.getElementById('modalConfirmBtn').addEventListener('click', processBingoAction);
// Close modal if clicking outside the content box
document.getElementById('bingoModal').addEventListener('click', (e) => {
    if(e.target === document.getElementById('bingoModal')) closeBingoModal();
});


// LOG MINUTES BUTTON
document.getElementById('logMinutesBtn').addEventListener('click', async () => {
  const minutesInput = document.getElementById('minutesInput');
  const titleInput = document.getElementById('bookTitleInput');
  const minutes = parseInt(minutesInput.value);
  const title = titleInput.value.trim();
  const msg = document.getElementById('logMessage');
  
  msg.textContent = '';
  
  if (!title) return (msg.textContent = '⚠️ Please enter the book name!');
  if (isNaN(minutes) || minutes < 1 || minutes > 120)
    return (msg.textContent = '⚠️ Enter minutes between 1 and 120.');

  try {
    const btn = document.getElementById('logMinutesBtn');
    btn.textContent = "Saving...";
    await logReadingMinutes(currentUser, minutes, title);
    
    minutesInput.value = '';
    titleInput.value = '';
    btn.textContent = "Saved! 🎉";
    setTimeout(() => btn.textContent = "Save Minutes", 2000);
    
  } catch (err) {
    msg.textContent = 'Error: ' + err.message;
  }
});

// STOPWATCH BUTTON
document.getElementById('stopwatchBtn').addEventListener('click', async () => {
  const display = document.getElementById('stopwatchDisplay');
  const btn = document.getElementById('stopwatchBtn');
  const msg = document.getElementById('logMessage');
  msg.textContent = '';

  if (!stopwatchInterval) {
    startTime = Date.now();
    btn.textContent = '⏹ Stop';
    btn.classList.add('btn-secondary');
    
    stopwatchInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      display.textContent = formatTime(elapsed);
    }, 1000);
    return;
  }

  const title = document.getElementById('bookTitleInput').value.trim();
  if (!title) {
    msg.textContent = '⚠️ Please write the book title first!';
    return;
  }

  clearInterval(stopwatchInterval);
  stopwatchInterval = null;
  btn.textContent = 'Start Timer';
  btn.classList.remove('btn-secondary');

  const elapsedMinutes = Math.round((Date.now() - startTime) / 60000);
  
  if (elapsedMinutes < 1) {
    msg.textContent = '⚠️ That was too short to count (< 1 min).';
    display.textContent = "00:00";
    return;
  }

  if (confirm(`Great job! You read for ${elapsedMinutes} minutes. Log it?`)) {
    await logReadingMinutes(currentUser, elapsedMinutes, title);
    document.getElementById('bookTitleInput').value = '';
    display.textContent = "00:00";
  }
});


/* ========= INIT ========= */
loadDashboard();
