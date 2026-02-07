import { useEffect } from "react";
import mapboxgl from "mapbox-gl";

interface TtcRoutesProps {
  map: mapboxgl.Map | null;
  showRoutes: boolean;
}

// Mapbox tileset containing TTC routes
const TTC_ROUTES_URL = "mapbox://abishanbhavananthan.d8g5xu8x";
const SOURCE_LAYER = "ttc-main-routes";

const TtcRoutes = ({ map, showRoutes }: TtcRoutesProps) => {
  useEffect(() => {
    if (!map) return;

    const addRouteLayer = () => {
      if (map.getSource("ttc-routes")) return;

      // Add tileset source
      map.addSource("ttc-routes", {
        type: "vector",
        url: TTC_ROUTES_URL,
      });

      // Add line layer
      map.addLayer({
        id: "ttc-routes-line",
        type: "line",
        source: "ttc-routes",
        "source-layer": SOURCE_LAYER,
        layout: {
          visibility: "visible",
        },
        paint: {
          "line-color": "#2b8cbe",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10, 1.5,
            14, 3,
            17, 5
          ],
          "line-opacity": 0.9
        }
      });
    };

    if (map.isStyleLoaded()) {
      addRouteLayer();
    } else {
      map.once("load", addRouteLayer);
    }
  }, [map]);

  // Toggle visibility
  useEffect(() => {
    if (!map) return;

    const visibility = showRoutes ? "visible" : "none";

    if (map.getLayer("ttc-routes-line")) {
      map.setLayoutProperty("ttc-routes-line", "visibility", visibility);
    }
  }, [map, showRoutes]);

  return null;
};

export default TtcRoutes;