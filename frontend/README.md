# AutoMarktic frontend: login & sign up

React + TypeScript + Vite. Frontend only; there's no backend yet, so the accounts are placeholders.

## Run it

Needs Node.js 20.19+ (or 22.12+).

```bash
cd frontend
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173).

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Unit tests for login/sign-up rules |
| `npm run build` | Type-check and build to `dist/` |

## Pages

| Route | Page |
| --- | --- |
| `#/login` | Login (default page) |
| `#/signup` | Create account |
| `#/home` | Placeholder page after login (only when signed in) |

Flow: Sign up → back to login with username filled in → log in → home → log out.

## Placeholder accounts

| Username | Email | Password |
| --- | --- | --- |
| demo | demo@example.edu | demo1234 |
| jsmith | j.smith@university.edu | password1 |
| alex.morgan | alex.morgan@example.edu | demo1234 |

Accounts you sign up with are saved in the browser's localStorage. This is for demo
purposes only: passwords are stored in plain text.

## Hooking up the backend later

Everything account-related is in `src/auth.ts`. Replace `login()` and `register()`
with API calls (e.g. `POST /api/auth/login`, `POST /api/auth/register`). The pages
don't need to change.

## Files

| File | Purpose |
| --- | --- |
| `src/main.tsx` | Entry point + which page shows for each route |
| `src/router.ts` | Tiny hash router (`go()`, `useRoute()`) |
| `src/session.tsx` | Who is logged in (kept for the browser tab) |
| `src/auth.ts` | Placeholder accounts, login, sign-up validation |
| `src/pages/Login.tsx` | Login page (default + error state from Figma) |
| `src/pages/Signup.tsx` | Sign-up page |
| `src/pages/Home.tsx` | Placeholder signed-in page |
| `src/components/AuthLayout.tsx` | Shared navy background, logo, card, inputs |
| `src/components/Icons.tsx` | Mail / lock / eye icons |
| `src/styles.css` | All styles |
