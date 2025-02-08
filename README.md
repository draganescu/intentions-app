# Intentions - A Tag-Based Message Manager

A modern, offline-capable web application for managing messages with a powerful tagging system. Built with vanilla JavaScript and IndexedDB for client-side storage.

## Features

### Message Management

- Create and store messages with automatic timestamp tracking
- Delete messages with confirmation dialog
- Messages persist offline using IndexedDB storage
- Paste multiple messages at once with automatic splitting
- Long-press messages to reference them by number

### Tag System

- Add tags to messages using hashtags (#example)
- Click on tags to filter messages
- View all available tags in the sidebar
- Filter by multiple tags simultaneously
- Save frequently used tag combinations for quick access

### Search Functionality

- Full-text search across all messages
- Start with "/" to enter search mode
- Save searches for quick access
- Results update in real-time as you type

### Filters

- Create and save tag-based filters
- Create and save search-based filters
- Access saved filters from the sidebar
- Delete filters when no longer needed

### UI/UX Features

- Modern, responsive design using Shoelace components
- Mobile-friendly with adaptive keyboard handling
- Dark mode support
- Smooth scrolling and animations
- Intuitive swipe gestures on mobile
- Progressive Web App (PWA) capabilities

### Commands

- `@help` - Display help dialog with usage instructions
- `:number` - Reference specific messages by number

### Settings

- Toggle automatic splitting of pasted text
- More settings coming soon

## Technical Details

- Built with vanilla JavaScript (no framework)
- Uses IndexedDB for offline-capable storage
- Implements the PWA standard for installability
- Uses Shoelace web components for UI
- Modular code structure with separate concerns

## Coming Soon

- Message editing
- Message categories
- Export/Import functionality
- More keyboard shortcuts
- Additional theme options
- Enhanced search capabilities