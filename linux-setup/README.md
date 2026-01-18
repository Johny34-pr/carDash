# 🚗 CarDash Linux Telepítési Útmutató

## Rendszerkövetelmények

### Hardver
- **Raspberry Pi 4** (4GB+ RAM ajánlott) VAGY
- **Mini PC** (Intel/AMD)
- **Érintőképernyő** (7" vagy nagyobb, ajánlott: 1024x600 vagy 1280x720)
- **Autós tápegység** (12V → 5V/3A átalakító)

### Szoftver
- Raspberry Pi OS Lite (ajánlott) / Ubuntu Server / Debian
- Node.js 18+

---

## 🔧 Telepítés lépései

### 1. Operációs rendszer telepítése

**Raspberry Pi esetén:**
```bash
# Raspberry Pi Imager-rel telepítsd a "Raspberry Pi OS Lite (64-bit)" verziót
# Engedélyezd az SSH-t a telepítés során
```

### 2. Csatlakozás és frissítés
```bash
# SSH-val csatlakozz
ssh pi@<raspberry-ip>

# Frissítés
sudo apt update && sudo apt upgrade -y
```

### 3. CarDash letöltése
```bash
# Git telepítése
sudo apt install git -y

# Projekt klónozása
git clone https://github.com/YOUR_REPO/cardash.git
cd cardash/linux-setup
```

### 4. Telepítés futtatása
```bash
# Telepítő futtatása
chmod +x install.sh
sudo ./install.sh

# Raspberry Pi optimalizáció (opcionális)
chmod +x raspberry-pi-setup.sh
sudo ./raspberry-pi-setup.sh

# Újraindítás
sudo reboot
```

---

## 📋 Konfigurációs lehetőségek

### Manuális indítás
```bash
cd /opt/cardash
npm start -- --kiosk
```

### Systemd szolgáltatás
```bash
# Indítás
sudo systemctl start cardash

# Automatikus indítás engedélyezése
sudo systemctl enable cardash

# Állapot ellenőrzése
sudo systemctl status cardash

# Logok megtekintése
journalctl -u cardash -f
```

---

## 🖥️ Képernyő beállítások

### Képernyő forgatás (ha szükséges)
```bash
# /boot/config.txt szerkesztése
sudo nano /boot/config.txt

# Adjuk hozzá (0=nincs, 1=90°, 2=180°, 3=270°):
display_rotate=0
```

### Érintőképernyő kalibrálás
```bash
sudo apt install xinput-calibrator
DISPLAY=:0 xinput_calibrator
```

---

## 🔌 Autós telepítés

### Tápellátás
1. Használj minőségi 12V → 5V/3A átalakítót
2. Ajánlott: védelem a motor indítási feszültségcsökkenés ellen
3. Opcionális: UPS modul a biztonságos leállításhoz

### Kapcsolási rajz
```
Autó 12V → DC-DC konverter → Raspberry Pi
         → IGN jel → GPIO (opcionális, leállításhoz)
```

### Biztonságos leállítás (opcionális)
```bash
# GPIO-alapú leállítás az /opt/cardash/shutdown-monitor.py fájllal
# Készíts Python scriptet, ami figyeli az IGN jelet
```

---

## 🛠️ Hibaelhárítás

### Fekete képernyő indításkor
```bash
# Ellenőrizd a logokat
journalctl -u cardash -b

# Manuális teszt
DISPLAY=:0 npm start -- --kiosk
```

### Nincs hang
```bash
# ALSA mixer beállítása
alsamixer

# Vagy PulseAudio telepítése
sudo apt install pulseaudio
```

### Érintőképernyő nem működik
```bash
# Ellenőrizd a drivereket
dmesg | grep -i touch

# USB érintőképernyő engedélyezése
sudo apt install xserver-xorg-input-evdev
```

### Lassú indítás
```bash
# Indítási idő elemzése
systemd-analyze blame

# Felesleges szolgáltatások letiltása
sudo systemctl disable bluetooth avahi-daemon
```

---

## 📱 Gyorsbillentyűk

| Billentyű | Funkció |
|-----------|---------|
| F11 | Teljes képernyő be/ki |
| ESC | Kilépés teljes képernyőből |
| Ctrl+Q | Alkalmazás bezárása (ha engedélyezve) |

---

## 🔄 Frissítés

```bash
cd /opt/cardash
sudo git pull
sudo npm install
sudo systemctl restart cardash
```

---

## 📞 Támogatás

Ha problémába ütközöl, ellenőrizd:
1. `journalctl -u cardash -f` - szolgáltatás logok
2. `dmesg` - kernel üzenetek
3. `/var/log/Xorg.0.log` - X11 logok
