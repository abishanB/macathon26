param(
  [string]$QueryPath = ".\\scripts\\overpass_downtown_toronto.query",
  [string]$OutPath = ".\\scripts\\overpass_roads_raw.json"
)

if (-not (Test-Path $QueryPath)) {
  Write-Error "Query file not found: $QueryPath"
  exit 1
}

$query = Get-Content -Raw -Path $QueryPath
$url = "https://overpass-api.de/api/interpreter"

Write-Host "Fetching road data from Overpass..."
Invoke-WebRequest `
  -Uri $url `
  -Method Post `
  -Body $query `
  -ContentType "text/plain" `
  -OutFile $OutPath

Write-Host "Saved raw Overpass response to $OutPath"
Write-Host "Convert to app GeoJSON with:"
Write-Host "  node ./scripts/convert-overpass-to-geojson.mjs $OutPath ./public/data/roads_downtown.geojson"
