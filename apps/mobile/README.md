# @ces/mobile

Expo React Native app for CES internal operations (engineers + approving managers).

## Dev

```bash
pnpm --filter @ces/mobile start
# scan the QR with the Expo Go app, or press `i` for iOS sim / `a` for Android emulator
```

## What's next (Phase 0 continued)

- MSAL React Native sign-in (Entra ID)
- Authenticated API client against `@ces/api`
- Tab navigation: Tasks / Travel / Expenses / Approvals
- Geofenced attendance check-in
- Offline queue for receipts/expenses (sync on reconnect)
