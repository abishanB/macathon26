# Nearby Buildings - Debug Guide

**Issue Found:** February 8, 2026  
**Problem:** Wrong buildings shown - using map center instead of construction site location

---

## The Problem

### Before Fix
```typescript
// ❌ WRONG - Uses viewport center, not construction site
centerPoint={mapRef.current?.getCenter().toArray()}
```

**Result:** Shows random buildings from wherever you're looking on the map, NOT the buildings actually near your construction site.

### After Fix
```typescript
// ✓ CORRECT - Calculates centroid of all placed buildings
centerPoint={(() => {
  // Calculate average position of all building coordinates
  const centroid = calculateBuildingsCentroid(polygonBuildings);
  return centroid;
})()}
```

**Result:** Shows buildings that are actually near your construction site!

---

## Debug Console Output

When you open the Simulation Results Panel, you'll now see detailed logs:

### Example Output

```javascript
[Nearby Buildings] Using construction site centroid: [-79.38325, 43.65692]
[Nearby Buildings] Number of buildings: 1

[Nearby Buildings Query] ===== START =====
[Nearby Buildings Query] Center point (construction site): [-79.38325, 43.65692]
[Nearby Buildings Query] Center pixel: { x: 512, y: 384 }
[Nearby Buildings Query] Search radius: 500 pixels
[Nearby Buildings Query] Bounding box: {
  sw: [12, -116],
  ne: [1012, 884]
}
[Nearby Buildings Query] Available layers: ["building", "poi-label"]
[Nearby Buildings Query] Total features found: 47

[Nearby Buildings Debug] Feature properties: {
  layer: "poi-label",
  name: "Vegan Bear",
  allProps: ["name", "maki", "class", ...],
  sampleProps: { name: "Vegan Bear", class: "restaurant", ... }
}

[Nearby Buildings Query] Total unique places after dedup: 32
[Nearby Buildings Query] Top 10 by priority: [
  { name: "Vegan Bear", priority: 15, type: "restaurant", address: "43.6569°N, -79.3833°W" },
  { name: "The Tenor", priority: 15, type: "restaurant", address: "43.6570°N, -79.3835°W" },
  { name: "Kordog", priority: 15, type: "restaurant", address: "43.6571°N, -79.3834°W" },
  ...
]
[Nearby Buildings Query] ===== END =====
```

---

## How to Debug

### Step 1: Open Browser Console

**Chrome/Edge:** Press `F12` or `Ctrl+Shift+I`  
**Firefox:** Press `F12` or `Ctrl+Shift+K`

### Step 2: Place a Building

1. Click "Switch to Build Mode"
2. Draw a building on the map (click and drag)
3. Click "Recompute" if needed

### Step 3: Open Results Panel

The panel should open automatically after simulation. Look for console logs.

### Step 4: Verify Center Point

Check the console log:
```javascript
[Nearby Buildings] Using construction site centroid: [-79.38325, 43.65692]
```

**Verify this matches your building location:**
- Hover your mouse over the building
- Check the coordinates at bottom-right of screen
- They should be very close (within 0.001 degrees)

### Step 5: Check Query Results

Look for:
```javascript
[Nearby Buildings Query] Total features found: 47
```

**If 0 features:**
- Building might be in area with no POI data
- Zoom level might be too far out
- Tileset might not have POI layers

**If many features (50+):**
- Search radius might be too large
- Dense urban area (normal)

### Step 6: Check Priority Sorting

Look at the "Top 10 by priority" log. Named businesses should have priority 15+ (10 for name + 5 for amenity/shop).

---

## Common Issues & Solutions

### Issue: "Total features found: 0"

**Causes:**
1. No POI data in that area
2. Map zoom level too far out (POIs not rendered)
3. Tileset doesn't have poi-label layer

**Solutions:**
1. Zoom in closer (zoom level 15+)
2. Check available layers: `map.getStyle().layers.map(l => l.id)`
3. Test in downtown Toronto (known to have POIs)

---

### Issue: Wrong buildings still showing

**Causes:**
1. No buildings placed yet (polygonBuildings.size === 0)
2. Buildings placed but centerPoint still undefined
3. Map center being used as fallback

**Solutions:**
1. Check console: `[Nearby Buildings] Number of buildings: 0` means no buildings
2. Make sure `calculateBuildingsCentroid()` is working
3. Verify buildings are actually in `polygonBuildings` state

---

### Issue: Priority scores seem wrong

**Example:** Generic building showing before named restaurant

**Debug:**
Look at the "Top 10 by priority" output. Priority scoring:
- Named place: +10 points
- Has amenity/shop: +5 points
- From POI layer: +3 points

**Expected:**
- Named restaurant: 15-18 points
- Named building: 10-13 points
- Unnamed building: 0-3 points

If a restaurant has priority < 15, it's missing `name` or `amenity` properties.

---

### Issue: Same building appears multiple times

**Causes:**
- Building has multiple features (footprint + label + entrance)
- Feature ID not unique

**Check console for:**
```javascript
[Nearby Buildings Query] Total features found: 47
[Nearby Buildings Query] Total unique places after dedup: 32
```

The dedup should reduce the count. If not, features don't have proper IDs.

---

## Distance Explanation

### Pixel Radius vs Geographic Distance

**500 pixels ≠ fixed meters!** It depends on zoom level:

| Zoom Level | 500px Radius | Approximate Coverage |
|------------|--------------|----------------------|
| 12 | ~2-3 km | City district |
| 14 | ~500-800 m | Neighborhood |
| 16 | ~100-200 m | City block |
| 18 | ~25-50 m | Single building area |

**Why pixel-based?**
- More intuitive (what you see on screen)
- Zoom in = more precise, fewer results
- Zoom out = broader area, more results

---

## Testing Checklist

- [ ] Place a building downtown Toronto
- [ ] Open browser console (F12)
- [ ] Open Simulation Results Panel
- [ ] Verify "Using construction site centroid" shows building location
- [ ] Check "Total features found" is > 0
- [ ] Verify top results are actually close to building (check on map)
- [ ] Named restaurants/shops appear first
- [ ] Addresses show neighborhood or coordinates
- [ ] No duplicate entries

---

## Advanced Debugging

### Print All Available Layers

```javascript
// Run in browser console
const map = mapRef.current;
const layers = map.getStyle().layers.map(l => ({
  id: l.id,
  type: l.type,
  source: l.source
}));
console.table(layers.filter(l => 
  l.id.includes('poi') || 
  l.id.includes('place') || 
  l.id.includes('building')
));
```

### Test Specific Coordinates

```javascript
// Run in browser console to test specific location
const testPoint = [-79.3832, 43.6532]; // King & Bay
const testPixel = map.project(testPoint);
const bbox = [
  [testPixel.x - 500, testPixel.y - 500],
  [testPixel.x + 500, testPixel.y + 500]
];
const features = map.queryRenderedFeatures(bbox, {
  layers: ['poi-label', 'building']
});
console.log('Features at King & Bay:', features.length);
console.log('Sample:', features.slice(0, 5).map(f => f.properties.name));
```

---

## Performance Impact

All console logging is development-only. For production:

1. **Option A:** Remove console.log statements
2. **Option B:** Wrap in environment check:
   ```typescript
   if (import.meta.env.DEV) {
     console.log('[Nearby Buildings]', ...);
   }
   ```
3. **Option C:** Use a logger that auto-strips in production

Current logs add ~1-2ms overhead (negligible).

---

## Related Files

- `src/App.tsx` - centerPoint calculation
- `src/components/SimulationResultsPanel.tsx` - Query function with logging
- `docs/NEARBY_BUILDINGS_FEATURE.md` - Original feature docs
- `docs/NEARBY_BUILDINGS_FIXES.md` - Address & delay fixes
- `docs/NEARBY_BUILDINGS_DEBUG.md` - This file

---

## Quick Reference

### Key Console Messages

| Message | Meaning |
|---------|---------|
| `Using construction site centroid: [lng, lat]` | ✅ Using correct location |
| `Number of buildings: 0` | ⚠️ No buildings placed yet |
| `Available layers: []` | ❌ No POI layers in tileset |
| `Total features found: 0` | ⚠️ No POIs in this area |
| `Total unique places after dedup: X` | ℹ️ X unique buildings found |

---

**Last Updated:** February 8, 2026  
**Status:** Debug logging enabled, centerPoint fixed to use construction site location
