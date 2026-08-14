import { Cache, EquirectangularAdapter, Viewer } from "@photo-sphere-viewer/core";

Cache.enabled = false;

function createGenerationGuardedAdapter(lifecycle) {
  return class GenerationGuardedAdapter extends EquirectangularAdapter {
    constructor(viewer, config) {
      super(viewer, config);
      this.lifecycle = lifecycle;
    }

    async loadTexture() {
      const generation = this.lifecycle.generation;
      const textureData = await super.loadTexture(...arguments);
      if (this.lifecycle.disposed || generation !== this.lifecycle.generation) {
        this.disposeTexture(textureData);
        const error = new Error("Panorama loading was aborted");
        error.name = "AbortError";
        throw error;
      }
      return textureData;
    }

    destroy() {
      this.lifecycle.cancelDecodes();
      super.destroy();
    }
  };
}

export { Cache, Viewer, createGenerationGuardedAdapter };
