/* ========= CONFIG ========= */
  const SUPABASE_URL = 'https://hfugnpqguidgosxyuioj.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdWducHFndWlkZ29zeHl1aW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NjE3ODAsImV4cCI6MjA3ODAzNzc4MH0.eawP-KaZTXOAE_OSYeJR6Ds_c6aKsqOsXo_EGifgtrU';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const COMMUNITY_GOAL = 1_000_000;
  let currentUser = null;
  let stopwatchInterval = null;
  let startTime = null;
  let STREAK_INTERVAL_SECONDS = 24 * 60 * 60;

  /* ========= UTILS ========= */
  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  /* ========= SUPABASE HELPERS ========= */
  async function getUserDataById(uuid) {
    const { data, error } = await supabase
      .from('Userdetails')
      .select('*')
      .eq('UUID', uuid)
      .single();
    if (error) throw error;
    return data;
  }

  async function getUserLogsById(userId) {
    const { data, error } = await supabase
      .from('loghistory')
      .select('minutes_logged, time_logged')
      .eq('UUID', userId)
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
      UUID: user.UUID,
      minutes_logged: minutes,
      book_title: bookTitle,
      time_logged: new Date().toISOString()
    }]);
    loadDashboard();
    if (error) throw error;
  }

    /* ========= USERNAME PROMPT ========= */
async function ensureUsername() {
  if (!currentUser) return;
  if (currentUser.user_name && currentUser.user_name.trim() !== "") return;

  let newName = "";
  while (true) {
    newName = prompt("Welcome! Please choose a unique display name (No real names):");
    if (newName === null) {
      alert("A display name is required to continue.");
      continue;
    }
    newName = newName.trim();
    if (newName.length < 3) {
      alert("Username must be at least 3 characters.");
      continue;
    }

    const { data: existingUsers, error } = await supabase
      .from("Userdetails")
      .select("user_name")
      .ilike("user_name", newName);

    if (error) {
      alert("Error checking username.");
      continue;
    }
    if (existingUsers.length > 0) {
      alert(`The name "${newName}" is taken. Try another.`);
      continue;
    }
    break;
  }

  const { error: updateError } = await supabase
    .from("Userdetails")
    .update({ user_name: newName })
    .eq("UUID", currentUser.UUID);

  if (updateError) {
    alert("Error saving username.");
    return ensureUsername();
  }
  currentUser.user_name = newName;
}


  /* ========= RENDER FUNCTIONS ========= */
  function renderWelcome(user) {
    document.getElementById('profileInitial').textContent = user.user_name[0].toUpperCase();
    document.getElementById('welcomeMessage').textContent = `Hello, ${user.user_name}!`;
  }

  function renderUserMinutes(total) {
    document.getElementById('userMinutes').textContent = total.toLocaleString();
  }

  function renderLeaderboard(users) {
  const container = document.getElementById('leaderboardContainer');
  container.innerHTML = '';
  if (!users.length) return (container.textContent = 'No data available.');

  users
    .sort((a, b) => b.minutes_logged - a.minutes_logged)
    .slice(0, 10)
    .forEach(user => {
      const displayName = user.user_name ?? "User";
      const initial = displayName[0].toUpperCase();

      const bar = document.createElement('div');
      bar.classList.add('leaderboard-bar');

      bar.innerHTML = `
        <div class="leaderboard-profile">${initial}</div>
        <div class="leaderboard-label">${displayName}: ${user.minutes_logged} min</div>
      `;
      container.appendChild(bar);
    });
}


 function renderProgressBar(total) {
  const fill = document.getElementById('progressFill');
  const text = document.getElementById('progressText');
  
  // Use a hard cap for the bar visual
  const percent = Math.min((total / COMMUNITY_GOAL) * 100, 100);
  fill.style.width = `${percent}%`;

  const percentText = ((total / COMMUNITY_GOAL) * 100).toFixed(1);
  text.textContent = `${percentText}% of Goal`;
}

  /* ========= NZ DATE HELPER ========= */
function toNZDateString(dateInput) {
  const date = new Date(dateInput);
  const nz = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
  const [day, month, year] = nz.split("/");
  return `${year}-${month}-${day}`;
}

  /* ========= READING STREAK ========= */
  async function loadReadingStreak() {
  if (!currentUser) return;

  const logs = await getUserLogsById(currentUser.UUID);
  const streakEl = document.getElementById("readingStreakDisplay");
  
  if (!logs || logs.length === 0) {
    streakEl.textContent = "0";
    return;
  }

  /* Group by NZ Date */
  const dayTotals = {};
  logs.forEach(l => {
    const day = toNZDateString(l.time_logged);
    dayTotals[day] = (dayTotals[day] || 0) + l.minutes_logged;
  });

  const days = Object.keys(dayTotals).sort().reverse();
  const todayStr = toNZDateString(Date.now());
  const yesterdayStr = toNZDateString(Date.now() - 864e5);
  const latestDay = days[0];

  /* Check break */
  if (latestDay !== todayStr && latestDay !== yesterdayStr) {
    streakEl.textContent = "0";
    await supabase.from("Userdetails").update({ reading_streak: 0 }).eq("UUID", currentUser.UUID);
    return;
  }

  /* Build Streak */
  const toDate = (str) => new Date(str + "T00:00:00");
  let streak = 1;

  for (let i = 1; i < days.length; i++) {
    const prev = toDate(days[i - 1]);
    const curr = toDate(days[i]);
    const diffDays = (prev - curr) / 864e5;
    if (diffDays === 1) streak++;
    else break;
  }

  streakEl.textContent = `${streak}`;
  await supabase.from("Userdetails").update({ reading_streak: streak }).eq("UUID", currentUser.UUID);
}


  /* ========= DASHBOARD LOADER ========= */
  async function loadDashboard() {
  const uuid = sessionStorage.getItem("userId");
  if (!uuid) return window.location.href = "login.html";

  currentUser = await getUserDataById(uuid);
  if (!currentUser) return window.location.href = "login.html";
  
  await ensureUsername();
  renderWelcome(currentUser);

  const userLogs = await getUserLogsById(currentUser.UUID);
  const totalUserMinutes = userLogs.reduce((s, e) => s + e.minutes_logged, 0);
  renderUserMinutes(totalUserMinutes);

  await supabase.from("Userdetails").update({ minutes_logged: totalUserMinutes }).eq("UUID", currentUser.UUID);

  const allUsers = await getAllUsers();
  renderLeaderboard(allUsers);

  const allLogs = await getAllLogs();
  const totalCommunityMinutes = allLogs.reduce((s, e) => s + e.minutes_logged, 0);
  renderProgressBar(totalCommunityMinutes);

  await loadBingo();
  await loadReadingStreak();
}


  /* ========= BINGO LOGIC ========= */
  const BINGO_SIZE = 5;
let bingoData = [];
let userBingoState = Array(BINGO_SIZE).fill(null).map(() => Array(BINGO_SIZE).fill(false));
let BINGO_WIN_BONUS = 20;
let currentBingoIndex = null;

function getShortBingoTitle(description) {
    const text = description.toLowerCase();
    if (text.includes("comic") || text.includes("graphic")) return "Comic Book";
    if (text.includes("mystery")) return "Mystery";
    if (text.includes("fantasy")) return "Fantasy";
    if (text.includes("sci-fi")) return "Sci-Fi";
    if (text.includes("non-fiction")) return "Non-Fiction";
    if (text.includes("animal")) return "Animal Book";
    if (text.includes("friend")) return "Read to Friend";
    if (text.includes("outside")) return "Read Outside";
    if (text.includes("bed")) return "Read in Bed";
    if (text.includes("series")) return "Start Series";
    if (text.includes("new author")) return "New Author";
    if (text.includes("blue cover")) return "Blue Cover";
    if (text.includes("red cover")) return "Red Cover";
    if (text.includes("minutes")) return "Read 20 Mins";
    const words = description.split(" ");
    return words.slice(0, 2).join(" ");
}


async function getBingoData() {
  const { data, error } = await supabase.from("bingochallenges").select("*");
  if (error) throw error;
  return data;
}

async function getUserBingoState(userId) {
  const { data, error } = await supabase.from("user_bingo_state").select("*").eq("UUID", userId);
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
    cell.id = `bingo-cell-${index}`;
    
    // Create span for centering logic (required for Sun CSS)
    const span = document.createElement("span");
    span.textContent = getShortBingoTitle(item.challenge);
    cell.appendChild(span);

    const row = Math.floor(index / BINGO_SIZE);
    const col = index % BINGO_SIZE;

    if (userBingoState[row][col]) cell.classList.add("completed");
    cell.addEventListener("click", () => openBingoModal(index));

    board.appendChild(cell);
  });
  
  // No autofit needed with new CSS
}

// Modal Listeners
document.getElementById('modalConfirmBtn').addEventListener('click', processBingoAction);
document.getElementById('modalCancelBtn').addEventListener('click', closeBingoModal);


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
    const cancelBtn = document.getElementById('modalCancelBtn');

    if (isCompleted) {
        title.textContent = "Completed!";
        desc.textContent = `You have already finished: "${challenge.challenge}". Unmark this tile?`;
        confirmBtn.textContent = "Unmark ↩️";
        confirmBtn.className = "btn btn-outline"; // Reset styling
    } else {
        title.textContent = getShortBingoTitle(challenge.challenge);
        desc.innerHTML = `${challenge.challenge}<br><br><strong>Bonus: +${challenge.bonus_minutes} mins</strong>`;
        confirmBtn.textContent = "I Did It! ✅";
        confirmBtn.className = "btn btn-primary";
    }
    
    modal.classList.remove('hidden');
}

function closeBingoModal() {
    document.getElementById('bingoModal').classList.add('hidden');
    currentBingoIndex = null;
}

// Logic for completing/unmarking
async function processBingoAction() {
    if (currentBingoIndex === null) return;
    
    const index = currentBingoIndex;
    closeBingoModal(); 

    const cell = document.getElementById(`bingo-cell-${index}`);
    const row = Math.floor(index / BINGO_SIZE);
    const col = index % BINGO_SIZE;
    const bonus = bingoData[index].bonus_minutes;
    const challengeName = bingoData[index].challenge;

    const prevState = JSON.parse(JSON.stringify(userBingoState));
    const wasCompleted = userBingoState[row][col];
    const newCompleted = !wasCompleted;

    // UI Update
    userBingoState[row][col] = newCompleted;
    cell.classList.toggle("completed", newCompleted);

    const hadBingoBefore = checkAnyBingo(prevState);
    const hasBingoAfter = checkAnyBingo(userBingoState);

    // Trigger Confetti if new Bingo
    if (!hadBingoBefore && hasBingoAfter) launchConfetti();

    try {
        const { data: existing } = await supabase
        .from("user_bingo_state")
        .select("*")
        .eq("UUID", currentUser.UUID)
        .eq("bingo_index", index)
        .limit(1);

        if (existing && existing.length > 0) {
        await supabase
            .from("user_bingo_state")
            .update({
            completed: newCompleted,
            completed_at: newCompleted ? new Date().toISOString() : null
            })
            .eq("UUID", currentUser.UUID)
            .eq("bingo_index", index);
        } else {
        await supabase.from("user_bingo_state").insert([{
            UUID: currentUser.UUID,
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
        userBingoState[row][col] = wasCompleted;
        cell.classList.toggle("completed", wasCompleted);
        alert("Error saving bingo state.");
    }
}

  function checkAnyBingo(state) {
    for (let r = 0; r < BINGO_SIZE; r++)
      if (state[r].every(v => v)) return true;
    for (let c = 0; c < BINGO_SIZE; c++)
      if (state.every(row => row[c])) return true;
    if (state.every((row, i) => row[i])) return true;
    if (state.every((row, i) => row[BINGO_SIZE - 1 - i])) return true;
    return false;
  }

  async function loadBingo() {
    try {
      const data = await getBingoData();
      if (!data || data.length < 25) {
        console.warn("Not enough bingo challenges.");
        return;
      }
      BINGO_WIN_BONUS = data.find(d => d.type === "win_bonus")?.bonus_minutes || 20;
      userBingoState = await getUserBingoState(currentUser.UUID);
      renderBingoBoard(data.slice(0, 25));
    } catch (err) {
      console.error("Error loading bingo:", err.message);
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
    const colors = ["#ff8b2e", "#ffd54f", "#1cb8ff", "#ff6f91", "#45e1ff"];
    const duration = 2500;
    const endTime = Date.now() + duration;

    for (let i = 0; i < 180; i++) {
      const side = i % 2 === 0 ? "left" : "right";
      confetti.push({
        x: side === "left" ? 0 : confettiCanvas.width,
        y: confettiCanvas.height,
        w: Math.random() * 8 + 4,
        h: Math.random() * 12 + 6,
        c: colors[Math.floor(Math.random() * colors.length)],
        vx: side === "left" ? (Math.random() * 4 + 2) : -(Math.random() * 4 + 2),
        vy: -(Math.random() * 6 + 7),
        gravity: 0.18 + Math.random() * 0.12,
        rotation: Math.random() * 360,
        vrot: Math.random() * 10 - 5
      });
    }

    function animate() {
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      confetti.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rotation += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (Date.now() < endTime) requestAnimationFrame(animate);
      else ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
    animate();
  }

  /* ========= EVENT HANDLERS ========= */
  document.getElementById('profileIcon').addEventListener('click', e => {
    e.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
  });

  document.getElementById('logMinutesBtn').addEventListener('click', async () => {
    const minutes = parseInt(document.getElementById('minutesInput').value);
    const title = document.getElementById('bookTitleInput').value.trim();
    const msg = document.getElementById('logMessage');
    msg.textContent = '';
    if (!title) return (msg.textContent = 'Please enter a book title.');
    if (isNaN(minutes) || minutes < 1 || minutes > 120)
      return (msg.textContent = 'Enter a valid number of minutes (1–120).');

    try {
      await logReadingMinutes(currentUser, minutes, title);
      document.getElementById('minutesInput').value = '';
      document.getElementById('bookTitleInput').value = '';
      await loadDashboard();
    } catch (err) {
      msg.textContent = 'Error logging: ' + err.message;
    }
  });

  document.getElementById('stopwatchBtn').addEventListener('click', async () => {
    const display = document.getElementById('stopwatchDisplay');
    const btn = document.getElementById('stopwatchBtn');
    const msg = document.getElementById('logMessage');
    msg.textContent = '';

    if (!stopwatchInterval) {
      startTime = Date.now();
      btn.textContent = 'Stop Timer';
      stopwatchInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        display.textContent = formatTime(elapsed);
      }, 1000);
      return;
    }

    const title = document.getElementById('bookTitleInput').value.trim();
    if (!title) return (msg.textContent = 'Enter title before stopping.');

    clearInterval(stopwatchInterval);
    stopwatchInterval = null;
    btn.textContent = 'Start Timer';

    const elapsedMinutes = Math.round((Date.now() - startTime) / 60000);
    if (elapsedMinutes < 1) return (msg.textContent = 'Session too short to log.');

    if (confirm(`Log ${elapsedMinutes} minute(s) for "${title}"?`)) {
      await logReadingMinutes(currentUser, elapsedMinutes, title);
      document.getElementById('bookTitleInput').value = '';
      await loadDashboard();
    }
  });

  window.addEventListener('resize', async () => {
    const allLogs = await getAllLogs();
    const total = allLogs.reduce((s, e) => s + e.minutes_logged, 0);
    renderProgressBar(total);
  });

  /* ========= INIT ========= */
  loadDashboard();
