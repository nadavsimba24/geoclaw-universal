#!/bin/bash

# 🏗️ GLTF Pipeline Skill - Installation Script
# Installs Python dependencies and sets up the skill

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo "${BLUE}🏗️ GLTF Pipeline Skill - Installation${NC}"
    echo "${BLUE}====================================${NC}"
    echo ""
}

print_success() {
    echo "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo "${RED}❌ $1${NC}"
}

check_python() {
    echo "🔍 Checking Python installation..."
    
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
        print_success "Found python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
        print_success "Found python"
    else
        print_error "Python not found. Please install Python 3.8 or higher."
        exit 1
    fi
    
    # Check Python version
    PYTHON_VERSION=$($PYTHON_CMD -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    if [ $(echo "$PYTHON_VERSION >= 3.8" | bc -l 2>/dev/null || echo "0") -eq 1 ]; then
        print_success "Python $PYTHON_VERSION (>= 3.8)"
    else
        print_error "Python 3.8+ required, found $PYTHON_VERSION"
        exit 1
    fi
}

check_pip() {
    echo "📦 Checking pip installation..."
    
    if $PYTHON_CMD -m pip --version &> /dev/null; then
        print_success "pip is available"
        PIP_CMD="$PYTHON_CMD -m pip"
    else
        print_warning "pip not found, attempting to install..."
        
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y python3-pip
            PIP_CMD="pip3"
        elif command -v yum &> /dev/null; then
            sudo yum install -y python3-pip
            PIP_CMD="pip3"
        elif command -v brew &> /dev/null; then
            brew install python3
            PIP_CMD="pip3"
        else
            print_error "Could not install pip automatically. Please install pip manually."
            exit 1
        fi
    fi
}

install_dependencies() {
    echo "📚 Installing Python dependencies..."
    
    # Core dependencies
    CORE_DEPS=(
        "shapely>=2.0.0"
        "pyproj>=3.6.0"
        "trimesh>=4.0.0"
        "numpy>=1.24.0"
        "pyyaml>=6.0"
        "pygltflib>=1.15.0"
    )
    
    for dep in "${CORE_DEPS[@]}"; do
        echo "  Installing $dep..."
        if $PIP_CMD install --quiet "$dep"; then
            print_success "  $dep"
        else
            print_warning "  Failed to install $dep (may already be installed)"
        fi
    done
    
    # Optional dependencies (install but don't fail)
    OPTIONAL_DEPS=(
        "mapbox-earcut>=1.0.0"
        "rasterio>=1.3.0"
        "scipy>=1.10.0"
        "pillow>=10.0.0"
    )
    
    for dep in "${OPTIONAL_DEPS[@]}"; do
        echo "  Installing optional: $dep..."
        $PIP_CMD install --quiet "$dep" 2>/dev/null || true
    done
}

create_virtual_environment() {
    echo "🔧 Creating virtual environment (optional)..."
    
    read -p "Create virtual environment? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if $PYTHON_CMD -m venv venv; then
            print_success "Virtual environment created"
            
            # Update pip command for venv
            if [ -f "venv/bin/activate" ]; then
                PIP_CMD="venv/bin/pip"
                print_success "Using virtual environment pip"
            fi
        else
            print_warning "Failed to create virtual environment, continuing with system Python"
        fi
    fi
}

setup_skill_directories() {
    echo "📁 Setting up skill directories..."
    
    SKILL_DIR="$(dirname "$0")/.."
    
    # Create necessary directories
    DIRS=(
        "assets/trees"
        "assets/benches"
        "assets/lights"
        "assets/signs"
        "assets/fences"
        "assets/materials"
        "configs"
        "examples"
        "scripts"
    )
    
    for dir in "${DIRS[@]}"; do
        mkdir -p "$SKILL_DIR/$dir"
        print_success "  Created: $dir"
    done
    
    # Create placeholder assets README
    for category in trees benches lights signs fences materials; do
        cat > "$SKILL_DIR/assets/$category/README.md" << EOF
# ${category^} Assets

Placeholder directory for ${category} assets.

Add your GLB files here. Each file should:
1. Be centered at origin (0,0,0)
2. Have appropriate scale (1 unit = 1 meter)
3. Include materials and textures
4. Be optimized for real-time rendering

Example naming: ${category}_generic.glb, ${category}_custom.glb
EOF
        print_success "  Created: assets/$category/README.md"
    done
}

test_installation() {
    echo "🧪 Testing installation..."
    
    # Test Python imports
    TEST_SCRIPT=$(cat << 'EOF'
import sys
print("Python version:", sys.version)

packages = ["shapely", "pyproj", "trimesh", "numpy", "yaml", "pygltflib"]
all_ok = True

for pkg in packages:
    try:
        __import__(pkg)
        print(f"✅ {pkg}")
    except ImportError as e:
        print(f"❌ {pkg}: {e}")
        all_ok = False

if all_ok:
    print("\n🎉 All dependencies installed successfully!")
    sys.exit(0)
else:
    print("\n⚠️ Some dependencies missing. Please install them manually.")
    sys.exit(1)
EOF
)
    
    if $PYTHON_CMD -c "$TEST_SCRIPT"; then
        print_success "Installation test passed!"
    else
        print_warning "Installation test had issues (see above)"
    fi
}

create_example_runner() {
    echo "🚀 Creating example runner..."
    
    SKILL_DIR="$(dirname "$0")/.."
    
    cat > "$SKILL_DIR/run_example.py" << 'EOF'
#!/usr/bin/env python3
"""
GLTF Pipeline Skill - Example Runner
Run a sample conversion to test the installation.
"""

import subprocess
import sys
import os
from pathlib import Path

def run_command(cmd, description):
    """Run a shell command with error handling."""
    print(f"⏳ {description}...")
    try:
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed:")
        print(f"   Error: {e.stderr}")
        return False

def main():
    """Run the example conversion."""
    print("=" * 60)
    print("🏗️ GLTF Pipeline Skill - Example Runner")
    print("=" * 60)
    
    # Get skill directory
    skill_dir = Path(__file__).parent
    example_file = skill_dir / "examples" / "sample_site.geojson"
    output_file = skill_dir / "output" / "example_scene.glb"
    
    # Create output directory
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    # Check if example file exists
    if not example_file.exists():
        print(f"❌ Example file not found: {example_file}")
        print("Please run the installation script first.")
        return 1
    
    # Build command
    cmd = f"python -m geojson_to_gltf " \
          f"--input \"{example_file}\" " \
          f"--output \"{output_file}\" " \
          f"--config \"{skill_dir}/configs/default.yaml\" " \
          f"--local-origin"
    
    # Run conversion
    if run_command(cmd, "Converting example data"):
        print(f"\n🎉 Conversion complete!")
        print(f"Output file: {output_file}")
        
        # Check if file was created
        if output_file.exists():
            file_size = output_file.stat().st_size
            print(f"File size: {file_size / 1024 / 1024:.2f} MB")
            
            print("\n📋 Next steps:")
            print("1. View the GLB file in a 3D viewer")
            print("2. Try with your own GeoJSON data")
            print("3. Customize the configuration")
            
            return 0
        else:
            print("❌ Output file was not created")
            return 1
    else:
        return 1

if __name__ == "__main__":
    sys.exit(main())
EOF
    
    chmod +x "$SKILL_DIR/run_example.py"
    print_success "Created: run_example.py"
}

print_next_steps() {
    echo ""
    echo "${BLUE}🎉 Installation Complete!${NC}"
    echo "${BLUE}=======================${NC}"
    echo ""
    echo "📋 Next steps:"
    echo ""
    echo "1. Test the installation:"
    echo "   cd $(dirname "$0")/.."
    echo "   python run_example.py"
    echo ""
    echo "2. Use with OpenClaw:"
    echo "   @gltf convert your_data.geojson"
    echo "   @gltf example"
    echo "   @gltf help"
    echo ""
    echo "3. Add your own assets:"
    echo "   Place GLB files in assets/trees/, assets/benches/, etc."
    echo ""
    echo "4. Customize configuration:"
    echo "   Edit configs/default.yaml for your needs"
    echo ""
    echo "📚 Documentation:"
    echo "   - See SKILL.md for detailed usage"
    echo "   - Check examples/ for sample data format"
    echo "   - Review configs/ for configuration options"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   - Run 'python run_example.py' to test"
    echo "   - Check Python version (3.8+ required)"
    echo "   - Ensure all dependencies are installed"
    echo ""
    echo "${GREEN}Happy 3D modeling! 🏙️🌳🚶‍♂️${NC}"
    echo ""
}

main() {
    print_header
    
    # Check Python
    check_python
    
    # Check pip
    check_pip
    
    # Create virtual environment (optional)
    create_virtual_environment
    
    # Install dependencies
    install_dependencies
    
    # Setup directories
    setup_skill_directories
    
    # Test installation
    test_installation
    
    # Create example runner
    create_example_runner
    
    # Print next steps
    print_next_steps
}

# Run main function
main "$@"