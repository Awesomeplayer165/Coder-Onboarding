import { Settings } from "lucide-react";
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
      <header className="topbar">
        <div>
          <h1>Who are you?</h1>
          <p>Choose your group to get Coder credentials and open your Coder login page.</p>
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
            <span className="eyebrow">{group.accountType === "reviewer" ? "Reviewer" : "Participant"}</span>
            <h2>{group.name}</h2>
            <p>{group.description}</p>
            <dl>
              <div>
                <dt>Domain</dt>
                <dd>{group.domainSuffix}</dd>
              </div>
              <div>
                <dt>Sign-in</dt>
                <dd>{group.authMode === "oidc" ? "OIDC" : "Name lookup"}</dd>
              </div>
            </dl>
            <Button onClick={() => onSelectGroup(group)}>{group.authMode === "oidc" ? "Sign in" : "Continue"}</Button>
          </Card>
        ))}
      </section>
    </main>
  );
}
