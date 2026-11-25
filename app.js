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

const PROGRESS_KEY = 'typebeat_progress_v1';

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn('Could not save progress.', e);
  }
}

function bestScoreLabel(id) {
  const best = loadProgress().songs?.[id];
  return best
    ? `<p class="text-xs font-bold text-amber-400 mt-2">Best: ${best.score} pts • ${best.accuracy}% accuracy</p>`
    : '';
}

function academyBestLabel(id) {
  const best = loadProgress().academy?.bestStars?.[id];
  return best ? ` ${'★'.repeat(best)}` : '';
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
  pausedByMistake: false, // true only when a typing error paused the video
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
      disablekb: 1,
      cc_load_policy: 1,
      cc_lang_pref: 'en'
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

function showPausePill(show, message = 'Waiting for your typing…') {
  const pill = document.getElementById('waitingOverlay');
  if (!pill) return;
  pill.classList.toggle('hidden', !show);
  const label = pill.querySelector('span:last-child');
  if (label && show) label.textContent = message;
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
  state.pausedByMistake = false;
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
  state.pausedByMistake = false;
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
  state.pausedByMistake = false;
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
    if (state.pausedByMistake) {
      state.pausedByMistake = false;
      state.isPausedForInput = false;
      showPausePill(false);
      if (state.isPlayerReady && state.player) state.player.playVideo();
    } else if (state.isPausedForInput) {
      showPausePill(true, 'Good, keep typing to continue');
    }
    renderVocaTypeUI();



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
      state.pausedByMistake = true;
      state.player.pauseVideo();
      const expected = targetChar === ' ' ? 'space' : targetChar;
      showPausePill(true, `Not quite. Type "${expected}" to continue`);
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
        showPausePill(true, 'Wrong letter. Fix it and keep typing');
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


function openCustomLyricModal(prefillVideoId = "") {
  const currentInput = document.getElementById('customYtUrl')?.value?.trim() || "";
  const videoId = prefillVideoId || extractYouTubeVideoId(currentInput) || "";
  const modalYt = document.getElementById('modalYtUrl');
  if (modalYt) modalYt.value = videoId ? `https://www.youtube.com/watch?v=${videoId}` : currentInput;
  const modal = document.getElementById('customLyricsModal');
  if (modal) modal.classList.remove('hidden');
}

function closeCustomLyricModal() {
  const modal = document.getElementById('customLyricsModal');
  if (modal) modal.classList.add('hidden');
}

function autoGenerateBeatTimings() {
  const sampleVocab = ["rhythm", "melody", "harmony", "energy", "future", "feeling", "champion", "thunder", "sparkle"];
  const generated = sampleVocab.map((w, idx) => {
    const time = 12 + idx * 10;
    return `[00:${time < 10 ? '0' + time : time}.00] Type the ${w} with the music beat`;
  }).join('\n');
  const textEl = document.getElementById('modalLyricsText');
  if (textEl) textEl.value = generated;
}

function parseLrcOrRawLyrics(rawText) {
  const lines = rawText.split('\n');
  const cues = [];
  let currentTime = 10;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const timeMatch = trimmed.match(/\[(\d{1,2}):(\d{2})(?:\.(\d+))?\]/);
    let lyricText = trimmed;

    if (timeMatch) {
      const minutes = parseInt(timeMatch[1], 10);
      const seconds = parseInt(timeMatch[2], 10);
      currentTime = minutes * 60 + seconds;
      lyricText = trimmed.replace(/\[\d{1,2}:\d{2}(?:\.\d+)?\]/g, '').trim();
    } else {
      currentTime += 6;
    }

    if (!lyricText) continue;

    const words = lyricText.split(/\s+/);
    const targetWord = words.find(w => w.length > 3) || words[0] || 'beat';
    const targetIdx = words.indexOf(targetWord);
    const before = words.slice(0, targetIdx).join(' ');
    const after = words.slice(targetIdx + 1).join(' ');

    cues.push({
      time: currentTime,
      sentence: lyricText,
      target: targetWord,
      before,
      after
    });
  }

  return cues;
}

function applyModalLyricsAndStart() {
  const urlInput = document.getElementById('modalYtUrl')?.value?.trim() || "";
  const videoId = extractYouTubeVideoId(urlInput);
  const text = document.getElementById('modalLyricsText')?.value?.trim() || "";

  if (!videoId) return alert("Please provide a valid YouTube URL or ID.");
  if (!text) return alert("Please paste lyrics or click 'Auto-Generate Beat Pacing'.");

  const cues = parseLrcOrRawLyrics(text);
  if (!cues.length) return alert("Could not parse words from lyrics. Try typing one line per sentence.");

  closeCustomLyricModal();
  applyCustomVideoCues(videoId, cues, "Custom Synced Song");
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

// Backup default tracks at load time so user can restore them anytime
const DEFAULT_TRACKS_BACKUP = typeof TRACKS !== 'undefined' ? JSON.parse(JSON.stringify(TRACKS)) : {};

function applyDeletedTracksFilter() {
  try {
    const deleted = JSON.parse(localStorage.getItem('typebeat_deleted_song_ids') || '[]');
    if (!Array.isArray(deleted) || deleted.length === 0) return;
    const deletedSet = new Set(deleted);
    Object.keys(TRACKS).forEach(trackKey => {
      if (TRACKS[trackKey] && Array.isArray(TRACKS[trackKey].levels)) {
        TRACKS[trackKey].levels = TRACKS[trackKey].levels.filter(lvl => !deletedSet.has(lvl.id));
      }
    });
  } catch (error) {
    console.warn('Could not filter deleted tracks.', error);
  }
}

function restoreCustomVideoCues() {
  try {
    const deleted = JSON.parse(localStorage.getItem('typebeat_deleted_song_ids') || '[]');
    const deletedSet = new Set(Array.isArray(deleted) ? deleted : []);
    const saved = JSON.parse(localStorage.getItem('typebeat_custom_songs') || '[]');
    if (!Array.isArray(saved)) return;
    saved.forEach(item => {
      const trackKey = item?.trackKey;
      const level = item?.level;
      if (TRACKS[trackKey] && level?.id && !deletedSet.has(level.id) && !TRACKS[trackKey].levels.some(existing => existing.id === level.id)) {
        TRACKS[trackKey].levels.push(level);
      }
    });
  } catch (error) {
    console.warn('Could not restore saved custom videos.', error);
  }
}

function deleteLevel(levelIndex, trackKey = null) {
  const key = trackKey || state.currentTrackKey || 'youth';
  const track = TRACKS[key];
  if (!track || !track.levels || !track.levels[levelIndex]) return;

  const lvl = track.levels[levelIndex];
  const confirmed = window.confirm(`Are you sure you want to delete "${lvl.title}" from this track?`);
  if (!confirmed) return;

  try {
    // Record deleted ID in persistent storage
    const deleted = JSON.parse(localStorage.getItem('typebeat_deleted_song_ids') || '[]');
    if (!deleted.includes(lvl.id)) {
      deleted.push(lvl.id);
      localStorage.setItem('typebeat_deleted_song_ids', JSON.stringify(deleted));
    }
    // Also remove from saved custom songs if it was a custom import
    const savedCustom = JSON.parse(localStorage.getItem('typebeat_custom_songs') || '[]');
    const filteredCustom = savedCustom.filter(item => item?.level?.id !== lvl.id);
    localStorage.setItem('typebeat_custom_songs', JSON.stringify(filteredCustom));
  } catch (err) {
    console.warn('Could not update deleted songs storage', err);
  }

  // Remove from active array
  track.levels.splice(levelIndex, 1);
  renderLevelCards();
}

function deleteCurrentPlayingLevel() {
  const lvl = getCurrentLevel();
  if (!lvl) return;
  const confirmed = window.confirm(`Delete "${lvl.title}" from this track and return to song list?`);
  if (!confirmed) return;

  if (state.player && state.player.pauseVideo) {
    state.player.pauseVideo();
  }
  stopTimeTracker();

  deleteLevel(state.currentLevelIndex, state.currentTrackKey);
  showScreen('levelSelectScreen');
}

function resetDefaultTracks() {
  const confirmed = window.confirm('Restore all original default songs? (Your custom imported videos will be kept)');
  if (!confirmed) return;

  try {
    localStorage.removeItem('typebeat_deleted_song_ids');
    Object.keys(DEFAULT_TRACKS_BACKUP).forEach(trackKey => {
      if (TRACKS[trackKey]) {
        TRACKS[trackKey].levels = JSON.parse(JSON.stringify(DEFAULT_TRACKS_BACKUP[trackKey].levels || []));
      }
    });
    restoreCustomVideoCues();
    renderLevelCards();
  } catch (err) {
    console.error('Failed to reset default tracks', err);
  }
}


function showScreen(screenId) {
  ['modeSelectScreen', 'levelSelectScreen', 'gameScreen', 'doneScreen', 'academyScreen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(screenId);
  if (target) target.classList.remove('hidden');

  if (screenId !== 'gameScreen' && state.isPlayerReady && state.player && state.player.pauseVideo) {
    state.player.pauseVideo();
    stopTimeTracker();
  }

  if (screenId !== 'academyScreen' && typeof academyBeat !== 'undefined' && academyBeat.isPlaying) {
    academyBeat.stop();
  }
}

function selectTrack(trackKey) {
  state.currentTrackKey = trackKey;
  renderLevelCards();
  showScreen('levelSelectScreen');
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
    const totalLines = (lvl.lines && lvl.lines.length) ? lvl.lines.length : (lvl.words ? lvl.words.length : 1);
    counterEl.textContent = `LINE ${state.currentLineIndex + 1}/${totalLines}`;
  }

  if (state.gameMode === 'vocatype') {
    const vocaSec = document.getElementById('vocatypeSection');
    const dictSec = document.getElementById('dictationSection');
    if (vocaSec) vocaSec.classList.remove('hidden');
    if (dictSec) dictSec.classList.add('hidden');
    renderVocaTypeUI();
  } else {
    const vocaSec = document.getElementById('vocatypeSection');
    const dictSec = document.getElementById('dictationSection');
    if (vocaSec) vocaSec.classList.add('hidden');
    if (dictSec) dictSec.classList.remove('hidden');
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

  if (btnVoca && btnDict) {
    if (newMode === 'vocatype') {
      btnVoca.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 shadow-md';
      btnDict.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white';
    } else {
      btnDict.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 shadow-md';
      btnVoca.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white';
    }
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

  const wpmEl = document.getElementById('liveWpm');
  if (wpmEl) wpmEl.textContent = `${wpm} WPM`;
  const accEl = document.getElementById('liveAccuracy');
  if (accEl) accEl.textContent = `${accuracy}%`;
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
  
  const finishedLevel = getCurrentLevel();
  if (finishedLevel) {
    const prog = loadProgress();
    prog.songs = prog.songs || {};
    const prev = prog.songs[finishedLevel.id];
    if (!prev || state.score > prev.score) {
      prog.songs[finishedLevel.id] = { score: state.score, accuracy };
      saveProgress(prog);
    }
  }

  const finalScoreEl = document.getElementById('finalScore');
  if (finalScoreEl) finalScoreEl.textContent = state.score;
  const finalAccEl = document.getElementById('finalAccuracy');
  if (finalAccEl) finalAccEl.textContent = `${accuracy}%`;
  const finalWpmEl = document.getElementById('finalWpm');
  const liveWpmEl = document.getElementById('liveWpm');
  if (finalWpmEl && liveWpmEl) finalWpmEl.textContent = liveWpmEl.textContent;

  if (window.confetti) {
    try {
      window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (e) {}
  }
}

function renderLevelCards() {
  const track = TRACKS[state.currentTrackKey];
  if (!track) return;

  document.getElementById('trackBadge').textContent = track.badge;
  const listContainer = document.getElementById('levelList');
  if (!listContainer) return;

  if (!track.levels || track.levels.length === 0) {
    listContainer.innerHTML = `
      <div class="col-span-full py-12 px-6 text-center rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/40">
        <span class="text-4xl block mb-3">🎬</span>
        <h4 class="text-base font-bold text-white mb-1">No videos left in this track</h4>
        <p class="text-xs text-slate-400 max-w-sm mx-auto mb-4">Paste any YouTube URL in the box above to add videos, or restore the original songs.</p>
        <button onclick="resetDefaultTracks()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition inline-flex items-center gap-1.5 mx-auto">
          <span>↺</span> Restore Default Songs
        </button>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = track.levels.map((lvl, index) => `
    <div onclick="startLevel(${index})" class="group cursor-pointer rounded-3xl p-6 bg-slate-900/90 border-2 border-slate-800 hover:border-amber-400/80 transition-all duration-300 hover:scale-[1.02] shadow-xl relative">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs uppercase font-extrabold px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
          ${lvl.difficulty}
        </span>
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono text-slate-400">${lvl.lines ? lvl.lines.length : 0} lines</span>
          <button onclick="event.stopPropagation(); deleteLevel(${index});" title="Delete video from this track" class="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
      <h3 class="text-lg font-black text-white group-hover:text-amber-400 transition pr-2">${lvl.title}</h3>
      <p class="text-xs text-slate-400 mt-1">${lvl.sub}</p>
      ${bestScoreLabel(lvl.id)}
    </div>
  `).join('');
}


/* =========================================================================
   TOUCH TYPING ACADEMY (KIDS & BEGINNERS HOME ROW ENGINE)
   Option 1: In-Browser Web Audio Synthesizer Beat & Visual Finger Mapping
   ========================================================================= */

class AcademyBeatSynthesizer {
  constructor() {
    this.ctx = null;
    this.bpm = 85;
    this.isPlaying = false;
    this.timerId = null;
    this.currentBeat = 0;
    this.isMuted = false;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playKick(time) {
    if (!this.ctx || this.isMuted) return;
    const t = time || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(145, t);
    osc.frequency.exponentialRampToValueAtTime(36, t + 0.16);
    gain.gain.setValueAtTime(0.42, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  playSnare(time) {
    if (!this.ctx || this.isMuted) return;
    const t = time || this.ctx.currentTime;
    // Tone component
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(185, t);
    oscGain.gain.setValueAtTime(0.22, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);

    // Noise burst
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.14);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.035));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.28, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.005, t + 0.14);
    noise.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start(t);
  }

  playHiHat(time) {
    if (!this.ctx || this.isMuted) return;
    const t = time || this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.045);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.009));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6800, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(t);
  }

  playMelodyChime(semitoneOffset = 0) {
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const baseFreq = 261.63 * Math.pow(2, semitoneOffset / 12); // C4 pentatonic basis
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, t);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  playWoodTick() {
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.linearRampToValueAtTime(60, t + 0.06);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  playFanfare() {
    this.ensureContext();
    if (!this.ctx) return;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25];
    notes.forEach((freq, idx) => {
      const t = this.ctx.currentTime + idx * 0.09;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  start() {
    this.ensureContext();
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.currentBeat = 0;
    this.scheduleNextBeat();
    this.updateToggleUI();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.updateToggleUI();
    this.clearLamps();
  }

  setBpm(bpm) {
    this.bpm = bpm;
  }

  scheduleNextBeat() {
    if (!this.isPlaying) return;
    // 4-beat pattern (0, 1, 2, 3)
    // Beat 0: Kick + Hat
    // Beat 1: Hat
    // Beat 2: Snare + Hat
    // Beat 3: Hat
    this.playHiHat();
    if (this.currentBeat === 0) {
      this.playKick();
    } else if (this.currentBeat === 2) {
      this.playSnare();
    }

    this.flashLamp(this.currentBeat);
    this.currentBeat = (this.currentBeat + 1) % 4;

    const intervalMs = (60 / this.bpm) * 1000;
    this.timerId = setTimeout(() => this.scheduleNextBeat(), intervalMs);
  }

  flashLamp(beatIndex) {
    for (let i = 0; i < 4; i++) {
      const lamp = document.getElementById(`beatLamp${i}`);
      if (!lamp) continue;
      if (i === beatIndex) {
        lamp.classList.add('active');
        lamp.style.backgroundColor = (i === 0) ? '#f59e0b' : (i === 2) ? '#10b981' : '#38bdf8';
      } else {
        lamp.classList.remove('active');
        lamp.style.backgroundColor = '#334155';
      }
    }
  }

  clearLamps() {
    for (let i = 0; i < 4; i++) {
      const lamp = document.getElementById(`beatLamp${i}`);
      if (lamp) {
        lamp.classList.remove('active');
        lamp.style.backgroundColor = '#334155';
      }
    }
  }

  updateToggleUI() {
    const icon = document.getElementById('academyBeatIcon');
    const label = document.getElementById('academyBeatLabel');
    const btn = document.getElementById('academyBeatToggleBtn');
    if (!btn || !icon || !label) return;
    if (this.isPlaying) {
      icon.textContent = '⏸';
      label.textContent = 'Beat Playing';
      btn.className = 'px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center gap-1.5 shadow';
    } else {
      icon.textContent = '▶';
      label.textContent = 'Beat Paused';
      btn.className = 'px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition flex items-center gap-1.5 shadow border border-slate-700';
    }
  }
}

const academyBeat = new AcademyBeatSynthesizer();

const ACADEMY_LESSONS = [
  {
    id: 'lesson-1',
    title: '1. Anchor Bumps (F & J)',
    badge: 'Index Anchors',
    keys: ['f', 'j'],
    pattern: 'ffjjfjffjjfjfj',
    leftHand: 'Index on [F]',
    rightHand: 'Index on [J]',
    tip: 'Feel the raised bump on F (left hand) and J (right hand). Keep your eyes on the screen!'
  },
  {
    id: 'lesson-2',
    title: '2. Index Stretch (G & H)',
    badge: 'Center Stretch',
    keys: ['f', 'g', 'h', 'j'],
    pattern: 'fgfhjhgfghjfgh',
    leftHand: 'Index reaches [G]',
    rightHand: 'Index reaches [H]',
    tip: 'Stretch index fingers across the middle to G and H, then snap right back home to F and J!'
  },
  {
    id: 'lesson-3',
    title: '3. Middle Groove (D & K)',
    badge: 'Middle Fingers',
    keys: ['d', 'f', 'j', 'k'],
    pattern: 'dfjkddkkfdjkdf',
    leftHand: 'Middle on [D]',
    rightHand: 'Middle on [K]',
    tip: 'Middle fingers rest right next to index fingers. Keep both index fingers resting gently on F & J!'
  },
  {
    id: 'lesson-4',
    title: '4. Ring Rhythm (S & L)',
    badge: 'Ring Agility',
    keys: ['s', 'd', 'k', 'l'],
    pattern: 'sdfjklsldkslsd',
    leftHand: 'Ring on [S]',
    rightHand: 'Ring on [L]',
    tip: 'Ring fingers feel weaker at first. Tap softly on the drum beat and let your muscle memory grow.'
  },
  {
    id: 'lesson-5',
    title: '5. Pinky & Space (A, ;, Space)',
    badge: 'Full Home Row',
    keys: ['a', 's', 'd', 'f', 'j', 'k', 'l', ';', ' '],
    pattern: 'asdf jkl; a ; as l;',
    leftHand: 'Pinky on [A]',
    rightHand: 'Pinky on [;], Thumbs [Space]',
    tip: 'Pinkies rest on the ends (A and ;). Thumbs hover gently above the Spacebar!'
  },
  {
    id: 'lesson-6',
    title: '6. Home Row Word Master',
    badge: 'Real Words',
    keys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    pattern: 'as ask dad fall glad half salad',
    leftHand: 'Full Left Home Row',
    rightHand: 'Full Right Home Row',
    tip: 'Awesome job! You are now typing full English words without looking at your physical keyboard!'
  }
];

const FINGER_MAP = {
  'a': { hand: 'left', finger: 'pinky', color: '#f43f5e', label: 'Left Pinky' },
  's': { hand: 'left', finger: 'ring', color: '#f59e0b', label: 'Left Ring' },
  'd': { hand: 'left', finger: 'middle', color: '#10b981', label: 'Left Middle' },
  'f': { hand: 'left', finger: 'index', color: '#06b6d4', label: 'Left Index (Bump!)' },
  'g': { hand: 'left', finger: 'index', color: '#06b6d4', label: 'Left Index (Reach)' },
  'h': { hand: 'right', finger: 'index', color: '#06b6d4', label: 'Right Index (Reach)' },
  'j': { hand: 'right', finger: 'index', color: '#06b6d4', label: 'Right Index (Bump!)' },
  'k': { hand: 'right', finger: 'middle', color: '#10b981', label: 'Right Middle' },
  'l': { hand: 'right', finger: 'ring', color: '#f59e0b', label: 'Right Ring' },
  ';': { hand: 'right', finger: 'pinky', color: '#f43f5e', label: 'Right Pinky' },
  ' ': { hand: 'both', finger: 'thumb', color: '#6366f1', label: 'Either Thumb' }
};

const PENTATONIC_SCALE = [0, 2, 4, 7, 9, 12, 14, 16];

const academyState = {
  lessonIndex: 0,
  charIndex: 0,
  combo: 0,
  maxCombo: 0,
  stars: 3,
  errors: 0
};

function openAcademy(lessonIndex = 0) {
  showScreen('academyScreen');
  renderAcademyLessonTabs();
  loadAcademyLesson(lessonIndex);
  academyBeat.start();
}

function renderAcademyLessonTabs() {
  const container = document.getElementById('academyLessonTabs');
  if (!container) return;
  container.innerHTML = ACADEMY_LESSONS.map((l, idx) => `
    <button onclick="loadAcademyLesson(${idx})" class="shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${idx === academyState.lessonIndex ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'}">
      <span>${l.title}${academyBestLabel(l.id)}</span>
    </button>
  `).join('');
}

function loadAcademyLesson(index) {
  academyState.lessonIndex = index;
  academyState.charIndex = 0;
  academyState.combo = 0;
  academyState.maxCombo = 0;
  academyState.errors = 0;
  academyState.stars = 3;

  document.getElementById('academySuccessModal')?.classList.add('hidden');
  renderAcademyLessonTabs();
  renderAcademyUI();
}

function toggleAcademyBeat() {
  if (academyBeat.isPlaying) {
    academyBeat.stop();
  } else {
    academyBeat.start();
  }
}

function setAcademyBpm(bpm) {
  academyBeat.setBpm(bpm);
  [65, 85, 105].forEach(val => {
    const btn = document.getElementById(`bpmBtn${val}`);
    if (btn) {
      if (val === bpm) {
        btn.className = 'px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-bold transition';
      } else {
        btn.className = 'px-2.5 py-1 rounded-lg text-slate-400 hover:text-white font-bold transition';
      }
    }
  });
}

function getAcademyStars() {
  const e = academyState.errors;
  return e === 0 ? 3 : e <= 3 ? 2 : 1;
}

function renderAcademyStars() {
  academyState.stars = getAcademyStars();
  const el = document.getElementById('academyStars');
  if (!el) return;
  el.innerHTML = [1, 2, 3].map(i =>
    `<span class="${i <= academyState.stars ? 'text-amber-400' : 'text-slate-700'}">★</span>`
  ).join('');
}

function renderAcademyUI() {
  const lesson = ACADEMY_LESSONS[academyState.lessonIndex];
  if (!lesson) return;

  const currentPattern = lesson.pattern;
  const currentChar = currentPattern[academyState.charIndex] || '';

  // 1. Progress & Score
  const progressText = document.getElementById('academyProgressText');
  if (progressText) {
    progressText.textContent = `${academyState.charIndex} / ${currentPattern.length}`;
  }

  const comboCount = document.getElementById('academyComboCount');
  if (comboCount) comboCount.textContent = academyState.combo;

  // 2. Stream rendering
  const streamEl = document.getElementById('academyPromptStream');
  if (streamEl) {
    const chars = currentPattern.split('');
    streamEl.innerHTML = chars.map((ch, i) => {
      const displayChar = ch === ' ' ? '␣' : ch.toUpperCase();
      if (i < academyState.charIndex) {
        return `<span class="inline-flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold opacity-60">${displayChar}</span>`;
      } else if (i === academyState.charIndex) {
        const fingerInfo = FINGER_MAP[ch.toLowerCase()] || { color: '#38bdf8' };
        return `<span class="inline-flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-slate-800 text-white font-black scale-110 shadow-2xl border-2 transition-all animate-bounce" style="border-color: ${fingerInfo.color}; box-shadow: 0 0 20px ${fingerInfo.color}80">${displayChar}</span>`;
      } else {
        return `<span class="inline-flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-slate-900 text-slate-500 border border-slate-800 font-semibold">${displayChar}</span>`;
      }
    }).join('');
  }

  // 3. Coach & Finger Placement Banner
  const finger = FINGER_MAP[currentChar.toLowerCase()];
  const handInstruction = document.getElementById('academyHandInstruction');
  const handIcon = document.getElementById('academyHandIcon');
  const lessonTip = document.getElementById('academyLessonTip');

  if (finger) {
    if (handIcon) handIcon.textContent = finger.hand === 'left' ? '🖐️' : finger.hand === 'right' ? '✋' : '👍';
    if (handInstruction) {
      handInstruction.innerHTML = `<span style="color: ${finger.color}">${finger.label}</span> on <strong class="text-white bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">${currentChar === ' ' ? 'SPACEBAR' : currentChar.toUpperCase()}</strong>`;
    }
  } else {
    if (handInstruction) handInstruction.textContent = 'Keep your eyes on the screen';
  }

  if (lessonTip) lessonTip.textContent = lesson.tip;

  // 4. Keyboard rendering
  renderAcademyKeyboard(currentChar.toLowerCase());
  renderAcademyStars();
}

function renderAcademyKeyboard(activeChar) {
  const container = document.getElementById('academyKeyboard');
  if (!container) return;

  const rows = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
    [' ']
  ];

  container.innerHTML = rows.map((row, rIdx) => {
    if (rIdx === 3) {
      // Spacebar row
      const isTarget = activeChar === ' ';
      return `
        <div class="flex justify-center pt-2">
          <div id="key-space" class="academy-key w-64 md:w-80 h-12 text-xs font-bold text-slate-400 ${isTarget ? 'key-target' : ''}" style="${isTarget ? 'border-color: #6366f1; box-shadow: 0 0 16px rgba(99,102,241,0.6)' : ''}">
            SPACEBAR (Thumbs)
          </div>
        </div>
      `;
    }

    const keysHtml = row.map(k => {
      const isTarget = k === activeChar;
      const isHomeRow = rIdx === 1;
      const finger = FINGER_MAP[k];
      const hasBump = k === 'f' || k === 'j';

      let borderStyle = '';
      let textColor = 'text-slate-400';
      if (finger && isHomeRow) {
        textColor = `text-white`;
        borderStyle = `border-color: ${finger.color}40; background: ${finger.color}15;`;
      }
      if (isTarget && finger) {
        borderStyle = `border-color: ${finger.color}; box-shadow: 0 0 18px ${finger.color}80;`;
      }

      return `
        <div id="key-${k === ';' ? 'semi' : k}" class="academy-key w-9 h-11 sm:w-11 sm:h-12 md:w-12 md:h-14 text-sm md:text-base ${hasBump ? 'bump' : ''} ${isTarget ? 'key-target' : ''} ${textColor}" style="${borderStyle}">
          <span>${k === ';' ? ';' : k.toUpperCase()}</span>
          ${finger && isHomeRow ? `<span class="text-[8px] uppercase tracking-tighter opacity-70" style="color: ${finger.color}">${finger.finger.slice(0, 3)}</span>` : ''}
        </div>
      `;
    }).join('');

    return `<div class="flex justify-center gap-1.5 sm:gap-2">${keysHtml}</div>`;
  }).join('');
}

function handleAcademyKey(e) {
  const academyScreen = document.getElementById('academyScreen');
  if (!academyScreen || academyScreen.classList.contains('hidden')) return;

  // Ignore navigation or modifier keys
  if (['Tab', 'CapsLock', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

  const lesson = ACADEMY_LESSONS[academyState.lessonIndex];
  if (!lesson) return;

  const currentPattern = lesson.pattern;
  if (academyState.charIndex >= currentPattern.length) return;

  const targetChar = currentPattern[academyState.charIndex];
  const pressed = e.key.toLowerCase();

  // Highlight physical key press visually
  const keyId = pressed === ' ' ? 'key-space' : pressed === ';' ? 'key-semi' : `key-${pressed}`;
  const keyEl = document.getElementById(keyId);
  if (keyEl) {
    keyEl.classList.add('key-pressed');
    setTimeout(() => keyEl.classList.remove('key-pressed'), 120);
  }

  const isMatch = (targetChar === ' ' && e.key === ' ') || (targetChar.toLowerCase() === pressed);

  if (isMatch) {
    e.preventDefault();
    // Play pentatonic chime matching step
    const semitone = PENTATONIC_SCALE[academyState.charIndex % PENTATONIC_SCALE.length];
    academyBeat.playMelodyChime(semitone);

    academyState.combo++;
    if (academyState.combo > academyState.maxCombo) {
      academyState.maxCombo = academyState.combo;
    }
    academyState.charIndex++;

    if (academyState.charIndex >= currentPattern.length) {
      finishAcademyLesson();
    } else {
      renderAcademyUI();
    }
  } else {
    // Mistake
    e.preventDefault();
    academyBeat.playWoodTick();
    academyState.errors++;
    academyState.combo = 0;
    renderAcademyUI();
    const promptStream = document.getElementById('academyPromptStream');
    if (promptStream) {
      promptStream.classList.add('animate-shake');
      setTimeout(() => promptStream.classList.remove('animate-shake'), 300);
    }
  }
}

function finishAcademyLesson() {
  renderAcademyUI();

  const lessonId = ACADEMY_LESSONS[academyState.lessonIndex].id;
  const prog = loadProgress();
  prog.academy = prog.academy || { bestStars: {}, bestCombo: 0 };
  prog.academy.bestStars = prog.academy.bestStars || {};
  prog.academy.bestStars[lessonId] = Math.max(prog.academy.bestStars[lessonId] || 0, academyState.stars);
  prog.academy.bestCombo = Math.max(prog.academy.bestCombo || 0, academyState.maxCombo);
  saveProgress(prog);

  academyBeat.playFanfare();

  // Launch confetti
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  }

  const modal = document.getElementById('academySuccessModal');
  const msg = document.getElementById('academySuccessMessage');
  if (modal) {
    if (msg) {
      const lesson = ACADEMY_LESSONS[academyState.lessonIndex];
      msg.textContent = `Terrific! You completed ${lesson.title} with a combo streak of ${academyState.maxCombo}!`;
    }
    const modalStars = modal.querySelector('.text-2xl.text-amber-400');
    if (modalStars) {
      modalStars.textContent = '★'.repeat(academyState.stars) + '☆'.repeat(3 - academyState.stars);
    }
    modal.classList.remove('hidden');
  }
}

function nextAcademyLesson() {
  document.getElementById('academySuccessModal')?.classList.add('hidden');
  const nextIdx = (academyState.lessonIndex + 1) % ACADEMY_LESSONS.length;
  loadAcademyLesson(nextIdx);
}

function restartAcademyLesson() {
  document.getElementById('academySuccessModal')?.classList.add('hidden');
  loadAcademyLesson(academyState.lessonIndex);
}

// Global key listener for Touch Typing Academy
window.addEventListener('keydown', handleAcademyKey);


/* =========================================================================
   INITIALIZATION
   ========================================================================= */

window.addEventListener('DOMContentLoaded', () => {
  applyDeletedTracksFilter();
  restoreCustomVideoCues();
  renderLevelCards();
});
