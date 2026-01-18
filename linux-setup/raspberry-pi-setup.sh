#!/bin/bash
# Raspberry Pi specific optimizations for CarDash
# Run this AFTER install.sh

set -e

echo "🍓 Raspberry Pi CarDash Optimization"
echo "====================================="

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo ./raspberry-pi-setup.sh"
    exit 1
fi

USER_NAME="${SUDO_USER:-$USER}"
USER_HOME=$(eval echo ~$USER_NAME)
INSTALL_DIR="/opt/cardash"

# Determine boot config location (Pi 4 vs Pi 5)
if [ -f /boot/firmware/config.txt ]; then
    BOOT_CONFIG="/boot/firmware/config.txt"
else
    BOOT_CONFIG="/boot/config.txt"
fi

echo "Using boot config: $BOOT_CONFIG"

# Increase GPU memory for better graphics
echo "⚙️ Optimizing GPU memory..."
if ! grep -q "gpu_mem" "$BOOT_CONFIG"; then
    echo "gpu_mem=256" >> "$BOOT_CONFIG"
fi

# Disable splash screen for faster boot
echo "⚙️ Optimizing boot..."
if ! grep -q "disable_splash" "$BOOT_CONFIG"; then
    echo "disable_splash=1" >> "$BOOT_CONFIG"
fi

# Enable hardware acceleration
if ! grep -q "dtoverlay=vc4-fkms-v3d" "$BOOT_CONFIG" && ! grep -q "dtoverlay=vc4-kms-v3d" "$BOOT_CONFIG"; then
    echo "dtoverlay=vc4-fkms-v3d" >> "$BOOT_CONFIG"
fi

# Reduce boot messages
CMDLINE_FILE="/boot/cmdline.txt"
if [ -f /boot/firmware/cmdline.txt ]; then
    CMDLINE_FILE="/boot/firmware/cmdline.txt"
fi
sed -i 's/console=tty1/console=tty3 quiet loglevel=3/' "$CMDLINE_FILE" 2>/dev/null || true

# Disable unnecessary services for faster boot
echo "⚙️ Disabling unnecessary services..."
systemctl disable bluetooth 2>/dev/null || true
systemctl disable avahi-daemon 2>/dev/null || true
systemctl disable triggerhappy 2>/dev/null || true

# Install additional emoji/font support specific to Raspberry Pi
echo "📦 Installing additional fonts..."
apt-get install -y fonts-noto-color-emoji fonts-liberation 2>/dev/null || true
fc-cache -f -v

# Create alternative autostart using LightDM (if available) or desktop entry
echo "⚙️ Setting up autostart alternatives..."

# Method 1: Create desktop autostart entry
mkdir -p $USER_HOME/.config/autostart
cat > $USER_HOME/.config/autostart/cardash.desktop << EOF
[Desktop Entry]
Type=Application
Name=CarDash
Comment=Car Dashboard Application
Exec=/opt/cardash/node_modules/.bin/electron /opt/cardash --kiosk --no-sandbox
X-GNOME-Autostart-enabled=true
Terminal=false
EOF
chown -R "$USER_NAME:$USER_NAME" $USER_HOME/.config/autostart

# Method 2: Create LXDE autostart (for Raspberry Pi OS with Desktop)
mkdir -p $USER_HOME/.config/lxsession/LXDE-pi
cat > $USER_HOME/.config/lxsession/LXDE-pi/autostart << EOF
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 1
@/opt/cardash/node_modules/.bin/electron /opt/cardash --kiosk --no-sandbox
EOF
chown -R "$USER_NAME:$USER_NAME" $USER_HOME/.config/lxsession 2>/dev/null || true

# Method 3: Ensure systemd service is enabled
systemctl enable cardash.service 2>/dev/null || true

# Set timezone (change as needed)
# timedatectl set-timezone Europe/Budapest

echo ""
echo "✅ Raspberry Pi optimization complete!"
echo "🔄 Please reboot: sudo reboot"
echo ""
echo "💡 Hardware recommendations:"
echo "  - Official 7\" Raspberry Pi Touch Display"
echo "  - Raspberry Pi 4 (4GB+ RAM recommended)"
echo "  - Good quality power supply (3A minimum)"
echo "  - Heatsink/fan for car environment"
echo ""
