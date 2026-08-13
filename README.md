# Stock Watch System

A personal local tool for tracking a stock portfolio and watchlist against
DCF-derived fair value estimates, with sector grouping and value-investing
ratios (P/B, current/quick ratio, PEG, payout ratio).

## Prerequisites

- Node.js, version pinned in `.nvmrc` (currently 24). If using `nvm`, run
  `nvm use` from the repo root before installing or running anything.
- A MongoDB instance running locally (default: `mongodb://localhost:27017/stock-watch`).

## Setup

```sh
npm install
cp backend/.env.example backend/.env
```

Edit `backend/.env` if your MongoDB URI or port differs from the defaults.

## Running

From the repo root:

```sh
npm start
```

This starts the backend (Express API) and frontend (Angular dev server)
concurrently. The frontend dev server proxies API requests to the backend.
