# UHP Transport Portal — MVP Foundation

This first milestone contains:

- Responsive React/Vite application shell
- Role-aware navigation previews for UHP Admin, Booker, Budget Holder and Need-A-Cab
- Initial UHP Admin Users screen
- SQLite migration for users, roles, departments, budgets, budget assignments, budget access, reason codes and audit log

## Run the UI

```bash
npm install
npm run dev
```

## Core build sequence

1. UHP Admin users / budgets / reason codes
2. Passwordless invite and sign-in
3. Book Transport workflow
4. Budget Holder dashboard
5. Need-A-Cab Control dashboard
6. Autocab integration
7. Docket fares / invoicing
8. Christmas module

The first database migration is `db/migrations/001_core.sql`.
