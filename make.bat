@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "EXIT_CODE=1"

set "SCRIPT_DIR=%~dp0"
if "!SCRIPT_DIR:~-1!"=="\" set "SCRIPT_DIR=!SCRIPT_DIR:~0,-1!"
set "MANIFEST_PATH=!SCRIPT_DIR!\manifest.json"

set "CHROME_BINARY=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "CHROME_KEY=%USERPROFILE%\Documents\ChromeDeveloperstorePrivateKey.pem"

if not exist "!MANIFEST_PATH!" (
  echo manifest.json not found at "!MANIFEST_PATH!"
  goto cleanup
)

if not exist "!CHROME_BINARY!" (
  echo Google Chrome binary not found at "!CHROME_BINARY!"
  goto cleanup
)

if not exist "!CHROME_KEY!" (
  echo Chrome extension key not found at "!CHROME_KEY!"
  goto cleanup
)

set "VERSION="
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$json = Get-Content -Raw $env:MANIFEST_PATH; $obj = ConvertFrom-Json -InputObject $json; $obj.version"`) do (
  if not "%%V"=="" set "VERSION=%%~V"
)

if not defined VERSION (
  echo Unable to determine version from manifest.json
  goto cleanup
)

set "CRX_NAME=make-new-tabs-active-!VERSION!.crx"
set "CRX_PATH=!SCRIPT_DIR!\!CRX_NAME!"

for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "$ErrorActionPreference = 'Stop'; $root = $env:SCRIPT_DIR; $name = '.crx-build.' + [System.Guid]::NewGuid().ToString('N').Substring(0,6); $path = Join-Path $root $name; (New-Item -ItemType Directory -Path $path).FullName"`) do set "TEMP_DIR=%%T"

if not defined TEMP_DIR (
  echo Failed to create temporary directory
  goto cleanup
)

set "TEMP_CRX=!TEMP_DIR!.crx"
set "TEMP_PEM=!TEMP_DIR!.pem"

robocopy "!SCRIPT_DIR!" "!TEMP_DIR!" manifest.json *.js *.html *.css icon*.png /S /NJH /NJS /NDL /NFL >nul
set "RC=!ERRORLEVEL!"
if !RC! GEQ 8 (
  echo Failed to copy extension files.
  goto cleanup
)

if exist "!SCRIPT_DIR!\_locales" (
  robocopy "!SCRIPT_DIR!\_locales" "!TEMP_DIR!\_locales" * /E /NJH /NJS /NDL /NFL >nul
  set "RC=!ERRORLEVEL!"
  if !RC! GEQ 8 (
    echo Failed to copy locale files.
    goto cleanup
  )
)

if not exist "!TEMP_DIR!\manifest.json" (
  echo No files found to package.
  goto cleanup
)

pushd "!SCRIPT_DIR!" >nul
"!CHROME_BINARY!" --pack-extension="!TEMP_DIR!" --pack-extension-key="!CHROME_KEY!"
set "PACK_RC=%ERRORLEVEL%"
popd >nul

if not "%PACK_RC%"=="0" (
  echo Chrome pack command failed with exit code %PACK_RC%.
  goto cleanup
)

if not exist "!TEMP_CRX!" (
  echo Expected CRX not found at "!TEMP_CRX!".
  goto cleanup
)

move /Y "!TEMP_CRX!" "!CRX_PATH!" >nul
if errorlevel 1 (
  echo Failed to move CRX to "!CRX_PATH!".
  goto cleanup
)

if exist "!TEMP_PEM!" del /Q "!TEMP_PEM!" >nul

echo Created !CRX_PATH!
set "EXIT_CODE=0"

:cleanup
if defined TEMP_DIR if exist "!TEMP_DIR!" rmdir /S /Q "!TEMP_DIR!" >nul
if defined TEMP_CRX if exist "!TEMP_CRX!" del /Q "!TEMP_CRX!" >nul
if defined TEMP_PEM if exist "!TEMP_PEM!" del /Q "!TEMP_PEM!" >nul

exit /b %EXIT_CODE%
