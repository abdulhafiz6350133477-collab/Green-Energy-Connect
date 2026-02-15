# replit.md

## Overview

Green Gang is a mobile-first social/community app built with Expo (React Native) and an Express backend. It features chat rooms, project boards, community events, and user profiles with a dark-themed UI centered around green accent colors. The app uses a tab-based navigation structure with rooms (chat), boards (project collaboration), events (community gatherings), and profile management. Currently, most data is managed client-side through React Context with AsyncStorage persistence, but the project has server infrastructure and a database schema ready for backend-driven features.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK 54 with React Native 0.81, using the new architecture (`newArchEnabled: true`) and React Compiler experiment
- **Navigation**: expo-router with file-based routing. Tab layout at `app/(tabs)/` with four tabs: Rooms (index), Boards, Events, Profile. Dynamic route at `app/room/[id].tsx` for individual chat rooms
- **State Management**: React Context (`contexts/AppContext.tsx`) serves as the primary state store, managing users, rooms, messages, projects, events, and members. Data is persisted locally via `@react-native-async-storage/async-storage`
- **Data Fetching**: TanStack React Query is configured with a custom `apiRequest` helper in `lib/query-client.ts` that points to the Express server. Currently, most data flows through the local context rather than API calls
- **Styling**: Pure React Native StyleSheet with a centralized color palette in `constants/colors.ts`. Dark theme only with green (#00E676) as the primary accent
- **Fonts**: Space Grotesk (Google Fonts) loaded via `@expo-google-fonts/space-grotesk`
- **Animations**: react-native-reanimated for animations (welcome screen effects, pulse indicators, message send animations)
- **Platform Support**: iOS, Android, and Web. Platform-specific handling exists for keyboard behavior, tab bar styling, and safe area insets

### Backend (Express)

- **Framework**: Express 5 running on Node.js, defined in `server/index.ts`
- **Routes**: Registered in `server/routes.ts` — currently minimal with just the HTTP server creation. All routes should be prefixed with `/api`
- **Storage**: `server/storage.ts` defines an `IStorage` interface with a `MemStorage` in-memory implementation. This is a placeholder — designed to be swapped with a database-backed implementation
- **CORS**: Dynamic CORS setup allowing Replit domains and localhost origins for development
- **Static Serving**: In production, serves a static build of the Expo web app. In development, proxies to the Expo dev server
- **Build**: Server is bundled with esbuild (`server:build` script) to `server_dist/`

### Database Schema

- **ORM**: Drizzle ORM with PostgreSQL dialect, configured in `drizzle.config.ts`
- **Schema**: Defined in `shared/schema.ts` — currently has a single `users` table with `id` (UUID primary key), `username` (unique text), and `password` (text)
- **Validation**: Uses `drizzle-zod` to generate Zod schemas from Drizzle table definitions (e.g., `insertUserSchema`)
- **Migrations**: Output to `./migrations` directory, pushed with `drizzle-kit push` (`db:push` script)
- **Note**: The schema is minimal. The app's data models (rooms, messages, projects, events) exist only in the AppContext and would need corresponding database tables for server-side persistence

### Key Scripts

- `expo:dev` — Starts Expo dev server configured for Replit
- `server:dev` — Starts Express server with tsx in development mode
- `db:push` — Pushes Drizzle schema to PostgreSQL
- `expo:static:build` — Builds static web bundle via custom script in `scripts/build.js`
- `server:prod` — Runs production server from bundled output

### Path Aliases

- `@/*` maps to project root
- `@shared/*` maps to `./shared/*`

## External Dependencies

### Database
- **PostgreSQL** via `pg` package, connection string from `DATABASE_URL` environment variable
- **Drizzle ORM** for schema definition, queries, and migrations

### Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required for database operations)
- `EXPO_PUBLIC_DOMAIN` — Domain for API requests from the client
- `REPLIT_DEV_DOMAIN` — Replit development domain (used for CORS and Expo config)
- `REPLIT_DOMAINS` — Comma-separated list of allowed Replit domains
- `REPLIT_INTERNAL_APP_DOMAIN` — Used during static builds for deployment

### Key NPM Packages
- **expo-router** — File-based routing
- **@tanstack/react-query** — Server state management (configured but lightly used)
- **react-native-reanimated** — Animations
- **react-native-gesture-handler** — Touch gesture handling
- **react-native-keyboard-controller** — Keyboard-aware UI
- **expo-haptics** — Haptic feedback on interactions
- **expo-contacts** — Device contacts access for adding members
- **expo-crypto** — UUID generation on the client
- **expo-image-picker** — Image selection (installed but usage not visible in provided files)
- **expo-location** — Location services (installed but usage not visible in provided files)
- **patch-package** — Applied via `postinstall` script for patching node_modules