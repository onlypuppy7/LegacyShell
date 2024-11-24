# Rough Shell Shockers Map History

## Randomly Genned Era

This era spans from the first release to the beginning of the [manually created era](#manually-created-era). Ie, before the map editor was made.

In the beginning, maps were just made via random number generators. Within early code there are functions for map generators that create based off of an initial seed. So either the maps themselves were baked into the code like they are in the [manually created era](#manually-created-era), or the seeds were bundled into the code, or the server sent the seed to the clients.

If it was determined by the server, then the preservation of these maps would be particuluary difficult due to the fact that there wasn't anything defined really in circulation. What I mean by this is that it would cause all the different maps found in videos to just have been temporary for that room and thus making it impossible to say that any one seed has particular importance.

Due to archiving for this era being practically non-existent save for some [YouTube videos](./updatestimeline.md), it's hard to determine how exactly the distribution of maps was achieved.

Since telling these maps apart isn't easy, the best way to ID them is to compare their corners. They usually contain fairly telling structures which act as their fingerprint.

### 0.0.4 - Flat + Crates

When the game launched, maps were nothing more than flat expanses with some piles of crates and stairs facilitating movement.

The following two screenshots are taken from different videos uploaded on [5 Sept 2017](https://www.youtube.com/watch?v=9YIXgrjLIXk) and [6 Sept 2017](https://www.youtube.com/watch?v=RV3A8cGYFgQ). As you can see, the map being played on is identical, supporting the idea that the first map ever was definitely defined somewhere, whether it was an actual json or just a seed.

<center>
<img src="./NEW IO GAME! Shell Shockers GAMEPLAY - World Record 85 Kills! 0-18 screenshot.png" alt="NEW IO GAME! Shell Shockers GAMEPLAY - World Record 85 Kills! 0-18 screenshot" width="40%">
<img src="./SHELL SHOCKERS 8-23 screenshot.png" alt="SHELL SHOCKERS 8-23 screenshot" width="40%">

*Note the blue Г shape on the left.*
</center>

Interestingly, the colours of the crates appears to change across videos, despite this the layout seems consistent.

<center>
<img src="./NEW IO GAME! Shell Shockers GAMEPLAY - World Record 85 Kills! 6-21 screenshot.png" alt="NEW IO GAME! Shell Shockers GAMEPLAY - World Record 85 Kills! 6-21 screenshot" width="40%">
<img src="./LIVE _ ShellShockers Gameplay NEW IO GAME ( Like Gats.io but 3D) 2-53 screenshot.png" alt="LIVE _ ShellShockers Gameplay NEW IO GAME ( Like Gats.io but 3D) 2-53 screenshot" width="40%">

*Here the green becomes blue and vice versa. Orange crates are unaffected, likely just due to chance.*
</center>

This could be explained by the fact that the oldest map jsons contained an attribute for decoration, of which the crates were part of. They may have simply just been shuffled every time the map was loaded.

```js
t.data[o][s][p].cat || c++, t.data[o][s][p] = l ? {
    cat: 1,
    dec: 4,
    dir: Math.seededRandomInt(0, 4)
} : s % 2 == 0 ? {
```
<center>

*Code taken from 0.9.0's js.*

</center>

Here are more screenshots showing the layout of this map. This map is featured in videos which document 0.0.4.

<center>
<img src="./NEW IO GAME! Shell Shockers GAMEPLAY - World Record 85 Kills! 6-22 screenshot.png" alt="NEW IO GAME! Shell Shockers GAMEPLAY - World Record 85 Kills! 6-22 screenshot" width="40%">
<img src="./NEW IO GAME! Shell Shockers GAMEPLAY - World Record 85 Kills! 1-58 screenshot.png" alt="NEW IO GAME! Shell Shockers GAMEPLAY - World Record 85 Kills! 1-58 screenshot" width="40%">

<img src="./NEW IO GAME! Shell Shockers GAMEPLAY - World Record 85 Kills! 6-56 screenshot.png" alt="NEW IO GAME! Shell Shockers GAMEPLAY - World Record 85 Kills! 6-56 screenshot" width="40%">
<img src="./LIVE _ ShellShockers Gameplay NEW IO GAME ( Like Gats.io but 3D) 4-0 screenshot.png" alt="LIVE _ ShellShockers Gameplay NEW IO GAME ( Like Gats.io but 3D) 4-0 screenshot" width="40%">

<img src="./NEW IO GAME! Shell Shockers GAMEPLAY - World Record 85 Kills! 6-48 screenshot.png" alt="NEW IO GAME! Shell Shockers GAMEPLAY - World Record 85 Kills! 6-48 screenshot" width="40%">
<img src="./Shell Shockers Game Walkthrough _ Shooting Games 0-12 screenshot.png" alt="Shell Shockers Game Walkthrough _ Shooting Games 0-12 screenshot" width="40%">

<img src="./Shell Shockers Game Walkthrough _ Shooting Games 3-47 screenshot.png" alt="Shell Shockers Game Walkthrough _ Shooting Games 3-47 screenshot" width="40%">
<img src="./Shell Shockers Game Walkthrough _ Shooting Games 4-13 screenshot.png" alt="Shell Shockers Game Walkthrough _ Shooting Games 4-13 screenshot" width="40%">
</center>


### 0.1.0 - Flat + Crates

With 0.1.0 came a new map, which is probably from the exact same generator just with a different seed. This map is only seen in one video, which was a livestream.

<center>
<img src="./LIVE _ ShellShockers_ShellShock.io New Update! 18-28 screenshot.png" alt="LIVE _ ShellShockers_ShellShock.io New Update! 18-28 screenshot" width="40%">
<img src="./LIVE _ ShellShockers_ShellShock.io New Update! 18-29 screenshot.png" alt="LIVE _ ShellShockers_ShellShock.io New Update! 18-29 screenshot" width="40%">

*One identifiable feature is the big obelisk in the corner of the map.*

<img src="./LIVE _ ShellShockers_ShellShock.io New Update! 18-33 screenshot.png" alt="LIVE _ ShellShockers_ShellShock.io New Update! 18-33 screenshot" width="40%">
<img src="./LIVE _ ShellShockers_ShellShock.io New Update! 18-34 screenshot.png" alt="LIVE _ ShellShockers_ShellShock.io New Update! 18-34 screenshot" width="40%">

*Another is this 1x3 section.*
</center>

More screenshots.
<center>
<img src="./LIVE _ ShellShockers_ShellShock.io New Update! 18-9 screenshot.png" alt="LIVE _ ShellShockers_ShellShock.io New Update! 18-9 screenshot" width="40%">
<img src="./LIVE _ ShellShockers_ShellShock.io New Update! 18-23 screenshot.png" alt="LIVE _ ShellShockers_ShellShock.io New Update! 18-23 screenshot" width="40%">

<img src="./LIVE _ ShellShockers_ShellShock.io New Update! 18-38 screenshot.png" alt="LIVE _ ShellShockers_ShellShock.io New Update! 18-38 screenshot" width="40%">
<img src="./LIVE _ ShellShockers_ShellShock.io New Update! 18-49 screenshot.png" alt="LIVE _ ShellShockers_ShellShock.io New Update! 18-49 screenshot" width="40%">
</center>

### 0.1.2 - Flat + Crates

This map is seen in several videos, from [10 Sept 2017](https://youtu.be/4XhxtmXu2Gc) to [14 Sept 2017](https://www.youtube.com/watch?v=Fl5v2SwZPy0).

<center>
<img src="./NEW IO GAME ! Shellshock.io - NEW WORLD RECORD 94 KILLS!! STRAIGHT! 1-32 screenshot.png" alt="NEW IO GAME ! Shellshock.io - NEW WORLD RECORD 94 KILLS!! STRAIGHT! 1-32 screenshot" width="40%">
<img src="./Shellshockers io Funny Moments 1-2 screenshot.png" alt="Shellshockers io Funny Moments 1-2 screenshot" width="40%">

*Clearly the layout is identical.*

<img src="./ShellShock.io Gameplay ! 136 Kills NEW WORLD RECORD! 0-6 screenshot.png" alt="ShellShock.io Gameplay ! 136 Kills NEW WORLD RECORD! 0-6 screenshot" width="40%">
<img src="./ShellShock.io Gameplay ! 136 Kills NEW WORLD RECORD! 6-27 screenshot.png" alt="ShellShock.io Gameplay ! 136 Kills NEW WORLD RECORD! 6-27 screenshot" width="40%">

<img src="./ShellShock.io Gameplay ! 136 Kills NEW WORLD RECORD! 1-9 screenshot.png" alt="ShellShock.io Gameplay ! 136 Kills NEW WORLD RECORD! 1-9 screenshot" width="40%">
<img src="./ShellShock.io Gameplay ! 136 Kills NEW WORLD RECORD! 0-31 screenshot.png" alt="ShellShock.io Gameplay ! 136 Kills NEW WORLD RECORD! 0-31 screenshot" width="40%">

*[The 4 corners of the map](https://www.youtube.com/watch?v=Fl5v2SwZPy0).*
</center>

### 0.2.0 - Flat + Crates

This is a map that appeared in 0.2.0, due to the video being short there isn't much available to ID it.

<center>
<img src="./Shellshock.io _ SOY UN HUEVO EN SERIE! 0-13 screenshot.png" alt="Shellshock.io _ SOY UN HUEVO EN SERIE! 0-13 screenshot" width="40%">
<img src="./Shellshock.io _ SOY UN HUEVO EN SERIE! 0-4 screenshot.png" alt="Shellshock.io _ SOY UN HUEVO EN SERIE! 0-4 screenshot" width="40%">

*[1 and a half corners of the map](https://www.youtube.com/watch?v=jWOLQNVGu3I).*
</center>

### 0.2.0? - Flat + Crates

This video doesn't have a confirmed version.

<center>
<img src="./MEJORES JUEGOS .IO 3-13 screenshot.png" alt="MEJORES JUEGOS .IO 3-13 screenshot" width="40%">
<img src="./MEJORES JUEGOS .IO 2-4 screenshot.png" alt="MEJORES JUEGOS .IO 2-4 screenshot" width="40%">

<img src="./MEJORES JUEGOS .IO 0-46 screenshot.png" alt="MEJORES JUEGOS .IO 0-46 screenshot" width="40%">

*[3 corners of the map](https://www.youtube.com/watch?v=xgbEjZijSfQ). Don't ask me why his expression doesn't change. I don't know either.*
</center>

### 0.4.0 - Flat + Crates

<center>
<img src="./!APARECE WILLIREX EN MI VEDIO¡ WTF _ Shell Shockers 1-56 screenshot.png" alt="!APARECE WILLIREX EN MI VEDIO¡ WTF _ Shell Shockers 1-56 screenshot" width="40%">
<img src="./!APARECE WILLIREX EN MI VEDIO¡ WTF _ Shell Shockers 3-17 screenshot.png" alt="!APARECE WILLIREX EN MI VEDIO¡ WTF _ Shell Shockers 3-17 screenshot" width="40%">

<img src="./!APARECE WILLIREX EN MI VEDIO¡ WTF _ Shell Shockers 2-55 screenshot.png" alt="!APARECE WILLIREX EN MI VEDIO¡ WTF _ Shell Shockers 2-55 screenshot" width="40%">
<img src="./!APARECE WILLIREX EN MI VEDIO¡ WTF _ Shell Shockers 2-43 screenshot.png" alt="!APARECE WILLIREX EN MI VEDIO¡ WTF _ Shell Shockers 2-43 screenshot" width="40%">

*[3 corners of the map (2 are of the same)](https://www.youtube.com/watch?v=J6BHzEU7C6s).*
</center>

### 0.4.? - Flat + Crates

<center>
<img src="./SHELLSHOCK.IO _ ROMPIENDO HUEVOS _ Gameplay español 0-37 screenshot.png" alt="SHELLSHOCK.IO _ ROMPIENDO HUEVOS _ Gameplay español 0-37 screenshot" width="40%">
<img src="./SHELLSHOCK.IO _ ROMPIENDO HUEVOS _ Gameplay español 8-6 screenshot.png" alt="SHELLSHOCK.IO _ ROMPIENDO HUEVOS _ Gameplay español 8-6 screenshot" width="40%">
<img src="./SHELLSHOCK.IO _ ROMPIENDO HUEVOS _ Gameplay español 7-39 screenshot.png" alt="SHELLSHOCK.IO _ ROMPIENDO HUEVOS _ Gameplay español 7-39 screenshot" width="40%">
<img src="./SHELLSHOCK.IO _ ROMPIENDO HUEVOS _ Gameplay español 3-49 screenshot.png" alt="SHELLSHOCK.IO _ ROMPIENDO HUEVOS _ Gameplay español 3-49 screenshot" width="40%">

*[The 4 corners of the map.](https://www.youtube.com/watch?v=crw7PW-ZaMQ)*
</center>

More screenshots:

<center>
<img src="./SHELLSHOCK.IO _ ROMPIENDO HUEVOS _ Gameplay español 1-28 screenshot.png" alt="SHELLSHOCK.IO _ ROMPIENDO HUEVOS _ Gameplay español 1-28 screenshot" width="40%">

*The identifiable corner structure.*
</center>

### 0.4.2-0.4.3 - Flat + Crates

<center>
<img src="./GUERRA DE HUEVOS!!!! - Shellshock.io 0-16 screenshot.png" alt="GUERRA DE HUEVOS!!!! - Shellshock.io 0-16 screenshot" width="40%">
<img src="./GUERRA DE HUEVOS!!!! - Shellshock.io 3-47 screenshot.png" alt="GUERRA DE HUEVOS!!!! - Shellshock.io 3-47 screenshot" width="40%">

<img src="./GUERRA DE HUEVOS!!!! - Shellshock.io 3-28 screenshot.png" alt="GUERRA DE HUEVOS!!!! - Shellshock.io 3-28 screenshot" width="40%">
<img src="./GUERRA DE HUEVOS!!!! - Shellshock.io 2-48 screenshot.png" alt="GUERRA DE HUEVOS!!!! - Shellshock.io 2-48 screenshot" width="40%">

*[3 corners of the map (2 are of the same)](https://www.youtube.com/watch?v=Sjv6BwxNsOc)*
</center>

This is one of the rare times that a randomly generated map has appeared across versions.

<center>
<img src="./especial 37 subs con el nuevo shellshock.io Directo _4 8-29 screenshot.png" alt="especial 37 subs con el nuevo shellshock.io Directo #4 8-29 screenshot" width="40%">
<img src="./especial 37 subs con el nuevo shellshock.io Directo _4 6-41 screenshot.png" alt="especial 37 subs con el nuevo shellshock.io Directo #4 6-41 screenshot" width="40%">

<img src="./especial 37 subs con el nuevo shellshock.io Directo _4 5-48 screenshot.png" alt="especial 37 subs con el nuevo shellshock.io Directo #4 5-48 screenshot" width="40%">
<img src="./especial 37 subs con el nuevo shellshock.io Directo _4 5-42 screenshot.png" alt="especial 37 subs con el nuevo shellshock.io Directo #4 5-42 screenshot" width="40%">

<img src="./especial 37 subs con el nuevo shellshock.io Directo _4 5-22 screenshot.png" alt="especial 37 subs con el nuevo shellshock.io Directo #4 5-22 screenshot" width="40%">
<img src="./¡¡¡GUERRA DE HUEVOS!!! - SHELL SHOCKERS 2-35 screenshot.png" alt="¡¡¡GUERRA DE HUEVOS!!! - SHELL SHOCKERS 2-35 screenshot" width="40%">

<img src="./SHELL SHOCKERS-A GUERRA DOS OVOS (FIZ 12KILLS SEM MORRE). 1-17 screenshot.png" alt="SHELL SHOCKERS-A GUERRA DOS OVOS (FIZ 12KILLS SEM MORRE). 1-17 screenshot" width="40%">
</center>

### 0.6.0 - Flat + Crates

<center>
<img src="./ShellShockers.io - 57 KillStreak _ New Updates _D 0-12 screenshot.png" alt="ShellShockers.io - 57 KillStreak _ New Updates _D 0-12 screenshot" width="40%">
<img src="./ShellShockers.io - 57 KillStreak _ New Updates _D 2-51 screenshot.png" alt="ShellShockers.io - 57 KillStreak _ New Updates _D 2-51 screenshot" width="40%">
<img src="./ShellShockers.io - 57 KillStreak _ New Updates _D 1-34 screenshot.png" alt="ShellShockers.io - 57 KillStreak _ New Updates _D 1-34 screenshot" width="40%">
<img src="./ShellShockers.io - 57 KillStreak _ New Updates _D 0-29 screenshot.png" alt="ShellShockers.io - 57 KillStreak _ New Updates _D 0-29 screenshot" width="40%">

*[3 corners of the map (2 are of the same)](https://www.youtube.com/watch?v=_lOkrMy5OpY)*
</center>

More screenshots:

<center>
<img src="./ShellShockers.io - 57 KillStreak _ New Updates _D 3-23 screenshot.png" alt="ShellShockers.io - 57 KillStreak _ New Updates _D 3-23 screenshot" width="40%">
<img src="./ShellShockers.io - 57 KillStreak _ New Updates _D 2-19 screenshot.png" alt="ShellShockers.io - 57 KillStreak _ New Updates _D 2-19 screenshot" width="40%">

<img src="./ShellShockers.io - 57 KillStreak _ New Updates _D 1-8 screenshot.png" alt="ShellShockers.io - 57 KillStreak _ New Updates _D 1-8 screenshot" width="40%">
<img src="./ShellShockers.io - 57 KillStreak _ New Updates _D 0-25 screenshot.png" alt="ShellShockers.io - 57 KillStreak _ New Updates _D 0-25 screenshot" width="40%">

<img src="./ShellShockers.io - 57 KillStreak _ New Updates _D 0-22 screenshot.png" alt="ShellShockers.io - 57 KillStreak _ New Updates _D 0-22 screenshot" width="40%">
<img src="./ShellShockers.io - 57 KillStreak _ New Updates _D 0-19 screenshot.png" alt="ShellShockers.io - 57 KillStreak _ New Updates _D 0-19 screenshot" width="40%">
</center>

## Inter-Editor Era

This era is defined by its presence of maps which are ambiguous as to whether or not they are actually handmade, generated, or a mix of the two.

The first public mentioning of the map editor was on [16th October 2017](https://www.facebook.com/ShellShockersGame/posts/pfbid0MveedmUki6MLMo73t6LZ9yxAZiAxRjdky6K2EeymVy8V9KXKH9kEc1qZC9iwjYTPl). Therefore it might be implied that every map seen prior to this date was randomly generated, and accordingly every map afterwards has been manually created.

As stated previously, early versions of Shell contained a map generator built in. Although there are no references to it, we can extract the code and put it to use in alternative ways. Thus, I built it into the LegacyShell map editor to see what it can output.

<center>
<img src="./LegacyGeneratorOutput.png" alt="LegacyGeneratorOutput" width="40%">

*Output from my modified Legacy Generator.*
</center>

As you will see, this sort of output is similar in structure to the upcoming maps - ignoring its lack of floor, stairs and ladders. It's actually this lack of decorations that leads me to think that these next maps may actually have been initially created using this generator as a base and then "crafted" to be more playable.

Unfortunately the WayBack Machine drought continues until 0.9.0. So that version is the earliest we can verifiably analyse and export maps from.

### The 0.7.x Maps - #1

There are two maps I could find for this version.

<center>
<img src="./Shell Shockers  GUERRA DE HUEVOS 1-31 screenshot.png" alt="Shell Shockers  GUERRA DE HUEVOS 1-31 screenshot" width="40%">
<img src="./Shell Shockers  GUERRA DE HUEVOS 5-10 screenshot.png" alt="Shell Shockers  GUERRA DE HUEVOS 5-10 screenshot" width="40%">

<img src="./Shell Shockers  GUERRA DE HUEVOS 4-58 screenshot.png" alt="Shell Shockers  GUERRA DE HUEVOS 4-58 screenshot" width="40%">
<img src="./Shell Shockers  GUERRA DE HUEVOS 3-0 screenshot.png" alt="Shell Shockers  GUERRA DE HUEVOS 3-0 screenshot" width="40%">

*[3 corners of the map (2 are of the same)](https://www.youtube.com/watch?v=_lOkrMy5OpY)*
</center>

More screenshots:

<center>
<img src="./Shell Shockers  GUERRA DE HUEVOS 1-52 screenshot.png" alt="Shell Shockers  GUERRA DE HUEVOS 1-52 screenshot" width="40%">
<img src="./Shell Shockers  GUERRA DE HUEVOS 3-48 screenshot.png" alt="Shell Shockers  GUERRA DE HUEVOS 3-48 screenshot" width="40%">

<img src="./Shell Shockers  GUERRA DE HUEVOS 2-20 screenshot.png" alt="Shell Shockers  GUERRA DE HUEVOS 2-20 screenshot" width="40%">
<img src="./Shell Shockers  GUERRA DE HUEVOS 1-36 screenshot.png" alt="Shell Shockers  GUERRA DE HUEVOS 1-36 screenshot" width="40%">

<img src="./Shell Shockers  GUERRA DE HUEVOS 2-41 screenshot.png" alt="Shell Shockers  GUERRA DE HUEVOS 2-41 screenshot" width="40%">
</center>

### The 0.7.x Maps - #2

This is the second map. By doing our corner analysis, this is clearly not the same map, but stylistically is identical.

<center>
<img src="./Getting a 20 kill streak in Shell Shockers 0-43 screenshot.png" alt="Getting a 20 kill streak in Shell Shockers 0-43 screenshot" width="40%">
<img src="./Getting a 20 kill streak in Shell Shockers 1-54 screenshot.png" alt="Getting a 20 kill streak in Shell Shockers 1-54 screenshot" width="40%">

<img src="./Getting a 20 kill streak in Shell Shockers 1-30 screenshot.png" alt="Getting a 20 kill streak in Shell Shockers 1-30 screenshot" width="40%">
<img src="./Getting a 20 kill streak in Shell Shockers 0-37 screenshot.png" alt="Getting a 20 kill streak in Shell Shockers 0-37 screenshot" width="40%">

*[3 or 4 corners of the map, I couldn't be bothered to verify.](https://www.youtube.com/watch?v=FnaKFU-yt1c)*
</center>

### The 0.8.x Maps - #1

Interestingly in this update cycle we see the reintegration of the visually jarring and randomly scattered crate blocks. They were omitted from 0.7.x's, but here make their final appearance doing the thing they were originally made to do: be everywhere and get in the way.

<center>
<img src="./_Insane_ Shellshock.io GAMEPLAY! (2018) 0-52 screenshot (1).png" alt="_Insane_ Shellshock.io GAMEPLAY! (2018) 0-52 screenshot (1)" width="40%">
<img src="./_Insane_ Shellshock.io GAMEPLAY! (2018) 0-50 screenshot.png" alt="_Insane_ Shellshock.io GAMEPLAY! (2018) 0-50 screenshot" width="40%">

<img src="./_Insane_ Shellshock.io GAMEPLAY! (2018) 0-31 screenshot.png" alt="_Insane_ Shellshock.io GAMEPLAY! (2018) 0-31 screenshot" width="40%">
<img src="./_Insane_ Shellshock.io GAMEPLAY! (2018) 0-41 screenshot.png" alt="_Insane_ Shellshock.io GAMEPLAY! (2018) 0-41 screenshot" width="40%">

*[Some corners, or something, I'm tired of this.](https://www.youtube.com/watch?v=UZSnvnNg8Qk)*
</center>

More screenshots:

<center>
<img src="./_Insane_ Shellshock.io GAMEPLAY! (2018) 0-52 screenshot.png" alt="_Insane_ Shellshock.io GAMEPLAY! (2018) 0-52 screenshot" width="40%">
<img src="./_Insane_ Shellshock.io GAMEPLAY! (2018) 0-40 screenshot.png" alt="_Insane_ Shellshock.io GAMEPLAY! (2018) 0-40 screenshot" width="40%">

<img src="./_Insane_ Shellshock.io GAMEPLAY! (2018) 0-54 screenshot.png" alt="_Insane_ Shellshock.io GAMEPLAY! (2018) 0-54 screenshot" width="40%">
</center>

### The 0.8.x Maps - #2

<center>
<img src="./Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 0-18 screenshot.png" alt="Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 0-18 screenshot" width="40%">
<img src="./Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 0-44 screenshot.png" alt="Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 0-44 screenshot" width="40%">

<img src="./Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 3-14 screenshot.png" alt="Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 3-14 screenshot" width="40%">
<img src="./Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 0-39 screenshot.png" alt="Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 0-39 screenshot" width="40%">

*[At least 3 corners here.](https://www.youtube.com/watch?v=YSDzwIz_y2Y)*
</center>

More screenshots:

<center>
<img src="./Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 2-39 screenshot.png" alt="Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 2-39 screenshot" width="40%">
<img src="./Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 0-53 screenshot.png" alt="Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 0-53 screenshot" width="40%">

<img src="./Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 0-22 screenshot.png" alt="Shellshock.io Gameplay (100 Kill Streak!!!) Snipers only NOT CLICKBAIT!!!! 0-22 screenshot" width="40%">
</center>

### The 0.9.x Maps

These are maps that have been found in the files of 0.9.0.

Reading from the official 0.9.0 changelog:

> **What's New**
> - Hand-crafted maps (Sorta!)

It's up to you to decide what that makes the other Inter-Editor maps. Just visually I personally don't see too huge a difference here, other than grass, slopes and other minor things. I'm going to believe that these are edited from generated maps, explaining the `(Sorta!)` in the changelog.

From analysing videos from the time period, these were from around [2 Dec 2017](https://www.youtube.com/watch?v=NkZKCQcHa5k) - 31 Dec 2017, thus placing them to exist in the 0.9.x update cycle. Maps which we know today started appearing in 0.10.0.

These maps come without a name, so they have been assigned some.

|Name|Videos|Image|Description|
|-|-|-|-|
|Alpha1|[Video 1](https://youtu.be/AYeGbwtRVqg?t=129)|<img src="./Alpha1.png" alt="Alpha1" width="65%">||
|Alpha2||<img src="./Alpha2.png" alt="Alpha2" width="65%">|Contains some areas reminiscent of Blue|
|Alpha3|[Video 1](https://youtu.be/0Gi4NultfvM?t=141)<br>[Video 2](https://youtu.be/v5eV43DHFZY?&t=29)|<img src="./Alpha3.png" alt="Alpha3" width="65%">|The inclusion of the generic slopes is especially interesting considering they don't appear in 0.10.x|

## Manually Created Era

This era is the one which marked the beginning of when maps started being added which actually stuck around. All prior maps have never returned.

### The 0.10.x Maps

Like 0.9.x, this version also contains just three maps.

Blue is often wrongly cited to be the oldest map, when it's just the oldest to still be in the game, along with Two Towers. Clearly as shown previously its far from the first.

|Name|Videos|Image|Description|
|-|-|-|-|
|Early Blue|[Video 1](https://youtu.be/cxJESkZzhkk?t=289)|<img src="./0.10.2 Alpha1.png" alt="0.10.2 Alpha1" width="65%">||
|Early Bedrock|[Video 1](https://youtu.be/xyT6_v7H_vs?t=342)<br>[Video 2](https://youtu.be/gemfbFnaGxY)|<img src="./0.10.2 Alpha2.png" alt="0.10.2 Alpha2" width="65%">|Removed but then readded as [Bedrock](https://shellshockers.fandom.com/wiki/Bedrock?file=BedrockMap.png).|
|Early Two Towers|[Video 1](https://youtu.be/xyT6_v7H_vs?t=656)|<img src="./0.10.2 Alpha3.png" alt="0.10.2 Alpha3" width="65%">||

The most significant thing to note here is the presence of an early version of Bedrock. It was later readded on 1st May 2023.

Scrutinising these maps further, I think that all these maps were also made with the same techniques as the [inter-editor era](#inter-editor-era), just with some block types replaced with new models.

It's most visible in Bedrock, obviously, as it's essentially another map like those in 0.9.x. Then looking at Blue, it's the same style just with grass and blue blocks. Then there's Two Towers. Despite the name, does it really look like two towers? Not to me. It looks too similar to the output of the Legacy Generator when you set the height to be large. 

So to conclude even though these maps have all prevailed, it's hard for me to call them manually created. But I will because I can. 