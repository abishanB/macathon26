import type { Map } from "mapbox-gl";

const TILESET_ID = "abishanbhavananthan.d8g5xu8x";
const SOURCE_ID = "ttc-routes-source";
const LAYER_ID = "ttc-routes-layer";
const SOURCE_LAYER = "ttc-main-routes";

/**
 * Adds the TTC routes tileset to the map
 * @param map - The Mapbox map instance
 * @returns A cleanup function to remove the tileset source and layer
 */
export function addTTCTileset(map: Map): () => void {
  const addSourceAndLayer = () => {
    // Only add if not already present
    if (map.getSource(SOURCE_ID)) {
      return;
    }

    // Add the vector tileset source
    map.addSource(SOURCE_ID, {
      type: "vector",
      url: `mapbox://${TILESET_ID}`,
    });

    // Add a line layer to visualize the TTC routes
    map.addLayer({
      id: LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      paint: {
        "line-color": "#ff6b35",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10, 2,
          14, 4,
          18, 8
        ],
        "line-opacity": 0.8,
      },
    });

    console.log(`✅ TTC routes tileset added (${TILESET_ID})`);
  };

  // Add when style is loaded
  if (map.isStyleLoaded()) {
    addSourceAndLayer();
  } else {
    map.on("style.load", addSourceAndLayer);
  }

  // Return cleanup function
  return () => {
    try {
      if (map.getLayer(LAYER_ID)) {
        map.removeLayer(LAYER_ID);
      }
      if (map.getSource(SOURCE_ID)) {
        map.removeSource(SOURCE_ID);
      }
      map.off("style.load", addSourceAndLayer);
    } catch (e) {
      console.error("Error cleaning up TTC tileset:", e);
    }
  };
}
