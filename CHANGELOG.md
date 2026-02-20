# Change Log

All notable changes to the "dbbase" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.3.0] - 2026-02-20

### Added
- **Table Data Management:** New buttons to Add, Clone, and Delete rows directly from the table editor UI.
- **Smart Pagination:** Data is now loaded in chunks of 500 records with a "Next/Previous" navigation system for MySQL, Postgres, and Redis.
- **Auto-Increment Support:** Successfully handles automatic primary keys by allowing columns to be left blank during row insertion.
- **Native Confirmations:** Uses native VS Code modals for critical actions like row deletion.

### Fixed
- **UI Stability:** Fixed "jumping" column widths during cell editing by locking cell dimensions during input.
- **Performance:** Optimized Redis browser with pagination for Keys, Hashes, Lists, and Sets (limited to 500 items).
- **Bugfixes:** Resolved index signature type errors in the Redis driver and fixed unresponsive action buttons in query results.
- **Edit UX:** Fixed input box styling issues (box-sizing, padding) and added a mechanism to discard unsaved "rascunho" rows.

### Changed
- **Localization:** Unified all UI labels, tooltips, and status messages to English for better accessibility.

## [1.2.0] - 2026-02-17

### Added
- **Table Grouping:** Automatically groups tables by prefix (e.g., `auth_user` -> `auth`) to improve navigation in large databases.
- **English as Default Language:** Full internationalization (i18n) support with English as the primary technical language.

### Improved
- **Connection UX:** Input boxes now show persistent prompts, ensuring labels like "Database Name" stay visible even with default values.
- **MCP Server:** Updated tool descriptions and error messages to English for better compatibility with AI models.

## [1.1.0] - 2026-02-14

### Added
- **Query Persistence:** Real file system structure for queries ("Scratches & Queries" folders).
- **Native Data Grid:** Integrated table viewer with inline editing and professional exports.
- **Improved Connection UX:** New disconnect button and smart auto-reconnection on folder expansion.
- **Smart Association:** Automatic connection switching based on the active query file.
- **Sidebar File Management:** Create/Rename/Delete queries directly from the connections tree.

### Fixed
- Improved sidebar stability.

## [1.0.1] - 2026-02-10
- Initial modularized version.

- Initial release