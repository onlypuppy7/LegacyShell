export const FranciumParticles = {
    patched: false,

    patch() {
        if (this.patched) return;
        this.patched = true;
        const render = BABYLON.SpriteManager.prototype.render;
        BABYLON.SpriteManager.prototype.render = function () {
            if (!FranciumPlugin.scenes.has(this._scene)) return render.apply(this, arguments);
            if (!this._effectBase.isReady() || !this._effectFog.isReady() || !this._spriteTexture || !this._spriteTexture.isReady()) return;
            const engine = this._scene.getEngine();
            const baseSize = this._spriteTexture.getBaseSize(), rowSize = baseSize.width / this.cellWidth;
            const delta = engine.getDeltaTime(), max = Math.min(this._capacity, this.sprites.length);
            let offset = 0;
            for (let i = 0; i < max; i++) {
                const sprite = this.sprites[i];
                if (!sprite || !sprite.isVisible) continue;
                sprite._animate(delta);
                this._appendSpriteVertex(offset++, sprite, 0, 0, rowSize);
                this._appendSpriteVertex(offset++, sprite, 1, 0, rowSize);
                this._appendSpriteVertex(offset++, sprite, 1, 1, rowSize);
                this._appendSpriteVertex(offset++, sprite, 0, 1, rowSize);
            };
            if (!offset) return;
            //keep the full CPU buffer for context restoration, upload only populated vertices
            engine.updateDynamicVertexBuffer(this._buffer.getBuffer(), this._vertexData, 0, offset * 16 * 4);
            let effect = this._effectBase;
            const fog = this._scene.fogEnabled && this._scene.fogMode !== BABYLON.Scene.FOGMODE_NONE && this.fogEnabled;
            if (fog) effect = this._effectFog;
            engine.enableEffect(effect);
            effect.setTexture('diffuseSampler', this._spriteTexture);
            effect.setMatrix('view', this._scene.getViewMatrix());
            effect.setMatrix('projection', this._scene.getProjectionMatrix());
            effect.setFloat2('textureInfos', this.cellWidth / baseSize.width, this.cellHeight / baseSize.height);
            if (fog) {
                effect.setFloat4('vFogInfos', this._scene.fogMode, this._scene.fogStart, this._scene.fogEnd, this._scene.fogDensity);
                effect.setColor3('vFogColor', this._scene.fogColor);
            };
            engine.bindBuffers(this._vertexBuffers, this._indexBuffer, effect);
            if (this.blendMode === BABYLON.Engine.ALPHA_ADD) engine.setAlphaMode(BABYLON.Engine.ALPHA_ADD);
            else {
                if (!this.noAlphaTest) {
                    engine.setDepthFunctionToLessOrEqual();
                    effect.setBool('alphaTest', true);
                    engine.setColorWrite(false);
                    engine.drawElementsType(BABYLON.Material.TriangleFillMode, 0, offset / 4 * 6);
                    engine.setColorWrite(true);
                    effect.setBool('alphaTest', false);
                };
                engine.setAlphaMode(BABYLON.Engine.ALPHA_COMBINE);
            };
            engine.drawElementsType(BABYLON.Material.TriangleFillMode, 0, offset / 4 * 6);
            engine.setAlphaMode(BABYLON.Engine.ALPHA_DISABLE);
        };
    },
};
