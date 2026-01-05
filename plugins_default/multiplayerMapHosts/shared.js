//legacyshell: basic
import { devlog, isClient, isServer, isEditor } from "#constants";
import { iterateXYZ } from "#loading";
import Comm from '#comm';
//legacyshell: plugins
import { plugins } from '#plugins';
//

export const MultiplayerMapHost = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (MultiplayerMapHost)");

        this.plugins = pluginManager;

        this.plugins.on("game:onExtraParams", this.onExtraParams.bind(this));
        this.plugins.on("game:onResourcesLoadedEnd", this.onResourcesLoadedEnd.bind(this));

        // this.plugins.on('game:clientOnExtraGameInfo', this.onExtraGameInfoSub.bind(this));
        // this.plugins.on('game:modifyMinMap', this.modifyMinMapSub.bind(this));

        if (isEditor) {
            document.addEventListener("DOMContentLoaded", () => { //arrow functions my beloved
                extern.testMapOnline = this.testMapOnline;
                this.addTestButton();
                this.addSelectionDialog();
            });
        };
    },

    onExtraParams(data){
        //test for map

        if (this.yepDoACustomMap) {
            this.yepDoACustomMap = false;
            autoInvite = true;
            joinType = Comm.Code.createPrivateGame;

            try {
                notify("Sending custom map...");
                data.extraParams.customMinMap = JSON.parse(localStorage.getItem("mapBackup"));
                console.log("derived custom minMap from localStorage, lets hope the best for the server!!");
            } catch (error) {
                console.error("unrecognised map:", localStorage.getItem("mapBackup"));
            };
        };
    },

    addSelectionDialog(){
      const dialog = document.createElement("div");
      dialog.id = "multiTestGMSelect";
      dialog.className = "dialog box";
      //heading
      const title = document.createElement("h1");
      title.textContent = "Select gamemode for multiplayer testing";
      dialog.appendChild(title);
      //buttons
      const buttonDiv = document.createElement("div");
      dialog.appendChild(buttonDiv);

      const types = Object.keys(GameType);
      for(let type of types){
        const button = document.createElement("button");
        button.textContent = type;
        button.onclick = function(){
          saveToLocal();
          window.open(location.origin+"/?testMapOnline="+type, "_blank");
        };
        buttonDiv.appendChild(button);
      }

      dialog.appendChild(document.createElement("hr"));
      //close button
      const closeButton = document.createElement("button");
      closeButton.textContent = "cancel";
      closeButton.onclick = function(){
        extern.closeDialog("multiTestGMSelect");
      };
      dialog.appendChild(closeButton);

      document.body.appendChild(dialog);
    },

    addTestButton() {
        const testButton = document.getElementById("test");

        const testOnlineButton = document.createElement("span");
        testOnlineButton.className = "button";
        testOnlineButton.id = "testOnline";
        testOnlineButton.textContent = "Test ONLINE";
        testOnlineButton.title = "Opens map in online multiplayer match game (fixed for Legacy)";
        testOnlineButton.style.marginLeft = "3px";
        testOnlineButton.style.fontWeight = "bold";
        testOnlineButton.onclick = function () {
            extern.testMapOnline();
        };

        testButton.insertAdjacentElement("afterend", testOnlineButton);

        //yoohoo! look at me! look!
        testOnlineButton.style.border = "dashed";
        testOnlineButton.style.borderWidth = "1.5px";
        testOnlineButton.style.borderColor = "darkgray";
    },

    testMapOnline() {
        console.log("woah, online testing, woaahhhh, but now fancy!");
        extern.openDialog("multiTestGMSelect");
        return;

        const types = Object.keys(GameType);

        const gameType = prompt("Type in the mode to play in: " + types, "ffa");

        let selected = "ffa";

        if (types.includes(gameType)) selected = gameType;
        else {
            for (const type of types) {
                if (type.startsWith(gameType)) {
                    selected = type;
                    break;
                };
            };
        };

        saveToLocal();
        window.open(location.origin+"/?testMapOnline="+selected, "_blank");
    },

    onResourcesLoadedEnd() {
        const selectedGameType = parsedUrl?.query?.testMapOnline;

        if (selectedGameType) {
            gameType = GameType[selectedGameType];

            this.yepDoACustomMap = true; //basically, yep do a custom map

            joinType = Comm.Code.createPrivateGame;
            play();
        };
    },

    /*
    //former logic: set this.useCustomMinMap
    onExtraGameInfoSub(event) {},

    //former logic: setting minMap on the client
    modifyMinMapSub(event) {},
    */
};

if (isClient) MultiplayerMapHost.registerListeners(plugins);
