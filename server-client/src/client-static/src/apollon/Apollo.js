//sound system for LegacyShell

//https://github.com/goldfire/howler.js
//https://howlerjs.com
import { TransformNode, Vector3 } from "babylonjs";
import { Howl, Howler } from "howler";

//this needs to be manually updated.
const APOLLO_VERSION = 9;

//why did I make it used a custom logging system you may ask? It's
//art, so it's open for interpretation :joe_cool:
const APOLLO_LOG = devmode;

const APOLLO_GLOBAL_PANNER_ATTRB =
  /*= {
  panningModel: 'HRTF',
  refDistance: 0.8,
  rolloffFactor: 2.5,
  distanceModel: 'exponential'
};
*/
  {
    distanceModel: "exponential",
    rolloffFactor: 1,
    maxDistance: 100,
    refDistance: 1,
  };

/**
 * array of forbidden sound names. Checked in setSound().
 * format is sound: message
 */
const APOLLO_FORBIDDEN = {
  "": "blank name. Most likely a mistake.",
  reserved:
    "RESERVED should play fallback to indicate failure. Used by SoundCues before a sound has been loaded.",
};

/**
 * list of sounds that have been loaded in.
 * @type {Howl{}}
 */
const sounds = {};
const APOLLO_EMERGENCY_FALLBACK_SOUND = new Howl({
  src: "sound/fallBack.mp3",
  onload: function () {
    if (APOLLO_LOG) console.log("APOLLO: fallback loaded!");
  },
}); //if this doesn't load, all hope is lost...

/**
 * just an interface for Howler.volume. If 0, sound is muted automatically. No need to suspend the sound engine
 * @param {number} vol - the new volume, from 0-1 afaik
 */
function apolloSetVolume(vol) {
  if (APOLLO_LOG)
    console.log(`APOLLO: setting Howler volume to ${vol}, as requested.`);
  Howler.volume(vol);
}

/**
 * stops all sounds. This is a wrapper for Howler.stop().
 * @returns {void}
 * @example stopAllSounds();
*/
stopAllSounds = function () {
  Howler.stop();
};

/**
 * loads a sound from a given source and saves it under the given name.
 * @param {String} src - the source of the media.
 * @param {String} name - the name of the sound.
 */
function loadSound(src, name, onLoadingComplete) {
  if (APOLLO_LOG)
    console.log(`APOLLO: loadSound() called for ${name} via ${src} `);
  const loadTimeout = setTimeout(() => {
    console.warn(
      `APOLLO: loadSound() called for ${name}, but the sound did not load in time!`,
    );
    onLoadingComplete();
  }, 5e3);
  const onload = (err) => {
    if (!err) devlog(`APOLLO: sound ${name} loaded!`);
    clearTimeout(loadTimeout);
    onLoadingComplete();
  };
  let snd = new Howl({ src, onload: ()=>{
    setSound(name, snd);
    onload();
  }, onloaderror: (err, err2)=>{
    devlog(`APOLLO: sound ${name} failed to load!`, err, err2);
    if (src.split(".").pop() == "mp3") {
      devlog("APOLLO: trying to load ogg instead for sound", name);
      clearTimeout(loadTimeout);
      loadSound(src.replace("mp3", "ogg"), name, onLoadingComplete);
    } else {
      onload(err2);
    };
  }}); //create howl object
}

/**
 * set a sound. This includes the warns and errors for overwriting.
 * @param {String} name - name of the sound
 * @param {Howl} val - the new value. Can be Cue too!
 */
function setSound(name, val) {
  if (APOLLO_FORBIDDEN[name.toLowerCase()])
    console.error(
      `APOLLO: trying to set a forbidden sound ${name}! (${APOLLO_FORBIDDEN[name.toLowerCase()]})`,
    ); //yk what? let's continue anyway. We said that unintended behavior might be bc of this, and devs are notified about doing a bad bad
  if (sounds[name]) {
    console.warn(
      `APOLLO: setSound() called for ${name}, but sound ${name} already exists. Sound will be overwritten!`,
    );
    sounds[name].unload(); //unload to prevent possible memory leak
  }
  sounds[name] = val;
}

/**
* loads an audio cue based on an array of sound source locations
* @param {String} name - the name this cue is stored in
* @param {Array} srcs - the source paths (as Strings)
*/
function loadCue(name, srcs) {
  if (APOLLO_LOG)
    console.log(`APOLLO: loadCue() called for ${name} via ${srcs} `);
  const cue = new Cue(name, srcs);
  setSound(name, cue);
}

//wait there is @example? Cool!
/**
 * loads a list of sounds from a given list.
 * @param {Array} list - the list of sounds to load. each entry should be an array with the first element being the source and the second being the name.
 * @param {Function} onComplete - the function to call when all sounds have been loaded.
 * @returns {void}
 * @example loadSoundsFromList([["sound/1.mp3", "sound1"], ["sound/2.mp3", "sound2"]], () => console.log("all sounds loaded!"));
 */
function loadSoundsFromList(list, onComplete) { //i hate this formatting, delete the code NOW or I will kill you
  var loadsComplete = 0;

  devlog("apollo loadSoundsFromList", list.length, list);

  function catComplete() {
    loadsComplete++
    devlog("apollo catcomplete", loadsComplete, list.length);
    if (list.length == loadsComplete) {
      onComplete();
    };
  }

  for (var i = 0; i < list.length; i++) {
    var sound = list[i];
    loadSound(sound[0], sound[1], catComplete);
  }
}

/**
 * safe way of getting Howl object from the sounds storage. Will return fallback if the sound does not exist.
 * @param {String} name - the name of the desired sound.
 * @returns {Howl} the sound, or the fallback sound.
 */
function getSound(name) {
  let sName = name;
  if (!sounds[sName]) {
    console.error(
      `APOLLO: getSound() called for ${sName}, but ${sName} does not exist! Returning fallback...`,
    );
    return APOLLO_EMERGENCY_FALLBACK_SOUND;
  }
  if (sounds[sName] instanceof Cue) sName = sounds[sName].getSound();
  return sounds[sName];
}

/**
 * the sound's location will get multiplied by these vars. Negate for panning changes. Testing only!
 */
window.APOLLO_MULTIPLIERS = [-1, -1, -1];

/**
 *
 * @param {Vector3} vec - the vec that should be translated
 * @returns the translated "vector" (only x, y, z properties!)
 */
function translateVec(vec) {
  return {
    x: APOLLO_MULTIPLIERS[0] * vec.x,
    y: APOLLO_MULTIPLIERS[1] * vec.y,
    z: APOLLO_MULTIPLIERS[2] * vec.z,
  };
}

/**
 * a SoundInstance represents a currently playing sound.
 */
class SoundInstance {
  //is this class unneccesary? Kinda. Would it be less clean without it? ye, kinda.
  /**
   * @type {Howl}
   */
  howl;
  /**
   * @type {number}
   */
  id; //prob isnt even a String but WHO CARES!!!
  constructor(howl, id) {
    this.howl = howl;
    this.id = id;
  }
}

/**
 * update the position from where sounds are being heard. Bound to cam in shellshock.min.js.
 * @param {Vector3} newPos - the position to set the listener position to. AUTOMATICALLY ADAPTED TO HOWLER'S COORDINATE SYSTEM!
 * @param {Vector3} newRotFront - the new forward vector
 * @param {Vector3} newRotUp - the new up vector
 */
function updateListener(newPos, newRotFront, newRotUp) {
  const p2 = translateVec(newPos);
  Howler.pos(p2.x, p2.y, p2.z);
  Howler.orientation(
    newRotFront.x,
    newRotFront.y,
    newRotFront.z,
    newRotUp.x,
    newRotUp.y,
    newRotUp.z,
  );
}

/**
 * plays a sound independent from an emitter, at a fixed pos.
 * @param {String} name - name of the sound whose play is desired.
 * @param {Vector3} pos - position of the sound's playback. AUTOMATICALLY ADAPTED TO HOWLER'S COORDINATE SYSTEM!
 */
function playSoundIndependent(name, params = {}) {
  const { pos, rate, loop, vol } = params;
  const p2 = translateVec(pos);
  if (loop) {
    sound._loop = loop;
    sound.loop();
  };
  const sound = getSound(name);
  const id = sound.play();
  sound.volume(vol, id);
  sound.pannerAttr(APOLLO_GLOBAL_PANNER_ATTRB, id);
  sound.pos(p2.x, p2.y, p2.z, id);
  if (rate) sound.rate(rate, id);
  return sound;
}

/**
 * plays a sound independent from an emitter, 2D.
 * @param {String} name - name of the sound whose play is desired.
 */
function playSoundIndependent2D(name, params = {}) {
  const { pos, rate, loop, vol } = params;
  const sound = getSound(name);
  if (loop) {
    sound._loop = loop;
    sound.loop();
  };
  const id = sound.play();
  sound.volume(vol, id);
  if (rate) sound.rate(rate, id); //repeated code is am making me angry
  return sound;
}

/**
emitters can be imagined like a loudspeaker. They play sounds at their location with their set parameters.
*/
class Emitter {
  /**
   * all Emitters that have been created.
   * @type {Emitter[]}
   */
  static activeEmitters = [];

  /**
   * the parent of this Emitter. The sound will follow it.
   *@type {TransformNode}
   */
  parent;
  /**
   * @type {boolean}
   */
  is2D;
  /**
   * @type {number}
   */
  emitterVolume;
  /**
   * @type {SoundInstance[]}
   */
  //playingSounds;

  /**
   * creates a new Emitter and attaches it to a given TransformNode.
   * @param {TransformNode} parent - the parent of this Emitter. The sound will follow it. Note: BABYLON.Mesh inherites from BABYLON.TransformNode.
   */
  constructor(parent) {
    Emitter.activeEmitters.push(this);
    this.parent = parent;
    this.is2D = !parent;
    this.emitterVolume = 1;
    this.playingSounds = [];
    //sub to render update bab thing
    if (this.parent && !this.is2D && this.parent.onBeforeRenderObservable) {
      //man I dont even care if this.parent.onBeforeRenderObservable doesnt exist just fuck you. FUCK YOU. !!
      this.parent.onBeforeRenderObservable.add(this.update.bind(this));
    }
    if (APOLLO_LOG) console.log(`APOLLO: Emitter created, is2d: ${this.is2D}`);
  }

  /**
   * @deprecated
   */
  static updateAll() {
    this.activeEmitters.forEach((em) => {
      em.update();
    });
  }

  /**
   * plays a sound on this emitter.
   * @param {String} name - the name of the sound.
   */
  play(name, rate) {
    const sound = getSound(name);
    const id = sound.play();
    const instance = new SoundInstance(sound, id);
    this.playingSounds.push(instance);
    sound.on("end", this.#onSoundEnd.bind(this), id);
    this.#instanceSyncWithMaster(instance);
    if (rate) sound.rate(rate, instance.id);
    sound.volume(this.emitterVolume, id);
    sound.pannerAttr(APOLLO_GLOBAL_PANNER_ATTRB, instance.id);
  }

  /**
   * syncs a given instance's position with that of this Emitter's master (parent).
   * @param {SoundInstance} inst - the instance to sync.
   */
  #instanceSyncWithMaster(inst) {
    if (!inst || !inst.howl) return;
    if (this.is2D) {
      inst.howl.stereo(0, inst.id);
      inst.howl.pannerAttr(
        {
          panningModel: "HRTF",
          distanceModel: "linear",
          refDistance: 1,
          maxDistance: 1,
        },
        inst.id,
      );
      //FIXME:? this is a hack! Is it?
      //this isn't a hack, this is a sin, but I'm keeping it anyway
    }
    if (!this.parent) return;
    /**@type {Vector3} */
    const nP = this.parent.getAbsolutePosition();
    const p2 = translateVec(nP);
    inst.howl.pos(p2.x, p2.y, p2.z, inst.id);
  }

  /**
   *internal func to handle sound end, removes the instance.
   *@param {String} id - called by the howl, id of the stopped sound.
   */
  #onSoundEnd(id) {
    this.#removeInstanceById(id);
  }

  /**
   * removes a sound instance from this emitter's tracked instances based on ID
   * @param {number} id - the id of the emitter to remove
   */
  #removeInstanceById(id) {
    this.playingSounds.forEach((snd) => {
      if (snd.id === id) {
        this.playingSounds.splice(this.playingSounds.indexOf(snd), 1);
      }
    });
    if (APOLLO_LOG)
      console.log(
        `APOLLO: after removeInstanceById (called with param ${id}): new array: ${this.playingSounds} (${this.playingSounds.length})`,
      );
  }

  /**
   * update the currently playing sound's positions.
   */
  update() {
    this.playingSounds.forEach((inst) => {
      if (!inst.howl.playing(inst.id)) {
        this.#removeInstanceById(inst.id);
        return;
      }
      this.#instanceSyncWithMaster(inst);
    });
  }
}

/**
 * a Cue is a collection of multiple sounds. Playing an object of this class will play a sound from its collection. What sound should be played is chosen by the selectSound function. Default is random.
 * all of a cue's sounds are placed in CUES.${this.name}.${index}.
 */
class Cue {
  /**
   * the names of this object's sounds.
   * @type {String[]}
   */
  sounds = [];
  name = "DEFAULTCUENAME";
  //isCue = true; //ye this might not be the cleanest way to do this but it works..
  //UPDATE (10. 12. 24): I couldn't take it anymore. Replaced with instanceof. Let's hope this doesnt break anything else.... ˜Sq

  /**
  * creates the Cue and loads all its sounds
  * @param {String} name - the name of the cue
  * @param {Array} srcs - String array of the source paths
  */
  constructor(name, srcs) {
    this.name = name;
    if (srcs) srcs.forEach((src) => this.addSound(src));
  }

  /**
  * this can be overwritten by the user to create custom/dynamic sound behavior. Default returns random sound
  * @returns the selected sound
  */
  selectSound = function () {
    return this.sounds[Math.floor(Math.random() * this.sounds.length)];
  };

  /**
   * adds a sound to this cue. Will load it too.
   * @param {String} src -  the source url of the desired sound.
   */
  addSound(src) {
    const index = this.sounds.length;
    this.sounds[index] = "RESERVED"; //reserve the index. Prob not needed but MAYBE for async stuff
    const sName = `CUE.${this.name}.${index}`;
    const that = this;
    loadSound(src, sName, function () {
      that.sounds[index] = sName;
    });
  }

  /**
   * gets the sound selected by the funtion. DO NOT OVERRIDE THIS FUNCTION FOR CUSTOM SELECTION, OVERWRITE selectSound.
   * @returns {String} the selected sound name.
   */
  getSound() {
    if (this.sounds.length < 1) {
      console.error(
        `APOLLO: getSound() called on a sound cue, but queue is empty! Returning fallback...`,
      );
      return ""; //fallbac
    }
    if (!this.selectSound) {
      console.warn(
        `APOLLO: a sound cue does not have a selectSound function, returning elem 0.`,
      );
      return this.sounds[0];
    }
    return this.selectSound();
  }
}

console.log(`APOLLO: Welcome to Apollo v${APOLLO_VERSION}!`);
