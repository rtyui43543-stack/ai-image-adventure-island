(() => {
  "use strict";

  const toggle = document.getElementById("music-toggle");
  const effectsToggle = document.getElementById("sfx-toggle");
  const volumeInput = document.getElementById("audio-volume");
  const volumeLabel = document.getElementById("audio-volume-label");
  const status = document.getElementById("audio-status");
  const storageKey = "adventure-audio-settings";
  const AudioConstructor = window.Audio;
  let musicWanted = false;
  let awaitingMusicGesture = false;
  let playRequest = 0;
  let volume = 25;
  let effectsEnabled = effectsToggle ? effectsToggle.checked : true;
  let duck = 1;
  let duckTimer = null;
  let restoreTimer = null;
  let lastConfirm = -Infinity;
  let revealVersion = 0;
  let activeReveal = null;

  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    if (saved && Number.isFinite(saved.volume)) volume = Math.max(0, Math.min(100, saved.volume));
    if (saved && typeof saved.effects === "boolean") effectsEnabled = saved.effects;
  } catch (_) { /* Offline/private browser storage may be unavailable. */ }

  function announce(text) {
    if (status) status.textContent = text;
  }

  function persist() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ volume, effects: effectsEnabled }));
    } catch (_) { /* Controls still work without storage. */ }
  }

  function setControls() {
    if (toggle) {
      toggle.setAttribute("aria-pressed", String(musicWanted));
      toggle.textContent = musicWanted ? "關閉冒險音樂" : "開啟冒險音樂";
    }
    if (effectsToggle) effectsToggle.checked = effectsEnabled;
    if (volumeInput) volumeInput.value = String(volume);
    if (volumeLabel) volumeLabel.textContent = `${volume}%`;
  }

  setControls();
  // The page remains fully usable on a browser without audio support.
  if (typeof AudioConstructor !== "function") {
    if (toggle) toggle.disabled = true;
    if (effectsToggle) effectsToggle.disabled = true;
    if (volumeInput) volumeInput.disabled = true;
    announce("此瀏覽器暫不支援音訊；仍可完成冒險。");
    window.ADVENTURE_AUDIO = { startExperience() {}, stopExperience() {}, confirm() {}, reveal() {}, cancelReveal() {} };
    return;
  }

  const music = new AudioConstructor("assets/audio/quiet-adventure.wav");
  const confirmSound = new AudioConstructor("assets/audio/choice-soft.wav");
  const revealSounds = new Map();
  music.loop = true;
  music.preload = "none";
  confirmSound.preload = "auto";
  const effectStates = new Map([
    [confirmSound, { request: 0, wanted: false }]
  ]);

  function updateVolumes() {
    music.volume = (volume / 100) * duck;
    confirmSound.volume = (volume / 100) * .62;
    revealSounds.forEach((sound) => { sound.volume = (volume / 100) * .72; });
  }

  function stop(sound) {
    const effect = effectStates.get(sound);
    if (effect) { effect.request += 1; effect.wanted = false; }
    sound.pause();
    try { sound.currentTime = 0; } catch (_) { /* Media may not have metadata yet. */ }
  }

  function clearDuckTimers() {
    if (duckTimer !== null) window.clearInterval(duckTimer);
    if (restoreTimer !== null) window.clearTimeout(restoreTimer);
    duckTimer = null;
    restoreTimer = null;
  }

  function rampDuck(target, duration) {
    if (duckTimer !== null) window.clearInterval(duckTimer);
    const from = duck;
    const steps = Math.max(1, Math.round(duration / 30));
    let step = 0;
    duckTimer = window.setInterval(() => {
      step += 1;
      duck = from + (target - from) * Math.min(step / steps, 1);
      updateVolumes();
      if (step >= steps) {
        window.clearInterval(duckTimer);
        duckTimer = null;
      }
    }, 30);
  }

  function cancelReveal() {
    revealVersion += 1;
    activeReveal = null;
    clearDuckTimers();
    revealSounds.forEach(stop);
    duck = 1;
    updateVolumes();
  }

  function finishReveal(version) {
    if (!activeReveal || activeReveal.version !== version) return;
    const sound = activeReveal.sound;
    activeReveal = null;
    clearDuckTimers();
    stop(sound);
    rampDuck(1, 300);
  }

  function soundFor(profile) {
    if (revealSounds.has(profile.id)) return revealSounds.get(profile.id);
    const sound = new AudioConstructor(profile.src);
    sound.preload = "auto";
    sound.loop = false;
    sound.volume = (volume / 100) * .72;
    effectStates.set(sound, { request: 0, wanted: false });
    revealSounds.set(profile.id, sound);
    sound.addEventListener("ended", () => {
      if (sound.ended && activeReveal?.sound === sound) finishReveal(activeReveal.version);
    });
    sound.addEventListener("error", () => {
      if (activeReveal?.sound === sound) finishReveal(activeReveal.version);
    });
    return sound;
  }

  function musicFailed(request, error, allowGestureRetry = false) {
    if (request !== playRequest || !musicWanted) return;
    musicWanted = false;
    awaitingMusicGesture = allowGestureRetry && awaitingMusicGesture && volume > 0 && error?.name === "NotAllowedError";
    playRequest += 1;
    music.pause();
    setControls();
    announce(awaitingMusicGesture
      ? "點選冒險選項或「開啟冒險音樂」，讓音樂陪你出發。"
      : "音樂暫時無法播放，請再按一次開啟；仍可繼續冒險。");
  }

  function startMusic(allowGestureRetry = false) {
    const request = ++playRequest;
    if (allowGestureRetry) awaitingMusicGesture = volume > 0;
    if (!musicWanted || document.hidden) return;
    announce("正在開啟冒險音樂…");
    try {
      const promise = music.play();
      Promise.resolve(promise).then(() => {
        if (request !== playRequest) {
          if (!musicWanted || document.hidden) music.pause();
          return;
        }
        if (!musicWanted || document.hidden) { music.pause(); return; }
        awaitingMusicGesture = false;
        announce(volume === 0 ? "音樂已開啟，目前音量為 0%。" : "冒險音樂已開啟。");
      }).catch((error) => musicFailed(request, error, allowGestureRetry));
    } catch (error) {
      musicFailed(request, error, allowGestureRetry);
    }
  }

  function playEffect(sound, onStarted = () => {}, onFailed = () => {}) {
    if (!effectsEnabled || volume === 0 || document.hidden) return false;
    stop(sound);
    const effect = effectStates.get(sound);
    const request = effect.request;
    effect.wanted = true;
    try {
      const promise = sound.play();
      Promise.resolve(promise).then(() => {
        if (request !== effect.request) {
          if (!effect.wanted) sound.pause();
          return;
        }
        if (!effectsEnabled || document.hidden || volume === 0) { stop(sound); return; }
        onStarted();
      }).catch(() => {
        if (request === effect.request) {
          effect.wanted = false;
          sound.pause();
          onFailed();
        }
        // Missing/blocked sound must not interrupt the activity.
      });
      return true;
    } catch (_) { effect.wanted = false; sound.pause(); onFailed(); return false; }
  }

  if (toggle) toggle.addEventListener("click", () => {
    awaitingMusicGesture = false;
    musicWanted = !musicWanted;
    setControls();
    if (musicWanted) startMusic();
    else {
      playRequest += 1;
      music.pause();
      announce("冒險音樂已關閉。");
    }
  });

  // A native choice click (mouse, touch or keyboard) provides browser activation.
  // Audio controls and programmatic selection never trigger this fallback.
  document.addEventListener("click", (event) => {
    if (!awaitingMusicGesture || !event.isTrusted || document.hidden || volume === 0) return;
    if (!event.target?.closest?.(".option-button")) return;
    awaitingMusicGesture = false;
    musicWanted = true;
    setControls();
    startMusic();
  }, true);

  if (effectsToggle) effectsToggle.addEventListener("change", () => {
    effectsEnabled = effectsToggle.checked;
    if (!effectsEnabled) { stop(confirmSound); cancelReveal(); }
    persist();
    announce(effectsEnabled ? "選擇與場景音效已開啟。" : "音效已關閉。");
  });

  if (volumeInput) volumeInput.addEventListener("input", () => {
    const next = Number(volumeInput.value);
    volume = Number.isFinite(next) ? Math.max(0, Math.min(100, next)) : 25;
    if (volume === 0) { awaitingMusicGesture = false; stop(confirmSound); cancelReveal(); }
    updateVolumes();
    setControls();
    persist();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      playRequest += 1;
      music.pause();
      stop(confirmSound);
      cancelReveal();
    } else if (musicWanted) startMusic(true);
  });
  music.addEventListener("error", () => musicFailed(playRequest));

  window.ADVENTURE_AUDIO = {
    startExperience() {
      awaitingMusicGesture = false;
      musicWanted = true;
      setControls();
      // Called synchronously by the Start button so playback uses that gesture.
      startMusic(true);
    },
    stopExperience() {
      awaitingMusicGesture = false;
      musicWanted = false;
      playRequest += 1;
      music.pause();
      stop(confirmSound);
      cancelReveal();
      setControls();
      announce("");
    },
    confirm() {
      // Avoid a rapid cascade when a keyboard/pointer repeats a selection.
      const now = Date.now();
      if (now - lastConfirm < 100) return;
      lastConfirm = now;
      playEffect(confirmSound);
    },
    reveal(context) {
      cancelReveal();
      stop(confirmSound);
      if (!effectsEnabled || volume === 0 || document.hidden) return;
      const profile = window.SCENE_AUDIO?.resolve(context);
      // An unknown scene stays silent instead of playing an unrelated cue.
      if (!profile) return;
      const sound = soundFor(profile);
      const version = revealVersion;
      activeReveal = { sound, version };
      playEffect(sound, () => {
        if (activeReveal?.version !== version) return;
        rampDuck(.3, 150);
        const duration = Number.isFinite(sound.duration) && sound.duration > 0 ? sound.duration : profile.duration;
        restoreTimer = window.setTimeout(() => {
          restoreTimer = null;
          finishReveal(version);
        }, Math.ceil(duration * 1000) + 150);
      }, () => finishReveal(version));
    },
    cancelReveal
  };
  updateVolumes();
  // The homepage stays quiet; the Start button begins the music in its click handler.
})();
