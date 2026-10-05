import { useEffect, useState } from "react";

// Tiny hash router: #/login, #/signup, #/home. No extra library needed.
export function go(path: string) {
  window.location.hash = path;
}

export function useRoute() {
  const read = () => window.location.hash.slice(1) || "/login";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const update = () => setRoute(read());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}
