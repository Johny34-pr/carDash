#!/bin/bash
# CarDash Linux Installation Script
# Tested on Raspberry Pi OS, Ubuntu, Debian

set -e

echo "🚗 CarDash Linux Installer"
echo "=========================="

# Variables
INSTALL_DIR="/opt/cardash"
USER_NAME="${SUDO_USER:-$USER}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo ./install.sh"
    exit 1
fi

echo "📦 Installing dependencies..."
apt-get update
apt-get install -y curl wget git

# Install Node.js (v18 LTS)
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Install X11 and dependencies for Electron
echo "📦 Installing X11 and display dependencies..."
apt-get install -y \
    xorg \
    x11-xserver-utils \
    xinit \
    openbox \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libuuid1 \
    libsecret-1-0 \
    libasound2 \
    libgbm1 \
    unclutter

# Create installation directory
echo "📁 Creating installation directory..."
mkdir -p "$INSTALL_DIR"

# Copy application files
echo "📋 Copying application files..."
cp -r . "$INSTALL_DIR/"
rm -rf "$INSTALL_DIR/linux-setup"

# Install npm dependencies
echo "📦 Installing npm dependencies..."
cd "$INSTALL_DIR"
npm install --production
npm install electron --save-dev

# Set permissions
chown -R "$USER_NAME:$USER_NAME" "$INSTALL_DIR"

# Create systemd service
echo "⚙️ Creating systemd service..."
cat > /etc/systemd/system/cardash.service << EOF
[Unit]
Description=CarDash Automotive Dashboard
After=graphical.target
Wants=graphical.target

[Service]
Type=simple
User=$USER_NAME
Environment=DISPLAY=:0
Environment=CARDASH_KIOSK=1
Environment=ELECTRON_DISABLE_GPU=0
WorkingDirectory=$INSTALL_DIR
ExecStartPre=/bin/sleep 5
ExecStart=/usr/bin/npm start -- --kiosk
Restart=always
RestartSec=3

[Install]
WantedBy=graphical.target
EOF

# Create X11 autostart config
echo "⚙️ Creating X11 autostart..."
mkdir -p /home/$USER_NAME/.config/openbox
cat > /home/$USER_NAME/.config/openbox/autostart << EOF
# Hide mouse cursor after 1 second of inactivity
unclutter -idle 1 &

# Disable screen blanking
xset s off
xset -dpms
xset s noblank

# Start CarDash
cd $INSTALL_DIR && npm start -- --kiosk &
EOF
chown -R "$USER_NAME:$USER_NAME" /home/$USER_NAME/.config

# Create .xinitrc for startx
cat > /home/$USER_NAME/.xinitrc << EOF
#!/bin/bash
# Disable screen blanking
xset s off
xset -dpms
xset s noblank

# Hide mouse cursor
unclutter -idle 1 &

# Start openbox with CarDash
exec openbox-session
EOF
chown "$USER_NAME:$USER_NAME" /home/$USER_NAME/.xinitrc
chmod +x /home/$USER_NAME/.xinitrc

# Enable auto-login (for Raspberry Pi / systemd)
echo "⚙️ Configuring auto-login..."
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $USER_NAME --noclear %I \$TERM
EOF

# Auto-start X on login
cat >> /home/$USER_NAME/.bash_profile << 'EOF'

# Auto-start X for CarDash
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
    exec startx
fi
EOF
chown "$USER_NAME:$USER_NAME" /home/$USER_NAME/.bash_profile

# Reload systemd
systemctl daemon-reload

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Usage options:"
echo "  1. Reboot for automatic start: sudo reboot"
echo "  2. Manual start: sudo systemctl start cardash"
echo "  3. Enable at boot: sudo systemctl enable cardash"
echo ""
echo "🔧 Useful commands:"
echo "  - Check status: sudo systemctl status cardash"
echo "  - View logs: journalctl -u cardash -f"
echo "  - Stop: sudo systemctl stop cardash"
echo ""
