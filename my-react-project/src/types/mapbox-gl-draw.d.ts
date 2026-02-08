declare module "@mapbox/mapbox-gl-draw" {
  import type { IControl } from "maplibre-gl";

  export interface MapboxDrawOptions {
    displayControlsDefault?: boolean;
    controls?: {
      polygon?: boolean;
      trash?: boolean;
      point?: boolean;
      line_string?: boolean;
      combine_features?: boolean;
      uncombine_features?: boolean;
    };
    defaultMode?: string;
  }

  export default class MapboxDraw implements IControl {
    constructor(options?: MapboxDrawOptions);
    onAdd(map: unknown): HTMLElement;
    onRemove(map: unknown): void;
    getDefaultPosition?: () => "top-left" | "top-right" | "bottom-left" | "bottom-right";
    getAll(): GeoJSON.FeatureCollection;
    delete(ids: string | number | Array<string | number>): this;
    changeMode(mode: string, options?: Record<string, unknown>): this;
  }
}
