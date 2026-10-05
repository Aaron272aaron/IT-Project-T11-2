import { createContext, useContext, useState, type ReactNode } from "react";
import type { Account } from "./auth";

// Who is logged in. Kept in sessionStorage so a page refresh keeps you signed in.
type User = Omit<Account, "password">;
const KEY = "automarktic-session";

function restore(): User | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

const Ctx = createContext<{
  user: User | null;
  signIn: (a: Account) => void;
  signOut: () => void;
} | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(restore);
  function save(u: User | null) {
    setUser(u);
    try {
      if (u) sessionStorage.setItem(KEY, JSON.stringify(u));
      else sessionStorage.removeItem(KEY);
    } catch {
      // storage blocked — session lasts until refresh
    }
  }
  return (
    <Ctx.Provider
      value={{
        user,
        signIn: ({ password: _pw, ...u }) => save(u),
        signOut: () => save(null),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("SessionProvider missing");
  return v;
}
