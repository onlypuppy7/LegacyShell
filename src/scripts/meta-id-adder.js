var delta = 1e3;
var filter = "Hats";

function addMetaIds(data) {
    return JSON.stringify(data
        .filter(item => filter ? item.category_name === filter : true)
        .map(item => {
            return {
                meta_id: item.id - delta,
                ...item
            };
        })
    );
};