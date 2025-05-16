#!/bin/bash
# deploy-dashboard.sh
# Script to copy dashboard files to the correct location during deployment

# Create public directory if it doesn't exist
mkdir -p public

# Copy dashboard HTML to both root and public directory for maximum compatibility
cp dashboard.html public/dashboard.html
echo "Copied dashboard.html to public directory"

# Copy all JS files that might be needed by the dashboard
for file in *-api.js *-display.js *-handling.js *-helper.js *-monitor.js *-verifier.js *-charts.js *-components.js; do
  if [ -f "$file" ]; then
    cp "$file" public/
    echo "Copied $file to public directory"
  fi
done

# Copy any CSS files
for file in *.css; do
  if [ -f "$file" ]; then
    cp "$file" public/
    echo "Copied $file to public directory"
  fi
done

# Create images directory if needed
mkdir -p public/images

# Copy any images
if [ -d "images" ]; then
  cp -r images/* public/images/
  echo "Copied images to public/images directory"
fi

echo "Dashboard deployment preparation complete"
