// Placeholder account store for the frontend prototype.
//
// There is no authentication backend yet, so accounts live in the browser
// (localStorage) and passwords are stored as plain text. This is ONLY for
// demoing page transitions. When the backend exists, replace `login` and
// `register` with API calls (e.g. POST /api/auth/login, POST /api/auth/register)
// and delete the local store — the pages only depend on these two functions.

export type Role = "Tutor" | "Subject coordinator";

export type Account = {
  name: string;
  email: string;
  username: string;
  role: Role;
  password: string;
};

export const SEED_ACCOUNTS: Account[] = [
  {
    name: "Demo User",
    email: "demo@example.edu",
    username: "demo",
    role: "Tutor",
    password: "demo1234",
  },
  {
    name: "Alex Morgan",
    email: "alex.morgan@example.edu",
    username: "alex.morgan",
    role: "Subject coordinator",
    password: "demo1234",
  },
  {
    name: "Jordan Smith",
    email: "j.smith@university.edu",
    username: "jsmith",
    role: "Tutor",
    password: "password1",
  },
];

const KEY = "automarktic-accounts-v1";
let memory: Account[] = [];

function readExtra(): Account[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return memory;
  }
}

function writeExtra(accounts: Account[]) {
  memory = accounts;
  try {
    localStorage.setItem(KEY, JSON.stringify(accounts));
  } catch {
    // Storage blocked (private mode etc.) — keep in memory for this tab.
  }
}

export function allAccounts(): Account[] {
  return [...SEED_ACCOUNTS, ...readExtra()];
}

const norm = (s: string) => s.trim().toLowerCase();

export function findAccount(
  identifier: string,
  password: string,
  accounts: Account[] = allAccounts(),
): Account | null {
  const id = norm(identifier);
  const match = accounts.find(
    (a) => norm(a.username) === id || norm(a.email) === id,
  );
  return match && match.password === password ? match : null;
}

export function login(identifier: string, password: string) {
  return findAccount(identifier, password);
}

export type SignupForm = {
  name: string;
  email: string;
  username: string;
  role: Role | "";
  password: string;
  confirm: string;
};

export type SignupErrors = Partial<Record<keyof SignupForm, string>>;

export function validateSignup(
  f: SignupForm,
  accounts: Account[] = allAccounts(),
): SignupErrors {
  const e: SignupErrors = {};
  if (!f.name.trim()) e.name = "Enter your full name.";
  if (!f.email.trim()) e.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
    e.email = "Enter a valid email address, e.g. name@university.edu.";
  else if (accounts.some((a) => norm(a.email) === norm(f.email)))
    e.email = "An account with this email already exists.";
  if (!f.username.trim()) e.username = "Choose a username.";
  else if (!/^[a-zA-Z0-9._-]{3,30}$/.test(f.username.trim()))
    e.username =
      "Use 3–30 characters: letters, numbers, dots, dashes or underscores.";
  else if (accounts.some((a) => norm(a.username) === norm(f.username)))
    e.username = "This username is already taken.";
  if (!f.role) e.role = "Select your role.";
  if (f.password.length < 8)
    e.password = "Password must be at least 8 characters.";
  else if (!/[a-zA-Z]/.test(f.password) || !/[0-9]/.test(f.password))
    e.password = "Password must include at least one letter and one number.";
  if (!f.confirm) e.confirm = "Re-enter your password.";
  else if (f.confirm !== f.password) e.confirm = "Passwords do not match.";
  return e;
}

export function register(f: SignupForm): Account {
  const account: Account = {
    name: f.name.trim(),
    email: f.email.trim(),
    username: f.username.trim(),
    role: f.role as Role,
    password: f.password,
  };
  writeExtra([...readExtra(), account]);
  return account;
}
