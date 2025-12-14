const { ipcRenderer } = require('electron');

// DOM Elements
let currentView = 'home';
let miniMap = null;
let mainMap = null;

// Location State
const locationState = {
  latitude: 46.8986701965332,  // Okány fallback
  longitude: 21.346471786499023, // Okány fallback
  city: 'Okány',
  timezone: 'Europe/Budapest',
  hasGPS: false
};

// Music Player State
const musicPlayer = {
  audio: null,
  playlists: [],        // Array of playlist objects
  allTracks: [],        // All tracks from all playlists + individual files
  currentPlaylist: null, // Currently selected playlist
  currentTracks: [],    // Current playing tracks
  currentIndex: -1,
  isPlaying: false,
  shuffle: false,
  repeat: false
};

// Storage key for saving playlists
const STORAGE_KEY = 'carDash_musicLibrary';

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  initializeLocation();
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
      minute: '2-digit',
      timeZone: locationState.timezone
    });

    dateEl.textContent = now.toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      timeZone: locationState.timezone
    });
  }

  updateClock();
  setInterval(updateClock, 1000);
}

// Initialize Location (GPS with Okány fallback)
function initializeLocation() {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locationState.latitude = position.coords.latitude;
        locationState.longitude = position.coords.longitude;
        locationState.hasGPS = true;
        console.log('GPS location acquired:', locationState.latitude, locationState.longitude);
        
        // Get city name and timezone from coordinates
        fetchLocationDetails();
        fetchWeather();
        initializeClock();
      },
      (error) => {
        console.log('GPS not available, using Okány fallback:', error.message);
        locationState.hasGPS = false;
        fetchWeather();
        initializeClock();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes cache
      }
    );
  } else {
    console.log('Geolocation not supported, using Okány fallback');
    fetchWeather();
    initializeClock();
  }

  // Update weather every 10 minutes
  setInterval(fetchWeather, 600000);
  
  // Update GPS position every 30 seconds
  setInterval(updateGPSPosition, 30000);
}

// Update GPS Position
function updateGPSPosition() {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLat = position.coords.latitude;
        const newLng = position.coords.longitude;
        
        // Only update if position changed significantly (more than ~100m)
        const latDiff = Math.abs(newLat - locationState.latitude);
        const lngDiff = Math.abs(newLng - locationState.longitude);
        
        if (latDiff > 0.001 || lngDiff > 0.001) {
          locationState.latitude = newLat;
          locationState.longitude = newLng;
          locationState.hasGPS = true;
          fetchLocationDetails();
          fetchWeather();
        }
      },
      () => {
        // Silent fail on update, keep last known position
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }
}

// Fetch location details (city name, timezone)
async function fetchLocationDetails() {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${locationState.latitude}&lon=${locationState.longitude}&format=json&accept-language=hu`
    );
    const data = await response.json();
    
    if (data && data.address) {
      locationState.city = data.address.city || 
                          data.address.town || 
                          data.address.village || 
                          data.address.municipality ||
                          'Ismeretlen';
      
      // Update weather location display
      const weatherLocation = document.querySelector('.weather-location');
      if (weatherLocation) {
        weatherLocation.textContent = locationState.city;
      }
    }
  } catch (error) {
    console.error('Error fetching location details:', error);
  }
}

// Fetch Weather Data
async function fetchWeather() {
  try {
    // Using wttr.in API (no API key required)
    const response = await fetch(
      `https://wttr.in/${locationState.latitude},${locationState.longitude}?format=j1`
    );
    const data = await response.json();
    
    if (data && data.current_condition && data.current_condition[0]) {
      const current = data.current_condition[0];
      const tempC = current.temp_C;
      const weatherCode = parseInt(current.weatherCode);
      const weatherDesc = getHungarianWeatherDesc(weatherCode);
      const weatherIcon = getWeatherIcon(weatherCode);
      
      // Update weather widget
      document.querySelector('.weather-temp').textContent = `${tempC}°C`;
      document.querySelector('.weather-desc').textContent = weatherDesc;
      document.querySelector('.weather-icon').textContent = weatherIcon;
      document.querySelector('.weather-location').textContent = locationState.city;
      
      // Update title bar temperature
      document.getElementById('temp-display').textContent = `${tempC}°C`;
    }
  } catch (error) {
    console.error('Error fetching weather:', error);
    // Try alternative API
    fetchWeatherAlternative();
  }
}

// Alternative weather fetch using Open-Meteo (backup)
async function fetchWeatherAlternative() {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${locationState.latitude}&longitude=${locationState.longitude}&current=temperature_2m,weather_code&timezone=auto`
    );
    const data = await response.json();
    
    if (data && data.current) {
      const tempC = Math.round(data.current.temperature_2m);
      const weatherCode = data.current.weather_code;
      const weatherDesc = getHungarianWeatherDescWMO(weatherCode);
      const weatherIcon = getWeatherIconWMO(weatherCode);
      
      document.querySelector('.weather-temp').textContent = `${tempC}°C`;
      document.querySelector('.weather-desc').textContent = weatherDesc;
      document.querySelector('.weather-icon').textContent = weatherIcon;
      document.querySelector('.weather-location').textContent = locationState.city;
      document.getElementById('temp-display').textContent = `${tempC}°C`;
      
      // Update timezone if provided
      if (data.timezone) {
        locationState.timezone = data.timezone;
      }
    }
  } catch (error) {
    console.error('Error fetching alternative weather:', error);
  }
}

// Get Hungarian weather description from wttr.in code
function getHungarianWeatherDesc(code) {
  const descriptions = {
    113: 'Napos',
    116: 'Részben felhős',
    119: 'Felhős',
    122: 'Borult',
    143: 'Ködös',
    176: 'Szitálás',
    179: 'Havazás',
    182: 'Havas eső',
    185: 'Ónos szitálás',
    200: 'Zivatar',
    227: 'Hófúvás',
    230: 'Hóvihar',
    248: 'Köd',
    260: 'Fagyos köd',
    263: 'Szitálás',
    266: 'Könnyű eső',
    281: 'Ónos eső',
    284: 'Ónos eső',
    293: 'Könnyű eső',
    296: 'Eső',
    299: 'Zápor',
    302: 'Erős eső',
    305: 'Felhőszakadás',
    308: 'Felhőszakadás',
    311: 'Ónos eső',
    314: 'Ónos eső',
    317: 'Havas eső',
    320: 'Havas eső',
    323: 'Könnyű havazás',
    326: 'Havazás',
    329: 'Erős havazás',
    332: 'Havazás',
    335: 'Hóvihar',
    338: 'Hóvihar',
    350: 'Jégeső',
    353: 'Zápor',
    356: 'Zápor',
    359: 'Felhőszakadás',
    362: 'Havas eső',
    365: 'Havas eső',
    368: 'Hózápor',
    371: 'Hózápor',
    374: 'Jégeső',
    377: 'Jégeső',
    386: 'Zivatar',
    389: 'Vihar',
    392: 'Havas zivatar',
    395: 'Hóvihar'
  };
  return descriptions[code] || 'Ismeretlen';
}

// Get weather icon from wttr.in code
function getWeatherIcon(code) {
  const icons = {
    113: '☀️',
    116: '⛅',
    119: '☁️',
    122: '☁️',
    143: '🌫️',
    176: '🌧️',
    179: '🌨️',
    182: '🌨️',
    185: '🌧️',
    200: '⛈️',
    227: '🌨️',
    230: '🌨️',
    248: '🌫️',
    260: '🌫️',
    263: '🌧️',
    266: '🌧️',
    281: '🌧️',
    284: '🌧️',
    293: '🌧️',
    296: '🌧️',
    299: '🌧️',
    302: '🌧️',
    305: '🌧️',
    308: '🌧️',
    311: '🌧️',
    314: '🌧️',
    317: '🌨️',
    320: '🌨️',
    323: '🌨️',
    326: '🌨️',
    329: '🌨️',
    332: '🌨️',
    335: '🌨️',
    338: '🌨️',
    350: '🌨️',
    353: '🌧️',
    356: '🌧️',
    359: '🌧️',
    362: '🌨️',
    365: '🌨️',
    368: '🌨️',
    371: '🌨️',
    374: '🌨️',
    377: '🌨️',
    386: '⛈️',
    389: '⛈️',
    392: '⛈️',
    395: '🌨️'
  };
  return icons[code] || '🌡️';
}

// WMO Weather codes for Open-Meteo
function getHungarianWeatherDescWMO(code) {
  const descriptions = {
    0: 'Tiszta égbolt',
    1: 'Derült',
    2: 'Részben felhős',
    3: 'Borult',
    45: 'Ködös',
    48: 'Zúzmarás köd',
    51: 'Szitálás',
    53: 'Szitálás',
    55: 'Erős szitálás',
    56: 'Ónos szitálás',
    57: 'Erős ónos szitálás',
    61: 'Könnyű eső',
    63: 'Eső',
    65: 'Erős eső',
    66: 'Ónos eső',
    67: 'Erős ónos eső',
    71: 'Könnyű havazás',
    73: 'Havazás',
    75: 'Erős havazás',
    77: 'Hószem',
    80: 'Zápor',
    81: 'Zápor',
    82: 'Felhőszakadás',
    85: 'Hózápor',
    86: 'Erős hózápor',
    95: 'Zivatar',
    96: 'Jégeső',
    99: 'Erős jégeső'
  };
  return descriptions[code] || 'Ismeretlen';
}

function getWeatherIconWMO(code) {
  const icons = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
    45: '🌫️', 48: '🌫️',
    51: '🌧️', 53: '🌧️', 55: '🌧️',
    56: '🌧️', 57: '🌧️',
    61: '🌧️', 63: '🌧️', 65: '🌧️',
    66: '🌧️', 67: '🌧️',
    71: '🌨️', 73: '🌨️', 75: '🌨️', 77: '🌨️',
    80: '🌧️', 81: '🌧️', 82: '🌧️',
    85: '🌨️', 86: '🌨️',
    95: '⛈️', 96: '⛈️', 99: '⛈️'
  };
  return icons[code] || '🌡️';
}

// Navigation State
const navigationState = {
  currentRoute: null,
  routeLayer: null,
  destinationMarker: null,
  startMarker: null,
  isNavigating: false,
  destination: null,
  searchResults: []
};

// Initialize Navigation
function initializeNavigation() {
  // Search input and button
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('btn-search');
  
  searchBtn.addEventListener('click', () => searchAddress(searchInput.value));
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      searchAddress(searchInput.value);
    }
  });

  // Suggestion items click
  document.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const lat = parseFloat(item.dataset.lat);
      const lng = parseFloat(item.dataset.lng);
      const name = item.querySelector('.suggestion-name').textContent;
      if (lat && lng) {
        planRoute(lat, lng, name);
      }
    });
  });
}

// Search for address using Nominatim
async function searchAddress(query) {
  if (!query || query.trim().length < 3) {
    showNotification('Kérlek adj meg legalább 3 karaktert a kereséshez!');
    return;
  }

  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('btn-search');
  
  // Show loading state
  searchBtn.textContent = '⏳ Keresés...';
  searchBtn.disabled = true;

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=hu&accept-language=hu`
    );
    const results = await response.json();

    if (results && results.length > 0) {
      navigationState.searchResults = results;
      showSearchResults(results);
    } else {
      // Try search without country restriction
      const globalResponse = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=hu`
      );
      const globalResults = await globalResponse.json();
      
      if (globalResults && globalResults.length > 0) {
        navigationState.searchResults = globalResults;
        showSearchResults(globalResults);
      } else {
        showNotification('Nem található ilyen cím. Próbálj pontosabb címet!');
      }
    }
  } catch (error) {
    console.error('Search error:', error);
    showNotification('Hiba történt a keresés során!');
  } finally {
    searchBtn.textContent = 'Keresés';
    searchBtn.disabled = false;
  }
}

// Show search results in a dropdown
function showSearchResults(results) {
  // Remove existing results dropdown
  const existingDropdown = document.querySelector('.search-results-dropdown');
  if (existingDropdown) {
    existingDropdown.remove();
  }

  const searchBox = document.querySelector('.search-box');
  const dropdown = document.createElement('div');
  dropdown.className = 'search-results-dropdown';
  
  results.forEach((result, index) => {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.innerHTML = `
      <span class="result-icon">📍</span>
      <div class="result-info">
        <span class="result-name">${result.display_name.split(',')[0]}</span>
        <span class="result-address">${result.display_name}</span>
      </div>
    `;
    item.addEventListener('click', () => {
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);
      const name = result.display_name.split(',')[0];
      planRoute(lat, lng, name);
      dropdown.remove();
      document.getElementById('search-input').value = name;
    });
    dropdown.appendChild(item);
  });

  searchBox.appendChild(dropdown);

  // Close dropdown when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function closeDropdown(e) {
      if (!searchBox.contains(e.target)) {
        dropdown.remove();
        document.removeEventListener('click', closeDropdown);
      }
    });
  }, 100);
}

// Plan route from current location to destination
async function planRoute(destLat, destLng, destName) {
  // Get start coordinates (GPS or fallback)
  const startLat = locationState.latitude;
  const startLng = locationState.longitude;
  
  // Show loading
  document.getElementById('nav-distance').textContent = '⏳ Számolás...';
  document.getElementById('nav-time').textContent = '';

  try {
    // Use OSRM for routing (free, no API key)
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`
    );
    const data = await response.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      displayRoute(route, startLat, startLng, destLat, destLng, destName);
    } else {
      showNotification('Nem sikerült útvonalat tervezni ehhez a célhoz!');
      document.getElementById('nav-distance').textContent = '❌ Hiba';
      document.getElementById('nav-time').textContent = '';
    }
  } catch (error) {
    console.error('Routing error:', error);
    showNotification('Hiba az útvonal tervezése során!');
    document.getElementById('nav-distance').textContent = '❌ Hiba';
    document.getElementById('nav-time').textContent = '';
  }
}

// Display route on map
function displayRoute(route, startLat, startLng, destLat, destLng, destName) {
  // Clear previous route
  clearRoute();

  // Get route geometry
  const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
  
  // Create route polyline with gradient effect
  navigationState.routeLayer = L.polyline(coordinates, {
    color: '#00d4ff',
    weight: 6,
    opacity: 0.8,
    lineJoin: 'round'
  }).addTo(mainMap);

  // Add route border for better visibility
  const routeBorder = L.polyline(coordinates, {
    color: '#0066aa',
    weight: 10,
    opacity: 0.4,
    lineJoin: 'round'
  }).addTo(mainMap);
  navigationState.routeLayer.borderLayer = routeBorder;

  // Add start marker
  const startIcon = L.divIcon({
    className: 'custom-marker start-marker',
    html: '<div class="marker-content">🚗</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
  
  navigationState.startMarker = L.marker([startLat, startLng], { icon: startIcon })
    .addTo(mainMap)
    .bindPopup(`<b>📍 Indulás</b><br>${locationState.hasGPS ? 'GPS pozíció' : locationState.city}`);

  // Add destination marker
  const destIcon = L.divIcon({
    className: 'custom-marker dest-marker',
    html: '<div class="marker-content">🏁</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });

  navigationState.destinationMarker = L.marker([destLat, destLng], { icon: destIcon })
    .addTo(mainMap)
    .bindPopup(`<b>🎯 Cél</b><br>${destName}`)
    .openPopup();

  // Fit map to route bounds
  const bounds = navigationState.routeLayer.getBounds();
  mainMap.fitBounds(bounds, { padding: [50, 50] });

  // Update route info
  const distanceKm = (route.distance / 1000).toFixed(1);
  const durationMin = Math.round(route.duration / 60);
  const hours = Math.floor(durationMin / 60);
  const mins = durationMin % 60;
  
  const timeStr = hours > 0 ? `${hours} ó ${mins} p` : `${mins} perc`;
  
  document.getElementById('nav-distance').textContent = `📏 ${distanceKm} km`;
  document.getElementById('nav-time').textContent = `⏱️ ${timeStr}`;

  // Save navigation state
  navigationState.currentRoute = route;
  navigationState.destination = { lat: destLat, lng: destLng, name: destName };
  navigationState.isNavigating = true;

  // Show turn-by-turn directions
  displayDirections(route.legs[0].steps);

  // Update mini map on home
  if (miniMap) {
    // Clear previous route on mini map
    if (navigationState.miniRouteLayer) {
      miniMap.removeLayer(navigationState.miniRouteLayer);
    }
    navigationState.miniRouteLayer = L.polyline(coordinates, {
      color: '#00d4ff',
      weight: 3,
      opacity: 0.8
    }).addTo(miniMap);
    miniMap.fitBounds(bounds, { padding: [20, 20] });
  }
}

// Display turn-by-turn directions
function displayDirections(steps) {
  const suggestionsDiv = document.getElementById('nav-suggestions');
  
  // Create directions panel
  suggestionsDiv.innerHTML = `
    <div class="directions-header">
      <h4>🧭 Útvonal lépései</h4>
      <button class="clear-route-btn" onclick="clearRoute()">✕ Törlés</button>
    </div>
    <div class="directions-list">
      ${steps.map((step, index) => {
        const instruction = translateManeuver(step.maneuver);
        const distance = step.distance >= 1000 
          ? `${(step.distance / 1000).toFixed(1)} km` 
          : `${Math.round(step.distance)} m`;
        const streetName = step.name || 'Ismeretlen út';
        
        return `
          <div class="direction-item">
            <span class="direction-icon">${getManeuverIcon(step.maneuver.type, step.maneuver.modifier)}</span>
            <div class="direction-info">
              <span class="direction-text">${instruction}</span>
              <span class="direction-street">${streetName}</span>
            </div>
            <span class="direction-distance">${distance}</span>
          </div>
        `;
      }).join('')}
      <div class="direction-item destination">
        <span class="direction-icon">🏁</span>
        <div class="direction-info">
          <span class="direction-text">Megérkezés a célhoz</span>
          <span class="direction-street">${navigationState.destination?.name || ''}</span>
        </div>
      </div>
    </div>
  `;
}

// Translate OSRM maneuver to Hungarian
function translateManeuver(maneuver) {
  const type = maneuver.type;
  const modifier = maneuver.modifier;
  
  const translations = {
    'depart': 'Indulj el',
    'arrive': 'Megérkezés',
    'turn': {
      'left': 'Fordulj balra',
      'right': 'Fordulj jobbra',
      'slight left': 'Enyhén balra',
      'slight right': 'Enyhén jobbra',
      'sharp left': 'Élesen balra',
      'sharp right': 'Élesen jobbra',
      'straight': 'Egyenesen',
      'uturn': 'Fordulj vissza'
    },
    'merge': 'Sorolj be',
    'on ramp': 'Hajts fel',
    'off ramp': 'Hajts le',
    'fork': {
      'left': 'Tarts balra az elágazásnál',
      'right': 'Tarts jobbra az elágazásnál',
      'slight left': 'Tarts balra',
      'slight right': 'Tarts jobbra'
    },
    'end of road': {
      'left': 'Az út végén fordulj balra',
      'right': 'Az út végén fordulj jobbra'
    },
    'continue': 'Folytatás egyenesen',
    'roundabout': 'Körforgalomnál',
    'rotary': 'Körforgalomnál',
    'roundabout turn': 'Körforgalomnál',
    'notification': 'Figyelem',
    'exit roundabout': 'Hagyd el a körforgalmat',
    'exit rotary': 'Hagyd el a körforgalmat'
  };

  if (typeof translations[type] === 'string') {
    return translations[type];
  } else if (typeof translations[type] === 'object' && modifier) {
    return translations[type][modifier] || `${type} ${modifier}`;
  }
  
  return modifier ? `${type} ${modifier}` : type;
}

// Get icon for maneuver type
function getManeuverIcon(type, modifier) {
  const icons = {
    'depart': '🚗',
    'arrive': '🏁',
    'turn-left': '⬅️',
    'turn-right': '➡️',
    'turn-slight left': '↖️',
    'turn-slight right': '↗️',
    'turn-sharp left': '⤴️',
    'turn-sharp right': '⤵️',
    'turn-straight': '⬆️',
    'turn-uturn': '🔄',
    'merge': '🔀',
    'fork-left': '↙️',
    'fork-right': '↘️',
    'roundabout': '🔄',
    'rotary': '🔄',
    'continue': '⬆️'
  };

  const key = modifier ? `${type}-${modifier}` : type;
  return icons[key] || icons[type] || '➡️';
}

// Clear current route
function clearRoute() {
  if (navigationState.routeLayer) {
    mainMap.removeLayer(navigationState.routeLayer);
    if (navigationState.routeLayer.borderLayer) {
      mainMap.removeLayer(navigationState.routeLayer.borderLayer);
    }
  }
  if (navigationState.startMarker) {
    mainMap.removeLayer(navigationState.startMarker);
  }
  if (navigationState.destinationMarker) {
    mainMap.removeLayer(navigationState.destinationMarker);
  }
  if (navigationState.miniRouteLayer && miniMap) {
    miniMap.removeLayer(navigationState.miniRouteLayer);
  }

  navigationState.routeLayer = null;
  navigationState.startMarker = null;
  navigationState.destinationMarker = null;
  navigationState.currentRoute = null;
  navigationState.destination = null;
  navigationState.isNavigating = false;

  document.getElementById('nav-distance').textContent = '--';
  document.getElementById('nav-time').textContent = '--';
  
  // Reset suggestions panel
  const suggestionsDiv = document.getElementById('nav-suggestions');
  suggestionsDiv.innerHTML = `
    <h4>Legutóbbi célok</h4>
    <div class="suggestion-list">
      <div class="suggestion-item" data-lat="46.896278381347656" data-lng="21.34123420715332">
        <span class="suggestion-icon">🏠</span>
        <div class="suggestion-info">
          <span class="suggestion-name">Otthon</span>
          <span class="suggestion-addr">Okány, Petőfi utca 9.</span>
        </div>
      </div>
      <div class="suggestion-item" data-lat="46.245365142822266" data-lng="20.15741539001465">
        <span class="suggestion-icon">💼</span>
        <div class="suggestion-info">
          <span class="suggestion-name">Albérlet</span>
          <span class="suggestion-addr">Szeged, Vedres utca 1/b.</span>
        </div>
      </div>
      <div class="suggestion-item" data-lat="46.6778655" data-lng="21.0898374">
        <span class="suggestion-icon">🛒</span>
        <div class="suggestion-info">
          <span class="suggestion-name">Csaba Center</span>
          <span class="suggestion-addr">Békéscsaba, Andrássy út 37-43.</span>
        </div>
      </div>
    </div>
  `;
  
  // Re-initialize suggestion clicks
  document.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const lat = parseFloat(item.dataset.lat);
      const lng = parseFloat(item.dataset.lng);
      const name = item.querySelector('.suggestion-name').textContent;
      if (lat && lng) {
        planRoute(lat, lng, name);
      }
    });
  });

  // Reset map view
  mainMap.setView([locationState.latitude, locationState.longitude], 13);
}

// Make clearRoute globally available
window.clearRoute = clearRoute;

// Make planRoute globally available
window.planRoute = planRoute;

// Show notification
function showNotification(message) {
  // Remove existing notification
  const existing = document.querySelector('.notification-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'notification-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Initialize Music Player
function initializeMusicPlayer() {
  musicPlayer.audio = document.getElementById('audio-player');
  
  // Load saved library
  loadMusicLibrary();
  
  // Library tabs
  document.querySelectorAll('.library-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.library-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabName = tab.dataset.tab;
      document.getElementById('playlists-tab').classList.toggle('hidden', tabName !== 'playlists');
      document.getElementById('tracks-tab').classList.toggle('hidden', tabName !== 'tracks');
    });
  });
  
  // Open folder button (add playlist)
  document.getElementById('btn-open-folder').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('open-music-folder');
    if (result && result.files.length > 0) {
      const playlistName = result.folderPath.split(/[/\\]/).pop();
      const playlist = {
        id: Date.now(),
        name: playlistName,
        path: result.folderPath,
        tracks: result.files,
        expanded: false
      };
      
      musicPlayer.playlists.push(playlist);
      musicPlayer.allTracks = [...musicPlayer.allTracks, ...result.files];
      
      saveMusicLibrary();
      updatePlaylistsUI();
      updateAllTracksUI();
    }
  });

  // Open files button
  document.getElementById('btn-open-files').addEventListener('click', async () => {
    const files = await ipcRenderer.invoke('open-music-files');
    if (files && files.length > 0) {
      musicPlayer.allTracks = [...musicPlayer.allTracks, ...files];
      saveMusicLibrary();
      updateAllTracksUI();
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
  
  // Update UI
  updatePlaylistsUI();
  updateAllTracksUI();
}

// Save music library to localStorage
function saveMusicLibrary() {
  const data = {
    playlists: musicPlayer.playlists,
    allTracks: musicPlayer.allTracks
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Load music library from localStorage
function loadMusicLibrary() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      musicPlayer.playlists = data.playlists || [];
      musicPlayer.allTracks = data.allTracks || [];
    }
  } catch (e) {
    console.error('Error loading music library:', e);
  }
}

// Update playlists UI
function updatePlaylistsUI() {
  const container = document.getElementById('playlists-list');
  
  if (musicPlayer.playlists.length === 0) {
    container.innerHTML = `
      <div class="playlist-empty">
        <span>📁</span>
        <p>Nincs playlist</p>
        <p class="hint">Adj hozzá egy mappát</p>
      </div>
    `;
    return;
  }

  container.innerHTML = musicPlayer.playlists.map((playlist, pIndex) => `
    <div class="playlist-folder ${playlist.expanded ? 'expanded' : ''}" data-playlist-id="${playlist.id}">
      <div class="playlist-header" data-index="${pIndex}">
        <span class="folder-icon">${playlist.expanded ? '📂' : '📁'}</span>
        <span class="folder-name">${playlist.name}</span>
        <span class="folder-count">${playlist.tracks.length} dal</span>
        <button class="folder-play-btn" data-action="play-all">▶</button>
        <button class="folder-delete-btn" data-action="delete">🗑️</button>
      </div>
      ${playlist.expanded ? `
        <div class="playlist-tracks">
          ${playlist.tracks.map((track, tIndex) => `
            <div class="playlist-item" data-playlist-index="${pIndex}" data-track-index="${tIndex}">
              <div class="item-icon">🎵</div>
              <div class="item-info">
                <span class="item-name">${track.name}</span>
                <span class="item-ext">${track.ext.toUpperCase()}</span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');

  // Add event listeners
  container.querySelectorAll('.playlist-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.dataset.action) return;
      
      const index = parseInt(header.dataset.index);
      musicPlayer.playlists[index].expanded = !musicPlayer.playlists[index].expanded;
      saveMusicLibrary();
      updatePlaylistsUI();
    });
  });

  container.querySelectorAll('.folder-play-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const header = btn.closest('.playlist-header');
      const index = parseInt(header.dataset.index);
      playPlaylist(index);
    });
  });

  container.querySelectorAll('.folder-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const header = btn.closest('.playlist-header');
      const index = parseInt(header.dataset.index);
      deletePlaylist(index);
    });
  });

  container.querySelectorAll('.playlist-item').forEach(item => {
    item.addEventListener('click', () => {
      const pIndex = parseInt(item.dataset.playlistIndex);
      const tIndex = parseInt(item.dataset.trackIndex);
      playFromPlaylist(pIndex, tIndex);
    });
  });
}

// Update all tracks UI
function updateAllTracksUI() {
  const playlistEl = document.getElementById('playlist');
  
  if (musicPlayer.allTracks.length === 0) {
    playlistEl.innerHTML = `
      <div class="playlist-empty">
        <span>🎵</span>
        <p>Nincs zene hozzáadva</p>
        <p class="hint">Használd a fenti gombokat</p>
      </div>
    `;
    return;
  }

  playlistEl.innerHTML = musicPlayer.allTracks.map((track, index) => `
    <div class="playlist-item ${musicPlayer.currentTracks === musicPlayer.allTracks && index === musicPlayer.currentIndex ? 'active' : ''}" data-index="${index}">
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
      musicPlayer.currentTracks = musicPlayer.allTracks;
      musicPlayer.currentPlaylist = null;
      playTrack(index);
    });
  });
}

// Play entire playlist
function playPlaylist(playlistIndex) {
  const playlist = musicPlayer.playlists[playlistIndex];
  if (!playlist || playlist.tracks.length === 0) return;
  
  musicPlayer.currentPlaylist = playlist;
  musicPlayer.currentTracks = playlist.tracks;
  playTrack(0);
}

// Play specific track from playlist
function playFromPlaylist(playlistIndex, trackIndex) {
  const playlist = musicPlayer.playlists[playlistIndex];
  if (!playlist) return;
  
  musicPlayer.currentPlaylist = playlist;
  musicPlayer.currentTracks = playlist.tracks;
  playTrack(trackIndex);
}

// Delete playlist
function deletePlaylist(index) {
  const playlist = musicPlayer.playlists[index];
  
  // Remove tracks from allTracks
  const pathsToRemove = playlist.tracks.map(t => t.path);
  musicPlayer.allTracks = musicPlayer.allTracks.filter(t => !pathsToRemove.includes(t.path));
  
  // Remove playlist
  musicPlayer.playlists.splice(index, 1);
  
  saveMusicLibrary();
  updatePlaylistsUI();
  updateAllTracksUI();
}

// Play track
function playTrack(index) {
  if (index < 0 || index >= musicPlayer.currentTracks.length) return;

  musicPlayer.currentIndex = index;
  const track = musicPlayer.currentTracks[index];

  musicPlayer.audio.src = track.path;
  musicPlayer.audio.play();
  musicPlayer.isPlaying = true;

  updateNowPlaying(track);
  updatePlaylistsUI();
  updateAllTracksUI();
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
  if (musicPlayer.currentTracks.length === 0) {
    // Try to play from allTracks if no current playlist
    if (musicPlayer.allTracks.length > 0) {
      musicPlayer.currentTracks = musicPlayer.allTracks;
      playTrack(0);
    }
    return;
  }

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
  if (musicPlayer.currentTracks.length === 0) return;

  let newIndex = musicPlayer.currentIndex - 1;
  if (newIndex < 0) {
    newIndex = musicPlayer.currentTracks.length - 1;
  }
  playTrack(newIndex);
}

// Play next track
function playNext() {
  if (musicPlayer.currentTracks.length === 0) return;

  let newIndex;
  if (musicPlayer.shuffle) {
    newIndex = Math.floor(Math.random() * musicPlayer.currentTracks.length);
  } else {
    newIndex = musicPlayer.currentIndex + 1;
    if (newIndex >= musicPlayer.currentTracks.length) {
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
  // Use current location (GPS or Okány fallback)
  const coords = [locationState.latitude, locationState.longitude];

  // Mini map on home
  try {
    miniMap = L.map('mini-map', {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false
    }).setView(coords, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(miniMap);

    L.marker(coords).addTo(miniMap);
  } catch (e) {
    console.log('Mini map init error:', e);
  }

  // Main navigation map
  try {
    mainMap = L.map('main-map', {
      zoomControl: false,
      attributionControl: false
    }).setView(coords, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(mainMap);

    L.marker(coords).addTo(mainMap);

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
      
      // Update location state
      locationState.latitude = latitude;
      locationState.longitude = longitude;
      locationState.hasGPS = true;
      
      mainMap.setView([latitude, longitude], 15);
      L.marker([latitude, longitude]).addTo(mainMap)
        .bindPopup('📍 Jelenlegi pozíció')
        .openPopup();
      
      // Update weather and location details
      fetchLocationDetails();
      fetchWeather();
    }, () => {
      // Use fallback location (Okány)
      mainMap.setView([locationState.latitude, locationState.longitude], 13);
      L.marker([locationState.latitude, locationState.longitude]).addTo(mainMap)
        .bindPopup(`📍 ${locationState.city} (GPS nem elérhető)`)
        .openPopup();
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
