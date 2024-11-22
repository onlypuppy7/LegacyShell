# How to update?

[Go to Shell's source](https://shellshock.io/js/shellshock.js)

Identify the part where they define the maps. It looks like this:

```js
,cx.movementAccuracyMod=.8;var hx=[{filename:"aqueduct",hash:"11dp765kifr",name:"Aqueduct",
```

Identify the part where the map definition ends. It looks like this:

```js
,name:"Wreckage",modes:{FFA:!0,Teams:!0,Spatula:!0,King:!0},availability:"private",numPlayers:"18"}];function fx()
```

Copy it and save it to some var in the console.

```js
var maps = [{filename:"aqueduct",hash:"11dp765kifr",name:"Aqueduct", ... (etc) ... ,name:"Wreckage",modes:{FFA:!0,Teams:!0,Spatula:!0,King:!0},availability:"private",numPlayers:"18"}];
```

Some maps aren't 

Paste this function:

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

Then execute this:

```js
downloadMaps(maps);
```

They should now all start downloading to your browser.

Note that this only handles maps already listed in the JS. If maps are hidden or removed, this will not locate them.