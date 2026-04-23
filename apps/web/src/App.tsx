import { useEffect, useState } from "react";
import type { Bootstrap, PublicGroup } from "./lib/types";
import { loadBootstrap } from "./lib/api";
import { SetupPage } from "./pages/SetupPage";
import { HomePage } from "./pages/HomePage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { CredentialsPage } from "./pages/CredentialsPage";
import { AdminPage } from "./pages/AdminPage";
import { ToastProvider } from "./components/ui/Toast";

type Credentials = {
  credentials: { email: string; password: string; coderLoginUrl: string };
};

export function App() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<PublicGroup | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [view, setView] = useState<"home" | "admin">("home");
  const [error, setError] = useState("");

  async function refresh() {
    setBootstrap(await loadBootstrap());
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const content = (() => {
    if (error) {
      return (
        <main className="center-screen">
          <p className="error">{error}</p>
        </main>
      );
    }

    if (!bootstrap) {
      return (
        <main className="center-screen">
          <div className="loader" />
        </main>
      );
    }

    if (bootstrap.setupRequired) {
      return <SetupPage onDone={refresh} />;
    }

    if (view === "admin") {
      return (
        <AdminPage
          currentIp={bootstrap.currentIp}
          session={bootstrap.session}
          onBack={() => setView("home")}
          onSignedOut={async () => {
            setView("home");
            await refresh();
          }}
        />
      );
    }

    if (credentials) {
      return <CredentialsPage credentials={credentials.credentials} onDone={() => { setCredentials(null); setSelectedGroup(null); }} />;
    }

    if (selectedGroup) {
      return <OnboardingPage group={selectedGroup} onBack={() => setSelectedGroup(null)} onCredentials={setCredentials} />;
    }

    return <HomePage bootstrap={bootstrap} onSelectGroup={setSelectedGroup} onAdmin={() => setView("admin")} />;
  })();

  return <ToastProvider>{content}</ToastProvider>;
}
