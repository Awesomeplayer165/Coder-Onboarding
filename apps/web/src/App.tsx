import { useEffect, useState } from "react";
import type { Bootstrap, PublicGroup } from "./lib/types";
import { api, loadBootstrap } from "./lib/api";
import { SetupPage } from "./pages/SetupPage";
import { HomePage } from "./pages/HomePage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { CredentialsPage } from "./pages/CredentialsPage";
import { AdminPage } from "./pages/AdminPage";
import { ToastProvider, useToast } from "./components/ui/Toast";
import { Button } from "./components/ui/Button";

type Credentials = {
  person: { firstName: string; lastName: string; email: string };
  credentials: { email: string; password: string; coderLoginUrl: string };
};

export function App() {
  const toast = useToast();
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<PublicGroup | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [path, setPath] = useState(() => window.location.pathname);
  const [error, setError] = useState("");

  async function refresh() {
    setBootstrap(await loadBootstrap());
  }

  function navigate(nextPath: string) {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  }

  useEffect(() => {
    refresh().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast({ title: "Unable to load app", description: message, tone: "danger" });
    });
  }, [toast]);

  useEffect(() => {
    function onPopState() {
      setPath(window.location.pathname);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!bootstrap || path !== "/admin" || bootstrap.session?.person?.isAdmin) return;
    toast({ title: "Admin sign-in required", description: "Sign in with an admin account before opening Admin.", tone: "danger" });
    navigate("/");
  }, [bootstrap, path, toast]);

  useEffect(() => {
    if (!bootstrap || path !== "/credentials" || credentials) return;
    if (!bootstrap.session?.person) {
      toast({ title: "Credentials expired", description: "Go through the name flow again to see your Coder credentials.", tone: "danger" });
      navigate("/");
      return;
    }

    let cancelled = false;
    setCredentialsLoading(true);
    api<Credentials>("/api/session/credentials")
      .then((result) => {
        if (cancelled) return;
        setCredentials(result);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        toast({ title: "Could not load Coder credentials", description: message, tone: "danger" });
        navigate("/");
      })
      .finally(() => {
        if (!cancelled) setCredentialsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bootstrap, credentials, path, toast]);

  const content = (() => {
    if (error) {
      return (
        <main className="center-screen">
          <Button variant="secondary" onClick={() => { setError(""); refresh().catch((err) => toast({ title: "Still unable to load app", description: err instanceof Error ? err.message : String(err), tone: "danger" })); }}>
            Retry
          </Button>
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

    if (path === "/admin" && bootstrap.session?.person?.isAdmin) {
      return (
        <AdminPage
          currentIp={bootstrap.currentIp}
          session={bootstrap.session}
          onBack={() => navigate("/")}
          onSignedOut={async () => {
            navigate("/");
            await refresh();
          }}
        />
      );
    }

    if (path === "/credentials") {
      if (credentialsLoading || (!credentials && bootstrap.session?.person)) {
        return (
          <main className="center-screen">
            <div className="loader" />
          </main>
        );
      }

      if (credentials) {
        const credentialPageProps = {
          credentials: credentials.credentials,
          isSignedIn: Boolean(bootstrap.session?.person),
          isAdmin: Boolean(bootstrap.session?.person?.isAdmin),
          onHome: () => {
            setCredentials(null);
            setSelectedGroup(null);
            navigate("/");
          },
          onDone: () => {
            setCredentials(null);
            setSelectedGroup(null);
            navigate("/");
          },
          ...(bootstrap.session?.person?.isAdmin
            ? {
                onAdmin: () => {
                  setCredentials(null);
                  navigate("/admin");
                }
              }
            : {})
        };

        return (
          <CredentialsPage {...credentialPageProps} />
        );
      }
    }

    if (selectedGroup) {
      return (
        <OnboardingPage
          group={selectedGroup}
          onBack={() => setSelectedGroup(null)}
          onCredentials={(value) => {
            setCredentials(value);
            navigate("/credentials");
          }}
        />
      );
    }

    return (
      <HomePage
        bootstrap={bootstrap}
        onSelectGroup={setSelectedGroup}
        onAdmin={() => navigate("/admin")}
        onShowCredentials={() => {
          setCredentials(null);
          navigate("/credentials");
        }}
        onSignedOut={async () => {
          setCredentials(null);
          setSelectedGroup(null);
          navigate("/");
          await refresh();
        }}
      />
    );
  })();

  return <ToastProvider>{content}</ToastProvider>;
}
