import { useEffect, useState } from "react";
import { ArrowLeft, FileUp, Play, RefreshCcw, Settings, Square, Trash2, Users, Wrench } from "lucide-react";
import { api } from "../lib/api";
import type { PersonRow, PublicGroup, WorkspaceRow } from "../lib/types";
import { Button } from "../components/ui/Button";
import { Card, Badge } from "../components/ui/Card";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Panel, Tabs } from "../components/ui/Tabs";
import { DataGrid, type Column } from "../components/DataGrid";

type AdminOidcConfig = {
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
  userinfoEndpoint?: string;
  allowedEmailDomain?: string;
  hostedDomainClaim?: string;
};

type AdminGroup = PublicGroup & {
  sharedPassword: string;
  ipv4Allowlist: string[];
  coderTemplateId?: string | null;
  coderTemplateName?: string | null;
  coderTemplatePresetId?: string | null;
  coderParameters: Record<string, string>;
  oidcConfigured: boolean;
  oidcConfig: AdminOidcConfig | null;
};

function blankGroup(): AdminGroup {
  return {
    id: "",
    name: "",
    description: "",
    accountType: "participant",
    authMode: "none",
    domainSuffix: "",
    autoCreateWorkspace: false,
    sharedPassword: "",
    ipv4Allowlist: [],
    coderParameters: {},
    oidcConfigured: false,
    oidcConfig: null
  };
}

export function AdminPage({ onBack, currentIp }: { onBack: () => void; currentIp: string }) {
  const [tab, setTab] = useState("groups");
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [editing, setEditing] = useState<AdminGroup>(blankGroup());
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; display_name?: string }[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<string[]>([]);
  const [csv, setCsv] = useState("");
  const [importPreview, setImportPreview] = useState<{ importId: string; rows: Record<string, unknown>[]; conflictCount: number } | null>(null);
  const [audit, setAudit] = useState<Record<string, unknown>[]>([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    const [groupData, peopleData, workspaceData] = await Promise.all([
      api<{ groups: AdminGroup[] }>("/api/admin/groups"),
      api<{ people: PersonRow[] }>("/api/admin/people"),
      api<{ workspaces: WorkspaceRow[] }>("/api/admin/workspaces")
    ]);
    setGroups(groupData.groups);
    setPeople(peopleData.people);
    setWorkspaces(workspaceData.workspaces);
    setEditing(groupData.groups[0] ?? blankGroup());
  }

  useEffect(() => {
    refresh().catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, []);

  async function saveGroup() {
    const body = {
      ...editing,
      id: editing.id || undefined,
      oidcConfig: editing.authMode === "oidc" ? editing.oidcConfig : null
    };
    await api("/api/admin/groups", { method: "POST", body: JSON.stringify(body) });
    setMessage("Group saved.");
    await refresh();
  }

  async function loadTemplates() {
    const data = await api<{ templates: { id: string; name: string; display_name?: string }[] }>("/api/admin/templates");
    setTemplates(data.templates);
  }

  async function batch(action: "start" | "stop" | "delete") {
    const data = await api<{ job: { id: string } }>("/api/admin/workspaces/batch", {
      method: "POST",
      body: JSON.stringify({ action, workspaceIds: selectedWorkspaces })
    });
    setMessage(`Workspace job queued: ${data.job.id}`);
  }

  async function previewImport() {
    const data = await api<{ importId: string; rows: Record<string, unknown>[]; conflictCount: number }>("/api/admin/imports/preview", {
      method: "POST",
      body: JSON.stringify({ groupId: editing.id, csv })
    });
    setImportPreview(data);
  }

  async function confirmImport() {
    if (!importPreview) return;
    await api(`/api/admin/imports/${importPreview.importId}/confirm`, { method: "POST" });
    setMessage("Import confirmed.");
    setImportPreview(null);
    setCsv("");
    await refresh();
  }

  async function updatePeopleRole(role: "participant" | "reviewer" | "admin") {
    await api("/api/admin/people/roles", { method: "POST", body: JSON.stringify({ personIds: selectedPeople, role }) });
    setMessage("Roles updated.");
    await refresh();
  }

  async function deletePeople() {
    await api("/api/admin/people/delete", { method: "POST", body: JSON.stringify({ personIds: selectedPeople }) });
    setSelectedPeople([]);
    setMessage("People removed.");
    await refresh();
  }

  async function loadAudit() {
    const data = await api<{ events: Record<string, unknown>[] }>("/api/admin/audit");
    setAudit(data.events);
  }

  const personColumns: Column<PersonRow>[] = [
    {
      key: "firstName",
      label: "Name",
      render: (row) => (
        <span className="hover-wrap">
          {row.firstName} {row.lastName}
          <span className="hover-card">
            <strong>{row.firstName} {row.lastName}</strong>
            <small>{row.email}</small>
            <small>{row.workspaceCount ?? 0} workspaces</small>
          </span>
        </span>
      )
    },
    { key: "email", label: "Email" },
    { key: "groupName", label: "Group" },
    { key: "role", label: "Role", render: (row) => <Badge tone={row.role === "admin" ? "warning" : "neutral"}>{row.role}</Badge> },
    { key: "workspaceCount", label: "Workspaces" }
  ];

  const workspaceColumns: Column<WorkspaceRow>[] = [
    {
      key: "name",
      label: "Workspace",
      render: (row) => (
        <span className="hover-wrap">
          {row.name}
          <span className="hover-card">
            <strong>{row.name}</strong>
            <small>{row.coderWorkspaceId}</small>
            <small>{row.templateName ?? "No template"}</small>
          </span>
        </span>
      )
    },
    { key: "personName", label: "Person" },
    { key: "groupName", label: "Group" },
    { key: "status", label: "Status" },
    { key: "templateName", label: "Template" }
  ];

  return (
    <main className="admin-shell">
      <header className="topbar">
        <div>
          <button className="text-button" type="button" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          <h1>Admin</h1>
        </div>
        <Button variant="secondary" onClick={refresh}>
          <RefreshCcw size={16} /> Refresh
        </Button>
      </header>
      {message ? <p className="notice">{message}</p> : null}
      <Tabs
        value={tab}
        onChange={(value) => {
          setTab(value);
          if (value === "audit") loadAudit().catch(() => undefined);
        }}
        tabs={[
          { id: "groups", label: "Groups", icon: <Settings size={16} /> },
          { id: "people", label: "People", icon: <Users size={16} /> },
          { id: "workspaces", label: "Workspaces", icon: <Wrench size={16} /> },
          { id: "imports", label: "Imports", icon: <FileUp size={16} /> },
          { id: "sync", label: "Coder Sync", icon: <RefreshCcw size={16} /> },
          { id: "audit", label: "Audit", icon: <Settings size={16} /> }
        ]}
      />
      {tab === "groups" ? (
        <Panel>
          <div className="admin-grid">
            <Card>
              <h2>Groups</h2>
              <div className="list">
                {groups.map((group) => (
                  <button key={group.id} type="button" className={editing.id === group.id ? "list-row active" : "list-row"} onClick={() => setEditing(group)}>
                    <span>{group.name}</span>
                    <small>{group.accountType} · {group.authMode}</small>
                  </button>
                ))}
              </div>
              <Button variant="secondary" onClick={() => setEditing(blankGroup())}>
                New group
              </Button>
            </Card>
            <Card>
              <h2>{editing.id ? "Edit group" : "New group"}</h2>
              <div className="stack">
                <Field label="Name">
                  <Input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
                </Field>
                <Field label="Description">
                  <Textarea value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
                </Field>
                <div className="two-col">
                  <Field label="Account type">
                    <select value={editing.accountType} onChange={(event) => setEditing({ ...editing, accountType: event.target.value as AdminGroup["accountType"] })}>
                      <option value="participant">Participant</option>
                      <option value="reviewer">Reviewer</option>
                    </select>
                  </Field>
                  <Field label="Auth mode">
                    <select value={editing.authMode} onChange={(event) => setEditing({ ...editing, authMode: event.target.value as AdminGroup["authMode"] })}>
                      <option value="none">Name lookup</option>
                      <option value="oidc">OIDC</option>
                    </select>
                  </Field>
                </div>
                <Field label="Domain suffix">
                  <Input value={editing.domainSuffix} onChange={(event) => setEditing({ ...editing, domainSuffix: event.target.value })} />
                </Field>
                <Field label="Group password">
                  <Input value={editing.sharedPassword} onChange={(event) => setEditing({ ...editing, sharedPassword: event.target.value })} />
                </Field>
                <Field label="IPv4 allowlist" hint={`Suggested current IPv4: ${currentIp}`}>
                  <Input
                    value={editing.ipv4Allowlist.join(", ")}
                    onChange={(event) => setEditing({ ...editing, ipv4Allowlist: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })}
                    placeholder="192.168.1.0/24, 10.0.0.12"
                  />
                </Field>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={editing.autoCreateWorkspace}
                    onChange={(event) => setEditing({ ...editing, autoCreateWorkspace: event.target.checked })}
                  />
                  Automatically create workspace
                </label>
                <div className="two-col">
                  <Field label="Coder template">
                    <select
                      value={editing.coderTemplateId ?? ""}
                      onFocus={loadTemplates}
                      onChange={(event) => {
                        const template = templates.find((item) => item.id === event.target.value);
                        setEditing({ ...editing, coderTemplateId: template?.id ?? "", coderTemplateName: template?.display_name ?? template?.name ?? "" });
                      }}
                    >
                      <option value="">No template</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.display_name ?? template.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Preset ID">
                    <Input value={editing.coderTemplatePresetId ?? ""} onChange={(event) => setEditing({ ...editing, coderTemplatePresetId: event.target.value })} />
                  </Field>
                </div>
                <Field label="Template parameters JSON">
                  <Textarea
                    value={JSON.stringify(editing.coderParameters ?? {}, null, 2)}
                    onChange={(event) => {
                      try {
                        setEditing({ ...editing, coderParameters: JSON.parse(event.target.value) as Record<string, string> });
                      } catch {
                        setEditing({ ...editing });
                      }
                    }}
                  />
                </Field>
                {editing.authMode === "oidc" ? (
                  <div className="oidc-block">
                    <p className="subtle">OIDC secrets are stored per group. Use scopes openid, profile, and email.</p>
                    <Field label="Issuer">
                      <Input
                        value={editing.oidcConfig?.issuer ?? ""}
                        onChange={(event) => setEditing({ ...editing, oidcConfig: { ...editing.oidcConfig, issuer: event.target.value } as AdminGroup["oidcConfig"] })}
                        placeholder="https://accounts.google.com"
                      />
                    </Field>
                    <div className="two-col">
                      <Field label="Client ID">
                        <Input
                          value={editing.oidcConfig?.clientId ?? ""}
                          onChange={(event) => setEditing({ ...editing, oidcConfig: { ...editing.oidcConfig, clientId: event.target.value } as AdminGroup["oidcConfig"] })}
                        />
                      </Field>
                      <Field label="Client secret">
                        <Input
                          value={editing.oidcConfig?.clientSecret ?? ""}
                          onChange={(event) => setEditing({ ...editing, oidcConfig: { ...editing.oidcConfig, clientSecret: event.target.value } as AdminGroup["oidcConfig"] })}
                        />
                      </Field>
                    </div>
                    <Field label="Authorization endpoint">
                      <Input
                        value={editing.oidcConfig?.authorizationEndpoint ?? ""}
                        onChange={(event) =>
                          setEditing({ ...editing, oidcConfig: { ...editing.oidcConfig, authorizationEndpoint: event.target.value } as AdminGroup["oidcConfig"] })
                        }
                        placeholder="https://accounts.google.com/o/oauth2/v2/auth"
                      />
                    </Field>
                    <Field label="Token endpoint">
                      <Input
                        value={editing.oidcConfig?.tokenEndpoint ?? ""}
                        onChange={(event) => setEditing({ ...editing, oidcConfig: { ...editing.oidcConfig, tokenEndpoint: event.target.value } as AdminGroup["oidcConfig"] })}
                        placeholder="https://oauth2.googleapis.com/token"
                      />
                    </Field>
                    <Field label="JWKS URI">
                      <Input
                        value={editing.oidcConfig?.jwksUri ?? ""}
                        onChange={(event) => setEditing({ ...editing, oidcConfig: { ...editing.oidcConfig, jwksUri: event.target.value } as AdminGroup["oidcConfig"] })}
                        placeholder="https://www.googleapis.com/oauth2/v3/certs"
                      />
                    </Field>
                    <div className="two-col">
                      <Field label="Allowed email domain">
                        <Input
                          value={editing.oidcConfig?.allowedEmailDomain ?? ""}
                          onChange={(event) =>
                            setEditing({ ...editing, oidcConfig: { ...editing.oidcConfig, allowedEmailDomain: event.target.value } as AdminGroup["oidcConfig"] })
                          }
                          placeholder="example.com"
                        />
                      </Field>
                      <Field label="Hosted-domain claim">
                        <Input
                          value={editing.oidcConfig?.hostedDomainClaim ?? "hd"}
                          onChange={(event) =>
                            setEditing({ ...editing, oidcConfig: { ...editing.oidcConfig, hostedDomainClaim: event.target.value } as AdminGroup["oidcConfig"] })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                ) : null}
                <Button onClick={saveGroup}>Save group</Button>
              </div>
            </Card>
          </div>
        </Panel>
      ) : null}
      {tab === "people" ? (
        <Panel>
          <div className="toolbar-actions">
            <Button variant="secondary" disabled={selectedPeople.length === 0} onClick={() => updatePeopleRole("participant")}>Participant</Button>
            <Button variant="secondary" disabled={selectedPeople.length === 0} onClick={() => updatePeopleRole("reviewer")}>Reviewer</Button>
            <Button variant="secondary" disabled={selectedPeople.length === 0} onClick={() => updatePeopleRole("admin")}>Admin</Button>
            <Button variant="danger" disabled={selectedPeople.length === 0} onClick={deletePeople}><Trash2 size={16} /> Remove</Button>
          </div>
          <DataGrid rows={people} columns={personColumns} selected={selectedPeople} onSelectedChange={setSelectedPeople} />
        </Panel>
      ) : null}
      {tab === "workspaces" ? (
        <Panel>
          <div className="toolbar-actions">
            <Button variant="secondary" disabled={selectedWorkspaces.length === 0} onClick={() => batch("start")}><Play size={16} /> Start</Button>
            <Button variant="secondary" disabled={selectedWorkspaces.length === 0} onClick={() => batch("stop")}><Square size={16} /> Stop</Button>
            <Button variant="danger" disabled={selectedWorkspaces.length === 0} onClick={() => batch("delete")}><Trash2 size={16} /> Delete</Button>
          </div>
          <DataGrid rows={workspaces} columns={workspaceColumns} selected={selectedWorkspaces} onSelectedChange={setSelectedWorkspaces} />
        </Panel>
      ) : null}
      {tab === "imports" ? (
        <Panel>
          <Card>
            <h2>Paste CSV</h2>
            <p>Use first name and last name columns. Existing people are the source of truth when conflicts are detected.</p>
            <Textarea value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="First name,Last name" />
            <div className="actions">
              <Button onClick={previewImport} disabled={!editing.id || !csv.trim()}>Preview import</Button>
              {importPreview?.conflictCount ? <Button variant="secondary" onClick={() => setImportPreview({ ...importPreview, rows: importPreview.rows.filter((row) => row.conflictPersonId) })}>Show conflicts</Button> : null}
              {importPreview ? <Button variant="secondary" onClick={confirmImport}>Confirm</Button> : null}
            </div>
          </Card>
          {importPreview ? (
            <Card>
              <h2>Preview</h2>
              <p>{importPreview.conflictCount} conflicts detected.</p>
              <div className="preview-table">
                {importPreview.rows.map((row, index) => (
                  <div key={index} className={row.conflictPersonId ? "preview-row conflict" : "preview-row"}>
                    <span>{String(row.firstName)} {String(row.lastName)}</span>
                    {row.conflictPersonId ? <Badge tone="warning">Conflict {String(row.conflictScore)}%</Badge> : <Badge tone="success">New</Badge>}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </Panel>
      ) : null}
      {tab === "sync" ? (
        <Panel>
          <Card>
            <h2>Coder Sync</h2>
            <p>Sync managed people to Coder, recreating users that are missing from Coder.</p>
            <Button
              onClick={async () => {
                const data = await api<{ syncedUsers: number }>("/api/admin/coder/sync", { method: "POST" });
                setMessage(`Synced ${data.syncedUsers} users.`);
              }}
            >
              Sync Coder users
            </Button>
          </Card>
        </Panel>
      ) : null}
      {tab === "audit" ? (
        <Panel>
          <Card>
            <h2>Audit</h2>
            <div className="audit-list">
              {audit.map((event, index) => (
                <div key={index} className="audit-row">
                  <strong>{String(event.action)}</strong>
                  <small>{String(event.createdAt)}</small>
                </div>
              ))}
            </div>
          </Card>
        </Panel>
      ) : null}
    </main>
  );
}
