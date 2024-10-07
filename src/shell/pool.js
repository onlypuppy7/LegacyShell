//

export function Pool(constructorFn, size) {
    this.size = 0;
    this.originalSize = size;
    this.constructorFn = constructorFn;
    this.objects = [];
    this.idx = 0;
    this.numActive = 0;
    this.expand(size);
};
Pool.prototype.expand = function (num) {
    for (var i = 0; i < num; i++) {
        var obj = this.constructorFn();
        obj.id = i + this.size;
        obj.active = false;
        this.objects.push(obj);
    };
    this.size += num;
};
Pool.prototype.retrieve = function (id) {
    if (null != id) {
        for (; id >= this.size;) this.expand(this.originalSize);
        return this.numActive++, this.objects[id].active = true, this.objects[id];
    };
    var i = this.idx;
    do {
        i = (i + 1) % this.size;
        var obj = this.objects[i];
        if (!obj.active) return this.idx = i, this.numActive++, obj.active = true, obj
    } while (i != this.idx);
    return this.expand(this.originalSize), this.retrieve()
};
Pool.prototype.recycle = function (obj) {
    obj.active = false, this.numActive--;
};
Pool.prototype.forEachActive = function (fn) {
    for (var i = 0; i < this.size; i++) {
        var obj = this.objects[i];
        true === obj.active && fn(obj, i)
    };
};