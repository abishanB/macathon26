# Cursor Rules Setup for UrbanSim Hackathon

## Structure

```
.cursorrules                    # Root rules (always applied)
.cursor/
  ├── rules/
  │   ├── maps.mdc             # Auto-attaches to **/map*.tsx, **/editor*.tsx
  │   ├── backboard.mdc        # Auto-attaches to **/backboard*, **/api/sim*
  │   ├── nextjs.mdc           # Auto-attaches to app/, components/
  │   └── agent.mdc            # Manual/Agent-requested
  └── MCP_SETUP.md             # MCP server configuration guide
```

## How It Works

### Auto-Attachment
- **maps.mdc**: Automatically attaches when editing files matching `**/map*.tsx` or `**/editor*.tsx`
- **backboard.mdc**: Automatically attaches when editing `**/backboard*` or `**/api/sim*` files
- **nextjs.mdc**: Automatically attaches when editing files in `app/` or `components/` directories
- **agent.mdc**: Use with `@agent` or when explicitly requested in Composer

### Root Rules (.cursorrules)
- Always applied to all files
- Contains core project guidelines, architecture patterns, and dependencies
- References: `@file tsconfig.json`, `@file tailwind.config.ts`, `@file .env.example`

## Usage

1. **In Cursor Settings**:
   - Go to Settings > General > Project Rules
   - Rules will auto-sync from `.cursorrules` and `.cursor/rules/`

2. **In Composer/Agent**:
   - Rules automatically attach based on file patterns
   - Use `@agent` to trigger agent.mdc rules
   - Example: `@agent Implement map editor per rules`

3. **MCP Integration**:
   - See `.cursor/MCP_SETUP.md` for MCP server configuration
   - Mapbox MCP Server provides geocoding/routing tools
   - Backboard chat acts as pseudo-agent

## Testing

After setup, test with:
```bash
# In Composer, try:
"Implement map editor per rules"
# Rules should auto-attach based on file patterns
```

## Next Steps

1. Create `.env.example` with required API keys (Mapbox, Backboard, Supabase)
2. Install dependencies: `npm i @mapbox/mapbox-gl-geocoder mapbox-gl @turf/turf @supabase/supabase-js backboard-sdk recharts jsPDF`
3. Set up Docker for Roadrunner: `docker run stevetarter/roadrunner`
4. Configure MCP servers in Cursor Settings (optional)
