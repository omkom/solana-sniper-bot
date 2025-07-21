 #!/bin/bash

# Define the output file
OUTPUT_FILE="CONTEXT.txt"

# Define directories/files to exclude (common build/dependency folders and dotfiles)
EXCLUDE_DIRS="node_modules build dist .git .expo .venv"
EXCLUDE_PATTERNS=".*"  # Excludes dotfiles like .gitignore, .env, etc.

# Define common code file extensions to include (customizable)
CODE_EXTENSIONS="js jsx ts tsx py rb java cpp c h sh"

# Start the output file
echo "=== Project Information ===" > "$OUTPUT_FILE"
echo "Generated on: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# 1. Project Structure
echo "=== Project Structure ===" >> "$OUTPUT_FILE"
if command -v tree >/dev/null 2>&1; then
    # Use tree if available, exclude specified directories and dotfiles
    tree -I "$(echo $EXCLUDE_DIRS $EXCLUDE_PATTERNS | tr ' ' '|')" --noreport >> "$OUTPUT_FILE"
else
    # Fallback to find if tree is not installed
    echo "(tree command not found, using find instead)" >> "$OUTPUT_FILE"
    find . -type f -not -path "*/node_modules/*" \
           -not -path "*/build/*" \
           -not -path "*/dist/*" \
           -not -path "*/.git/*" \
           -not -path "*/.expo/*" \
           -not -path "*/.venv/*" \
           -not -name ".*" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# 2. Code Files Content
echo "=== Code Files Content ===" >> "$OUTPUT_FILE"
# Dynamically find all code files with specified extensions, excluding hidden files
find . -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \
    -o -name "*.py" -o -name "*.rb" -o -name "*.java" -o -name "*.cpp" \
    -o -name "*.c" -o -name "*.h" -o -name "*.sh" \) \
    -not -path "*/node_modules/*" \
    -not -path "*/build/*" \
    -not -path "*/dist/*" \
    -not -path "*/.git/*" \
    -not -path "*/.expo/*" \
    -not -path "*/.venv/*" \
    -not -name ".*" | while read -r FILE; do
    if [ -f "$FILE" ]; then
        echo "----- $FILE -----" >> "$OUTPUT_FILE"
        cat "$FILE" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
    fi
done

# 3. Dependency Information (if applicable)
echo "=== Dependency Information ===" >> "$OUTPUT_FILE"
if [ -f "package.json" ]; then
    echo "Dependencies:" >> "$OUTPUT_FILE"
    jq '.dependencies // {}' package.json >> "$OUTPUT_FILE" 2>/dev/null || cat package.json
    echo "" >> "$OUTPUT_FILE"
    echo "Dev Dependencies:" >> "$OUTPUT_FILE"
    jq '.devDependencies // {}' package.json >> "$OUTPUT_FILE" 2>/dev/null || cat package.json
elif [ -f "requirements.txt" ]; then
    echo "Python Dependencies (requirements.txt):" >> "$OUTPUT_FILE"
    cat requirements.txt >> "$OUTPUT_FILE"
else
    echo "No dependency file (e.g., package.json, requirements.txt) found." >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# 4. Summary
echo "=== Summary ===" >> "$OUTPUT_FILE"
echo "Project directory: $(pwd)" >> "$OUTPUT_FILE"
echo "Output file: $OUTPUT_FILE" >> "$OUTPUT_FILE"
echo "Done!" >> "$OUTPUT_FILE"

echo "Project information has been extracted to $OUTPUT_FILE"