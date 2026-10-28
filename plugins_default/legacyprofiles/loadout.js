import { CharClass, itemIdOffsets, ItemType } from '#constants';

export function profileLoadout(loadout) {
    const ids = values => Array.isArray(values) ? values.map(id => Number.isSafeInteger(id) && id >= 0 ? id : null) : [];
    const primaryId = ids(loadout?.primaryId), secondaryId = ids(loadout?.secondaryId);
    for (let index = 0; index < CharClass.length; index++) {
        if (primaryId[index] == null && Number.isSafeInteger(itemIdOffsets[ItemType.Primary][index])) primaryId[index] = itemIdOffsets[ItemType.Primary].base + itemIdOffsets[ItemType.Primary][index];
        if (secondaryId[index] == null && Number.isSafeInteger(itemIdOffsets[ItemType.Secondary])) secondaryId[index] = itemIdOffsets[ItemType.Secondary];
    };
    return { primaryId, secondaryId };
};
