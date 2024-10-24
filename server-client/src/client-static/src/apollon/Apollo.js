//sound system for LegacyShell

//so, quick TLDR on what needs to be done/not done or how stuff works
//FIXME: test the new attachment way.

//https://github.com/goldfire/howler.js
//https://howlerjs.com
import { TransformNode, Vector3 } from "babylonjs";
import { Howl, Howler } from "howler";


const APOLLO_LOG = true;
/**
 * list of sounds that have been loaded in.
 * @type {Howl{}}
 */
const sounds = {};
const APOLLO_EMERGENCY_FALLBACK_SOUND = new Howl({
  src: "https://github.com/TheRealSeq/Media/raw/50fd01317c6740c76d610a7f544a3f9c353777e8/Apollo/fallBack.mp3",
  //volume: 0,
  spatial: true,
  onload: function () { if (APOLLO_LOG) console.log("APOLLO: fallback loaded!"); }
}); //if this doesn't load, all hope is lost...

/**
 * loads a sound from a given source and saves it under the given name.
 * @param {String} src - the source of the media.
 * @param {String} name - the name of the sound.
 */
function loadSound(src, name) {
  let snd = new Howl({ src, volume: 0 }); //create howl object
  if (sounds[name])
    console.warn(
      `APOLLO: loadSound() called for ${name}, but sound ${name} already exists. Sound will be overwritten!`,
    );
  sounds[name] = snd;
}

/**
 * safe way of getting Howl object from the sounds storage. Will return fallback if the sound does not exist.
 * @param {String} name - the name of the desired sound.
 * @returns {Howl} the sound, or the fallback sound.
 */
function getSound(name) {
  if (!sounds[name]) {
    console.error(
      `APOLLO: getSound() called for ${name}, but ${name} does not exist! Returning fallback...`,
    );
    return APOLLO_EMERGENCY_FALLBACK_SOUND;
  }
  return sounds[name];
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
   * @type {String}
   */
  id; //prob isnt even a String but WHO CARES!!!
  constructor(howl, id) {
    this.howl = howl;
    this.id = id;
  }
}

function apolloTest(){
  // Create a Howl object with spatial properties
          var sound = new Howl({
              src: ['https://github.com/TheRealSeq/Media/raw/50fd01317c6740c76d610a7f544a3f9c353777e8/Apollo/fallBack.mp3'],
              html5: true,  // Use HTML5 Audio for better streaming
              volume: 1.0,
              loop: false,
              preload: true,
              // Add spatial plugin settings
              sprite: {
                  start: [0, 5000] // Play first 5 seconds as an example
              },
              onload: function() {
                  console.log('Sound loaded successfully.');
                  playWithSpatialSettings();
              },
              onplay: function() {
                  console.log('Sound is now playing.');
              },
              onend: function() {
                  console.log('Sound has finished playing.');
              }
          });

          // Function to play sound with different spatial settings
          function playWithSpatialSettings() {
              // Test 1: Normal playback (no spatial effect)
              console.log('Test 1: Playing sound normally.');
              sound.play('start');

              setTimeout(function() {
                  // Test 2: Spatial effect - sound positioned to the left
                  console.log('Test 2: Playing sound with spatial effect (left).');
                  sound.pos(-1, 0, 0); // Position sound to the left
                  sound.play('start');
              }, 6000); // Wait for 6 seconds before next test

              setTimeout(function() {
                  // Test 3: Spatial effect - sound positioned to the right
                  console.log('Test 3: Playing sound with spatial effect (right).');
                  sound.pos(1, 0, 0); // Position sound to the right
                  sound.play('start');
              }, 12000); // Wait for another 6 seconds

              setTimeout(function() {
                  // Test 4: Spatial effect - sound positioned behind
                  console.log('Test 4: Playing sound with spatial effect (behind).');
                  sound.pos(0, 0, -1); // Position sound behind
                  sound.play('start');
              }, 18000);
          }
}
window.apolloTest = apolloTest;

/**
* update the position from where sounds are being heard. Bound to cam in shellshock.min.js.
* @param {Vector3} newPos - the position to set the listener position to.
*/
function updateListener(newPos){
  Howler.pos(newPos.x, newPos.y, newPos.z);
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

    //console.log("emitter parent:");
    //console.log(this.parent);

    //sub to render update bab thing
    if (this.parent) {
      this.parent.onBeforeRenderObservable.add(this.update.bind(this));
    }
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
  play(name) {
    const sound = getSound(name);
    const id = sound.play();
    const instance = new SoundInstance(sound, id);
    this.playingSounds.push(instance);
    sound.on("end", this.#onSoundEnd.bind(this), id);
    //console.log(this.playingSounds.bind(this));
    //sound.pos(Howler.pos-1, Howler.pos, Howler.pos);
    this.#instanceSyncWithMaster(instance);
    sound.volume(1, id);
    sound.pannerAttr({
            panningModel: 'HRTF',
            refDistance: 0.8,
            rolloffFactor: 2.5,
            distanceModel: 'exponential'
          }, instance.id);
    //FIXME: this might cause problems...
  }

  /**
   * syncs a given instance's position with that of this Emitter's master (parent).
   * @param {SoundInstance} inst - the instance to sync.
   */
  #instanceSyncWithMaster(inst) {
    if (this.is2D || !this.parent || !inst ||!inst.howl) return;
    /**@type {Vector3} */
    const nP = this.parent.getAbsolutePosition();
    //console.log("playing sound at the following pos:");
    //console.log(nP);
    inst.howl.pos(nP.x, nP.y, nP.z, inst.id);
    //inst.howl.pos = [nP.x, nP.y, nP.z];
    //console.log(inst.howl.pos(inst.id));
    //FIXME: this will likely break, bc Babs coord system does not seem to mach howler's. (z forward/backward wrong). Want to fix that once I get to actually hear it though
  }

  /**
   *internal func to handle sound end, removes the instance.
   *@param {String} id - called by the howl, id of the stopped sound.
   */
  #onSoundEnd(id) {
    console.log(this.playingSounds);
    this.playingSounds.forEach((snd) => {
      if (snd.id === id) {
        this.playingSounds.splice(
          this.playingSounds.indexOf(snd),
          1,
        );
      }
    });
  }

  /**
   * update the currently playing sound's positions.
   */
  update() {
    this.playingSounds.forEach((inst) => {
      if (!inst.howl.playing(inst.id)) return;
      this.#instanceSyncWithMaster(inst);
    });
  }
}
