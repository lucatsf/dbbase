# Change Log

All notable changes to the "dbbase" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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