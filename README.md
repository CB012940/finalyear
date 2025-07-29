# Pink Boutique

A simple e-commerce demo for a women's clothing store with light pink and white aesthetic. Built with Node.js, Express and SQLite. Includes basic catalog, cart, checkout and user authentication. Blockchain audit hooks are placed at key actions (`signup`, `product_add`, `product_edit`, `product_delete`, `purchase`).

## Setup

Install dependencies and run the server:

```bash
npm install
npm start
```

The server listens on port 3000.

## Blockchain Logging

The function `auditLog(action, details)` in `server.js` is called whenever important actions occur. Replace its contents with calls to your blockchain backend to record immutable logs.

