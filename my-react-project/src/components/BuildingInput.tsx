import { useState, useEffect } from 'react';
import './BuildingInput.css';

interface BuildingInputProps {
  onBuildingAdded: () => void;
}

interface Building {
  id: string;
  coordinates: number[][];
  height?: number;
  properties?: Record<string, any>;
}

export function BuildingInput({ onBuildingAdded }: BuildingInputProps) {
  const [coordinates, setCoordinates] = useState('');
  const [height, setHeight] = useState('20');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoadingBuildings, setIsLoadingBuildings] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      // Parse coordinates
      // Expected format: "lng,lat lng,lat lng,lat" or "lng,lat; lng,lat; lng,lat"
      const coordPairs = coordinates
        .split(/[;\n]/)
        .map(pair => pair.trim())
        .filter(pair => pair.length > 0);

      const parsedCoords: number[][] = [];
      
      for (const pair of coordPairs) {
        const [lngStr, latStr] = pair.split(',').map(s => s.trim());
        const lng = parseFloat(lngStr);
        const lat = parseFloat(latStr);

        if (isNaN(lng) || isNaN(lat)) {
          throw new Error(`Invalid coordinate pair: ${pair}`);
        }

        // Validate Toronto bounds
        if (lng < -79.6 || lng > -79.2 || lat < 43.58 || lat > 43.85) {
          throw new Error(`Coordinates outside Toronto bounds: ${pair}`);
        }

        parsedCoords.push([lng, lat]);
      }

      if (parsedCoords.length < 3) {
        throw new Error('Need at least 3 coordinate pairs to form a polygon');
      }

      // Send to backend
      const response = await fetch('http://localhost:3001/api/buildings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: parsedCoords,
          height: parseFloat(height),
          properties: {
            name: 'Custom Building',
            type: 'custom'
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add building');
      }

      await response.json();
      setSuccess(`Building added successfully!`);
      setCoordinates('');
      
      // Refresh buildings list and notify parent to refresh map
      loadBuildings();
      onBuildingAdded();

    } catch (err: any) {
      setError(err.message || 'Failed to add building');
    } finally {
      setIsLoading(false);
    }
  };

  // Load buildings list
  const loadBuildings = async () => {
    setIsLoadingBuildings(true);
    try {
      const response = await fetch('http://localhost:3001/api/buildings/list');
      if (response.ok) {
        const data = await response.json();
        setBuildings(data);
      }
    } catch (err) {
      console.error('Failed to load buildings:', err);
    } finally {
      setIsLoadingBuildings(false);
    }
  };

  useEffect(() => {
    loadBuildings();
    // Refresh list when buildings are added
    const interval = setInterval(loadBuildings, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this building?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/buildings/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete building');
      }

      setSuccess('Building deleted');
      loadBuildings();
      onBuildingAdded();
    } catch (err) {
      setError('Failed to delete building');
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all custom buildings?')) {
      return;
    }

    try {
      await fetch('http://localhost:3001/api/buildings', {
        method: 'DELETE',
      });
      setSuccess('All custom buildings cleared');
      loadBuildings();
      onBuildingAdded();
    } catch (err) {
      setError('Failed to clear buildings');
    }
  };

  return (
    <div className="building-input">
      <h3>Add Custom Building</h3>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="coordinates">
            Coordinates (lng,lat pairs, one per line):
          </label>
          <textarea
            id="coordinates"
            value={coordinates}
            onChange={(e) => setCoordinates(e.target.value)}
            placeholder="-79.3871,43.6426&#10;-79.3869,43.6426&#10;-79.3869,43.6424&#10;-79.3871,43.6424"
            rows={6}
            required
          />
          <small>Enter at least 3 points to form a building polygon</small>
        </div>

        <div className="form-group">
          <label htmlFor="height">Height (meters):</label>
          <input
            id="height"
            type="number"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            min="1"
            max="500"
            required
          />
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="button-group">
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Adding...' : 'Add Building'}
          </button>
          <button type="button" onClick={handleClear} className="secondary">
            Clear All
          </button>
        </div>
      </form>

      <div className="buildings-list">
        <h4>Your Buildings ({buildings.length})</h4>
        {isLoadingBuildings ? (
          <div className="loading">Loading...</div>
        ) : buildings.length === 0 ? (
          <div className="no-buildings">No buildings added yet</div>
        ) : (
          <div className="buildings-scroll">
            {buildings.map((building) => (
              <div key={building.id} className="building-item">
                <div className="building-info">
                  <div className="building-id">ID: {building.id}</div>
                  <div className="building-details">
                    Height: {building.height || 20}m • Points: {building.coordinates.length}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(building.id)}
                  className="delete-btn"
                  title="Delete this building"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="example">
        <strong>Example (CN Tower area):</strong>
        <pre>
-79.3871,43.6426{'\n'}
-79.3869,43.6426{'\n'}
-79.3869,43.6424{'\n'}
-79.3871,43.6424
        </pre>
      </div>
    </div>
  );
}
