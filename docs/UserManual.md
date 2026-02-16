# LagZero User Manual

## Category Management

LagZero allows you to organize your games and applications into custom categories.

1. **Accessing Categories**: Click the "Manage Categories" button (folder icon) in the Game Library view.
2. **Adding a Category**: Enter a name in the input field and click "Add".
3. **Editing**: Double-click a category name to rename it.
4. **Reordering**: Drag and drop categories using the handle icon to change their display order.
5. **Deleting**: Click the trash icon to remove a category.

## Advanced Configuration

For games requiring specific network settings, use the Advanced Config Editor.

1. **Editing Game Config**: Click the "Edit" (pencil) icon on any game card.
2. **Process Management**: 
   - Add multiple process names (e.g., launcher and game executable).
   - The system supports multi-select and dynamic addition of processes.
3. **Chain Proxy**:
   - Enable "Chain Proxy Detection" to automatically proxy child processes started by the game.
   - This is useful for games with launchers that spawn separate game clients.

## Intelligent Proxy Monitor

When a game is running with acceleration enabled:
- The **Proxy Monitor** panel in the Dashboard shows real-time status.
- If "Chain Proxy" is enabled, any new child processes detected by the system will be listed in the monitor panel.
- These processes are automatically added to the proxy rules without restarting the game.
