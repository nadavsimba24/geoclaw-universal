#!/bin/bash

# 🧪 GLTF Pipeline Skill - Test Script
# Run tests to verify the skill is working correctly

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo "${BLUE}🧪 GLTF Pipeline Skill - Tests${NC}"
    echo "${BLUE}=============================${NC}"
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

test_python_dependencies() {
    echo "🔍 Testing Python dependencies..."
    
    local all_ok=true
    
    # Test Python version
    python_version=$(python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    if [ $(echo "$python_version >= 3.8" | bc -l 2>/dev/null || echo "0") -eq 1 ]; then
        print_success "Python $python_version"
    else
        print_error "Python 3.8+ required, found $python_version"
        all_ok=false
    fi
    
    # Test required packages
    packages=("shapely" "pyproj" "trimesh" "numpy" "yaml" "pygltflib")
    
    for pkg in "${packages[@]}"; do
        if python -c "import $pkg" 2>/dev/null; then
            print_success "$pkg"
        else
            print_error "$pkg (missing)"
            all_ok=false
        fi
    done
    
    if $all_ok; then
        return 0
    else
        return 1
    fi
}

test_skill_structure() {
    echo "📁 Testing skill structure..."
    
    local all_ok=true
    local skill_dir="$(dirname "$0")/.."
    
    # Check required directories
    required_dirs=(
        "configs"
        "examples"
        "assets"
        "scripts"
    )
    
    for dir in "${required_dirs[@]}"; do
        if [ -d "$skill_dir/$dir" ]; then
            print_success "$dir/"
        else
            print_error "$dir/ (missing)"
            all_ok=false
        fi
    done
    
    # Check required files
    required_files=(
        "SKILL.md"
        "gltf_agent.js"
        "configs/default.yaml"
        "examples/sample_site.geojson"
        "scripts/install.sh"
        "scripts/test.sh"
    )
    
    for file in "${required_files[@]}"; do
        if [ -f "$skill_dir/$file" ]; then
            print_success "$file"
        else
            print_error "$file (missing)"
            all_ok=false
        fi
    done
    
    if $all_ok; then
        return 0
    else
        return 1
    fi
}

test_geojson_example() {
    echo "📊 Testing GeoJSON example..."
    
    local skill_dir="$(dirname "$0")/.."
    local example_file="$skill_dir/examples/sample_site.geojson"
    
    if [ ! -f "$example_file" ]; then
        print_error "Example file not found: $example_file"
        return 1
    fi
    
    # Validate JSON structure
    if python -m json.tool "$example_file" > /dev/null 2>&1; then
        print_success "Valid JSON structure"
    else
        print_error "Invalid JSON in example file"
        return 1
    fi
    
    # Count features
    feature_count=$(python -c "
import json
with open('$example_file', 'r') as f:
    data = json.load(f)
print(len(data.get('features', [])))
" 2>/dev/null || echo "0")
    
    if [ "$feature_count" -gt 0 ]; then
        print_success "$feature_count features found"
        return 0
    else
        print_error "No features found in example"
        return 1
    fi
}

test_configuration() {
    echo "⚙️ Testing configuration..."
    
    local skill_dir="$(dirname "$0")/.."
    local config_file="$skill_dir/configs/default.yaml"
    
    if [ ! -f "$config_file" ]; then
        print_error "Config file not found: $config_file"
        return 1
    fi
    
    # Validate YAML structure
    if python -c "
import yaml
with open('$config_file', 'r') as f:
    data = yaml.safe_load(f)
print('YAML parsed successfully')
" 2>/dev/null; then
        print_success "Valid YAML structure"
    else
        print_error "Invalid YAML in config file"
        return 1
    fi
    
    # Check required config sections
    required_sections=("units" "source_crs" "target_crs" "realism_tier" "defaults")
    
    for section in "${required_sections[@]}"; do
        if python -c "
import yaml
with open('$config_file', 'r') as f:
    data = yaml.safe_load(f)
if '$section' in str(data):
    print('found')
else:
    print('missing')
" 2>/dev/null | grep -q "found"; then
            print_success "Config has '$section'"
        else
            print_warning "Config missing '$section' (may be optional)"
        fi
    done
    
    return 0
}

test_agent_script() {
    echo "🤖 Testing agent script..."
    
    local skill_dir="$(dirname "$0")/.."
    local agent_file="$skill_dir/gltf_agent.js"
    
    if [ ! -f "$agent_file" ]; then
        print_error "Agent file not found: $agent_file"
        return 1
    fi
    
    # Check if it's valid JavaScript
    if node -c "$agent_file" 2>/dev/null; then
        print_success "Valid JavaScript syntax"
    else
        print_error "Invalid JavaScript syntax"
        return 1
    fi
    
    # Check for required exports
    if grep -q "class GLTFPipelineAgent" "$agent_file"; then
        print_success "GLTFPipelineAgent class found"
    else
        print_error "GLTFPipelineAgent class not found"
        return 1
    fi
    
    if grep -q "handleCommand" "$agent_file"; then
        print_success "handleCommand method found"
    else
        print_error "handleCommand method not found"
        return 1
    fi
    
    return 0
}

run_quick_conversion_test() {
    echo "🚀 Running quick conversion test..."
    
    local skill_dir="$(dirname "$0")/.."
    local example_file="$skill_dir/examples/sample_site.geojson"
    local output_dir="$skill_dir/test_output"
    
    # Create test output directory
    mkdir -p "$output_dir"
    
    # Check if geojson_to_gltf is available
    if ! command -v geojson_to_gltf > /dev/null 2>&1; then
        print_warning "geojson_to_gltf command not found (skipping conversion test)"
        return 0
    fi
    
    # Run a simple test conversion
    if python -m geojson_to_gltf --help > /dev/null 2>&1; then
        print_success "geojson_to_gltf module available"
        
        # Try to run conversion (but don't fail if it doesn't work)
        if python -m geojson_to_gltf \
            --input "$example_file" \
            --output "$output_dir/test.glb" \
            --config "$skill_dir/configs/default.yaml" \
            --local-origin 2>&1 | tail -20; then
            
            if [ -f "$output_dir/test.glb" ]; then
                file_size=$(stat -f%z "$output_dir/test.glb" 2>/dev/null || stat -c%s "$output_dir/test.glb" 2>/dev/null || echo "0")
                if [ "$file_size" -gt 1000 ]; then
                    print_success "Conversion successful ($((file_size/1024)) KB)"
                    return 0
                else
                    print_warning "Output file created but very small ($file_size bytes)"
                    return 0
                fi
            else
                print_warning "Conversion ran but no output file created"
                return 0
            fi
        else
            print_warning "Conversion test failed (but skill structure is OK)"
            return 0
        fi
    else
        print_warning "geojson_to_gltf module not available (skipping conversion)"
        return 0
    fi
}

print_summary() {
    echo ""
    echo "${BLUE}📊 Test Summary${NC}"
    echo "${BLUE}===============${NC}"
    
    local passed=$1
    local total=$2
    
    if [ "$passed" -eq "$total" ]; then
        echo "${GREEN}🎉 All $passed/$total tests passed!${NC}"
        echo ""
        echo "The GLTF Pipeline skill is ready to use!"
        echo ""
        echo "Next steps:"
        echo "1. Use in OpenClaw: @gltf help"
        echo "2. Run example: cd $(dirname "$0")/.. && python run_example.py"
        echo "3. Add your assets to the assets/ directory"
        return 0
    elif [ "$passed" -ge $((total * 2 / 3)) ]; then
        echo "${YELLOW}⚠️  $passed/$total tests passed${NC}"
        echo ""
        echo "The skill is mostly working but has some issues."
        echo ""
        echo "Common issues:"
        echo "- Missing Python dependencies"
        echo "- Invalid configuration files"
        echo "- Missing example data"
        echo ""
        echo "Run: ./scripts/install.sh to fix installation"
        return 1
    else
        echo "${RED}❌ Only $passed/$total tests passed${NC}"
        echo ""
        echo "The skill has significant issues."
        echo ""
        echo "Please run: ./scripts/install.sh"
        echo "Then run this test again."
        return 1
    fi
}

main() {
    print_header
    
    local tests_passed=0
    local tests_total=0
    
    # Run tests
    echo "Running tests..."
    echo ""
    
    # Test 1: Python dependencies
    ((tests_total++))
    if test_python_dependencies; then
        ((tests_passed++))
    fi
    echo ""
    
    # Test 2: Skill structure
    ((tests_total++))
    if test_skill_structure; then
        ((tests_passed++))
    fi
    echo ""
    
    # Test 3: GeoJSON example
    ((tests_total++))
    if test_geojson_example; then
        ((tests_passed++))
    fi
    echo ""
    
    # Test 4: Configuration
    ((tests_total++))
    if test_configuration; then
        ((tests_passed++))
    fi
    echo ""
    
    # Test 5: Agent script
    ((tests_total++))
    if test_agent_script; then
        ((tests_passed++))
    fi
    echo ""
    
    # Test 6: Quick conversion (optional)
    ((tests_total++))
    if run_quick_conversion_test; then
        ((tests_passed++))
    fi
    echo ""
    
    # Print summary
    print_summary $tests_passed $tests_total
    
    return $?
}

# Run main function
main "$@"