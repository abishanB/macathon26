# Changelog

## [Unreleased]

### Added - February 8, 2026
- **AI Context Analysis**: Gemini 2.0 Flash-powered analysis of construction impact based on nearby buildings
  - Analyzes business competition (e.g., multiple restaurants, market saturation)
  - Identifies feasibility concerns (e.g., multiple schools, conflicting uses)
  - Evaluates community impact (essential service access, parking, foot traffic)
  - Highlights opportunities (complementary businesses, mixed-use benefits)
  - Displays in new "🤖 AI Impact Analysis" section below Nearby Buildings
  - Uses Backboard.io + OpenRouter integration
  - ~2 second response time, costs ~$0.025 per analysis
  - See `docs/AI_CONTEXT_ANALYSIS_FEATURE.md` for full documentation

### Fixed - February 8, 2026
- Removed unused deck.gl imports causing TypeScript build errors
- Fixed implicit 'any' type errors in App.tsx

## [Previous Releases] - 2026-02-08

### Added - Nearby Buildings Feature

#### User-Facing Changes
- **Nearby Buildings section** in Simulation Results Panel
  - Displays up to 5 buildings/POIs within 500-pixel radius
  - Shows business names (e.g., "Taco Bell", "RBC Office")
  - Includes addresses and business types
  - Type-specific emoji icons for easy identification
  - Prioritizes named businesses over generic buildings

#### Technical Implementation
- New function `getNearbyBuildingsAndPOIs()` 
  - Queries rendered map features using `map.queryRenderedFeatures()`
  - Searches building, POI, and place-label layers
  - Implements priority scoring system (named POIs > buildings)
  - Zero API costs - uses local vector tile data

- Updated `SimulationResultsPanel.tsx`
  - Added `map` and `centerPoint` props
  - Added `useEffect` hook for real-time querying
  - New helper function `getTypeIcon()` with 30+ business type icons

- Updated `App.tsx`
  - Passes `mapRef.current` to SimulationResultsPanel
  - Passes `map.getCenter()` as centerPoint

#### Documentation
- Created comprehensive docs at `docs/NEARBY_BUILDINGS_FEATURE.md`
  - Architecture overview
  - Algorithm documentation
  - OSM property mappings
  - Icon system reference
  - Performance considerations
  - Troubleshooting guide
  - Testing checklist

#### Files Changed
- `src/components/SimulationResultsPanel.tsx` - Main feature implementation
- `src/App.tsx` - Props integration
- `docs/NEARBY_BUILDINGS_FEATURE.md` - Feature documentation
- `CHANGELOG.md` - This file

---

## [Previous] - 2026-02-08

### Changed - UI Improvements and Traffic Simulation Fix

- Simplified stats strip to show closed roads and trip impact percentage
- Removed technical network metrics (nodes, edges, runtime) from results panel
- Changed delay metric from percentage to time (minutes/seconds)
- Added plain-language "What this means" explanations for traffic impact
- Increased BPR alpha coefficient from 0.15 to 0.6 for better congestion visibility
- Roads now properly show orange/yellow delays near construction zones
- Removed unused imports

### Fixed
- Traffic simulation now correctly shows delays near construction zones
- Build passes with no TypeScript errors

---

## Future Enhancements

### Nearby Buildings Feature Roadmap
- [ ] Add distance display ("152m away")
- [ ] Interactive building selection (click to highlight on map)
- [ ] Optional Mapbox Geocoding API for better addresses
- [ ] Customizable search radius slider
- [ ] Filter by business type
- [ ] Impact indicators (color-code by traffic delay)
