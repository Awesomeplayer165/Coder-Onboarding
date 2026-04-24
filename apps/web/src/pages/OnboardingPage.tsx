import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { PublicGroup } from "../lib/types";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Card";
import { Field, Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";

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
  const toast = useToast();
  const [name, setName] = useState({ firstName: "", lastName: "" });
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [emailOptions, setEmailOptions] = useState<Record<string, string>>({});
  const [emailMode, setEmailMode] = useState<"first.last" | "firstlast" | "f.lastname" | "custom">("custom");
  const [customEmail, setCustomEmail] = useState("");
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; lastLoginAt: string | null }[]>([]);

  function updateName(part: "firstName" | "lastName", value: string) {
    setName((current) => ({ ...current, [part]: value }));
    if (matches !== null) {
      setMatches(null);
      setEmailOptions({});
      setCustomEmail("");
    }
  }

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
    try {
      const result = await api<{ matches: Match[]; emailOptions: Record<string, string> }>("/api/onboarding/lookup", {
        method: "POST",
        body: JSON.stringify({ groupId: group.id, ...name })
      });
      setMatches(result.matches);
      setEmailOptions(result.emailOptions);
    } catch (err) {
      toast({ title: "Lookup failed", description: err instanceof Error ? err.message : String(err), tone: "danger" });
    }
  }

  async function claim(personId: string) {
    try {
      const result = await api<Credentials>("/api/onboarding/claim", { method: "POST", body: JSON.stringify({ groupId: group.id, personId }) });
      toast({ title: "Coder credentials ready", tone: "success" });
      onCredentials(result);
    } catch (err) {
      toast({ title: "Could not load credentials", description: err instanceof Error ? err.message : String(err), tone: "danger" });
    }
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await api<Credentials>("/api/onboarding/register", {
        method: "POST",
        body: JSON.stringify({ groupId: group.id, ...name, emailMode, customEmail })
      });
      toast({ title: "Coder credentials created", tone: "success" });
      onCredentials(result);
    } catch (err) {
      toast({ title: "Could not create credentials", description: err instanceof Error ? err.message : String(err), tone: "danger" });
    }
  }

  if (group.authMode === "oidc") {
    window.location.href = `/api/oidc/${group.id}/start?redirectTo=${encodeURIComponent("/credentials")}`;
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
        <button className="text-button back-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <p className="eyebrow">Continue with your name</p>
        <h1>{group.name}</h1>
        <p>Enter your name to find or create your Coder credentials.</p>
        <form className="stack" onSubmit={matches === null ? lookup : register}>
          <div className="two-col">
            <Field label="First name">
              <Input value={name.firstName} onChange={(event) => updateName("firstName", event.target.value)} required />
            </Field>
            <Field label="Last name">
              <Input value={name.lastName} onChange={(event) => updateName("lastName", event.target.value)} required />
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
          {matches === null ? <Button type="submit">Submit <ArrowRight size={16} /></Button> : null}
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
                {(["first.last", "firstlast", "f.lastname"] as const).map((mode) => (
                  <label className="radio-card" key={mode}>
                    <div className="radio-line">
                      <input type="radio" checked={emailMode === mode} onChange={() => setEmailMode(mode)} />
                      <span>{emailOptions[mode]}</span>
                    </div>
                  </label>
                ))}
                <label className="radio-card recommended">
                  <div className="radio-line">
                    <input type="radio" checked={emailMode === "custom"} onChange={() => setEmailMode("custom")} />
                    <span>Use a personal email</span>
                  </div>
                  <Input type="email" value={customEmail} onChange={(event) => setCustomEmail(event.target.value)} placeholder="you@example.com" />
                </label>
              </div>
              <Button type="submit">Create credentials</Button>
            </div>
          ) : null}
        </form>
      </Card>
    </main>
  );
}
