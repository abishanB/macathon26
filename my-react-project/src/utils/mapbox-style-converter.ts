/**
 * Fetches Mapbox style JSON and converts it to be MapLibre-compatible
 * by replacing mapbox:// URLs with direct API URLs
 */

export interface MapboxStyleSource {
  type: string;
  url?: string;
  tiles?: string[];
  [key: string]: any;
}

export interface MapboxStyle {
  version: 8;
  sources: { [key: string]: MapboxStyleSource };
  layers: any[];
  sprite?: string;
  glyphs?: string;
  [key: string]: any;
}

/**
 * Fetches the Mapbox style and converts it to MapLibre format
 */
export async function fetchAndConvertMapboxStyle(
  styleUrl: string,
  accessToken: string
): Promise<MapboxStyle> {
  // Extract style ID from mapbox:// URL or use full URL
  let apiUrl: string;
  
  if (styleUrl.startsWith('mapbox://styles/')) {
    // Convert mapbox://styles/mapbox/streets-v11 to API URL
    const stylePath = styleUrl.replace('mapbox://styles/', '');
    apiUrl = `https://api.mapbox.com/styles/v1/${stylePath}?access_token=${accessToken}`;
  } else {
    apiUrl = styleUrl;
  }

  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch style: ${response.statusText}`);
  }

  const style: MapboxStyle = await response.json();

  // Convert sources from mapbox:// URLs to direct tile URLs
  Object.keys(style.sources).forEach((sourceId) => {
    const source = style.sources[sourceId];

    if (source.url && source.url.startsWith('mapbox://')) {
      // Convert mapbox:// URL to tiles array with direct API URLs
      const tilesetId = source.url.replace('mapbox://', '');
      
      // Remove the url property and add tiles array
      delete source.url;
      source.tiles = [
        `https://api.mapbox.com/v4/${tilesetId}/{z}/{x}/{y}.mvt?access_token=${accessToken}`
      ];
    }
  });

  // Update sprite URLs if they use mapbox:// protocol
  if (style.sprite && style.sprite.startsWith('mapbox://')) {
    const spritePath = style.sprite.replace('mapbox://sprites/', '');
    style.sprite = `https://api.mapbox.com/styles/v1/${spritePath}/sprite?access_token=${accessToken}`;
  }

  // Update glyphs URLs if they use mapbox:// protocol
  if (style.glyphs && style.glyphs.startsWith('mapbox://')) {
    const glyphsPath = style.glyphs.replace('mapbox://fonts/', '');
    style.glyphs = `https://api.mapbox.com/fonts/v1/${glyphsPath}?access_token=${accessToken}`;
  }

  return style;
}
