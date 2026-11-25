/* =========================================================================
   TYPEBEAT - CORE ENGINE
   Combines VocaType Inline Typing and YouType Audio Dictation
   ========================================================================= */

// Audio Synthesis using Web Audio API
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playKeyTick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  playWrongSound() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(80, this.ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  playSuccessChime() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.12, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.3);
    });
  }

  speak(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }
}

const sounds = new SoundEngine();

/* =========================================================================
   GAME STATE & SETTINGS
   ========================================================================= */

const state = {
  currentTrackKey: 'youth',
  currentLevelIndex: 0,
  currentLineIndex: 0,
  gameMode: 'vocatype', // 'vocatype' (inline lyrics) or 'dictation' (word blanks)
  charIndex: 0, // for VocaType inline typing
  dictationWordIndex: 0, // for Dictation mode
  dictationWordsTyped: [], // typed words array
  isPausedForInput: false,
  smartPauseEnabled: true,
  showTranslation: true,
  syncOffset: 0, // in seconds
  // Metrics
  correctKeystrokes: 0,
  totalKeystrokes: 0,
  streak: 0,
  score: 0,
  startTime: null,
  // YouTube API
  player: null,
  isPlayerReady: false,
  timeTracker: null
};

/* =========================================================================
   YOUTUBE IFRAME INTEGRATION
   ========================================================================= */

function onYouTubeIframeAPIReady() {
  state.player = new YT.Player('ytPlayerContainer', {
    height: '100%',
    width: '100%',
    videoId: 'lY2yjAdbvdQ', // Shawn Mendes - Treat You Better default
    playerVars: {
      playsinline: 1,
      controls: 1,
      rel: 0,
      modestbranding: 1,
      disablekb: 1
    },
    events: {
      onReady: () => {
        state.isPlayerReady = true;
        // If a level was opened before the YouTube API finished loading, load it now.
        const gameScreen = document.getElementById('gameScreen');
        const lvl = getCurrentLevel();
        if (gameScreen && !gameScreen.classList.contains('hidden') && lvl) {
          const firstLine = lvl.lines[0];
          state.player.loadVideoById({
            videoId: lvl.videoId,
            startSeconds: Math.max(0, (firstLine?.start || 0) + state.syncOffset),
            suggestedQuality: 'hd720'
          });
        }
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.PLAYING) {
          startTimeTracker();
          updatePlayPauseButton(true);
        } else {
          stopTimeTracker();
          updatePlayPauseButton(false);
        }
      }
    }
  });
}

function startTimeTracker() {
  stopTimeTracker();
  state.timeTracker = setInterval(checkPlaybackSync, 80);
}

function stopTimeTracker() {
  if (state.timeTracker) {
    clearInterval(state.timeTracker);
    state.timeTracker = null;
  }
}

function checkPlaybackSync() {
  if (!state.isPlayerReady || !state.player || !state.player.getCurrentTime) return;
  const curTime = state.player.getCurrentTime();
  const currentLine = getCurrentLine();
  if (!currentLine) return;

  const pauseTarget = Math.max(0, currentLine.pause + state.syncOffset);

  // If video reached pause boundary and we haven't paused yet:
  if (state.smartPauseEnabled && !state.isPausedForInput && curTime >= pauseTarget) {
    state.isPausedForInput = true;
    state.player.pauseVideo();
    showPausePill(true);
  }
}

function showPausePill(show) {
  const pill = document.getElementById('waitingOverlay');
  if (pill) {
    pill.classList.toggle('hidden', !show);
  }
}

function updatePlayPauseButton(isPlaying) {
  const btn = document.getElementById('btnPlayPause');
  if (btn) {
    btn.innerHTML = isPlaying 
      ? '<span class="text-base">⏸</span>' 
      : '<span class="text-base">▶</span>';
  }
}

function togglePlayPause() {
  if (!state.isPlayerReady || !state.player) return;
  const playerState = state.player.getPlayerState();
  if (playerState === YT.PlayerState.PLAYING) {
    state.player.pauseVideo();
  } else {
    state.player.playVideo();
  }
}

/* =========================================================================
   LEVEL & LINE MANAGEMENT
   ========================================================================= */

function getCurrentLevel() {
  const track = TRACKS[state.currentTrackKey];
  return track ? track.levels[state.currentLevelIndex] : null;
}

function getCurrentLine() {
  const lvl = getCurrentLevel();
  return lvl && lvl.lines ? lvl.lines[state.currentLineIndex] : null;
}

function startLevel(levelIndex, trackKey = null) {
  if (trackKey) state.currentTrackKey = trackKey;
  state.currentLevelIndex = levelIndex;
  state.currentLineIndex = 0;
  state.charIndex = 0;
  state.dictationWordIndex = 0;
  state.dictationWordsTyped = [];
  state.isPausedForInput = false;
  state.correctKeystrokes = 0;
  state.totalKeystrokes = 0;
  state.streak = 0;
  state.score = 0;
  state.startTime = Date.now();

  const lvl = getCurrentLevel();
  if (!lvl) return;

  // Update UI Labels
  document.getElementById('gameLevelTitle').textContent = lvl.title;
  document.getElementById('gameArtistLabel').textContent = lvl.artist || lvl.sub;
  showScreen('gameScreen');

  // Load video at first line start
  if (state.isPlayerReady && state.player) {
    const firstLine = lvl.lines[0];
    const startTime = firstLine ? Math.max(0, firstLine.start + state.syncOffset) : 0;
    state.player.loadVideoById({
      videoId: lvl.videoId,
      startSeconds: startTime,
      suggestedQuality: 'hd720'
    });
  }

  renderLineUI();
  updateLiveStats();
}

function replayCurrentLine() {
  const line = getCurrentLine();
  if (!line || !state.isPlayerReady || !state.player) return;

  state.charIndex = 0;
  state.dictationWordIndex = 0;
  state.dictationWordsTyped = [];
  state.isPausedForInput = false;
  showPausePill(false);

  const seekTime = Math.max(0, line.start + state.syncOffset);
  state.player.seekTo(seekTime, true);
  state.player.playVideo();
  renderLineUI();
}

function prevLine() {
  if (state.currentLineIndex > 0) {
    state.currentLineIndex--;
    replayCurrentLine();
  }
}

function nextLine() {
  const lvl = getCurrentLevel();
  if (lvl && state.currentLineIndex < lvl.lines.length - 1) {
    state.currentLineIndex++;
    replayCurrentLine();
  } else {
    finishLevel();
  }
}

function onLineCompleted() {
  sounds.playSuccessChime();
  state.score += 150 + (state.streak * 15);
  state.streak++;
  state.isPausedForInput = false;
  showPausePill(false);

  // Micro flash on subtitle container
  const lyricContainer = document.getElementById('lyricDisplayArea');
  if (lyricContainer) {
    lyricContainer.classList.add('ring-2', 'ring-emerald-400/50');
    setTimeout(() => lyricContainer.classList.remove('ring-2', 'ring-emerald-400/50'), 400);
  }

  updateLiveStats();

  // Advance the active cue before resuming playback so the sync checker does not
  // pause again on the cue that was just completed.
  const lvl = getCurrentLevel();
  if (state.currentLineIndex + 1 >= lvl.lines.length) {
    finishLevel();
    return;
  }

  state.currentLineIndex++;
  state.charIndex = 0;
  state.dictationWordIndex = 0;
  state.dictationWordsTyped = [];
  renderLineUI();

  // Always seek video precisely to the start of the next line so audio matches displayed text
  const nextLine = getCurrentLevel()?.lines[state.currentLineIndex];
  if (nextLine && state.isPlayerReady && state.player) {
    const nextStart = Math.max(0, nextLine.start + state.syncOffset);
    state.player.seekTo(nextStart, true);
    state.player.playVideo();
  }
}

/* =========================================================================
   VOCATYPE INLINE TYPING ENGINE
   ========================================================================= */

function renderVocaTypeUI() {
  const line = getCurrentLine();
  if (!line) return;

  const container = document.getElementById('vocatypeSentenceContainer');
  container.innerHTML = '';

  const sentence = line.sentence;
  for (let i = 0; i < sentence.length; i++) {
    const char = sentence[i];
    const span = document.createElement('span');
    span.dataset.index = i;
    span.textContent = char;

    let cls = 'lyric-char ';
    if (char === ' ') cls += 'space ';

    if (i < state.charIndex) {
      cls += 'completed';
    } else if (i === state.charIndex) {
      cls += 'active';
    } else {
      cls += 'pending';
    }
    span.className = cls;
    container.appendChild(span);
  }

  // Render Secondary Translation Subtitle
  const transEl = document.getElementById('lyricTranslation');
  if (transEl) {
    transEl.textContent = line.translation || '';
    transEl.style.display = state.showTranslation && line.translation ? 'block' : 'none';
  }
}

function handleVocaTypeKey(key) {
  const line = getCurrentLine();
  if (!line) return;
  const sentence = line.sentence;
  if (state.charIndex >= sentence.length) return;

  state.totalKeystrokes++;
  const targetChar = sentence[state.charIndex];

  // Case-insensitive letter matching
  const isMatch = (key.toLowerCase() === targetChar.toLowerCase()) || 
                  (targetChar === '’' && key === "'") ||
                  (targetChar === '”' && key === '"');

  if (isMatch) {
    state.correctKeystrokes++;
    sounds.playKeyTick();
    state.charIndex++;
    renderVocaTypeUI();

    // If video was paused because of a typo, resume video if before line pause boundary
    if (state.isPausedForInput && state.isPlayerReady && state.player) {
      const curTime = state.player.getCurrentTime ? state.player.getCurrentTime() : 0;
      const pauseBoundary = Math.max(0, line.pause + state.syncOffset);
      if (curTime < pauseBoundary) {
        state.isPausedForInput = false;
        showPausePill(false);
        state.player.playVideo();
      }
    }

    // Check if entire line completed
    if (state.charIndex >= sentence.length) {
      onLineCompleted();
    }
  } else {
    // Typing Error: Shake active character & pause video so song doesn't run ahead
    sounds.playWrongSound();
    state.streak = 0;

    if (state.smartPauseEnabled && state.isPlayerReady && state.player) {
      state.isPausedForInput = true;
      state.player.pauseVideo();
      showPausePill(true);
    }

    const activeSpan = document.querySelector(`.lyric-char[data-index="${state.charIndex}"]`);
    if (activeSpan) {
      activeSpan.classList.add('error');
      setTimeout(() => activeSpan.classList.remove('error'), 300);
    }
  }

  updateLiveStats();
}

function handleVocaTypeBackspace() {
  if (state.charIndex > 0) {
    state.charIndex--;
    renderVocaTypeUI();
  }
}

function normalizeDictationWord(word) {
  return String(word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* =========================================================================
   YOUTYPE DICTATION MODE ENGINE
   ========================================================================= */

function renderDictationUI() {
  const line = getCurrentLine();
  if (!line) return;

  const container = document.getElementById('dictationSlotsContainer');
  container.innerHTML = '';

  const words = line.sentence.split(/\s+/);
  
  words.forEach((word, wIdx) => {
    // Strip trailing punctuation for comparison
    const cleanWord = normalizeDictationWord(word);
    const typed = state.dictationWordsTyped[wIdx] || '';
    const isActive = wIdx === state.dictationWordIndex;
    const isCompleted = state.dictationWordsTyped[wIdx] !== undefined;
    const isCorrect = isCompleted && (normalizeDictationWord(typed) === cleanWord);

    const slot = document.createElement('div');
    slot.className = `dictation-slot ${isActive ? 'active' : ''} ${isCorrect ? 'correct' : ''}`;
    slot.dataset.wordIndex = wIdx;

    if (isCompleted) {
      slot.textContent = typed;
    } else if (isActive) {
      slot.textContent = typed || '· · ·';
    } else {
      slot.textContent = '· · ·';
    }

    container.appendChild(slot);
  });

  const hintEl = document.getElementById('dictationHintText');
  if (hintEl) {
    hintEl.textContent = `Word ${state.dictationWordIndex + 1} of ${words.length}`;
  }
}

function handleDictationKey(key) {
  const line = getCurrentLine();
  if (!line) return;
  const words = line.sentence.split(/\s+/);
  if (state.dictationWordIndex >= words.length) return;

  const currentTyped = state.dictationWordsTyped[state.dictationWordIndex] || '';

  if (key === ' ') {
    // Space advances to next word
    if (currentTyped.length > 0) {
      state.dictationWordIndex++;
      sounds.playKeyTick();
      renderDictationUI();

      // Check if all words filled
      if (state.dictationWordIndex >= words.length) {
        checkDictationLineSuccess();
      }
    }
    return;
  }

  if (key.length === 1 && /[a-zA-Z0-9']/.test(key)) {
    state.totalKeystrokes++;
    const expected = normalizeDictationWord(words[state.dictationWordIndex]);
    const typedNormalized = normalizeDictationWord(currentTyped);
    if (/[a-z0-9]/i.test(key) && key.toLowerCase() === expected[typedNormalized.length]) {
      state.correctKeystrokes++;
    } else if (/[a-z0-9]/i.test(key)) {
      state.streak = 0;
      sounds.playWrongSound();
      if (state.smartPauseEnabled && state.isPlayerReady && state.player) {
        state.isPausedForInput = true;
        state.player.pauseVideo();
        showPausePill(true);
      }
    }
    if (/[a-z0-9]/i.test(key)) sounds.playKeyTick();
    state.dictationWordsTyped[state.dictationWordIndex] = currentTyped + key;
    renderDictationUI();
    updateLiveStats();
  }
}

function handleDictationBackspace() {
  const currentTyped = state.dictationWordsTyped[state.dictationWordIndex] || '';
  if (currentTyped.length > 0) {
    state.dictationWordsTyped[state.dictationWordIndex] = currentTyped.slice(0, -1);
    renderDictationUI();
  } else if (state.dictationWordIndex > 0) {
    state.dictationWordIndex--;
    renderDictationUI();
  }
}

function checkDictationLineSuccess() {
  const line = getCurrentLine();
  if (!line) return;
  const words = line.sentence.split(/\s+/);

  let allCorrect = true;
  words.forEach((w, idx) => {
    const cleanWord = normalizeDictationWord(w);
    const typed = normalizeDictationWord(state.dictationWordsTyped[idx] || '');
    if (cleanWord !== typed) {
      allCorrect = false;
    }
  });

  if (allCorrect) {
    onLineCompleted();
  } else {
    sounds.playWrongSound();
    const slots = document.querySelectorAll('.dictation-slot');
    slots.forEach(s => s.classList.add('error'));
    setTimeout(() => slots.forEach(s => s.classList.remove('error')), 350);
  }
}

function giveDictationHint() {
  const line = getCurrentLine();
  if (!line) return;
  const words = line.sentence.split(/\s+/);
  const targetWord = words[state.dictationWordIndex]?.replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '');
  if (!targetWord) return;

  const currentTyped = state.dictationWordsTyped[state.dictationWordIndex] || '';
  if (currentTyped.length < targetWord.length) {
    state.dictationWordsTyped[state.dictationWordIndex] = targetWord.slice(0, currentTyped.length + 1);
    sounds.playKeyTick();
    renderDictationUI();
  }
}

function revealDictationAnswer() {
  const line = getCurrentLine();
  if (!line) return;
  const words = line.sentence.split(/\s+/);
  words.forEach((w, i) => {
    state.dictationWordsTyped[i] = w.replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '');
  });
  renderDictationUI();
}

/* =========================================================================
   GLOBAL KEYBOARD HANDLER (Direct document typing like VocaType)
   ========================================================================= */

let ctrlShortcutTimer = null;
let ctrlHintHandled = false;

window.addEventListener('keydown', (e) => {
  // Only capture keystrokes on the game screen
  const gameScreen = document.getElementById('gameScreen');
  if (!gameScreen || gameScreen.classList.contains('hidden')) return;

  // Ignore keystrokes when typing inside text inputs or modals
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

  // Delay Ctrl replay briefly so Ctrl+Shift can be recognized as a hint.
  if (e.key === 'Control' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
    ctrlHintHandled = false;
    clearTimeout(ctrlShortcutTimer);
    ctrlShortcutTimer = setTimeout(() => {
      if (!ctrlHintHandled) replayCurrentLine();
    }, 180);
    return;
  }
  if (e.key === 'Shift' && e.ctrlKey) {
    clearTimeout(ctrlShortcutTimer);
    ctrlHintHandled = true;
    e.preventDefault();
    giveDictationHint();
    return;
  }

  if (e.key === 'Escape') {
    if (state.gameMode === 'dictation') {
      revealDictationAnswer();
    }
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    nextLine();
    return;
  }

  if (e.key === 'Backspace') {
    e.preventDefault();
    if (state.gameMode === 'vocatype') {
      handleVocaTypeBackspace();
    } else {
      handleDictationBackspace();
    }
    return;
  }

  if (e.key === 'Enter') {
    if (state.gameMode === 'dictation') {
      checkDictationLineSuccess();
    }
    return;
  }

  // Handle character keys
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (state.gameMode === 'vocatype') {
      handleVocaTypeKey(e.key);
    } else {
      handleDictationKey(e.key);
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'Control' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
    clearTimeout(ctrlShortcutTimer);
    ctrlShortcutTimer = null;
  }
});


/* =========================================================================
   CUSTOM YOUTUBE VIDEO IMPORT & AUTO-SYNC
   ========================================================================= */
const CUSTOM_TRANSCRIPT_STOP_WORDS = new Set([
  'a','an','the','and','or','but','if','in','on','at','to','for','with','of','by',
  'from','up','about','into','over','after','is','am','are','was','were','be','been',
  'being','have','has','had','do','does','did','i','you','he','she','it','we','they',
  'me','him','her','us','them','my','your','his','its','our','their','this','that',
  'these','those','so','no','not','what','who','how','why','when','where','all','will','would'
]);

function extractYouTubeVideoId(input) {
  if (!input) return null;
  const value = String(input).trim();
  const match = value.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (match) return match[1];
  return /^[\w-]{11}$/.test(value) ? value : null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYouTubeCaptions(videoId) {
  const providers = [
    {
      url: `https://youtubetextconverter.com/api/public/v1/transcript?url=${encodeURIComponent(videoId)}`,
      read: data => data.segments || data.transcript || []
    },
    {
      url: `https://youtubegpt.ai/api/transcript?v=${encodeURIComponent(videoId)}`,
      read: data => data.segments || data.transcript || []
    },
    {
      url: 'https://transcribeyoutube.com/api/transcript',
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}` })
      },
      read: data => data.transcript || []
    }
  ];

  for (const provider of providers) {
    try {
      const response = await fetchWithTimeout(provider.url, provider.options || {}, 6500);
      if (!response.ok) continue;
      const data = await response.json();
      const raw = provider.read(data);
      if (!Array.isArray(raw) || !raw.length) continue;
      const segments = raw.map(item => {
        let start = typeof item.start === 'number' ? item.start : parseFloat(item.start) || 0;
        if (start > 1000) start /= 1000;
        return { start, text: item.text || item.caption || '' };
      }).filter(item => item.text.trim());
      if (segments.length) return { title: data.title || 'Custom YouTube Practice', segments };
    } catch (error) {
      console.warn('YouTube caption provider unavailable; trying the next one.', error);
    }
  }
  return null;
}

function parseCaptionSegmentsToCues(segments) {
  const cues = [];
  let lastTime = -10;
  for (const segment of segments) {
    const sentence = String(segment.text || '').replace(/[♪♫#]/g, '').replace(/\s+/g, ' ').trim();
    if (!sentence || (/^\[.*\]$/.test(sentence)) || (/^\(.*\)$/.test(sentence))) continue;
    let time = Number(segment.start) || 0;
    if (time > 1000) time /= 1000;
    time = Math.round(time * 100) / 100;
    if (time - lastTime < 3.5) continue;
    const tokens = sentence.split(/\s+/);
    let candidates = tokens.map((token, index) => ({
      token,
      index,
      clean: token.replace(/[^a-z]/gi, '').toLowerCase()
    })).filter(item => item.clean.length >= 3 && !CUSTOM_TRANSCRIPT_STOP_WORDS.has(item.clean) && !/[’']/.test(item.token));
    if (!candidates.length) {
      candidates = tokens.map((token, index) => ({ token, index, clean: token.replace(/[^a-z]/gi, '').toLowerCase() }))
        .filter(item => item.clean.length >= 2 && !/[’']/.test(item.token));
    }
    candidates.sort((a, b) => b.clean.length - a.clean.length);
    const target = candidates[0];
    if (!target) continue;
    cues.push({
      target: target.clean,
      time,
      before: tokens.slice(0, target.index).join(' ') + (target.index ? ' ' : ''),
      after: (target.index < tokens.length - 1 ? ' ' : '') + tokens.slice(target.index + 1).join(' '),
      sentence
    });
    lastTime = time;
  }
  return cues;
}

function setCustomStatus(type, message) {
  const area = document.getElementById('customStatusArea');
  const icon = document.getElementById('customStatusIcon');
  const text = document.getElementById('customStatusText');
  if (!area || !icon || !text) return;
  area.classList.remove('hidden');
  area.className = 'mt-3.5 px-3 py-2 rounded-xl text-xs font-medium text-left flex items-center gap-2';
  const states = {
    loading: ['⏳', 'bg-indigo-950/60 border border-indigo-700/50 text-indigo-200 animate-pulse'],
    success: ['✅', 'bg-emerald-950/60 border border-emerald-700/50 text-emerald-200'],
    warning: ['⚠️', 'bg-amber-950/60 border border-amber-700/50 text-amber-200'],
    error: ['❌', 'bg-rose-950/60 border border-rose-700/50 text-rose-200']
  };
  const [symbol, classes] = states[type] || states.warning;
  icon.textContent = symbol;
  area.className += ` ${classes}`;
  text.textContent = message;
}

async function loadCustomVideo() {
  const input = document.getElementById('customYtUrl');
  const videoId = extractYouTubeVideoId(input?.value || '');
  if (!videoId) {
    setCustomStatus('error', 'Enter a valid YouTube video URL or 11-character video ID.');
    return;
  }
  const spinner = document.getElementById('customBtnSpinner');
  const buttonText = document.getElementById('customBtnText');
  if (spinner) spinner.classList.remove('hidden');
  if (buttonText) buttonText.textContent = 'Syncing...';
  setCustomStatus('loading', 'Looking for available YouTube captions and their timestamps...');
  try {
    const result = await fetchYouTubeCaptions(videoId);
    const cues = result ? parseCaptionSegmentsToCues(result.segments) : [];
    if (cues.length) {
      setCustomStatus('success', `Found ${cues.length} timed prompts. Starting your video...`);
      setTimeout(() => applyCustomVideoCues(videoId, cues, result.title), 500);
      return;
    }
    setCustomStatus('warning', 'No usable public captions found. Add lyrics and timestamps manually.');
    openCustomLyricModal(videoId);
  } catch (error) {
    console.error('Could not sync YouTube captions.', error);
    setCustomStatus('warning', 'Caption sync failed. Add lyrics and timestamps manually.');
    openCustomLyricModal(videoId);
  } finally {
    if (spinner) spinner.classList.add('hidden');
    if (buttonText) buttonText.textContent = 'Sync & Play';
  }
}

function applyCustomVideoCues(videoId, cues, title = 'Custom YouTube Practice') {
  const trackKey = state.currentTrackKey || 'youth';
  const customLevel = {
    id: `custom-${Date.now()}`,
    title: title || 'Custom YouTube Practice',
    artist: 'YouTube Custom',
    sub: `Custom video • ${videoId}`,
    videoId,
    difficulty: 'Custom',
    lines: cues.map(cue => ({
      start: cue.time,
      pause: cue.time + 5,
      sentence: cue.sentence,
      target: cue.target || cue.targetWord,
      before: cue.before || '',
      after: cue.after || ''
    }))
  };
  TRACKS[trackKey].levels.push(customLevel);
  try {
    const saved = JSON.parse(localStorage.getItem('typebeat_custom_songs') || '[]');
    saved.push({ trackKey, level: customLevel });
    localStorage.setItem('typebeat_custom_songs', JSON.stringify(saved));
  } catch (error) {
    console.warn('Could not save this custom song in this browser.', error);
  }
  renderLevelCards();
  startLevel(TRACKS[trackKey].levels.length - 1, trackKey);
}

function restoreCustomVideoCues() {
  try {
    const saved = JSON.parse(localStorage.getItem('typebeat_custom_songs') || '[]');
    if (!Array.isArray(saved)) return;
    saved.forEach(item => {
      const trackKey = item?.trackKey;
      const level = item?.level;
      if (TRACKS[trackKey] && level?.id && !TRACKS[trackKey].levels.some(existing => existing.id === level.id)) {
        TRACKS[trackKey].levels.push(level);
      }
    });
  } catch (error) {
    console.warn('Could not restore saved custom videos.', error);
  }
}

function openCustomLyricModal(prefillVideoId = '') {
  const source = document.getElementById('customYtUrl');
  const modalUrl = document.getElementById('modalYtUrl');
  const modal = document.getElementById('customLyricsModal');
  if (!modal || !modalUrl) return;
  const value = prefillVideoId || extractYouTubeVideoId(source?.value || '') || '';
  modalUrl.value = value ? `https://www.youtube.com/watch?v=${value}` : (source?.value || '');
  modal.classList.remove('hidden');
}

function closeCustomLyricModal() {
  document.getElementById('customLyricsModal')?.classList.add('hidden');
}

function autoGenerateBeatTimings() {
  const example = ['rhythm', 'melody', 'harmony', 'energy', 'future', 'feeling'];
  document.getElementById('modalLyricsText').value = example.map((word, index) =>
    `[00:${String(12 + index * 8).padStart(2, '0')}.00] Type the ${word} with the music beat`
  ).join('\n');
}

function parseTimedLyrics(text) {
  const cues = [];
  let fallbackTime = 10;
  for (const rawLine of text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
    const match = rawLine.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    let time = fallbackTime;
    let sentence = rawLine;
    if (match) {
      time = Number(match[1]) * 60 + Number(match[2]);
      sentence = match[3].trim();
    }
    if (!sentence) continue;
    const tokens = sentence.split(/\s+/);
    const target = tokens.find(token => token.replace(/[^a-z]/gi, '').length >= 3) || tokens[0];
    cues.push({
      time,
      sentence,
      target: target.replace(/[^a-z]/gi, '').toLowerCase(),
      before: sentence.slice(0, sentence.indexOf(target)),
      after: sentence.slice(sentence.indexOf(target) + target.length)
    });
    fallbackTime = time + 6.5;
  }
  return cues;
}

function applyModalLyricsAndStart() {
  const url = document.getElementById('modalYtUrl')?.value || '';
  const videoId = extractYouTubeVideoId(url);
  const text = document.getElementById('modalLyricsText')?.value.trim() || '';
  if (!videoId) return alert('Please enter a valid YouTube URL or ID.');
  if (!text) return alert('Please paste lyrics or timed lines first.');
  const cues = parseTimedLyrics(text);
  if (!cues.length) return alert('No usable lyric lines were found.');
  closeCustomLyricModal();
  applyCustomVideoCues(videoId, cues, 'Custom Synced Video');
}

/* =========================================================================
   UI RENDERING & SCREEN NAVIGATION
   ========================================================================= */

function renderLineUI() {
  const lvl = getCurrentLevel();
  if (!lvl) return;

  // Line counter in header
  const counterEl = document.getElementById('liveLineCounter');
  if (counterEl) {
    counterEl.textContent = `LINE ${state.currentLineIndex + 1}/${lvl.lines.length}`;
  }

  if (state.gameMode === 'vocatype') {
    document.getElementById('vocatypeSection').classList.remove('hidden');
    document.getElementById('dictationSection').classList.add('hidden');
    renderVocaTypeUI();
  } else {
    document.getElementById('vocatypeSection').classList.add('hidden');
    document.getElementById('dictationSection').classList.remove('hidden');
    renderDictationUI();
  }
}

function switchMode(newMode) {
  state.gameMode = newMode;
  state.charIndex = 0;
  state.dictationWordIndex = 0;
  state.dictationWordsTyped = [];

  const btnVoca = document.getElementById('btnModeVocatype');
  const btnDict = document.getElementById('btnModeDictation');

  if (newMode === 'vocatype') {
    btnVoca.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 shadow-md';
    btnDict.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white';
  } else {
    btnDict.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 shadow-md';
    btnVoca.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white';
  }

  renderLineUI();
}

function toggleTranslation() {
  state.showTranslation = !state.showTranslation;
  const transEl = document.getElementById('lyricTranslation');
  if (transEl) {
    const line = getCurrentLine();
    transEl.style.display = state.showTranslation && line && line.translation ? 'block' : 'none';
  }
}

function updateLiveStats() {
  // WPM calculation
  const elapsedMinutes = (Date.now() - (state.startTime || Date.now())) / 60000;
  const wordsTyped = (state.correctKeystrokes / 5);
  const wpm = elapsedMinutes > 0 ? Math.round(wordsTyped / elapsedMinutes) : 0;
  
  // Accuracy calculation
  const accuracy = state.totalKeystrokes > 0 
    ? Math.round((state.correctKeystrokes / state.totalKeystrokes) * 100) 
    : 100;

  document.getElementById('liveWpm').textContent = `${wpm} WPM`;
  document.getElementById('liveAccuracy').textContent = `${accuracy}%`;
  const scoreEl = document.getElementById('liveScore');
  if (scoreEl) scoreEl.textContent = state.score;
}

function finishLevel() {
  if (state.player && state.player.pauseVideo) {
    state.player.pauseVideo();
  }
  showScreen('doneScreen');

  const accuracy = state.totalKeystrokes > 0 
    ? Math.round((state.correctKeystrokes / state.totalKeystrokes) * 100) 
    : 100;
  
  document.getElementById('finalScore').textContent = state.score;
  document.getElementById('finalAccuracy').textContent = `${accuracy}%`;
  document.getElementById('finalWpm').textContent = document.getElementById('liveWpm').textContent;

  if (window.confetti) {
    window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  }
}

function showScreen(screenId) {
  ['modeSelectScreen', 'levelSelectScreen', 'gameScreen', 'doneScreen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(screenId);
  if (target) target.classList.remove('hidden');

  if (screenId !== 'gameScreen' && state.isPlayerReady && state.player && state.player.pauseVideo) {
    state.player.pauseVideo();
    stopTimeTracker();
  }
}

function selectTrack(trackKey) {
  state.currentTrackKey = trackKey;
  renderLevelCards();
  showScreen('levelSelectScreen');
}

function renderLevelCards() {
  const track = TRACKS[state.currentTrackKey];
  if (!track) return;

  document.getElementById('trackBadge').textContent = track.badge;
  const listContainer = document.getElementById('levelList');
  if (!listContainer) return;

  listContainer.innerHTML = track.levels.map((lvl, index) => `
    <div onclick="startLevel(${index})" class="group cursor-pointer rounded-3xl p-6 bg-slate-900/90 border-2 border-slate-800 hover:border-amber-400/80 transition-all duration-300 hover:scale-[1.02] shadow-xl">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs uppercase font-extrabold px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
          ${lvl.difficulty}
        </span>
        <span class="text-xs font-mono text-slate-400">${lvl.lines.length} lines</span>
      </div>
      <h3 class="text-lg font-black text-white group-hover:text-amber-400 transition">${lvl.title}</h3>
      <p class="text-xs text-slate-400 mt-1">${lvl.sub}</p>
    </div>
  `).join('');
}

/* =========================================================================
   INITIALIZATION
   ========================================================================= */

window.addEventListener('DOMContentLoaded', () => {
  restoreCustomVideoCues();
  renderLevelCards();
});
