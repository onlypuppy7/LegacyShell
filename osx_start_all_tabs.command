#!/bin/bash

current_dir="$(cd "$(dirname "$0")" && pwd)"

osascript -e "tell application \"Terminal\" to activate" \
    -e "tell application \"System Events\" to tell process \"Terminal\" to keystroke \"t\" using command down" \
    -e "tell application \"Terminal\" to do script \"cd '$current_dir' && source osx_start_client.command\" in last tab of front window"

osascript -e "tell application \"Terminal\" to activate" \
    -e "tell application \"System Events\" to tell process \"Terminal\" to keystroke \"t\" using command down" \
    -e "tell application \"Terminal\" to do script \"cd '$current_dir' && source osx_start_services.command\" in last tab of front window"

osascript -e "tell application \"Terminal\" to activate" \
    -e "tell application \"System Events\" to tell process \"Terminal\" to keystroke \"t\" using command down" \
    -e "tell application \"Terminal\" to do script \"cd '$current_dir' && source osx_start_game.command\" in last tab of front window"