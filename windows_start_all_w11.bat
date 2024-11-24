@echo off
timeout 1
wt -w 0 -d . cmd /k windows_start_client.bat
timeout 1
wt -w 0 -d . cmd /k windows_start_services.bat
timeout 1
wt -w 0 -d . cmd /k windows_start_game.bat