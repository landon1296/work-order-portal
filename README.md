# GLLS Work Orders App

This repository contains the scaffold for the Great Lakes Lifting Work Orders application.

## Structure

- **backend/**: Node.js + Express server that interfaces with Google Sheets.
- **frontend/**: React application for login and dashboards.

## Setup

1. Copy your existing service-account JSON key to `backend/service-account.json`.
2. Create a `.env` in `backend/`:

   ```
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
   SHEET_ID=<your-sheet-id>
   JWT_SECRET=<your_jwt_secret>
   ```

3. Install & run backend:

   ```bash
   cd backend
   npm install
   npm run dev
   ```

4. Install & run frontend:

   ```bash
   cd frontend
   npm install
   npm start
   ```

Frontend will be at `http://localhost:3000`.