import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

export function CredentialsPage({
  credentials,
  onDone
}: {
  credentials: { email: string; password: string; coderLoginUrl: string };
  onDone: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string) {
    navigator.clipboard.writeText(value).catch(() => undefined);
    setCopied(value);
    window.setTimeout(() => setCopied(null), 900);
  }

  return (
    <main className="center-screen">
      <Card className="credential-card">
        <h1>Your Coder credentials are ready</h1>
        <p>Use these on the next page.</p>
        <div className="credential-box">
          <span>Email</span>
          <strong>{credentials.email}</strong>
          <button className={copied === credentials.email ? "copied" : ""} type="button" onClick={() => copy(credentials.email)} aria-label="Copy email">
            <Copy size={18} />
          </button>
        </div>
        <div className="credential-box">
          <span>Password</span>
          <strong>{credentials.password}</strong>
          <button className={copied === credentials.password ? "copied" : ""} type="button" onClick={() => copy(credentials.password)} aria-label="Copy password">
            <Copy size={18} />
          </button>
        </div>
        <div className="actions">
          <a className="button button-primary" href={credentials.coderLoginUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={18} /> Open Coder
          </a>
          <Button variant="secondary" onClick={onDone}>
            Done
          </Button>
        </div>
      </Card>
    </main>
  );
}
