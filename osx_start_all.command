#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

osascript -e "tell application \"Terminal\" to do script \"$SCRIPT_DIR/osx_start_services.command\""
osascript -e "tell application \"Terminal\" to do script \"$SCRIPT_DIR/osx_start_game.command\""
osascript -e "tell application \"Terminal\" to do script \"$SCRIPT_DIR/osx_start_client.command\""
