/* ========= CONFIG ========= */
const SUPABASE_URL = 'https://hfugnpqguidgosxyuioj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdWducHFndWlkZ29zeHl1aW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NjE3ODAsImV4cCI6MjA3ODAzNzc4MH0.eawP-KaZTXOAE_OSYeJR6Ds_c6aKsqOsXo_EGifgtrU';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const COMMUNITY_GOAL = 1_000_000;

let currentUser = null;
let stopwatchInterval = null;
let startTime = null;
const STREAK_INTERVAL_SECONDS = 24 * 60 * 60;

/* ========= UTILS ========= */
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function toNZDateString(dateInput) {
  const date = new Date(dateInput);
  const nz = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
  const [day, month, year] = nz.split("/");
  return `${year}-${month}-${day}`;
}

/* ========= SUPABASE DATA HELPERS ========= */
async function getUserDataById(uuid) {
  const { data, error } = await supabase.from('Userdetails').select('*').eq('UUID', uuid).single();
  if (error) throw error;
  return data;
}

async function getUserLogsById(userId) {
  const { data, error } = await supabase.from('loghistory').select('minutes_logged, time_logged').eq('UUID', userId).order("time_logged", { ascending: false });
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

/* --- LOGGING FUNCTION (Includes Bookshelf Logic) --- */
async function logReadingMinutes(user, minutes, bookTitle) {
  // 1. Log to history
  const { error: logError } = await supabase.from('loghistory').insert([{
    UUID: user.UUID,
    minutes_logged: minutes,
    book_title: bookTitle,
    time_logged: new Date().toISOString()
  }]);

  if (logError) throw logError;

  // 2. Add to Bookshelf (skip if it's a Bingo action or Unmark action)
  const lowerTitle = bookTitle.toLowerCase();
  if (!lowerTitle.includes('bingo') && !lowerTitle.includes('unmark')) {
    const { error: shelfError } = await supabase.from('user_bookshelf').upsert(
        { user_uuid: user.UUID, book_title: bookTitle }, 
        { onConflict: 'user_uuid, book_title', ignoreDuplicates: true } 
    );
    if (shelfError) console.error("Bookshelf error:", shelfError);
  }

  // 3. Refresh Dashboard
  await loadDashboard();
}

/* ========= USERNAME PROMPT ========= */
async function ensureUsername() {
  if (!currentUser) return;
  if (currentUser.user_name && currentUser.user_name.trim() !== "") return;

  let newName = "";
  while (true) {
    newName = prompt("Welcome! Please choose a unique display name (No real names):");
    if (newName === null) { alert("A display name is required."); continue; }
    newName = newName.trim();
    if (newName.length < 3) { alert("Username too short."); continue; }

    const { data: existingUsers } = await supabase.from("Userdetails").select("user_name").ilike("user_name", newName);
    if (existingUsers.length > 0) { alert(`"${newName}" is taken.`); continue; }
    
    await supabase.from("Userdetails").update({ user_name: newName }).eq("UUID", currentUser.UUID);
    currentUser.user_name = newName;
    break;
  }
}

/* ========= MAIN DASHBOARD LOADER ========= */
async function loadDashboard() {
  const uuid = sessionStorage.getItem("userId");
  if (!uuid) return window.location.href = "login.html";

  // 1. Load User
  try {
    currentUser = await getUserDataById(uuid);
    if (!currentUser) return window.location.href = "login.html";
    await ensureUsername();
    renderWelcome(currentUser);
  } catch(e) { console.error("Login error", e); return; }

  // 2. Load User Stats
  const userLogs = await getUserLogsById(currentUser.UUID);
  const totalUserMinutes = userLogs.reduce((s, e) => s + e.minutes_logged, 0);
  renderUserMinutes(totalUserMinutes);
  
  // Sync total
  await supabase.from("Userdetails").update({ minutes_logged: totalUserMinutes }).eq("UUID", currentUser.UUID);

  // 3. Load Community Stats
  const allUsers = await getAllUsers();
  renderLeaderboard(allUsers);

  const allLogs = await getAllLogs();
  const totalCommunityMinutes = allLogs.reduce((s, e) => s + e.minutes_logged, 0);
  renderProgressBar(totalCommunityMinutes);

  // 4. Load Modules (Safe Awaits)
  await loadBingo();
  await loadReadingStreak();
  await loadBookshelf(); 
  await loadTopRated(); 
  
  // 5. Load Notifications (Won't break if file missing)
  loadNotifications(); 
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

  users.sort((a, b) => b.minutes_logged - a.minutes_logged).slice(0, 10).forEach(user => {
    const displayName = user.user_name ?? "User";
    const initial = displayName[0].toUpperCase();
    const bar = document.createElement('div');
    bar.classList.add('leaderboard-bar');
    bar.innerHTML = `<div class="leaderboard-profile">${initial}</div><div class="leaderboard-label">${displayName}: ${user.minutes_logged} min</div>`;
    container.appendChild(bar);
  });
}

function renderProgressBar(total) {
  const fill = document.getElementById('progressFill');
  const text = document.getElementById('progressText');
  const percent = Math.min((total / COMMUNITY_GOAL) * 100, 100);
  fill.style.width = `${percent}%`;
  text.textContent = `${((total / COMMUNITY_GOAL) * 100).toFixed(1)}% of Goal`;
}

/* ========= READING STREAK ========= */
async function loadReadingStreak() {
  if (!currentUser) return;
  const logs = await getUserLogsById(currentUser.UUID);
  const streakEl = document.getElementById("readingStreakDisplay");
  if (!logs || logs.length === 0) { streakEl.textContent = "0"; return; }

  const dayTotals = {};
  logs.forEach(l => { dayTotals[toNZDateString(l.time_logged)] = (dayTotals[toNZDateString(l.time_logged)] || 0) + l.minutes_logged; });
  const days = Object.keys(dayTotals).sort().reverse();
  const todayStr = toNZDateString(Date.now());
  const yesterdayStr = toNZDateString(Date.now() - 864e5);
  
  if (days[0] !== todayStr && days[0] !== yesterdayStr) {
    streakEl.textContent = "0";
    await supabase.from("Userdetails").update({ reading_streak: 0 }).eq("UUID", currentUser.UUID);
    return;
  }
  
  let streak = 1;
  const toDate = (str) => new Date(str + "T00:00:00");
  for (let i = 1; i < days.length; i++) {
    if ((toDate(days[i - 1]) - toDate(days[i])) / 864e5 === 1) streak++; else break;
  }
  streakEl.textContent = `${streak}`;
  await supabase.from("Userdetails").update({ reading_streak: streak }).eq("UUID", currentUser.UUID);
}

/* ========= BOOKSHELF & RATINGS ========= */
async function loadBookshelf() {
  const list = document.getElementById('bookshelfList');
  if(!currentUser || !list) return;

  const { data: books, error } = await supabase.from('user_bookshelf').select('*').eq('user_uuid', currentUser.UUID).order('created_at', { ascending: false });
  if (error) return;

  list.innerHTML = '';
  if (books.length === 0) { list.innerHTML = '<p class="empty-state">Log time to add books here!</p>'; return; }

  books.forEach(book => {
    const row = document.createElement('div');
    row.className = 'book-row';
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
      const isFilled = i <= book.rating ? 'filled' : '';
      starsHtml += `<span class="star ${isFilled}" onclick="rateBook(${book.id}, ${i})">★</span>`;
    }
    row.innerHTML = `<div class="book-title">${book.book_title}</div><div class="star-rating">${starsHtml}</div>`;
    list.appendChild(row);
  });
}

window.rateBook = async function(bookId, rating) {
  const { error } = await supabase.from('user_bookshelf').update({ rating: rating }).eq('id', bookId);
  if (!error) { loadBookshelf(); loadTopRated(); }
};

async function loadTopRated() {
  const container = document.getElementById('topRatedList');
  if(!container) return;
  const { data, error } = await supabase.from('top_rated_books').select('*').limit(5);
  if (error) return;
  
  container.innerHTML = '';
  if (!data || data.length === 0) { container.innerHTML = '<p class="tiny-note">No rated books yet.</p>'; return; }

  data.forEach(book => {
    const div = document.createElement('div');
    div.className = 'top-book-row';
    div.innerHTML = `<span>${book.book_title}</span><span class="top-book-score">★ ${book.average_rating}</span>`;
    container.appendChild(div);
  });
}

/* ========= NOTIFICATIONS (FILE BASED) ========= */
const notifBtn = document.getElementById('notifBtn');
const notifDropdown = document.getElementById('notifDropdown');
const notifBadge = document.getElementById('notifBadge');
const notifList = document.getElementById('notifList');
const notifModal = document.getElementById('notifModal');
const notifModalBody = document.getElementById('notifModalBody');
const closeNotifModalBtn = document.getElementById('closeNotifModalBtn');

if(notifBtn) {
  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle('hidden');
    if (!notifDropdown.classList.contains('hidden')) {
      notifBadge.classList.add('hidden');
      const newestId = notifBtn.dataset.newestId || 0;
      localStorage.setItem('lastReadNotifId', newestId);
    }
  });

  document.addEventListener('click', (e) => {
    if (!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
      notifDropdown.classList.add('hidden');
    }
  });

  if(closeNotifModalBtn) {
    closeNotifModalBtn.addEventListener('click', () => {
      notifModal.classList.add('hidden');
    });
  }
}

async function loadNotifications() {
  try {
    const response = await fetch('notifications.html');
    if (!response.ok) return; // Silent fail if file missing
    
    const text = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const entries = Array.from(doc.querySelectorAll('.notification-entry'));
    
    if(!notifList) return;
    notifList.innerHTML = '';
    if (entries.length === 0) { notifList.innerHTML = '<li class="empty-notif">No new notifications</li>'; return; }

    entries.forEach(entry => {
      const id = entry.getAttribute('data-id');
      const date = entry.getAttribute('data-date');
      const summaryHTML = entry.querySelector('.summary').innerHTML;
      const fullContentHTML = entry.querySelector('.full-content').innerHTML;

      const li = document.createElement('li');
      li.innerHTML = `<div style="margin-bottom:4px;">${summaryHTML}</div><span class="notif-time">${date}</span>`;
      li.addEventListener('click', () => {
        notifModalBody.innerHTML = fullContentHTML;
        notifModal.classList.remove('hidden');
        notifDropdown.classList.add('hidden');
      });
      notifList.appendChild(li);
    });

    // Check Unread
    if (entries.length > 0) {
      const newestId = parseInt(entries[0].getAttribute('data-id')) || 0;
      notifBtn.dataset.newestId = newestId;
      const lastReadId = parseInt(localStorage.getItem('lastReadNotifId')) || 0;
      if (newestId > lastReadId) notifBadge.classList.remove('hidden'); else notifBadge.classList.add('hidden');
    }
  } catch (err) {
    console.warn("Notifications disabled (file not found or local CORS).");
  }
}


/* ========= BINGO LOGIC ========= */
const BINGO_SIZE = 5;
let bingoData = [];
let userBingoState = Array(BINGO_SIZE).fill(null).map(() => Array(BINGO_SIZE).fill(false));
let BINGO_WIN_BONUS = 20;
let currentBingoIndex = null;

function getShortBingoTitle(description) {
  const text = description.toLowerCase();
  if (text.includes("minutes")) return "Read 20 Mins";
  // ... (Abbreviated common ones to save space, logic same as before)
  const words = description.split(" ");
  return words.slice(0, 2).join(" ");
}

async function loadBingo() {
  try {
    const { data } = await supabase.from("bingochallenges").select("*");
    if (!data || data.length < 25) return;
    BINGO_WIN_BONUS = data.find(d => d.type === "win_bonus")?.bonus_minutes || 20;
    
    const { data: userState } = await supabase.from("user_bingo_state").select("*").eq("UUID", currentUser.UUID);
    userBingoState = Array(BINGO_SIZE).fill(null).map(() => Array(BINGO_SIZE).fill(false));
    if (userState) userState.forEach(row => { userBingoState[Math.floor(row.bingo_index / BINGO_SIZE)][row.bingo_index % BINGO_SIZE] = row.completed; });
    
    const board = document.getElementById("bingoBoard");
    board.innerHTML = "";
    bingoData = data.slice(0, 25);
    bingoData.forEach((item, index) => {
      const cell = document.createElement("div");
      cell.id = `bingo-cell-${index}`;
      const span = document.createElement("span");
      span.textContent = getShortBingoTitle(item.challenge);
      cell.appendChild(span);
      const row = Math.floor(index / BINGO_SIZE);
      const col = index % BINGO_SIZE;
      if (userBingoState[row][col]) cell.classList.add("completed");
      cell.addEventListener("click", () => openBingoModal(index));
      board.appendChild(cell);
    });
  } catch (err) { console.error("Bingo Error", err); }
}

// Modal Handlers
document.getElementById('modalConfirmBtn').addEventListener('click', processBingoAction);
document.getElementById('modalCancelBtn').addEventListener('click', () => document.getElementById('bingoModal').classList.add('hidden'));

function openBingoModal(index) {
  currentBingoIndex = index;
  const challenge = bingoData[index];
  const isCompleted = userBingoState[Math.floor(index / BINGO_SIZE)][index % BINGO_SIZE];
  
  const modal = document.getElementById('bingoModal');
  document.getElementById('modalTitle').textContent = isCompleted ? "Completed!" : getShortBingoTitle(challenge.challenge);
  document.getElementById('modalDescription').innerHTML = isCompleted ? `Unmark "${challenge.challenge}"?` : `${challenge.challenge}<br><br><strong>Bonus: +${challenge.bonus_minutes} mins</strong>`;
  
  const btn = document.getElementById('modalConfirmBtn');
  btn.textContent = isCompleted ? "Unmark ↩️" : "I Did It! ✅";
  btn.className = isCompleted ? "btn btn-outline" : "btn btn-primary";
  modal.classList.remove('hidden');
}

async function processBingoAction() {
  if (currentBingoIndex === null) return;
  const index = currentBingoIndex;
  document.getElementById('bingoModal').classList.add('hidden');

  const cell = document.getElementById(`bingo-cell-${index}`);
  const row = Math.floor(index / BINGO_SIZE);
  const col = index % BINGO_SIZE;
  const newCompleted = !userBingoState[row][col];
  const bonus = bingoData[index].bonus_minutes;

  // Optimistic UI
  userBingoState[row][col] = newCompleted;
  cell.classList.toggle("completed", newCompleted);
  if (newCompleted && checkAnyBingo(userBingoState)) launchConfetti();

  try {
     const { data: existing } = await supabase.from("user_bingo_state").select("*").eq("UUID", currentUser.UUID).eq("bingo_index", index).limit(1);
     if(existing.length) {
       await supabase.from("user_bingo_state").update({ completed: newCompleted }).eq("UUID", currentUser.UUID).eq("bingo_index", index);
     } else {
       await supabase.from("user_bingo_state").insert([{ UUID: currentUser.UUID, bingo_index: index, completed: true }]);
     }
     await logReadingMinutes(currentUser, newCompleted ? bonus : -bonus, `${newCompleted ? "Bingo" : "Unmark"}: ${bingoData[index].challenge}`);
  } catch(e) { console.error(e); }
}

function checkAnyBingo(state) {
  for (let r = 0; r < BINGO_SIZE; r++) if (state[r].every(v => v)) return true;
  for (let c = 0; c < BINGO_SIZE; c++) if (state.every(row => row[c])) return true;
  if (state.every((row, i) => row[i])) return true;
  if (state.every((row, i) => row[BINGO_SIZE - 1 - i])) return true;
  return false;
}

/* ========= AUTOCOMPLETE ========= */
const titleInput = document.getElementById('bookTitleInput');
const suggestionsList = document.getElementById('suggestionsList');
let debounceTimer;

titleInput.addEventListener('input', (e) => {
  const query = e.target.value.trim();
  clearTimeout(debounceTimer);
  if (query.length < 3) { suggestionsList.classList.add('hidden'); return; }
  debounceTimer = setTimeout(() => fetchBookSuggestions(query), 300);
});

document.addEventListener('click', (e) => {
  if (!titleInput.contains(e.target) && !suggestionsList.contains(e.target)) { suggestionsList.classList.add('hidden'); }
});

async function fetchBookSuggestions(query) {
  const { data } = await supabase.from('loghistory').select('book_title')
    .ilike('book_title', `%${query}%`)
    .not('book_title', 'ilike', '%Bingo%')
    .not('book_title', 'ilike', '%Unmark%')
    .limit(50);
  
  if (!data || !data.length) { suggestionsList.classList.add('hidden'); return; }
  const uniqueTitles = [...new Set(data.map(d => d.book_title))];
  
  suggestionsList.innerHTML = '';
  uniqueTitles.slice(0, 8).forEach(title => {
    const li = document.createElement('li');
    li.textContent = title;
    li.addEventListener('click', () => { titleInput.value = title; suggestionsList.classList.add('hidden'); });
    suggestionsList.appendChild(li);
  });
  suggestionsList.classList.remove('hidden');
}

/* ========= CONFETTI ========= */
const confettiCanvas = document.getElementById("confettiCanvas");
const ctx = confettiCanvas.getContext("2d");
function resizeConfetti() { confettiCanvas.width = window.innerWidth; confettiCanvas.height = window.innerHeight; }
resizeConfetti();
window.addEventListener("resize", resizeConfetti);
function launchConfetti() {
  const confetti = [];
  const colors = ["#ff8b2e", "#ffd54f", "#1cb8ff", "#ff6f91", "#45e1ff"];
  for (let i = 0; i < 150; i++) confetti.push({
      x: Math.random() * confettiCanvas.width, y: confettiCanvas.height,
      w: Math.random()*8+4, h: Math.random()*12+6, c: colors[Math.floor(Math.random()*colors.length)],
      vy: -(Math.random()*6+7), vx: (Math.random()*4)-2, gravity: 0.2
  });
  function animate() {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confetti.forEach(p => { p.y += p.vy; p.x += p.vx; p.vy += p.gravity; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.w, p.h); });
    if(confetti.some(p => p.y < confettiCanvas.height)) requestAnimationFrame(animate);
  }
  animate();
}

/* ========= EVENT HANDLERS ========= */
document.getElementById('logMinutesBtn').addEventListener('click', async () => {
  const minutes = parseInt(document.getElementById('minutesInput').value);
  const title = document.getElementById('bookTitleInput').value.trim();
  if (!title || isNaN(minutes)) return;
  await logReadingMinutes(currentUser, minutes, title);
  document.getElementById('minutesInput').value = '';
  document.getElementById('bookTitleInput').value = '';
});

document.getElementById('stopwatchBtn').addEventListener('click', async () => {
  const display = document.getElementById('stopwatchDisplay');
  const btn = document.getElementById('stopwatchBtn');
  if (!stopwatchInterval) {
    startTime = Date.now();
    btn.textContent = 'Stop Timer';
    stopwatchInterval = setInterval(() => display.textContent = formatTime(Date.now() - startTime), 1000);
  } else {
    clearInterval(stopwatchInterval);
    stopwatchInterval = null;
    btn.textContent = 'Start Timer';
    const elapsedMinutes = Math.round((Date.now() - startTime) / 60000);
    const title = document.getElementById('bookTitleInput').value.trim();
    if (elapsedMinutes >= 1 && title && confirm(`Log ${elapsedMinutes} mins for "${title}"?`)) {
      await logReadingMinutes(currentUser, elapsedMinutes, title);
    }
  }
});

/* ========= INIT ========= */
loadDashboard();
