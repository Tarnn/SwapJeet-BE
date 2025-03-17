#!/bin/bash

# Create fonts directory if it doesn't exist
mkdir -p assets/fonts

# Download Inter fonts
curl -L "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf" -o assets/fonts/Inter-Regular.ttf
curl -L "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Bold.ttf" -o assets/fonts/Inter-Bold.ttf

echo "Font files downloaded successfully!" 