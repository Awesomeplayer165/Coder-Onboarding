import { ArrowRight, ExternalLink, KeyRound, LogOut, Settings } from "lucide-react";
import { useEffect } from "react";
import type { Bootstrap, PublicGroup } from "../lib/types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { api } from "../lib/api";
import { useToast } from "../components/ui/Toast";

export function HomePage({
  bootstrap,
  onSelectGroup,
  onAdmin,
  onShowCredentials,
  onSignedOut
}: {
  bootstrap: Bootstrap;
  onSelectGroup: (group: PublicGroup) => void;
  onAdmin: () => void;
  onShowCredentials: () => void;
  onSignedOut: () => void | Promise<void>;
}) {
  const toast = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (!error) return;
    toast({ title: "Sign-in failed", description: error, tone: "danger" });
    window.history.replaceState({}, "", window.location.pathname);
  }, [toast]);

  async function signOut() {
    try {
      await api("/api/session/logout", { method: "POST" });
      toast({ title: "Signed out", tone: "success" });
      await onSignedOut();
    } catch (error) {
      toast({ title: "Could not sign out", description: error instanceof Error ? error.message : String(error), tone: "danger" });
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar hero-topbar">
        <div>
          <p className="eyebrow">Coder onboarding</p>
          <h1>{bootstrap.session?.person ? `Hello, ${bootstrap.session.person.firstName}` : "Choose your group"}</h1>
          <p>Get your Coder credentials, copy them cleanly, and open the Coder login page.</p>
        </div>
        {bootstrap.session?.person ? (
          <div className="topbar-actions">
            {bootstrap.session.person.isAdmin ? (
              <Button variant="secondary" onClick={onAdmin}>
                <Settings size={16} /> Admin
              </Button>
            ) : null}
            <Button variant="secondary" onClick={signOut}>
              <LogOut size={16} /> Sign out
            </Button>
          </div>
        ) : null}
      </header>
      {bootstrap.session?.person ? (
        <section className="signed-in-panel">
          <div>
            <h2>Signed in as {bootstrap.session.person.firstName}</h2>
            <p>Jump back to your Coder credentials any time.</p>
          </div>
          <div className="actions signed-in-actions">
            <Button onClick={onShowCredentials}>
              <KeyRound size={16} /> Show Coder credentials
            </Button>
            {bootstrap.session.person.isAdmin ? (
              <Button variant="secondary" onClick={onAdmin}>
                <Settings size={16} /> Admin
              </Button>
            ) : null}
            <a className="button button-secondary" href={bootstrap.coderLoginUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Open Coder
            </a>
            <Button variant="ghost" onClick={signOut}>
              <LogOut size={16} /> Sign out
            </Button>
          </div>
        </section>
      ) : null}
      {!bootstrap.session?.person ? (
        <section className="group-grid">
          {bootstrap.groups.map((group) => (
            <Card key={group.id} className="group-card">
              <h2>{group.name}</h2>
              <p>{group.description}</p>
              <dl>
                <div>
                  <dt>Domain</dt>
                  <dd>{group.domainSuffix}</dd>
                </div>
              </dl>
              <Button onClick={() => onSelectGroup(group)}>
                {group.authMode === "oidc" ? "Continue with Google" : "Continue with your name"} <ArrowRight size={16} />
              </Button>
            </Card>
          ))}
        </section>
      ) : null}
    </main>
  );
}
