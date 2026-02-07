import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2] ?? path.join("scripts", "overpass_roads_raw.json");
const outputPath =
  process.argv[3] ?? path.join("public", "data", "roads_downtown.geojson");

const DRIVEABLE_HIGHWAYS = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "residential",
  "unclassified",
  "living_street",
  "road",
]);

const rawText = fs.readFileSync(inputPath, "utf8");
const raw = JSON.parse(rawText);
const elements = Array.isArray(raw.elements) ? raw.elements : [];

const features = [];
for (const el of elements) {
  if (el?.type !== "way" || !Array.isArray(el.geometry)) {
    continue;
  }
  const highway = el?.tags?.highway;
  if (typeof highway !== "string" || !DRIVEABLE_HIGHWAYS.has(highway)) {
    continue;
  }

  const coordinates = el.geometry
    .map((point) => [Number(point.lon), Number(point.lat)])
    .filter((coord) => Number.isFinite(coord[0]) && Number.isFinite(coord[1]));
  if (coordinates.length < 2) {
    continue;
  }

  features.push({
    type: "Feature",
    properties: {
      osm_id: String(el.id),
      highway,
      name: typeof el?.tags?.name === "string" ? el.tags.name : undefined,
      oneway: typeof el?.tags?.oneway === "string" ? el.tags.oneway : undefined,
    },
    geometry: {
      type: "LineString",
      coordinates,
    },
  });
}

const geojson = {
  type: "FeatureCollection",
  features,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(geojson));

console.log(`Converted ${features.length} drivable road features.`);
console.log(`Wrote ${outputPath}`);
