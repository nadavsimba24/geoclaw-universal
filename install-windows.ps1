# Geoclaw v3.0 - Windows Installation Script
Write-Host "🚀 Installing Geoclaw v3.0 - Universal Agent Platform" -ForegroundColor Cyan
Write-Host ""

# Check for npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ npm is required. Install Node.js first: https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Install globally from GitHub
Write-Host "📦 Installing from GitHub..." -ForegroundColor Yellow
npm install -g "https://github.com/nadavsimba24/geoclaw-universal.git"

Write-Host ""
Write-Host "✅ Geoclaw v3.0 installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Quick start:" -ForegroundColor Cyan
Write-Host "   1. geoclaw setup    # Interactive setup wizard"
Write-Host "   2. geoclaw start    # Start the platform"
Write-Host ""
Write-Host "🎭 Learn about components:" -ForegroundColor Cyan
Write-Host "   geoclaw learn mcporter    # MCP server discovery"
Write-Host "   geoclaw learn n8n         # Workflow automation"
Write-Host "   geoclaw learn qgis        # Geospatial analysis"
Write-Host ""
Write-Host "📚 Full documentation:" -ForegroundColor Cyan
Write-Host "   https://github.com/nadavsimba24/geoclaw-universal"
Write-Host ""
Write-Host "🎉 Welcome to transparent agent automation!" -ForegroundColor Green