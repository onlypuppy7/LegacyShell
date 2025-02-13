//legacyshell: basic
import { devlog, isClient, isServer } from "#constants";
import { iterateXYZ } from "#loading";
//legacyshell: plugins
import { plugins } from '#plugins';
//

export const MultiplayerMapHost = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (ChristmasEvent)");

        this.plugins = pluginManager;

        this.plugins.on('game:clientOnExtraGameInfo', this.onExtraGameInfoSub.bind(this));
        this.plugins.on('game:modifyMinMap', this.modifyMinMapSub.bind(this));
        this.plugins.on("game:onExtraParams", this.onExtraParamsSub.bind(this));
    },

    onExtraParamsSub(event){
        //test for map

        //TODO: make this load into custom map if condition
        event.extraParams.customMinMap = {"data":{"generic.green-block.full":[{"x":0,"y":1,"z":8,"rx":2,"rz":2},{"x":0,"y":2,"z":8,"rx":2,"rz":2},{"x":1,"y":0,"z":8,"rx":2,"rz":2},{"x":1,"y":3,"z":8,"rx":2,"rz":2},{"x":2,"y":0,"z":8,"rx":2,"rz":2},{"x":2,"y":1,"z":8,"rx":2,"rz":2},{"x":2,"y":2,"z":8,"rx":2,"rz":2},{"x":2,"y":3,"z":8,"rx":2,"rz":2},{"x":4,"y":0,"z":8,"rx":2,"rz":2},{"x":4,"y":1,"z":8,"rx":2,"rz":2},{"x":4,"y":3,"z":8,"rx":2,"rz":2},{"x":5,"y":2,"z":8,"rx":2,"rz":2},{"x":6,"y":0,"z":8,"rx":2,"rz":2},{"x":6,"y":1,"z":8,"rx":2,"rz":2},{"x":6,"y":3,"z":8,"rx":2,"rz":2},{"x":9,"y":0,"z":17,"rx":2,"rz":2},{"x":9,"y":0,"z":18,"rx":2,"rz":2},{"x":9,"y":0,"z":19,"rx":2,"rz":2},{"x":9,"y":0,"z":20,"rx":2,"rz":2},{"x":10,"y":0,"z":17,"rx":2,"rz":2},{"x":10,"y":0,"z":18,"rx":2,"rz":2},{"x":10,"y":0,"z":19,"rx":2,"rz":2},{"x":10,"y":0,"z":20,"rx":2,"rz":2},{"x":11,"y":0,"z":17,"rx":2,"rz":2},{"x":11,"y":0,"z":18,"rx":2,"rz":2},{"x":11,"y":0,"z":19,"rx":2,"rz":2},{"x":11,"y":0,"z":20,"rx":2,"rz":2},{"x":16,"y":0,"z":0,"rx":2,"rz":2},{"x":16,"y":0,"z":2,"rx":2,"rz":2},{"x":16,"y":0,"z":4,"rx":2,"rz":2},{"x":16,"y":0,"z":6,"rx":2,"rz":2},{"x":16,"y":0,"z":7,"rx":2,"rz":2},{"x":16,"y":0,"z":8,"rx":2,"rz":2},{"x":16,"y":0,"z":11,"rx":2,"rz":2},{"x":16,"y":0,"z":14,"rx":2,"rz":2},{"x":16,"y":0,"z":15,"rx":2,"rz":2},{"x":16,"y":0,"z":16,"rx":2,"rz":2},{"x":16,"y":0,"z":18,"rx":2,"rz":2},{"x":16,"y":0,"z":19,"rx":2,"rz":2},{"x":16,"y":0,"z":20,"rx":2,"rz":2},{"x":16,"y":0,"z":22,"rx":2,"rz":2},{"x":16,"y":0,"z":23,"rx":2,"rz":2},{"x":16,"y":1,"z":0,"rx":2,"rz":2},{"x":16,"y":1,"z":2,"rx":2,"rz":2},{"x":16,"y":1,"z":4,"rx":2,"rz":2},{"x":16,"y":1,"z":6,"rx":2,"rz":2},{"x":16,"y":1,"z":8,"rx":2,"rz":2},{"x":16,"y":1,"z":11,"rx":2,"rz":2},{"x":16,"y":1,"z":14,"rx":2,"rz":2},{"x":16,"y":1,"z":15,"rx":2,"rz":2},{"x":16,"y":1,"z":18,"rx":2,"rz":2},{"x":16,"y":1,"z":20,"rx":2,"rz":2},{"x":16,"y":1,"z":23,"rx":2,"rz":2},{"x":16,"y":2,"z":0,"rx":2,"rz":2},{"x":16,"y":2,"z":2,"rx":2,"rz":2},{"x":16,"y":2,"z":4,"rx":2,"rz":2},{"x":16,"y":2,"z":6,"rx":2,"rz":2},{"x":16,"y":2,"z":8,"rx":2,"rz":2},{"x":16,"y":2,"z":11,"rx":2,"rz":2},{"x":16,"y":2,"z":16,"rx":2,"rz":2},{"x":16,"y":2,"z":18,"rx":2,"rz":2},{"x":16,"y":2,"z":20,"rx":2,"rz":2},{"x":16,"y":2,"z":23,"rx":2,"rz":2},{"x":16,"y":3,"z":0,"rx":2,"rz":2},{"x":16,"y":3,"z":1,"rx":2,"rz":2},{"x":16,"y":3,"z":2,"rx":2,"rz":2},{"x":16,"y":3,"z":3,"rx":2,"rz":2},{"x":16,"y":3,"z":4,"rx":2,"rz":2},{"x":16,"y":3,"z":6,"rx":2,"rz":2},{"x":16,"y":3,"z":7,"rx":2,"rz":2},{"x":16,"y":3,"z":8,"rx":2,"rz":2},{"x":16,"y":3,"z":10,"rx":2,"rz":2},{"x":16,"y":3,"z":11,"rx":2,"rz":2},{"x":16,"y":3,"z":12,"rx":2,"rz":2},{"x":16,"y":3,"z":14,"rx":2,"rz":2},{"x":16,"y":3,"z":15,"rx":2,"rz":2},{"x":16,"y":3,"z":16,"rx":2,"rz":2},{"x":16,"y":3,"z":18,"rx":2,"rz":2},{"x":16,"y":3,"z":20,"rx":2,"rz":2},{"x":16,"y":3,"z":22,"rx":2,"rz":2},{"x":16,"y":3,"z":23,"rx":2,"rz":2}],"SPECIAL.spawn-red.none":[{"x":10,"y":1,"z":18,"rx":2,"rz":2}],"SPECIAL.spawn-blue.none":[{"x":10,"y":1,"z":19,"rx":2,"rz":2}]},"fileVersion":1,"sun":{"direction":{"x":0.2,"y":1,"z":-0.3},"color":"#FFFFFF"},"ambient":"#000000","fog":{"density":0.01,"color":"#33334C"},"palette":["generic.green-block.full","SPECIAL.spawn-red.none","SPECIAL.spawn-blue.none","town.shop2.full","town.shop4.full","castle.brick-arch-side.aabb","town.shop3.full","generic.plain-angle-ceiling.iwedge","raceline.topside-02.aabb","scifi.roof.wedge"],"render":{"pointLightIntensity":0.5},"width":17,"height":4,"depth":24,"name":"","surfaceArea":45,"extents":{"x":{"max":30,"min":14},"y":{"max":3,"min":0},"z":{"max":27,"min":4},"width":17,"height":4,"depth":24,"bgm":"undefined","maxJumps":"1"},"skybox":"default","modes":{"FFA":true,"Teams":true,"Scale":true,"Hiroshima":true,"Parkour":true},"availability":"both","numPlayers":"18"};
    },

    onExtraGameInfoSub(event) {
    },

    modifyMinMapSub(event) {
    },
};

if (isClient) MultiplayerMapHost.registerListeners(plugins);
