# Nearby Buildings Feature Documentation

**Last Updated:** February 8, 2026  
**Feature:** Display nearby buildings and POIs within construction zone impact area  
**Location:** `SimulationResultsPanel.tsx`

---

## Overview

The Nearby Buildings feature displays up to 5 buildings, businesses, and points of interest (POIs) within a 500-pixel radius of the map's center point. This helps users understand which establishments might be affected by construction projects.

### Key Features

- **Real-time querying** of map tiles for buildings and POIs
- **Prioritized results** - Named businesses appear before generic buildings
- **Rich metadata** - Shows name, address, and business type
- **Visual icons** - Type-specific emojis for easy identification
- **Zero API costs** - Uses already-loaded vector tile data

---

## Technical Implementation

### Architecture

```
App.tsx
  └─> mapRef.current (MapLibre Map instance)
  └─> centerPoint (map.getCenter())
      │
      ▼
SimulationResultsPanel.tsx
  └─> getNearbyBuildingsAndPOIs(map, centerPoint, 500px)
      │
      ├─> map.queryRenderedFeatures(bbox, layers)
      ├─> Priority scoring algorithm
      └─> Returns top 5 results
          │
          ▼
      Nearby Buildings UI Section
```

### Core Function: `getNearbyBuildingsAndPOIs()`

**Purpose:** Query rendered map features within a pixel radius  
**Location:** `SimulationResultsPanel.tsx`

**Parameters:**
- `map: maplibregl.Map` - MapLibre map instance
- `centerPoint: [number, number]` - Geographic coordinates [lng, lat]
- `radiusPixels: number` - Search radius in screen pixels (default: 500)

**Returns:** `NearbyPlace[]` - Array of up to 5 buildings/POIs

#### Algorithm Steps

1. **Convert geographic coordinates to screen pixels**
   ```typescript
   const centerPixel = map.project(centerPoint);
   ```

2. **Define bounding box around center point**
   ```typescript
   const bbox: [PointLike, PointLike] = [
     [centerPixel.x - radiusPixels, centerPixel.y - radiusPixels], // SW corner
     [centerPixel.x + radiusPixels, centerPixel.y + radiusPixels]  // NE corner
   ];
   ```

3. **Query multiple layer types**
   - `building` - Building footprints from OSM
   - `poi-label` - Point of interest labels (Mapbox)
   - `poi` - Alternative POI layer
   - `place-label` - Place names
   - `poi_label` - Variant naming (some tilesets)

4. **Extract and normalize feature properties**
   - **Name extraction priority:** `name` > `name:en` > `brand` > `operator` > `amenity` > `shop`
   - **Type extraction:** `class` > `type` > `amenity` > `shop` > `building`
   - **Address building:** `addr:housenumber` + `addr:street` > `addr:city`

5. **Priority scoring system**
   ```typescript
   priority = 0
   if (has name or brand)         priority += 10
   if (is amenity or shop)        priority += 5
   if (from POI layer)            priority += 3
   ```

6. **Sort and limit results**
   - Sort by priority (descending)
   - Return top 5 results

---

## Data Model

### `NearbyPlace` Interface

```typescript
interface NearbyPlace {
  name: string;      // Display name of place
  address: string;   // Street address or fallback
  type: string;      // Category (restaurant, bank, building, etc.)
  priority: number;  // Sorting weight (higher = more relevant)
}
```

### OpenStreetMap Property Mappings

| OSM Property | Purpose | Example |
|--------------|---------|---------|
| `name` | Primary name | "Starbucks" |
| `name:en` | English name | "Toronto City Hall" |
| `brand` | Brand name | "McDonald's" |
| `operator` | Who operates it | "City of Toronto" |
| `amenity` | Facility type | "restaurant", "bank", "hospital" |
| `shop` | Shop type | "supermarket", "convenience" |
| `building` | Building type | "commercial", "residential" |
| `addr:housenumber` | Street number | "123" |
| `addr:street` | Street name | "King Street West" |
| `addr:city` | City name | "Toronto" |
| `class` | Feature class | "commercial", "retail" |
| `type` | Feature subtype | "office", "apartment" |

---

## UI Component

### Visual Design

The Nearby Buildings section appears after the "Construction Impact" section and before "Mitigation Recommended".

**Layout:**
- Header: "📍 Nearby Buildings"
- Each building card shows:
  - Type icon (emoji)
  - Name (bold, truncated at 50 chars)
  - Address (gray, 11px)
  - Type label (gray, 10px, if not generic "building")

**Styling:**
- Card: Light gray background (#f9fafb)
- Left border: Blue accent (3px solid #3b82f6)
- Padding: 8px
- Border radius: 4px
- Gap: 8px between cards

### Example Output

```
📍 Nearby Buildings

🍔 Taco Bell
234 King Street West
restaurant

🏦 RBC Royal Bank
180 Wellington Street
bank

☕ Starbucks
200 King Street West
cafe

🏢 Commerce Court West
199 Bay Street
office

🏘️ Unnamed Building
123 Adelaide Street
residential
```

---

## Icon System

### `getTypeIcon()` Function

Maps business/building types to appropriate emoji icons.

**Common Mappings:**

| Type | Icon | Category |
|------|------|----------|
| `restaurant` | 🍽️ | Food & Drink |
| `cafe` | ☕ | Food & Drink |
| `bank` | 🏦 | Financial |
| `hospital` | 🏥 | Healthcare |
| `school` | 🏫 | Education |
| `hotel` | 🏨 | Accommodation |
| `shop` | 🛍️ | Retail |
| `office` | 🏢 | Commercial |
| `residential` | 🏘️ | Housing |
| `parking` | 🅿️ | Transportation |
| `church` | ⛪ | Religious |
| `park` | 🌳 | Recreation |

**Default:** 🏢 (for unknown types)

---

## Performance Considerations

### Optimization Strategies

1. **Conditional Querying**
   - Only queries when panel is visible and not minimized
   - Uses `useEffect` with proper dependencies

2. **Layer Validation**
   - Filters to only query existing layers
   - Prevents errors from missing tile layers

3. **Result Limiting**
   - Limits to top 5 results
   - Prevents performance degradation with large datasets

4. **Error Handling**
   - Try-catch around query operations
   - Graceful fallback to empty array

### Cost & Rate Limits

✅ **Zero API costs** - No external geocoding API calls  
✅ **No rate limits** - Uses local vector tile data  
✅ **Instant results** - Sub-100ms query time  

---

## Integration Points

### Props Required in `SimulationResultsPanel`

```typescript
interface SimulationResultsPanelProps {
  // ... existing props
  map?: maplibregl.Map | null;           // MapLibre instance
  centerPoint?: [number, number];        // [longitude, latitude]
}
```

### Passing Props from `App.tsx`

```typescript
<SimulationResultsPanel
  stats={stats}
  isVisible={showResultsPanel}
  onClose={() => setShowResultsPanel(false)}
  buildingCount={polygonBuildings.size}
  closedRoads={stats.closed}
  map={mapRef.current}
  centerPoint={mapRef.current?.getCenter().toArray() as [number, number] | undefined}
/>
```

---

## Tileset Requirements

### Required Layers

The feature requires **at least one** of the following layers to be present:
- `building` (most common in OSM/Mapbox tilesets)
- `poi-label` or `poi` or `poi_label`
- `place-label`

### Checking Available Layers

```typescript
const style = map.getStyle();
const layerIds = style.layers.map(l => l.id);
console.log('Available layers:', layerIds);
```

### Common Tilesets

| Tileset | Has Buildings | Has POIs | Notes |
|---------|---------------|----------|-------|
| Mapbox Streets v11 | ✅ | ✅ | Full support |
| OpenMapTiles | ✅ | ✅ | Full support |
| Mapbox Basic | ✅ | ⚠️ | Limited POIs |
| Custom OSM | ⚠️ | ⚠️ | Depends on schema |

---

## Future Enhancements

### Potential Improvements

1. **Distance Display**
   - Show "152m away" using haversine calculation
   - Sort by actual distance, not just priority

2. **Interactive Selection**
   - Click building card to highlight on map
   - Zoom to selected building

3. **Cached Geocoding**
   - Optional Mapbox Geocoding API integration
   - Cache results for buildings without OSM addresses

4. **Customizable Radius**
   - User slider to adjust search radius
   - UI feedback showing search area on map

5. **Filter by Type**
   - Toggle categories (restaurants, banks, etc.)
   - "Show only businesses" checkbox

6. **Impact Indicators**
   - Show which buildings are in high-delay zones
   - Color-code by traffic impact level

---

## Troubleshooting

### Common Issues

#### No Buildings Appear

**Causes:**
- Map not initialized yet
- Tileset doesn't have building/POI layers
- Center point outside loaded tile area

**Solutions:**
1. Check `map` and `centerPoint` are defined
2. Verify layers exist: `map.getLayer('building')`
3. Ensure map has loaded: `map.loaded()`

#### Wrong Buildings Shown

**Causes:**
- Using map center instead of construction site center
- 500px radius too large/small for zoom level

**Solutions:**
1. Pass specific building coordinates as `centerPoint`
2. Adjust `radiusPixels` based on zoom level
3. Use selected building centroid when available

#### Performance Issues

**Causes:**
- Querying too many layers
- Large radius with high feature density
- Re-querying on every render

**Solutions:**
1. Limit to essential layers only
2. Reduce radius or limit results
3. Add proper `useEffect` dependencies

---

## Testing

### Manual Testing Checklist

- [ ] Open SimulationResultsPanel
- [ ] Verify 5 or fewer buildings shown
- [ ] Check named businesses appear first
- [ ] Confirm addresses are formatted correctly
- [ ] Test at different zoom levels
- [ ] Verify icons match business types
- [ ] Check "Unnamed Building" fallback works
- [ ] Test with panel minimized (should not query)
- [ ] Verify no console errors

### Test Locations (Toronto)

| Location | Expected Results |
|----------|------------------|
| King & Bay | Financial district, many banks/offices |
| Yonge & Dundas | Retail, restaurants, entertainment |
| University of Toronto | Campus buildings, libraries, cafes |
| CN Tower area | Hotels, attractions, restaurants |

---

## Related Files

- `src/components/SimulationResultsPanel.tsx` - Main implementation
- `src/App.tsx` - Props passing
- `src/types/building.ts` - Type definitions
- `docs/NEARBY_BUILDINGS_FEATURE.md` - This documentation

---

## References

- [MapLibre GL JS queryRenderedFeatures](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#queryrenderedfeatures)
- [OpenStreetMap Tagging Schema](https://wiki.openstreetmap.org/wiki/Map_features)
- [Mapbox Vector Tile Specification](https://docs.mapbox.com/data/tilesets/reference/mapbox-streets-v8/)
- [OSM Address Tags](https://wiki.openstreetmap.org/wiki/Key:addr)

---

## License & Attribution

Data sourced from OpenStreetMap © OpenStreetMap contributors  
Map rendering by MapLibre GL JS
