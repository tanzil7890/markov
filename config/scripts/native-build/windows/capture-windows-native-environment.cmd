@echo off
chcp 65001 >nul
call "%MARKOV_WINDOWS_VSDEVCMD%" -no_logo -arch=%MARKOV_WINDOWS_NATIVE_ARCH% -host_arch=%MARKOV_WINDOWS_NATIVE_ARCH%
if errorlevel 1 exit /b 1
echo MARKOV_WINDOWS_NATIVE_ENVIRONMENT
set
