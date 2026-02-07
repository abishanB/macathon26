# MCP Server Setup for UrbanSim Hackathon

## Available MCP Resources

### Mapbox MCP Server
- **Purpose**: Exposes geocoding/routing as agent tools
- **Usage**: Adapt for sim ("run traffic on bbox"). Demo agent pans/zooms maps.
- **Reference**: cursor.directory/mapbox-gl-js

### Cursor.directory Resources
- **Next.js/Mapbox rules/templates**: Copy-paste starters for Next.js 15 + Mapbox integration
- **Mapbox GL JS Guides**: Draw controls, custom layers, 3D urban examples

## Configuration

MCP servers are configured in Cursor Settings:
1. Open Cursor Settings (Cmd/Ctrl + ,)
2. Navigate to "Features" → "Model Context Protocol"
3. Add MCP servers as needed

## Usage in Agent Mode

When using `@agent` or Composer:
- Rules auto-attach by glob patterns (e.g., `**/map*.tsx` → `maps.mdc`)
- MCP tools become available for agent interactions
- Example: Agent can use Mapbox MCP to geocode addresses or calculate routes

## Pseudo-Agent Pattern

For Backboard integration:
- Use Backboard chat as pseudo-agent: `client.chat("Find optimal road via sim")`
- This simulates agent behavior without full MCP server setup
