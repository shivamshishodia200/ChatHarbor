#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=========================================================="
echo " Starting Full Verification Suite for ChatHarbor "
echo " Working directory: $DIR"
echo "=========================================================="

# 1. Run Backend Unit & Integration Tests
echo ""
echo "[1/4] Running Backend Unit & Integration Tests..."
cd "$DIR"
node --experimental-strip-types --test backend/test/*.test.ts
echo ">> Backend Tests Passed!"

# 2. Run Frontend Build
echo ""
echo "[2/4] Building Frontend Production Bundle..."
npx vite build frontend
echo ">> Frontend Production Build Succeeded!"

# 3. Run Android Companion Unit Tests
echo ""
echo "[3/4] Running Android Unit Tests (JUnit)..."
cd "$DIR/android"
./gradlew testDebugUnitTest
echo ">> Android Unit Tests Passed!"

# 4. Build Android Debug APK
echo ""
echo "[4/4] Assembling Android Debug APK..."
./gradlew assembleDebug
APK_PATH="$DIR/android/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
    echo ">> APK successfully created at: $APK_PATH ($(ls -lh "$APK_PATH" | awk '{print $5}'))"
else
    echo ">> Error: APK was not found at $APK_PATH"
    exit 1
fi

echo ""
echo "=========================================================="
echo " ALL VERIFICATION CHECKS COMPLETED SUCCESSFULLY! "
echo "=========================================================="

