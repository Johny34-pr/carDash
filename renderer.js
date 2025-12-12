const { ipcRenderer } = require('electron');

// DOM Elements
let currentView = 'home';
let miniMap = null;
let mainMap = null;

// Music Player State
const musicPlayer = {
  audio: null,
  playlist: [],
  currentIndex: -1,
  isPlaying: false,
  shuffle: false,
  repeat: false
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  initializeClock();
  initializeNavigation();
  initializeMusicPlayer();
  initializeMaps();
  initializeWindowControls();
  initializeSettings();
  simulateVehicleData();
});

// Initialize Application
function initializeApp() {
  // Navigation buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      showView(view);
    });
  });
}

// Show View
function showView(viewId) {
  // Update buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });

  // Update views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });
  document.getElementById(`view-${viewId}`).classList.add('active');

  currentView = viewId;

  // Initialize map if navigation view
  if (viewId === 'navigation' && mainMap) {
    setTimeout(() => mainMap.invalidateSize(), 100);
  }
}

// Make showView globally available
window.showView = showView;

// Initialize Clock
function initializeClock() {
  function updateClock() {
    const now = new Date();
    const timeEl = document.getElementById('current-time');
    const dateEl = document.getElementById('current-date');

    timeEl.textContent = now.toLocaleTimeString('hu-HU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    dateEl.textContent = now.toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  }

  updateClock();
  setInterval(updateClock, 1000);
}

// Initialize Navigation
function initializeNavigation() {
  document.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const lat = parseFloat(item.dataset.lat);
      const lng = parseFloat(item.dataset.lng);
      if (mainMap && lat && lng) {
        mainMap.setView([lat, lng], 15);
        L.marker([lat, lng]).addTo(mainMap);
      }
    });
  });
}

// Initialize Music Player
function initializeMusicPlayer() {
  musicPlayer.audio = document.getElementById('audio-player');
  
  // Open folder button
  document.getElementById('btn-open-folder').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('open-music-folder');
    if (result && result.files.length > 0) {
      musicPlayer.playlist = result.files;
      updatePlaylist();
    }
  });

  // Open files button
  document.getElementById('btn-open-files').addEventListener('click', async () => {
    const files = await ipcRenderer.invoke('open-music-files');
    if (files && files.length > 0) {
      musicPlayer.playlist = [...musicPlayer.playlist, ...files];
      updatePlaylist();
    }
  });

  // Playback controls
  document.getElementById('btn-play').addEventListener('click', togglePlay);
  document.getElementById('btn-prev').addEventListener('click', playPrevious);
  document.getElementById('btn-next').addEventListener('click', playNext);
  document.getElementById('btn-shuffle').addEventListener('click', toggleShuffle);
  document.getElementById('btn-repeat').addEventListener('click', toggleRepeat);

  // Home controls
  document.getElementById('home-play').addEventListener('click', togglePlay);
  document.getElementById('home-prev').addEventListener('click', playPrevious);
  document.getElementById('home-next').addEventListener('click', playNext);

  // Volume control
  const volumeSlider = document.getElementById('volume-slider');
  volumeSlider.addEventListener('input', (e) => {
    const volume = e.target.value / 100;
    musicPlayer.audio.volume = volume;
    document.getElementById('volume-value').textContent = `${e.target.value}%`;
    updateVolumeIcon(volume);
  });

  // Progress bar
  const progressBar = document.getElementById('progress-bar');
  progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    musicPlayer.audio.currentTime = percent * musicPlayer.audio.duration;
  });

  // Audio events
  musicPlayer.audio.addEventListener('timeupdate', updateProgress);
  musicPlayer.audio.addEventListener('ended', handleTrackEnd);
  musicPlayer.audio.addEventListener('loadedmetadata', updateDuration);

  // Set initial volume
  musicPlayer.audio.volume = 0.8;
}

// Update playlist UI
function updatePlaylist() {
  const playlistEl = document.getElementById('playlist');
  
  if (musicPlayer.playlist.length === 0) {
    playlistEl.innerHTML = `
      <div class="playlist-empty">
        <span>🎵</span>
        <p>Nincs zene hozzáadva</p>
        <p class="hint">Használd a fenti gombokat zenék hozzáadásához</p>
      </div>
    `;
    return;
  }

  playlistEl.innerHTML = musicPlayer.playlist.map((track, index) => `
    <div class="playlist-item ${index === musicPlayer.currentIndex ? 'active' : ''}" data-index="${index}">
      <div class="item-icon">🎵</div>
      <div class="item-info">
        <span class="item-name">${track.name}</span>
        <span class="item-ext">${track.ext.toUpperCase()}</span>
      </div>
    </div>
  `).join('');

  // Add click handlers
  playlistEl.querySelectorAll('.playlist-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      playTrack(index);
    });
  });
}

// Play track
function playTrack(index) {
  if (index < 0 || index >= musicPlayer.playlist.length) return;

  musicPlayer.currentIndex = index;
  const track = musicPlayer.playlist[index];

  musicPlayer.audio.src = track.path;
  musicPlayer.audio.play();
  musicPlayer.isPlaying = true;

  updateNowPlaying(track);
  updatePlaylist();
  updatePlayButton();
}

// Update now playing UI
function updateNowPlaying(track) {
  document.getElementById('track-name').textContent = track.name;
  document.getElementById('artist-name').textContent = 'Ismeretlen előadó';
  document.getElementById('home-track-title').textContent = track.name;
  document.getElementById('home-track-artist').textContent = 'Ismeretlen előadó';
}

// Toggle play/pause
function togglePlay() {
  if (musicPlayer.playlist.length === 0) return;

  if (musicPlayer.currentIndex === -1) {
    playTrack(0);
    return;
  }

  if (musicPlayer.isPlaying) {
    musicPlayer.audio.pause();
    musicPlayer.isPlaying = false;
  } else {
    musicPlayer.audio.play();
    musicPlayer.isPlaying = true;
  }

  updatePlayButton();
}

// Update play button
function updatePlayButton() {
  const icon = musicPlayer.isPlaying ? '⏸' : '▶';
  document.getElementById('btn-play').textContent = icon;
  document.getElementById('home-play').textContent = icon;
}

// Play previous track
function playPrevious() {
  if (musicPlayer.playlist.length === 0) return;

  let newIndex = musicPlayer.currentIndex - 1;
  if (newIndex < 0) {
    newIndex = musicPlayer.playlist.length - 1;
  }
  playTrack(newIndex);
}

// Play next track
function playNext() {
  if (musicPlayer.playlist.length === 0) return;

  let newIndex;
  if (musicPlayer.shuffle) {
    newIndex = Math.floor(Math.random() * musicPlayer.playlist.length);
  } else {
    newIndex = musicPlayer.currentIndex + 1;
    if (newIndex >= musicPlayer.playlist.length) {
      newIndex = 0;
    }
  }
  playTrack(newIndex);
}

// Toggle shuffle
function toggleShuffle() {
  musicPlayer.shuffle = !musicPlayer.shuffle;
  document.getElementById('btn-shuffle').classList.toggle('active', musicPlayer.shuffle);
}

// Toggle repeat
function toggleRepeat() {
  musicPlayer.repeat = !musicPlayer.repeat;
  document.getElementById('btn-repeat').classList.toggle('active', musicPlayer.repeat);
}

// Update progress bar
function updateProgress() {
  const { currentTime, duration } = musicPlayer.audio;
  const percent = (currentTime / duration) * 100 || 0;
  
  document.getElementById('progress-fill').style.width = `${percent}%`;
  document.getElementById('time-current').textContent = formatTime(currentTime);
}

// Update duration display
function updateDuration() {
  document.getElementById('time-total').textContent = formatTime(musicPlayer.audio.duration);
}

// Handle track end
function handleTrackEnd() {
  if (musicPlayer.repeat) {
    musicPlayer.audio.currentTime = 0;
    musicPlayer.audio.play();
  } else {
    playNext();
  }
}

// Format time
function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update volume icon
function updateVolumeIcon(volume) {
  let icon = '🔊';
  if (volume === 0) icon = '🔇';
  else if (volume < 0.3) icon = '🔈';
  else if (volume < 0.7) icon = '🔉';
  document.getElementById('volume-icon').textContent = icon;
}

// Initialize Maps
function initializeMaps() {
  // Budapest coordinates
  const budapestCoords = [47.4979, 19.0402];

  // Mini map on home
  try {
    miniMap = L.map('mini-map', {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false
    }).setView(budapestCoords, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(miniMap);

    L.marker(budapestCoords).addTo(miniMap);
  } catch (e) {
    console.log('Mini map init error:', e);
  }

  // Main navigation map
  try {
    mainMap = L.map('main-map', {
      zoomControl: false,
      attributionControl: false
    }).setView(budapestCoords, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(mainMap);

    L.marker(budapestCoords).addTo(mainMap);

    // Map controls
    document.getElementById('btn-zoom-in').addEventListener('click', () => mainMap.zoomIn());
    document.getElementById('btn-zoom-out').addEventListener('click', () => mainMap.zoomOut());
    document.getElementById('btn-locate').addEventListener('click', locateUser);
  } catch (e) {
    console.log('Main map init error:', e);
  }
}

// Locate user
function locateUser() {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      mainMap.setView([latitude, longitude], 15);
      L.marker([latitude, longitude]).addTo(mainMap)
        .bindPopup('📍 Jelenlegi pozíció')
        .openPopup();
    }, () => {
      console.log('Geolocation not available');
    });
  }
}

// Initialize Window Controls
function initializeWindowControls() {
  document.getElementById('btn-minimize').addEventListener('click', () => {
    ipcRenderer.send('minimize-window');
  });

  document.getElementById('btn-maximize').addEventListener('click', () => {
    ipcRenderer.send('maximize-window');
  });

  document.getElementById('btn-close').addEventListener('click', () => {
    ipcRenderer.send('close-window');
  });
}

// Initialize Settings
function initializeSettings() {
  // Brightness
  document.getElementById('brightness-slider').addEventListener('input', (e) => {
    document.body.style.filter = `brightness(${e.target.value / 100})`;
  });

  // Night mode
  document.getElementById('night-mode').addEventListener('change', (e) => {
    if (e.target.checked) {
      document.body.style.filter = 'brightness(0.7) sepia(0.3)';
    } else {
      document.body.style.filter = '';
    }
  });
}

// Quick Actions
let hazardActive = false;
let lightsOn = false;

window.toggleHazard = function() {
  hazardActive = !hazardActive;
  const icon = document.getElementById('hazard-icon');
  icon.classList.toggle('hazard-active', hazardActive);
};

window.toggleLights = function() {
  lightsOn = !lightsOn;
  const icon = document.getElementById('lights-icon');
  icon.textContent = lightsOn ? '💡' : '🔦';
  icon.style.opacity = lightsOn ? '1' : '0.5';
};

// Simulate Vehicle Data
function simulateVehicleData() {
  let speed = 0;
  let targetSpeed = 0;
  
  setInterval(() => {
    // Random speed changes
    if (Math.random() > 0.9) {
      targetSpeed = Math.floor(Math.random() * 130);
    }

    // Smooth speed transition
    speed += (targetSpeed - speed) * 0.1;
    const currentSpeed = Math.floor(speed);

    // Update speed display
    document.getElementById('current-speed').textContent = currentSpeed;

    // Update gauge
    const maxSpeed = 200;
    const percent = Math.min(currentSpeed / maxSpeed, 1);
    const circumference = 2 * Math.PI * 90;
    const offset = circumference - (percent * circumference * 0.75);
    const gaugeFill = document.getElementById('speed-gauge-fill');
    if (gaugeFill) {
      gaugeFill.style.strokeDashoffset = offset;
      gaugeFill.style.stroke = `hsl(${180 - percent * 120}, 100%, 50%)`;
    }

    // Random RPM
    const rpm = 800 + currentSpeed * 30 + Math.random() * 200;
    document.getElementById('rpm-value').textContent = `${Math.floor(rpm)} RPM`;

    // Engine temp fluctuation
    const temp = 80 + Math.random() * 10;
    document.getElementById('engine-temp').textContent = `${Math.floor(temp)}°C`;
    document.getElementById('motor-temp').textContent = `${Math.floor(temp)}°C`;

  }, 100);

  // Slow fuel decrease
  let fuel = 75;
  setInterval(() => {
    fuel = Math.max(0, fuel - 0.01);
    document.getElementById('fuel-bar').style.width = `${fuel}%`;
    document.getElementById('fuel-value').textContent = `${Math.floor(fuel)}%`;
    document.getElementById('fuel-level').style.width = `${fuel}%`;
    document.getElementById('range-value').textContent = `${Math.floor(fuel * 6)} km`;
  }, 1000);
}
