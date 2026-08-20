# Modern Shell Maps

Re-adds Shell Shockers' modern-era map pool (plus their Halloween/Christmas texture variants), which isn't part of LegacyShell's classic-era default map set.

## Availability

Included by default in `plugins_samples/` - drag it into `plugins/` to activate it.

## Updating the maps

Shell Shockers periodically adds new maps, so this plugin's map list can go stale. To refresh it:

1. [Go to Shell's source](https://shellshock.io/js/shellshock.js) and find where it defines the maps. It looks like this:

```js
,cx.movementAccuracyMod=.8;var hx=[{filename:"aqueduct",hash:"11dp765kifr",name:"Aqueduct",
```

2. Find where the map definition ends. It looks like this:

```js
,name:"Wreckage",modes:{FFA:!0,Teams:!0,Spatula:!0,King:!0},availability:"private",numPlayers:"18"}];function fx()
```

3. Copy everything between those two points (inclusive) and assign it to a variable in the browser console:

```js
var maps = [{filename:"aqueduct",hash:"11dp765kifr",name:"Aqueduct", ... (etc) ... ,name:"Wreckage",modes:{FFA:!0,Teams:!0,Spatula:!0,King:!0},availability:"private",numPlayers:"18"}];
```

Some maps aren't included in this list - for instance, `easyparkour` exists on Shell's servers but isn't listed in the game's own JS.

4. Paste this function into the console:

```js
async function downloadMaps(mapList) {
    Math.mod = function (n, m) {
        var remain = n % m;
        return 0 <= remain ? remain : remain + m
    };

    var maps = [];

    for (const map of mapList) {
        maps.push({
            ...map,
            suffix: " (Modern)",
        });

        maps.push({ //halloween variants
            filename: map.filename+"h",
            suffix: " (Modern, Halloween)",
        });

        maps.push({ //christmas variants
            filename: map.filename+"C",
            suffix: " (Modern, Christmas)",
        });
    };

    for (const map of maps) {
        const filename = `${map.filename}.json`;
        const url = `https://shellshock.io/maps/${filename}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`Failed to download ${filename}: ${response.statusText}`);
                continue;
            }
            const minMap2 = await response.json();

            minMap2.name += map.suffix;
            
            //convert versions if needed (v2 to v1)
            if (minMap2.fileVersion >= 2) {
                console.log("newer map", minMap2.name);
                for (const [key, value] of Object.entries(minMap2.data)) {
                    value.forEach((block)=>{
                    block.x = minMap2.extents.width - block.x - 1;
                    if (block.ry === 2) {
                        block.ry = 0;
                    } else {
                        block.ry = Math.mod(-(block.ry || 0) + 2, 4);
                    };
                    block.rx = Math.mod(-(block.rx || 0), 4);
                    });
                };
                if (minMap2?.fog?.density) minMap2.fog.density *= .5; //seems right
                minMap2.fileVersion = 1;
            };

            const modifiedBlob = new Blob([JSON.stringify(minMap2, null, 2)], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(modifiedBlob);
            link.download = filename;
            link.click();
            URL.revokeObjectURL(link.href);
            console.log(`Downloaded: ${filename}`);
        } catch (error) {
            console.error(`Error downloading ${filename}:`, error);
        };
        await new Promise(resolve => setTimeout(resolve, 750));
    };
};
```

5. Then run it:

```js
downloadMaps(maps);
```

They should now all start downloading to your browser.

Note that this only handles maps already listed in the JS - if a map is hidden or removed from that list, this won't locate it.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
