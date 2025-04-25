# Simplified Picqer to SQL DB Synchronization

This documentation provides an overview of the simplified synchronization solution between Picqer and SQL DB.

## Overview

The simplified architecture consolidates the synchronization logic into a generic service that can handle any entity type, eliminating the need for separate service files for each entity. This reduces code duplication and simplifies maintenance while maintaining all essential functionality.

## Components

### 1. ConfigManager (`config-manager.js`)
Handles environment configuration for Picqer API and database connections.

### 2. PicqerRateLimiter (`picqer-rate-limiter.js`)
Implements rate limiting for Picqer API requests to prevent "Rate limit exceeded" errors.

### 3. PicqerApiClient (`picqer-api-client.js`)
Provides a client for interacting with the Picqer API with built-in rate limiting.

### 4. DatabaseManager (`database-manager.js`)
Handles database connection and schema management for all entities.

### 5. GenericEntityService (`generic-entity-service.js`)
A unified service for handling all entity types between Picqer and SQL database.

### 6. EntityConfigs (`entity-configs.js`)
Defines configuration for all entity types that can be synchronized.

### 7. SyncManager (`sync-manager.js`)
A centralized manager for orchestrating synchronization operations.

### 8. Main Application (`index.js`)
The main entry point for the synchronization service.

## How It Works

1. The application initializes all components: configuration, API client, database manager, and sync manager.
2. Entity services are registered with the sync manager based on the configurations in `entity-configs.js`.
3. The sync manager provides methods to sync individual entity types or all entities at once.
4. API endpoints are exposed to trigger synchronization operations and retrieve sync status.
5. A scheduled job runs daily to automatically sync all entities.

## API Endpoints

- `GET /`: Returns basic service information
- `POST /api/sync/all`: Syncs all entity types
- `POST /api/sync/:entityType`: Syncs a specific entity type
- `GET /api/sync/status`: Returns sync status for all entity types

## Environment Variables

The application uses the following environment variables:

- `PICQER_API_URL`: Picqer API base URL (default: https://skapa-global.picqer.com/api/v1)
- `PICQER_API_KEY`: Picqer API key
- `SQL_SERVER` or `DB_HOST`: SQL server hostname
- `SQL_PORT` or `DB_PORT`: SQL server port (default: 1433)
- `SQL_DATABASE` or `DB_NAME`: SQL database name
- `SQL_USER` or `DB_USER`: SQL username
- `SQL_PASSWORD` or `DB_PASSWORD`: SQL password
- `PORT`: Application port (default: 3000)

## Adding New Entity Types

To add a new entity type for synchronization:

1. Add a new configuration entry in `entity-configs.js`:
```javascript
newEntity: {
  entityType: 'newEntity',
  tableName: 'NewEntities',
  idField: 'idnewentity',
  apiEndpoint: '/new-entities',
  nameField: 'name'
}
```

2. No other code changes are needed! The generic architecture will automatically handle the new entity type.

## Testing

Run the test script to verify the implementation:

```
node test.js
```

Set `RUN_FULL_TEST=true` in the environment to include actual API calls during testing.

## Benefits of the Simplified Architecture

1. **Reduced Code Duplication**: Uses a generic entity service instead of separate service files for each entity type.
2. **Simplified Maintenance**: Changes to synchronization logic only need to be made in one place.
3. **Consistent Error Handling**: Centralized error handling ensures consistent behavior across all entity types.
4. **Easier to Add New Entities**: Adding a new entity type only requires adding a new configuration entry.
5. **Better Separation of Concerns**: Each component has a clear responsibility.
6. **Improved Testability**: Smaller, focused components are easier to test.
7. **Cleaner API**: Provides a cleaner, more intuitive API for triggering synchronization operations.
