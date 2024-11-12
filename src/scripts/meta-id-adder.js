var delta = 3000;

function addMetaIds(data) {
    return JSON.stringify(data.map(item => {
        return {
            meta_id: item.id - delta,
            ...item
        };
    }));
};