---
name: av-schematic
description: Draw and edit AV signal-flow schematics, equipment racks and 3D room layouts in iconic using its MCP tools. Create device nodes from product models or datasheets and room layouts from photos or floor plans. Use when placing AV devices, zones or cables, designing a rack, or laying out a room.
---

# iconic AV canvas

Operate the open iconic drawing through the `av-schematic` MCP server. The app owns drawing state; this skill supplies the workflow. Installing a skill does not register MCP.

If tools are unavailable or a connection fails, read [setup](references/setup.md). For tool choices and layout details, read [tools](references/tools.md). These references are relative to this skill, not to the user's current project.

## Work on the drawing

- Read `list_devices` before editing. Also read `get_room` when working in 3D. Use the returned tags and port labels; do not invent existing state.
- Preserve existing work unless the user requests replacement. Clear the drawing/room or delete devices only when requested.
- Create zones before devices, devices before cables. Give ports a signal type and use exact tags and labels for connections.
- Reuse device tags across schematic, rack equipment and 3D items. Room measurements are metres.
- Use `build_system` or `build_room` for larger layouts. Commands apply sequentially; after an error, read state before retrying to avoid duplicates. Already-applied commands remain.
- Read back the affected drawing or room after changes and report what the tools actually completed.

Manual app features include project JSON and PNG/SVG/PDF/HTML/XLSX exports. The current MCP tools do not perform file exports. Never claim an export happened without an available tool or an authorized, verified app action.

## Product models, datasheets and room images

Use [import workflows](references/imports.md) when the user supplies a product model, datasheet, room photo or floor plan. The AI client performs research, PDF reading and vision; MCP accepts the extracted structured result. Do not ask the user to manually turn an accessible attachment into JSON. Use `import_product` or `import_room_layout` to retain evidence and assumptions. These tools do not fetch files or run a model themselves.
