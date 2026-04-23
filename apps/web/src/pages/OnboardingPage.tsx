import { useEffect, useState } from "react";
import type { PublicGroup } from "../lib/types";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Card";
import { Field, Input } from "../components/ui/Input";

type Match = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  lastLoginAt: string | null;
  score: number;
  reason: string;
};

type Credentials = {
  person: { firstName: string; lastName: string; email: string };
  credentials: { email: string; password: string; coderLoginUrl: string };
};

function relativeTime(value?: string | null) {
  if (!value) return "never";
  const days = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 86400000));
  if (days < 1) return "today";
  if (days < 45) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

export function OnboardingPage({ group, onBack, onCredentials }: { group: PublicGroup; onBack: () => void; onCredentials: (value: Credentials) => void }) {
  const [name, setName] = useState({ firstName: "", lastName: "" });
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [emailOptions, setEmailOptions] = useState<Record<string, string>>({});
  const [emailMode, setEmailMode] = useState<"first.last" | "firstlast" | "f.lastname" | "custom">("custom");
  const [customEmail, setCustomEmail] = useState("");
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; lastLoginAt: string | null }[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = `${name.firstName} ${name.lastName}`.trim();
    if (q.length < 4 || matches !== null) return;
    const handle = window.setTimeout(async () => {
      const result = await api<{ suggestions: { id: string; name: string; lastLoginAt: string | null }[] }>(
        `/api/onboarding/suggest?groupId=${group.id}&q=${encodeURIComponent(q)}`
      );
      setSuggestions(result.suggestions);
    }, 180);
    return () => window.clearTimeout(handle);
  }, [group.id, matches, name]);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ matches: Match[]; emailOptions: Record<string, string> }>("/api/onboarding/lookup", {
        method: "POST",
        body: JSON.stringify({ groupId: group.id, ...name })
      });
      setMatches(result.matches);
      setEmailOptions(result.emailOptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function claim(personId: string) {
    const result = await api<Credentials>("/api/onboarding/claim", { method: "POST", body: JSON.stringify({ groupId: group.id, personId }) });
    onCredentials(result);
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<Credentials>("/api/onboarding/register", {
        method: "POST",
        body: JSON.stringify({ groupId: group.id, ...name, emailMode, customEmail })
      });
      onCredentials(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (group.authMode === "oidc") {
    window.location.href = `/api/oidc/${group.id}/start`;
    return (
      <main className="center-screen">
        <Card>
          <h1>Opening sign-in...</h1>
        </Card>
      </main>
    );
  }

  return (
    <main className="center-screen">
      <Card className="onboard-card">
        <button className="text-button" type="button" onClick={onBack}>
          Back
        </button>
        <h1>{group.name}</h1>
        <p>Enter your name to find or create your Coder credentials.</p>
        <form className="stack" onSubmit={matches === null ? lookup : register}>
          <div className="two-col">
            <Field label="First name">
              <Input value={name.firstName} onChange={(event) => setName({ ...name, firstName: event.target.value })} required />
            </Field>
            <Field label="Last name">
              <Input value={name.lastName} onChange={(event) => setName({ ...name, lastName: event.target.value })} required />
            </Field>
          </div>
          {suggestions.length > 0 && matches === null ? (
            <div className="suggestions">
              {suggestions.map((suggestion) => (
                <button type="button" key={suggestion.id} onClick={() => claim(suggestion.id)}>
                  {suggestion.name}
                  <small>Last login {relativeTime(suggestion.lastLoginAt)}</small>
                </button>
              ))}
            </div>
          ) : null}
          {matches === null ? <Button type="submit">Submit</Button> : null}
          {matches && matches.length > 0 ? (
            <div className="match-list">
              <h2>Is this you?</h2>
              {matches.map((match) => (
                <button type="button" key={match.id} className="match-row" onClick={() => claim(match.id)}>
                  <span>
                    {match.firstName} {match.lastName}
                    <small>{match.email} · last login {relativeTime(match.lastLoginAt)}</small>
                  </span>
                  <Badge tone={match.reason === "exact" ? "success" : "warning"}>{match.score}%</Badge>
                </button>
              ))}
              <button className="text-button" type="button" onClick={() => setMatches([])}>
                None of these are me
              </button>
            </div>
          ) : null}
          {matches && matches.length === 0 ? (
            <div className="stack">
              <p className="subtle">If you believe you already have an account, talk to an admin.</p>
              <div className="email-options">
                <label className="radio-card recommended">
                  <input type="radio" checked={emailMode === "custom"} onChange={() => setEmailMode("custom")} />
                  <span>Use a personal email</span>
                  <Input type="email" value={customEmail} onChange={(event) => setCustomEmail(event.target.value)} placeholder="you@example.com" />
                </label>
                {(["first.last", "firstlast", "f.lastname"] as const).map((mode) => (
                  <label className="radio-card" key={mode}>
                    <input type="radio" checked={emailMode === mode} onChange={() => setEmailMode(mode)} />
                    <span>{emailOptions[mode]}</span>
                  </label>
                ))}
              </div>
              <Button type="submit">Create credentials</Button>
            </div>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
        </form>
      </Card>
    </main>
  );
}
