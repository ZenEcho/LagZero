# LagZero API Documentation

## IPC Interfaces

The LagZero backend exposes several IPC interfaces for the frontend to interact with the core system.

### Categories API (`window.categories`)

- `getAll()`: Promise<Category[]>
  - Returns all configured categories.
- `save(category: Category)`: Promise<Category[]>
  - Creates or updates a category.
- `delete(id: string)`: Promise<Category[]>
  - Deletes a category by ID.
- `match(name: string, processes: string[])`: Promise<string | null>
  - Attempts to auto-classify a game based on its name and process list using configured rules.

### Profiles API (`window.profiles`)

- `getAll()`: Promise<ConfigProfile[]>
  - Returns all configuration profiles.
- `save(profile: ConfigProfile)`: Promise<ConfigProfile[]>
  - Creates or updates a configuration profile.
- `delete(id: string)`: Promise<ConfigProfile[]>
  - Deletes a profile by ID.

### Proxy Monitor API (`window.proxyMonitor`)

- `start(gameId: string, processNames: string[])`: Promise<void>
  - Starts the intelligent proxy monitor for a specific game.
  - Enables chain proxy detection (child process monitoring).
- `stop()`: Promise<void>
  - Stops the current monitoring session.

### System API (`window.system`)

- `scanProcesses()`: Promise<string[]>
  - Returns a list of currently running process names.
- `getProcessTree()`: Promise<ProcessInfo[]>
  - Returns the full process tree (Windows only).

## Data Models

### Category
```typescript
interface Category {
  id: string;
  name: string;
  parentId?: string;
  rules?: string[]; // Regex patterns for auto-classification
  icon?: string;
  order?: number;
}
```

### ConfigProfile
```typescript
interface ConfigProfile {
  id: string;
  name: string;
  description?: string;
  rules: ConfigRule[];
  chainProxy: boolean;
}

interface ConfigRule {
  type: 'process' | 'domain' | 'ip';
  value: string[];
  outbound: 'proxy' | 'direct' | 'block';
}
```
