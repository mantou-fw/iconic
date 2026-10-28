# MCP tools and layout

| Task | Tools |
| --- | --- |
| Read drawing | `list_devices` |
| Create zones/devices | `add_zone`, `add_device` |
| Model/datasheet → node | `import_product` |
| Photos/floor plan → room | `import_room_layout` |
| Connect device ports | `connect_devices` |
| Notes and layout | `add_note`, `auto_layout` |
| Rack elevation | `add_rack` |
| Room state/layout | `get_room`, `set_room`, `add_room_item` |
| Batch construction | `build_system`, `build_room` |
| Requested removal | `delete_device`, `clear_canvas`, `clear_room` |

Use the live tool schemas for parameters. Typical signal types are audio, video, network, control and power. Create the named zone before assigning devices to it. Choose readable unique tags, such as DSP-01, AMP-01 and SPK-L, then reuse them in rack bays and room items. Match cables by exact port label rather than guessing an internal port ID.

For 3D, read the room before changing dimensions and place equipment using metres. Device and furniture kinds are defined by the live schema. Do not clear room items merely to adjust room dimensions.

`build_room` preserves existing items by default and accepts per-item sizes. Prefer `import_room_layout` for image-derived layouts: it validates the entire import before editing and retains source/scale assumptions. See [import workflows](imports.md).

Example request: “Read the existing drawing, then add a meeting-room display, DSP, amplifier and two speakers with their audio connections. Preserve current contents.” Read the result after creation and report actual devices/cables and any errors.
