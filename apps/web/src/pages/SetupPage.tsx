import { useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, Input } from "../components/ui/Input";

export function SetupPage({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    token: "",
    organizationName: "Default organization",
    participantGroupName: "Participant",
    reviewerGroupName: "Reviewer",
    defaultDomain: "student.example.com",
    sharedPassword: "",
    firstAdminEmail: ""
  });
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/setup", { method: "POST", body: JSON.stringify(form) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="center-screen">
      <Card className="setup-card">
        <h1>First-run setup</h1>
        <p>Create the initial organization, default groups, shared Coder password, and first Admin grant.</p>
        <form className="stack" onSubmit={submit}>
          <Field label="Setup token">
            <Input value={form.token} onChange={(event) => setForm({ ...form, token: event.target.value })} required />
          </Field>
          <Field label="Organization name">
            <Input value={form.organizationName} onChange={(event) => setForm({ ...form, organizationName: event.target.value })} />
          </Field>
          <div className="two-col">
            <Field label="Participant group">
              <Input value={form.participantGroupName} onChange={(event) => setForm({ ...form, participantGroupName: event.target.value })} />
            </Field>
            <Field label="Reviewer group">
              <Input value={form.reviewerGroupName} onChange={(event) => setForm({ ...form, reviewerGroupName: event.target.value })} />
            </Field>
          </div>
          <Field label="Default group domain">
            <Input value={form.defaultDomain} onChange={(event) => setForm({ ...form, defaultDomain: event.target.value })} />
          </Field>
          <Field label="Shared Coder password">
            <Input value={form.sharedPassword} onChange={(event) => setForm({ ...form, sharedPassword: event.target.value })} required />
          </Field>
          <Field label="First Admin email">
            <Input type="email" value={form.firstAdminEmail} onChange={(event) => setForm({ ...form, firstAdminEmail: event.target.value })} required />
          </Field>
          {error ? <p className="error">{error}</p> : null}
          <Button type="submit">Create setup</Button>
        </form>
      </Card>
    </main>
  );
}
