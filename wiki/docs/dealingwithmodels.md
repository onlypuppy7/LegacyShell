# Dealing with Babylon Models

## Preface

Shell Shockers uses the BabylonJS engine to render the 3D world to the canvas. On the version that LegacyShell uses (3.3.0), Babylon uses it's own model system instead of the sensibler option of using GLBs or something as they do later.

Because it's all getting antiquated, finding working tools isn't as easy as you may think.

## What are .babylon files?

They are horribly unoptimised jsons containing loads of information that could instead be somehow encoded. Nevertheless, the advantage present is that they become very easy to manipulate, especially with JavaScript, so for the purposes of the LegacyShell project we don't intend on switching formats because it allows for things like combining files in conjunction with plugins.

LegacyShell does optimise bandwidth by automatically zipping all the models - resulting in an 80% reduction in file size. While the models still can get big, especially when seeking to import newer items, it greatly helps reduce load on the server and time needed to transfer everything on slow connections.

## How can I open .babylon files?

There isn't a way to natively open .babylon files because they're so proprietary. It's necessary to convert them before being able to import them into Blender or something.

### Method: Using the online viewer/sandbox

[Watch a video tutorial here](https://www.youtube.com/watch?v=vFK03cToTYM)

1. Go to the [BabylonJS sandbox](https://sandbox.babylonjs.com/)  
2. Open your .babylon file
3. Ensure the right hand side panel named "Inspector" is visible
   - If it's not, press the third button from the right on the bottom panel
4. Press the fourth icon in the panel called "Tools"
5. Scroll down to "GLTF EXPORT" and press "Export to GLB"
6. It will now download to your computer

Now that you have a file with actual support, importing should be trivial.

### Where's my colours?

Shell doesn't make much use of textures at all. In fact, it uses vertex colours for 99% of everything.

Make sure you work with vertex colours when painting your model to ensure the best results.

## How can I export .babylon files?

Since .babylon files have long been deprecated, there hasn't been any development on tools for them in the previous few years.

The easiest way is to use Blender.

### What you will need?

You need Blender and the corresponding Blender2Babylon plugin.

You need a specific combination of these, as you can't just mix and match.

In my own testing, the best combination balancing new versions and compatability has been **Blender 3.6.5 and Blender2Babylon 2.93x**.

### Downloading Blender 3.6.5

[From the official Blender binary archives](https://download.blender.org/release/Blender3.6/)

[From archive.org](https://web.archive.org/web/20241119191629/https://download.blender.org/release/Blender3.6/)

### Downloading Blender2Babylon-2.93x.zip

Since this is a little more volatile, these next few links all go to the same file but are from different sources for redundancy's sake.

The plugin should work regardless of OS.

[From the GitHub repo](https://github.com/BabylonJS/BlenderExporter/raw/refs/heads/master/deprecated/Blender2Babylon-2.93x.zip)

[From the specific GitHub commit](https://github.com/BabylonJS/BlenderExporter/raw/ca736b6a310ba2183393763ecb5827a764d181da/deprecated/Blender2Babylon-2.93x.zip)

[From archive.org](https://web.archive.org/web/20241121215931/https://github.com/BabylonJS/BlenderExporter/raw/refs/heads/master/deprecated/Blender2Babylon-2.93x.zip)

[From onlypuppy7's forum](https://forum.onlypuppy7.online/viewtopic.php?p=105036#p105036)

### Adding the plugin

1. On the top bar, go to: Edit > Preferences
2. In preferences, go to: Add-ons > Install...
3. Locate the zip, open it, then check the box next to it to enable it

### Exporting

On the top bar, go to: File > Export > Babylon.js ver 2.93.5

This could take ages, which is normal. Expect it to raise warnings.

## Common Issues

### Where is x? What stuff is in y?

Here is a small table telling you all you need to know:

|File|Contents|Notes|
|-|-|-|
|egg.babylon|Contains the egg model and hats.|Note that by modifying the egg you will break the automatic UV scaler for stamps.<br>I'm sure you realise already that even without this there's a headache to be had regardless.|
|gun_cluck9mm.babylon|Contains all the gun skins for the Cluck9mm.|All of the gun models require no elaboration, really.|
|gun_csg1.babylon|Contains all the gun skins for the CSG1 (Free Ranger).|-|
|gun_dozenGauge.babylon|Contains all the gun skins for the Dozen Gauge (Scrambler).|-|
|gun_eggk47.babylon|Contains all the gun skins for the Eggk47 (Soldier).|-|
|gun_rpegg.babylon|Contains all the gun skins for the RPEGG (Eggsploder).|-|
|items.babylon|Contains all the models for ingame pickups such as ammo and grenades.|-|
|map.babylon|Contains all the models for map blocks.|In this rare instance, simply adding a model here with a correctly formatted name is all that is needed to add a functioning, collidable block to the game.|
|munitions.babylon|Contains the models for the bullet, rocket (from RPEGG) and grenade (model used when thrown).|In short these are the "live" versions of things you can fire.|
|muzzleFlash.babylon|Contains the muzzle flash model.|This is the star shaped white object that you see when firing.|
|reticle.babylon|Contains the reticle model.|It's a little confusing to work out what this does and I haven't put any time into working that out, truthfully.|

### Why is my model not in the right size/position/rotation?

Make sure for each object you've applied transformations in Blender. Do this with Ctrl + A (or Command + A) and select `All Transforms`.