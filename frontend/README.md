# PieChat Frontend

This is the frontend for PieChat, a secure and decentralized chat platform. It is built with **Next.js 15**, **Tailwind CSS**, and **Zustand** for state management.

## Features

- **Authentication UI**: Login and Register pages.
- **Chat Interface**: 
  - Sidebar with room list (Groups and DMs).
  - Real-time message updates (optimistic UI).
  - User presence indicators.
- **Settings**: Profile management and application preferences (Dark Mode).
- **Mock Matrix Service**: Currently runs with a simulated backend service for demonstration purposes.

## Getting Started

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Run Development Server**:
    ```bash
    npm run dev
    ```

3.  **Open in Browser**:
    Navigate to [http://localhost:3000](http://localhost:3000).

## Project Structure

- `app/`: Next.js App Router pages and layouts.
- `lib/store/`: Zustand state management stores.
- `lib/services/`: Service layer (currently contains `matrix-service.ts` mock).
- `components/`: Reusable UI components (to be extracted).

## connecting to Real Backend (Future)

Once the Dendrite homeserver is running, the `MatrixService` in `lib/services/matrix-service.ts` will be updated to make actual HTTP requests to the Matrix Client-Server API.
