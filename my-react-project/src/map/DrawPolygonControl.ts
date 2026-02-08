import type { ControlPosition, IControl, Map } from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";

/**
 * Custom MapLibre control for Draw Polygon button
 * Positioned on the left side, below navigation controls
 */
export class DrawPolygonControl implements IControl {
  private _container: HTMLDivElement;
  private _button: HTMLButtonElement;
  private _draw: MapboxDraw | null = null;
  private _isActive: boolean = false;
  private _onToggle?: (active: boolean) => void;

  constructor(onToggle?: (active: boolean) => void) {
    this._onToggle = onToggle;
    this._container = document.createElement("div");
    this._container.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    this._container.style.marginTop = "10px"; // Space below navigation controls

    this._button = document.createElement("button");
    this._button.type = "button";
    this._button.className = "mapboxgl-ctrl-icon";
    this._button.innerHTML = "✏️";
    this._button.title = "Draw Polygon";
    this._button.style.cssText = `
      width: 29px;
      height: 29px;
      background-color: #6c757d;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      color: white;
      transition: background-color 0.2s;
    `;

    this._button.addEventListener("click", () => {
      this.toggle();
    });

    this._button.addEventListener("mouseenter", () => {
      if (!this._isActive) {
        this._button.style.backgroundColor = "#5a6268";
      }
    });

    this._button.addEventListener("mouseleave", () => {
      if (!this._isActive) {
        this._button.style.backgroundColor = "#6c757d";
      }
    });

    this._container.appendChild(this._button);
  }

  onAdd(map: Map): HTMLDivElement {
    // Initialize MapboxDraw if not already done
    if (!this._draw) {
      this._draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true,
        },
        defaultMode: "simple_select",
      });
      // Add draw control to map (it will be positioned separately)
      map.addControl(this._draw);
    }
    return this._container;
  }

  onRemove(): void {
    this._container.parentNode?.removeChild(this._container);
  }

  getDefaultPosition(): ControlPosition {
    return "top-left";
  }

  toggle(): void {
    if (!this._draw) return;

    this._isActive = !this._isActive;

    if (this._isActive) {
      this._draw.changeMode("draw_polygon");
      this._button.style.backgroundColor = "#007bff";
      this._button.title = "Exit Draw Mode";
    } else {
      this._draw.changeMode("simple_select");
      this._button.style.backgroundColor = "#6c757d";
      this._button.title = "Draw Polygon";
    }

    this._onToggle?.(this._isActive);
  }

  setActive(active: boolean): void {
    if (this._isActive === active) return;
    this.toggle();
  }

  getDraw(): MapboxDraw | null {
    return this._draw;
  }
}
