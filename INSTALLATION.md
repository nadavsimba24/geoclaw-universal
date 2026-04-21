# Geoclaw v3.0 - Installation Guide

## 🎯 Simple Installation for All Platforms

### **Option 1: Direct npm install (Recommended)**
```bash
# Linux/macOS/WSL
npm install -g "https://github.com/nadavsimba24/geoclaw-universal.git"

# Windows (PowerShell)
npm install -g "https://github.com/nadavsimba24/geoclaw-universal.git"
```

### **Option 2: Using install scripts**
```bash
# Linux/macOS/WSL
curl -fsSL https://raw.githubusercontent.com/nadavsimba24/geoclaw-universal/main/install.sh | bash

# Windows (PowerShell)
# Run as Administrator in PowerShell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\install-windows.ps1
```

### **Option 3: Clone and install**
```bash
# All platforms
git clone https://github.com/nadavsimba24/geoclaw-universal.git
cd geoclaw-universal
npm install
npm link  # Makes 'geoclaw' command available globally
```

## 🔧 Platform-Specific Instructions

### **Windows**
1. **Install Node.js** from https://nodejs.org/
2. **Open PowerShell as Administrator**
3. **Run installation**:
   ```powershell
   npm install -g "https://github.com/nadavsimba24/geoclaw-universal.git"
   ```
4. **If you get permission errors**, run PowerShell as Administrator

### **WSL (Windows Subsystem for Linux)**
1. **Open WSL terminal**
2. **Install Node.js** if not already installed:
   ```bash
   sudo apt update
   sudo apt install nodejs npm
   ```
3. **Run installation**:
   ```bash
   npm install -g "https://github.com/nadavsimba24/geoclaw-universal.git"
   ```

### **macOS**
1. **Install Node.js** from https://nodejs.org/ or using Homebrew:
   ```bash
   brew install node
   ```
2. **Run installation**:
   ```bash
   npm install -g "https://github.com/nadavsimba24/geoclaw-universal.git"
   ```

### **Linux**
1. **Install Node.js**:
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install nodejs npm
   
   # Fedora
   sudo dnf install nodejs npm
   ```
2. **Run installation**:
   ```bash
   npm install -g "https://github.com/nadavsimba24/geoclaw-universal.git"
   ```

## 🚀 After Installation

### **Verify Installation**
```bash
# Check if geoclaw command is available
geoclaw --help

# Should show:
# 🎭  Geoclaw v3.0 - Universal Agent Platform
# ────────────────────────────────────────────
# Transparent automation with educational UX
```

### **Setup Geoclaw**
```bash
# Run interactive setup wizard
geoclaw setup

# This will guide you through configuring:
# 1. Memory System
# 2. Skill Ecosystem
# 3. Vibe Kanban
# 4. n8n workflow automation
# 5. QGIS/PostGIS geospatial tools
# 6. Web scraping
# 7. MCPorter integration
# 8. Workflow orchestration
```

### **Start Geoclaw**
```bash
# Start the platform
geoclaw start
```

## 🛠️ Troubleshooting

### **"npm: command not found"**
- Install Node.js from https://nodejs.org/
- Make sure Node.js is in your PATH

### **Permission errors on Linux/macOS**
```bash
# Fix npm permissions
sudo chown -R $USER /usr/local/lib/node_modules
# Or install with --no-sudo
npm config set prefix ~/.npm-global
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### **Windows PowerShell execution policy**
```powershell
# Run as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### **Git not installed**
```bash
# Linux
sudo apt install git

# macOS
brew install git

# Windows: Download from https://git-scm.com/
```

### **Node.js version too old**
```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Update Node.js
# Using nvm (recommended)
nvm install 18
nvm use 18

# Or download from https://nodejs.org/
```

## 📦 Manual Installation (Advanced)

If npm install fails, you can install manually:

1. **Download the repository**:
   ```bash
   git clone https://github.com/nadavsimba24/geoclaw-universal.git
   cd geoclaw-universal
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create global symlink**:
   ```bash
   # Linux/macOS/WSL
   sudo ln -s "$(pwd)/geoclaw.mjs" /usr/local/bin/geoclaw
   
   # Or use npm link
   npm link
   ```

4. **Create Windows shortcut** (if needed):
   ```powershell
   # Create geoclaw.bat in a directory in your PATH
   @echo off
   node "C:\path\to\geoclaw-universal\geoclaw.mjs" %*
   ```

## 🎯 Quick Test

After installation, run this test:

```bash
# Test basic functionality
geoclaw --help
geoclaw learn mcporter
geoclaw status
```

## 📚 Next Steps

1. **Read the documentation**: https://github.com/nadavsimba24/geoclaw-universal#readme
2. **Explore components**: `geoclaw learn <component>`
3. **Create magic workflows**: `geoclaw workflow create`
4. **Join the community**: Report issues on GitHub

## 🆘 Getting Help

If you encounter issues:

1. **Check the error message** carefully
2. **Verify Node.js version**: `node --version`
3. **Check npm version**: `npm --version`
4. **Look for existing issues**: https://github.com/nadavsimba24/geoclaw-universal/issues
5. **Create a new issue** with:
   - Your operating system
   - Node.js version
   - Exact error message
   - Steps to reproduce

## 🎉 Welcome to Geoclaw!

You're now ready to start creating transparent, educational automation workflows with Geoclaw v3.0! 🎭