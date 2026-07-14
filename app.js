const SONGS = [
  {
    id: "warmup",
    name: "แบบฝึกไล่เสียง",
    notes: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1]
  },
  {
    id: "lao_siang_thian_demo",
    name: "ลาวเสี่ยงเทียน (แนวฝึกตัวอย่าง)",
    notes: [5,6,8,9,8,6,5,3,5,6,8,10,9,8,6,5,3,5,6,5,3,2,1]
  },
  {
    id: "sukhothai_demo",
    name: "ระบำสุโขทัย (แนวฝึกตัวอย่าง)",
    notes: [3,5,6,8,6,5,3,2,3,5,8,9,8,6,5,3,5,6,8,10,8,6,5,3]
  }
];

const THAI_NOTE_LABELS = ["ด","ร","ม","ฟ","ซ","ล","ท","ดํ","รํ","มํ","ฟํ","ซํ","ลํ","ทํ","ดํํ","รํํ"];

const els = {
  songSelect: document.getElementById("songSelect"),
  modeSelect: document.getElementById("modeSelect"),
  tempoSelect: document.getElementById("tempoSelect"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  resetBtn: document.getElementById("resetBtn"),
  statusText: document.getElementById("statusText"),
  scoreText: document.getElementById("scoreText"),
  progressText: document.getElementById("progressText"),
  notation: document.getElementById("notation"),
  gongStage: document.getElementById("gongStage"),
  toggleNoteBtn: document.getElementById("toggleNoteBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  historyList: document.getElementById("historyList"),
  installBtn: document.getElementById("installBtn")
};

let audioCtx;
let currentIndex = 0;
let correctCount = 0;
let wrongCount = 0;
let playingTimer = null;
let running = false;
let notesVisible = true;
let deferredPrompt = null;

function currentSong() {
  return SONGS.find(s => s.id === els.songSelect.value) || SONGS[0];
}

function setupSongs() {
  SONGS.forEach(song => {
    const option = document.createElement("option");
    option.value = song.id;
    option.textContent = song.name;
    els.songSelect.appendChild(option);
  });
}

function setupGongs() {
  const positions = [
    [12,66],[17,43],[26,24],[38,13],[51,9],[64,13],[76,24],[85,43],
    [89,66],[82,82],[69,91],[54,95],[39,91],[26,82],[18,72],[10,82]
  ];
  for (let i = 0; i < 16; i++) {
    const gong = document.createElement("button");
    gong.type = "button";
    gong.className = "gong";
    gong.dataset.note = String(i + 1);
    gong.style.left = positions[i][0] + "%";
    gong.style.top = positions[i][1] + "%";
    gong.innerHTML = `<span>${THAI_NOTE_LABELS[i]}</span>`;
    gong.setAttribute("aria-label", `ลูกฆ้องที่ ${i + 1} โน้ต ${THAI_NOTE_LABELS[i]}`);
    gong.addEventListener("pointerdown", () => handleGongPress(i + 1, gong));
    els.gongStage.appendChild(gong);
  }
}

function frequencyFor(noteNumber) {
  const base = 220;
  const semitoneMap = [0,2,4,5,7,9,11,12,14,16,17,19,21,23,24,26];
  return base * Math.pow(2, semitoneMap[noteNumber - 1] / 12);
}

function playGongSound(noteNumber, duration = 1.3) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.75, now + 0.015);
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const osc3 = audioCtx.createOscillator();
  const freq = frequencyFor(noteNumber);

  osc1.frequency.value = freq;
  osc2.frequency.value = freq * 2.01;
  osc3.frequency.value = freq * 3.97;
  osc1.type = "sine";
  osc2.type = "sine";
  osc3.type = "triangle";

  const g1 = audioCtx.createGain();
  const g2 = audioCtx.createGain();
  const g3 = audioCtx.createGain();
  g1.gain.value = 0.8;
  g2.gain.value = 0.22;
  g3.gain.value = 0.08;

  osc1.connect(g1).connect(master);
  osc2.connect(g2).connect(master);
  osc3.connect(g3).connect(master);
  master.connect(audioCtx.destination);

  osc1.start(now); osc2.start(now); osc3.start(now);
  osc1.stop(now + duration); osc2.stop(now + duration); osc3.stop(now + duration);
}

function flashGong(noteNumber, className = "active") {
  const gong = document.querySelector(`.gong[data-note="${noteNumber}"]`);
  if (!gong) return;
  gong.classList.add(className);
  setTimeout(() => gong.classList.remove(className), 300);
}

function renderNotation() {
  const song = currentSong();
  els.notation.innerHTML = "";
  song.notes.forEach((note, i) => {
    const chip = document.createElement("span");
    chip.className = "note-chip";
    chip.dataset.index = i;
    chip.textContent = notesVisible ? THAI_NOTE_LABELS[note - 1] : "•";
    els.notation.appendChild(chip);
  });
  updateProgressUI();
}

function updateProgressUI(lastWrongIndex = null) {
  const song = currentSong();
  [...els.notation.children].forEach((chip, i) => {
    chip.classList.remove("current","done","wrong");
    if (i < currentIndex) chip.classList.add("done");
    if (i === currentIndex && running) chip.classList.add("current");
  });
  if (lastWrongIndex !== null && els.notation.children[lastWrongIndex]) {
    els.notation.children[lastWrongIndex].classList.add("wrong");
  }
  els.progressText.textContent = `${Math.min(currentIndex, song.notes.length)} / ${song.notes.length}`;
  const total = correctCount + wrongCount;
  const score = total ? Math.round((correctCount / total) * 100) : 0;
  els.scoreText.textContent = `${score}%`;
}

function handleGongPress(noteNumber, gongEl) {
  playGongSound(noteNumber);
  gongEl.classList.add("active");
  setTimeout(() => gongEl.classList.remove("active"), 250);

  const mode = els.modeSelect.value;
  if (!running || mode === "free" || mode === "listen") return;

  const song = currentSong();
  const expected = song.notes[currentIndex];
  if (noteNumber === expected) {
    correctCount++;
    gongEl.classList.add("correct");
    setTimeout(() => gongEl.classList.remove("correct"), 350);
    currentIndex++;
    els.statusText.textContent = "ถูกต้อง";
    if (currentIndex >= song.notes.length) finishSession();
  } else {
    wrongCount++;
    gongEl.classList.add("wrong");
    setTimeout(() => gongEl.classList.remove("wrong"), 350);
    els.statusText.textContent = `ยังไม่ถูก ลองโน้ต ${THAI_NOTE_LABELS[expected - 1]}`;
  }
  updateProgressUI(noteNumber === expected ? null : currentIndex);
}

function startSession() {
  stopPlayback();
  resetSession(false);
  running = true;
  const mode = els.modeSelect.value;
  const song = currentSong();

  if (mode === "free") {
    els.statusText.textContent = "เล่นอิสระได้เลย";
    els.progressText.textContent = `0 / ${song.notes.length}`;
    return;
  }

  if (mode === "listen") {
    els.statusText.textContent = "กำลังเล่นตัวอย่าง";
    playSequence(song.notes);
    return;
  }

  els.statusText.textContent = mode === "test"
    ? "เริ่มทดสอบ — ไม่แสดงคำใบ้ลูกฆ้อง"
    : `แตะโน้ต ${THAI_NOTE_LABELS[song.notes[0]-1]}`;
  updateProgressUI();

  if (mode === "practice") {
    flashGong(song.notes[0], "active");
  }
}

function playSequence(notes) {
  let i = 0;
  const interval = Number(els.tempoSelect.value);

  function step() {
    if (!running || i >= notes.length) {
      if (i >= notes.length) finishSession(true);
      return;
    }
    currentIndex = i;
    playGongSound(notes[i], 0.9);
    flashGong(notes[i], "active");
    updateProgressUI();
    i++;
    playingTimer = setTimeout(step, interval);
  }
  step();
}

function finishSession(listenOnly = false) {
  running = false;
  stopPlayback();
  const song = currentSong();
  currentIndex = song.notes.length;
  updateProgressUI();
  if (listenOnly) {
    els.statusText.textContent = "เล่นตัวอย่างจบแล้ว";
    return;
  }

  const total = correctCount + wrongCount;
  const score = total ? Math.round((correctCount / total) * 100) : 100;
  els.statusText.textContent = `จบการฝึก คะแนน ${score}%`;
  saveHistory(song.name, els.modeSelect.options[els.modeSelect.selectedIndex].text, score);
  renderHistory();
}

function stopPlayback() {
  if (playingTimer) {
    clearTimeout(playingTimer);
    playingTimer = null;
  }
}

function stopSession() {
  running = false;
  stopPlayback();
  els.statusText.textContent = "หยุดแล้ว";
  updateProgressUI();
}

function resetSession(render = true) {
  running = false;
  stopPlayback();
  currentIndex = 0;
  correctCount = 0;
  wrongCount = 0;
  els.statusText.textContent = "พร้อมใช้งาน";
  if (render) renderNotation();
  else updateProgressUI();
}

function saveHistory(song, mode, score) {
  const history = JSON.parse(localStorage.getItem("khongHistory") || "[]");
  history.unshift({
    song, mode, score,
    time: new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
  });
  localStorage.setItem("khongHistory", JSON.stringify(history.slice(0, 8)));
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem("khongHistory") || "[]");
  if (!history.length) {
    els.historyList.innerHTML = '<p class="muted">ยังไม่มีประวัติการฝึก</p>';
    return;
  }
  els.historyList.innerHTML = history.map(item => `
    <div class="history-item">
      <strong>${item.song}</strong>
      <span>${item.mode} • ${item.score}%</span>
      <time>${item.time}</time>
    </div>
  `).join("");
}

els.startBtn.addEventListener("click", startSession);
els.stopBtn.addEventListener("click", stopSession);
els.resetBtn.addEventListener("click", () => resetSession(true));
els.songSelect.addEventListener("change", () => resetSession(true));
els.modeSelect.addEventListener("change", () => {
  notesVisible = els.modeSelect.value !== "test";
  els.toggleNoteBtn.textContent = notesVisible ? "ซ่อนโน้ต" : "แสดงโน้ต";
  resetSession(true);
});
els.toggleNoteBtn.addEventListener("click", () => {
  notesVisible = !notesVisible;
  els.toggleNoteBtn.textContent = notesVisible ? "ซ่อนโน้ต" : "แสดงโน้ต";
  renderNotation();
});
els.clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem("khongHistory");
  renderHistory();
});

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  els.installBtn.classList.remove("hidden");
});
els.installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  els.installBtn.classList.add("hidden");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}

setupSongs();
setupGongs();
renderNotation();
renderHistory();
