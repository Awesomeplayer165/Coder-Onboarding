import { ArrowRight, Settings } from "lucide-react";
import type { Bootstrap, PublicGroup } from "../lib/types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

export function HomePage({
  bootstrap,
  onSelectGroup,
  onAdmin
}: {
  bootstrap: Bootstrap;
  onSelectGroup: (group: PublicGroup) => void;
  onAdmin: () => void;
}) {
  return (
    <main className="app-shell">
      <header className="topbar hero-topbar">
        <div>
          <p className="eyebrow">Coder onboarding</p>
          <h1>{bootstrap.session?.person ? `Hello, ${bootstrap.session.person.firstName}` : "Choose your group"}</h1>
          <p>Get your Coder credentials, copy them cleanly, and open the Coder login page.</p>
        </div>
        {bootstrap.session?.person?.isAdmin ? (
          <button className="icon-button" type="button" onClick={onAdmin} aria-label="Open Admin">
            <Settings size={20} />
          </button>
        ) : null}
      </header>
      {new URLSearchParams(window.location.search).get("error") ? <p className="error">{new URLSearchParams(window.location.search).get("error")}</p> : null}
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
    </main>
  );
}
