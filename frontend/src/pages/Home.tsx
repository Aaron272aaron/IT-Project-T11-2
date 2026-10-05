import { go } from "../router";
import { useSession } from "../session";
import { Logo } from "../components/AuthLayout";

// Placeholder page shown after login. The real dashboard will replace this.
export function Home() {
  const { user, signOut } = useSession();
  if (!user) return null;
  return (
    <main className="home">
      <header className="home-bar">
        <Logo />
        <button
          className="button"
          onClick={() => {
            signOut();
            go("/login");
          }}
        >
          Log out
        </button>
      </header>
      <section className="home-card">
        <h1>Welcome, {user.name.split(" ")[0]}</h1>
        <p>You’re signed in. The marking dashboard will go here.</p>
        <dl>
          <dt>Name</dt>
          <dd>{user.name}</dd>
          <dt>Username</dt>
          <dd>{user.username}</dd>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Role</dt>
          <dd>{user.role}</dd>
        </dl>
      </section>
    </main>
  );
}
