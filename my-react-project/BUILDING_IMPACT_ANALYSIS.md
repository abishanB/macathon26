# Building Construction Impact Analysis

## Overview

The UrbanSim Toronto application now features a **comprehensive building construction impact analysis system** that allows users to:

1. **Place buildings** on the map by drag-and-drop
2. **Adjust building parameters** (height, size, type)
3. **Input construction details** (duration, traffic impact, environmental controls)
4. **Receive AI-powered analysis** of construction impacts on:
   - Traffic congestion and transit routes
   - Air quality (PM10, PM2.5, dust)
   - Noise pollution
   - Economic impact on local businesses
   - Regulatory compliance requirements

---

## Features

### 1. **Building Placement**

- Click the **"+ Add Building"** button to enter building placement mode
- Click anywhere on the map to place a new building
- Buildings appear as 3D extrusions on the map (red/orange when unselected, blue when selected)

### 2. **Building Controls**

When a building is selected, a control panel appears in the top-right with sliders to adjust:

- **Height** (10m - 200m)
- **Footprint size** (10m × 10m to 100m × 100m)
- **Building type** (Residential, Commercial, Mixed-Use, Industrial, Institutional)

### 3. **Construction Details Input**

Click **"Analyze Construction Impact"** to open a detailed form collecting:

#### Building Specifications
- Building type and number of stories
- Footprint dimensions
- Post-construction expected occupancy

#### Construction Timeline
- Duration (months)
- Start date
- Work hours (start/end times)
- Weekend/night work options

#### Traffic Impact
- Number of lane closures
- Parking spaces lost
- Delivery trucks per day

#### Environmental Factors
- Excavation depth
- Foundation type (shallow, deep, piles)
- Dust control measures
- Noise control measures

#### Post-Construction
- Parking spaces created
- Expected daily occupancy

### 4. **AI-Powered Impact Analysis**

After submitting construction details, the system:

1. Sends data to Backboard.io RAG system
2. Analyzes against **7 Toronto regulatory documents**:
   - CMP Fall 2024 & 2023
   - TIS Guidelines 2013
   - Traffic Disruption Management 2015
   - Noise Bylaw 2026
   - RoDARS/TTC coordination
   - Zoning & construction regulations

3. Returns comprehensive impact report with:

#### Traffic Impact
- Estimated delay percentage
- Peak hour delay (minutes)
- Affected routes
- Detour requirements
- Transit route disruptions
- Compliance status

#### Environmental Impact
- **Air Quality**: PM10/PM2.5 estimates, dust levels, compliance
- **Noise**: Peak noise levels (dB), bylaw compliance, mitigation requirements
- **Dust Control**: Required measures

#### Economic Impact
- Business impact severity (minimal/moderate/significant/severe)
- Estimated revenue loss to local businesses
- Number of affected businesses

#### Regulatory Compliance
- Required permits (Building, RoDARS, Lane Closure, etc.)
- Traffic Management Plan requirement
- Environmental Assessment requirement
- Community consultation requirement
- Mitigation measures

#### Overall Assessment
- Risk level (low/medium/high/critical)
- Severity score (1-10)
- Recommended actions
- Comprehensive narrative analysis

---

## Research-Based Impact Factors

The system analyzes construction impacts based on peer-reviewed research:

### Traffic & Transportation
- **Lane closures** → increased congestion, delays, queue lengths
- **Work zone effects** → 5%+ delay threshold (TIS Guidelines)
- **Transit disruptions** → bus detours, route changes
- **Peak hour multipliers** → 7-9 AM, 4-6 PM
- **Emergency vehicle access** considerations

### Environmental Impacts
- **Air Quality**: PM10/PM2.5 emissions 100-1000× higher than standards during construction
- **Dust**: Excavation, materials transport, waste stacking
- **Noise**: Toronto bylaw limits (65dB or ambient+5dB, 7AM-7PM)
- **Control measures**: Water spraying, fog cannons, acoustic barriers

### Construction Phases
- **Earthwork**: Highest dust/noise (hammer piling, excavation)
- **Foundation**: Piling operations, deep excavation
- **Structure**: Material deliveries, equipment operation
- **Finishing**: Lower impact phase

### Urban System Impacts
- Population density effects
- Road network connectivity
- Land use mix changes
- Economic impact on nearby businesses (revenue loss estimates)
- Service access disruption

---

## Usage Example

### Step 1: Place a Building

```
1. Click "+ Add Building" button
2. Click on map at desired location
3. Building appears with default 30m height, 20m × 20m footprint
```

### Step 2: Adjust Building

```
1. Use sliders to adjust:
   - Height: 60m (17 stories)
   - Footprint: 40m × 40m (1,600 m²)
2. Change type to "Commercial"
```

### Step 3: Input Construction Details

```
1. Click "📊 Analyze Construction Impact"
2. Fill in form:
   - Duration: 18 months
   - Lane closures: 2
   - Parking lost: 15 spaces
   - Delivery trucks: 20/day
   - Excavation: 8m depth
   - Work hours: 7 AM - 7 PM
   - Dust/noise controls: ✓ Enabled
```

### Step 4: Review Impact Report

The AI analysis returns:

```
Risk Level: HIGH
Severity: 7/10

Traffic Impact:
- Peak hour delay: 12 minutes
- Estimated delay: 8.5%
- Compliance: REQUIRES MITIGATION (>5% threshold)

Environmental:
- PM10: 60 μg/m³
- Noise: 68 dB (exceeds 65dB limit)
- Mitigation required

Economic:
- Business impact: Significant
- Est. revenue loss: $360,000
- Affected businesses: 16

Required Actions:
1. Submit Traffic Management Plan
2. Obtain RoDARS permit ($76)
3. Coordinate with TTC (7-day notice)
4. Implement dust control (water spraying)
5. Limit work to 7 AM-7 PM
6. Community consultation required
```

---

## Technical Architecture

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `BuildingPlacer` | Map interaction, 3D building rendering |
| `BuildingControls` | Sliders for height/size adjustment |
| `BuildingInfoModal` | Construction details form |
| `ImpactReportModal` | Comprehensive analysis display |

### Backend Integration

| Service | Role |
|---------|------|
| **Backboard.io** | RAG/LLM analysis engine |
| **Toronto Docs** | 7 regulatory documents |
| **analyzeConstructionImpact()** | Structured query generation |

### Data Flow

```
User places building
  ↓
Adjust size/type
  ↓
Click "Analyze Impact"
  ↓
Fill construction details form
  ↓
Submit → Create Backboard thread
  ↓
Send comprehensive query with:
  - Building specs
  - Construction timeline
  - Traffic impact
  - Environmental controls
  ↓
RAG retrieves relevant regulations
  ↓
LLM analyzes against:
  - TIS Guidelines (delay thresholds)
  - CMP (traffic management)
  - Noise Bylaw (dB limits, hours)
  - RoDARS (permits, fees)
  - Environmental standards
  ↓
Return structured JSON analysis
  ↓
Display impact report modal
```

---

## Configuration

### Required Environment Variables

```bash
# .env file
VITE_MAPBOX_TOKEN=your_mapbox_token
VITE_BACKBOARD_API_KEY=your_backboard_api_key
```

### RAG System Setup

```bash
# Run once to ingest Toronto documents
npm run rag:setup

# Or manually:
npm run rag:download-pdfs
npm run rag:ingest
```

---

## API Reference

### `analyzeConstructionImpact()`

```typescript
client.analyzeConstructionImpact(threadId, {
  location: [lng, lat],
  buildingType: 'commercial',
  stories: 20,
  footprint: 1600, // m²
  duration: 18, // months
  laneClosures: 2,
  parkingLost: 15,
  deliveryTrucks: 20,
  excavationDepth: 8,
  workHours: {
    start: '07:00',
    end: '19:00',
    weekend: false,
    night: false,
  },
  dustControl: true,
  noiseControl: true,
  expectedOccupancy: 500,
})
```

**Returns**: Comprehensive `ImpactAnalysis` object with traffic, environmental, economic, compliance, and overall assessment.

---

## Toronto Regulations Reference

| Regulation | Key Thresholds |
|------------|----------------|
| **TIS Guidelines 2013** | >5% delay = mitigation required |
| **CMP 2023-26** | Traffic agents, signal timing, alternative routing |
| **Noise Bylaw 2026** | 65dB max OR ambient+5dB, 7AM-7PM weekdays |
| **RoDARS** | $76 permit fee, 7-day TTC notice |
| **Air Quality Standards** | PM10 <150 μg/m³, PM2.5 <75 μg/m³ |

---

## Future Enhancements

Potential additions:

1. **Real-time traffic simulation integration** - Link construction closures to traffic heatmap
2. **Multi-building analysis** - Cumulative impact of multiple projects
3. **Timeline visualization** - Construction phase impacts over time
4. **Alternative scenarios** - Compare mitigation strategies
5. **Cost-benefit analysis** - Economic tradeoffs
6. **Community impact mapping** - Visualize affected residential areas
7. **PDF report export** - Generate shareable impact assessments

---

## Sources

This system is based on research from:

- **Traffic Impact**: Construction work zone studies (2024-2025)
- **Air Quality**: Building construction PM monitoring (systematic reviews)
- **Noise**: Construction noise management research (ScienceDirect)
- **Urban Planning**: Built environment impact on congestion (MDPI, 2025)
- **Traffic Management**: CalTrans TMP Guidelines, FHWA Work Zone guides

---

## Support

For issues or questions:

1. Check console for error messages
2. Verify `.env` has valid API keys
3. Ensure RAG documents are ingested (`npm run rag:ingest`)
4. Review `CHANGELOG.md` for recent changes

---

**Version**: 0.4.0
**Last Updated**: February 7, 2026
**Author**: UrbanSim Toronto Team
