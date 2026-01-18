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

# Increase GPU memory for better graphics
echo "⚙️ Optimizing GPU memory..."
if ! grep -q "gpu_mem" /boot/config.txt; then
    echo "gpu_mem=256" >> /boot/config.txt
fi

# Disable splash screen for faster boot
echo "⚙️ Optimizing boot..."
if ! grep -q "disable_splash" /boot/config.txt; then
    echo "disable_splash=1" >> /boot/config.txt
fi

# Enable hardware acceleration
if ! grep -q "dtoverlay=vc4-fkms-v3d" /boot/config.txt; then
    echo "dtoverlay=vc4-fkms-v3d" >> /boot/config.txt
fi

# Reduce boot messages
sed -i 's/console=tty1/console=tty3 quiet loglevel=3/' /boot/cmdline.txt 2>/dev/null || true

# Disable unnecessary services for faster boot
systemctl disable bluetooth 2>/dev/null || true
systemctl disable avahi-daemon 2>/dev/null || true
systemctl disable triggerhappy 2>/dev/null || true

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
