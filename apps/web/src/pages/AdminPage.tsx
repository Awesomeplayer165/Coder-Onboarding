import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronsUpDown, Command, Download, FileUp, LogOut, Play, RefreshCcw, Save, Search, Settings, Shield, Square, Trash2, UserCircle, UserPlus, Users, Wrench } from "lucide-react";
import { api } from "../lib/api";
import type { PersonRow, PublicGroup, Session, WorkspaceRow } from "../lib/types";
import { Button } from "../components/ui/Button";
import { Card, Badge } from "../components/ui/Card";
import { Field, Input, Textarea } from "../components/ui/Input";
import { DataGrid, type Column } from "../components/DataGrid";
import { HoverCard } from "../components/ui/HoverCard";
import { TableSkeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { Dialog } from "../components/ui/Dialog";
import { Kbd } from "../components/ui/Kbd";
import { Avatar } from "../components/ui/Avatar";
import { Empty } from "../components/ui/Empty";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "../components/ui/DropdownMenu";

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

export function AdminPage({ onBack, onSignedOut, currentIp, session }: { onBack: () => void; onSignedOut: () => void; currentIp: string; session: Session }) {
  const toast = useToast();
  const [tab, setTab] = useState("groups");
  const [tableSearch, setTableSearch] = useState("");
  const [tableFilters, setTableFilters] = useState<{ label: string; key: string; value: string }[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [editing, setEditing] = useState<AdminGroup>(blankGroup());
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; display_name?: string }[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<string[]>([]);
  const [roleToApply, setRoleToApply] = useState<"participant" | "reviewer" | "admin">("participant");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [createWorkspaceDialogOpen, setCreateWorkspaceDialogOpen] = useState(false);
  const [deletePeopleDialogOpen, setDeletePeopleDialogOpen] = useState(false);
  const [workspaceAction, setWorkspaceAction] = useState<"start" | "stop" | "delete" | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const [csv, setCsv] = useState("");
  const [importPreview, setImportPreview] = useState<{ importId: string; rows: Record<string, unknown>[]; conflictCount: number } | null>(null);
  const [audit, setAudit] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [peopleRoleFilter, setPeopleRoleFilter] = useState("");
  const [peopleGroupTypeFilter, setPeopleGroupTypeFilter] = useState("");
  const [newWorkspace, setNewWorkspace] = useState({ templateId: "", name: "main" });
  const [newPerson, setNewPerson] = useState({
    groupId: "",
    firstName: "",
    lastName: "",
    role: "participant" as "participant" | "reviewer" | "admin",
    emailMode: "first.last" as "first.last" | "firstlast" | "f.lastname" | "custom",
    customEmail: "",
    createInCoderNow: false
  });

  async function refresh(preferredGroupId = editing.id) {
    const [groupData, peopleData, workspaceData] = await Promise.all([
      api<{ groups: AdminGroup[] }>("/api/admin/groups"),
      api<{ people: PersonRow[] }>("/api/admin/people"),
      api<{ workspaces: WorkspaceRow[] }>("/api/admin/workspaces")
    ]);
    setGroups(groupData.groups);
    setPeople(peopleData.people);
    setWorkspaces(workspaceData.workspaces);
    const nextEditing = groupData.groups.find((group) => group.id === preferredGroupId) ?? groupData.groups[0] ?? blankGroup();
    setEditing(nextEditing);
    setNewPerson((current) => ({ ...current, groupId: current.groupId || nextEditing.id }));
    setLoading(false);
  }

  useEffect(() => {
    refresh("").catch((error) => toast({ title: "Admin data failed to load", description: error instanceof Error ? error.message : String(error), tone: "danger" }));
  }, []);

  useEffect(() => {
    const events = new EventSource("/api/admin/live");
    events.onmessage = () => {
      if (!isEditingGroup) {
        refresh(editing.id).catch(() => undefined);
      }
    };
    return () => events.close();
  }, [editing.id, isEditingGroup]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const selectedPeopleCount = selectedPeople.length;
  const selectedWorkspaceCount = selectedWorkspaces.length;
  const peopleRows = useMemo(
    () =>
      people.map((person) => {
        const group = groups.find((item) => item.id === person.groupId);
        return { ...person, groupType: group?.accountType ?? "" };
      }),
    [groups, people]
  );
  const activePeopleFilters = useMemo(() => {
    const filters: { label: string; key: keyof (PersonRow & { groupType: string }) & string; value: string }[] = [];
    if (peopleRoleFilter) filters.push({ label: "Role", key: "role", value: peopleRoleFilter });
    if (peopleGroupTypeFilter) filters.push({ label: "Group type", key: "groupType", value: peopleGroupTypeFilter });
    return filters;
  }, [peopleGroupTypeFilter, peopleRoleFilter]);

  async function saveGroup() {
    const body = {
      ...editing,
      id: editing.id || undefined,
      oidcConfig: editing.authMode === "oidc" ? editing.oidcConfig : null
    };
    await api("/api/admin/groups", { method: "POST", body: JSON.stringify(body) });
    setIsEditingGroup(false);
    toast({ title: "Group saved", description: `${editing.name} is up to date.`, tone: "success" });
    await refresh(editing.id);
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
    toast({ title: "Workspace job queued", description: `${action} job ${data.job.id}`, tone: "success" });
  }

  async function previewImport() {
    const data = await api<{ importId: string; rows: Record<string, unknown>[]; conflictCount: number }>("/api/admin/imports/preview", {
      method: "POST",
      body: JSON.stringify({ groupId: editing.id, csv })
    });
    setImportPreview(data);
    toast({ title: "Import preview ready", description: `${data.conflictCount} conflicts found.` });
  }

  async function confirmImport() {
    if (!importPreview) return;
    await api(`/api/admin/imports/${importPreview.importId}/confirm`, { method: "POST" });
    toast({ title: "Import confirmed", tone: "success" });
    setImportPreview(null);
    setCsv("");
    await refresh();
  }

  async function updatePeopleRole(role: "participant" | "reviewer" | "admin") {
    await api("/api/admin/people/roles", { method: "POST", body: JSON.stringify({ personIds: selectedPeople, role }) });
    toast({ title: "Roles updated", description: `${selectedPeople.length} account${selectedPeople.length === 1 ? "" : "s"} changed.`, tone: "success" });
    await refresh();
  }

  async function deletePeople() {
    await api("/api/admin/people/delete", { method: "POST", body: JSON.stringify({ personIds: selectedPeople }) });
    setSelectedPeople([]);
    toast({ title: "Accounts removed", description: "Coder workspaces were queued for deletion first.", tone: "success" });
    await refresh();
  }

  async function createPerson() {
    await api("/api/admin/people", { method: "POST", body: JSON.stringify(newPerson) });
    toast({ title: "Account created", description: `${newPerson.firstName} ${newPerson.lastName}`, tone: "success" });
    setNewPerson((current) => ({ ...current, firstName: "", lastName: "", customEmail: "", createInCoderNow: false }));
    await refresh();
  }

  async function createWorkspaceForPeople() {
    const template = templates.find((item) => item.id === newWorkspace.templateId);
    const data = await api<{ affected: number; created: number }>("/api/admin/workspaces/create-for-people", {
      method: "POST",
      body: JSON.stringify({
        personIds: selectedPeople,
        templateId: newWorkspace.templateId,
        templateName: template?.display_name ?? template?.name,
        name: newWorkspace.name
      })
    });
    toast({ title: "Workspace creation started", description: `${data.affected} account${data.affected === 1 ? "" : "s"} processed.`, tone: "success" });
    setSelectedPeople([]);
    await refresh();
  }

  async function loadAudit() {
    const data = await api<{ events: Record<string, unknown>[] }>("/api/admin/audit");
    setAudit(data.events);
  }

  async function signOut() {
    await api("/api/session/logout", { method: "POST" });
    toast({ title: "Signed out", tone: "success" });
    onSignedOut();
  }

  function exportAdminData() {
    const payload = { exportedAt: new Date().toISOString(), groups, people, workspaces, audit };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `coder-onboarding-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export prepared", description: "Admin data was exported as JSON.", tone: "success" });
  }

  function markGroupEditing(next: AdminGroup) {
    setIsEditingGroup(true);
    setEditing(next);
  }

  function formatDate(value: unknown) {
    if (!value) return "Never";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value)));
  }

  const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
  const navItems = [
    { id: "groups", label: "Groups", icon: <Settings size={16} /> },
    { id: "people", label: "People", icon: <Users size={16} /> },
    { id: "workspaces", label: "Workspaces", icon: <Wrench size={16} /> },
    { id: "sync", label: "Sync", icon: <RefreshCcw size={16} /> },
    { id: "audit", label: "Audit", icon: <Shield size={16} /> }
  ];

  const commandItems = useMemo(() => {
    const pages = navItems.map((item) => ({ type: "Page", label: item.label, detail: "Go to section", action: () => { setTab(item.id); setTableSearch(""); setTableFilters([]); } }));
    const groupItems = groups.map((group) => ({
      type: "Group",
      label: group.name,
      detail: group.domainSuffix,
      action: () => {
        setTab("groups");
        setEditing(group);
        setTableSearch(group.name);
      }
    }));
    const personItems = people.map((person) => ({
      type: "User",
      label: `${person.firstName} ${person.lastName}`,
      detail: person.email,
      action: () => {
        setTab("people");
        setTableSearch(person.email);
      }
    }));
    const workspaceItems = workspaces.map((workspace) => ({
      type: "Workspace",
      label: workspace.name,
      detail: workspace.personEmail ?? workspace.groupName ?? "",
      action: () => {
        setTab("workspaces");
        setTableSearch(workspace.name);
      }
    }));
    const all = [...pages, ...groupItems, ...personItems, ...workspaceItems];
    const query = commandQuery.trim().toLowerCase();
    return query ? all.filter((item) => `${item.type} ${item.label} ${item.detail}`.toLowerCase().includes(query)).slice(0, 12) : all.slice(0, 12);
  }, [commandQuery, groups, people, workspaces]);

  useEffect(() => {
    setCommandIndex(0);
  }, [commandItems.length, commandQuery]);

  function runCommand(index = commandIndex) {
    const item = commandItems[index];
    if (!item) return;
    item.action();
    setCommandOpen(false);
    setCommandQuery("");
    setCommandIndex(0);
  }

  const personColumns: Column<PersonRow & { groupType: string }>[] = [
    {
      key: "firstName",
      label: "Name",
      render: (row) => (
        <HoverCard
          content={
            <>
              <strong>{row.firstName} {row.lastName}</strong>
              <small>{row.email}</small>
              <small>{row.groupName ?? "No group"} · {row.workspaceCount ?? 0} workspaces</small>
              <small>Last login {formatDate(row.lastLoginAt)}</small>
            </>
          }
        >
          {row.firstName} {row.lastName}
        </HoverCard>
      )
    },
    { key: "email", label: "Email" },
    { key: "groupName", label: "Group" },
    { key: "groupType", label: "Group type", render: (row) => row.groupType ? <Badge>{row.groupType}</Badge> : "Unknown" },
    { key: "role", label: "Role", render: (row) => <Badge tone={row.role === "admin" ? "warning" : "neutral"}>{row.role}</Badge> },
    { key: "workspaceCount", label: "Workspaces" }
  ];

  const workspaceColumns: Column<WorkspaceRow>[] = [
    {
      key: "name",
      label: "Workspace",
      render: (row) => (
        <HoverCard
          content={
            <>
              <strong>{row.name}</strong>
              <small>{row.coderWorkspaceId}</small>
              <small>{row.personEmail ?? "No owner email"}</small>
              <small>{row.templateName ?? "No template"}</small>
            </>
          }
        >
          {row.name}
        </HoverCard>
      )
    },
    { key: "personName", label: "Person" },
    { key: "groupName", label: "Group" },
    { key: "status", label: "Status" },
    { key: "templateName", label: "Template" }
  ];

  const auditColumns: Column<Record<string, unknown> & { id: string }>[] = [
    { key: "action", label: "Action" },
    { key: "targetType", label: "Target" },
    { key: "targetId", label: "Target ID" },
    { key: "createdAt", label: "When", render: (row) => formatDate(row.createdAt) },
    { key: "metadata", label: "Metadata", render: (row) => <code>{JSON.stringify(row.metadata ?? {})}</code> }
  ];

  return (
    <main className="admin-layout">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <Avatar name={session?.person ? `${session.person.firstName} ${session.person.lastName}` : "Admin"} />
          <strong>Admin</strong>
        </div>
        <nav className="sidebar-nav" aria-label="Admin navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "sidebar-item active" : "sidebar-item"}
              onClick={() => {
                setTab(item.id);
                if (item.id === "audit") loadAudit().catch(() => undefined);
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-menu">
            <div className="sidebar-menu-item">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="sidebar-menu-button sidebar-menu-button-lg account-selector" type="button">
                    <span className="sidebar-account-icon">
                      <UserCircle size={18} />
                    </span>
                    <span className="sidebar-account-copy">
                      <strong>{session?.person ? `${session.person.firstName} ${session.person.lastName}` : "Admin"}</strong>
                      <small>{session?.person?.email ?? "Signed in"}</small>
                    </span>
                    <ChevronsUpDown className="sidebar-account-chevron" size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" sideOffset={8}>
                  <DropdownMenuLabel>Account</DropdownMenuLabel>
                  <DropdownMenuItem onClick={onBack}>
                    <ArrowLeft size={15} />
                    Home
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut size={15} />
                    Sign out
                    <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </aside>
      <section className="admin-main">
        <header className="admin-header">
          <div>
            <h1>{navItems.find((item) => item.id === tab)?.label ?? "Admin"}</h1>
            <p>Manage groups, accounts, workspaces, sync, and audit history.</p>
          </div>
          <div className="admin-header-actions">
            <button className="command-trigger" type="button" onClick={() => setCommandOpen(true)}>
              <Search size={16} />
              Search users, workspaces, groups...
              <span><Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd><Kbd>K</Kbd></span>
            </button>
            <Button variant="secondary" onClick={() => refresh(editing.id)}>
              <RefreshCcw size={16} /> Refresh
            </Button>
          </div>
        </header>
      {tab === "groups" ? (
        <div className="panel">
          <div className="admin-grid">
            <Card>
              <h2>Groups</h2>
              <div className="list">
                {groups.map((group) => (
                  <button key={group.id} type="button" className={editing.id === group.id ? "list-row active" : "list-row"} onClick={() => setEditing(group)}>
                    <span>{group.name}</span>
                    <small>{group.authMode === "oidc" ? "Continue with Google" : "Continue with your name"}</small>
                  </button>
                ))}
              </div>
              <Button variant="secondary" onClick={() => { setIsEditingGroup(true); setEditing(blankGroup()); }}>
                New group
              </Button>
            </Card>
            <Card>
              <h2>{editing.id ? "Edit group" : "New group"}</h2>
              <div className="stack">
                <Field label="Name">
                  <Input value={editing.name} onChange={(event) => markGroupEditing({ ...editing, name: event.target.value })} />
                </Field>
                <Field label="Description">
                  <Textarea value={editing.description} onChange={(event) => markGroupEditing({ ...editing, description: event.target.value })} />
                </Field>
                <div className="two-col">
                  <Field label="Account type">
                    <select value={editing.accountType} onChange={(event) => markGroupEditing({ ...editing, accountType: event.target.value as AdminGroup["accountType"] })}>
                      <option value="participant">Participant</option>
                      <option value="reviewer">Reviewer</option>
                    </select>
                  </Field>
                  <Field label="Auth mode">
                    <select value={editing.authMode} onChange={(event) => markGroupEditing({ ...editing, authMode: event.target.value as AdminGroup["authMode"] })}>
                      <option value="none">Continue with your name</option>
                      <option value="oidc">Continue with Google</option>
                    </select>
                  </Field>
                </div>
                <Field label="Domain suffix">
                  <Input value={editing.domainSuffix} onChange={(event) => markGroupEditing({ ...editing, domainSuffix: event.target.value })} />
                </Field>
                <Field label="Group password">
                  <Input value={editing.sharedPassword} onChange={(event) => markGroupEditing({ ...editing, sharedPassword: event.target.value })} />
                </Field>
                <Field label="IPv4 allowlist" hint={`Suggested current IPv4: ${currentIp}`}>
                  <Input
                    value={editing.ipv4Allowlist.join(", ")}
                    onChange={(event) => markGroupEditing({ ...editing, ipv4Allowlist: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })}
                    placeholder="192.168.1.0/24, 10.0.0.12"
                  />
                </Field>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={editing.autoCreateWorkspace}
                    onChange={(event) => markGroupEditing({ ...editing, autoCreateWorkspace: event.target.checked })}
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
                        markGroupEditing({ ...editing, coderTemplateId: template?.id ?? "", coderTemplateName: template?.display_name ?? template?.name ?? "" });
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
                    <Input value={editing.coderTemplatePresetId ?? ""} onChange={(event) => markGroupEditing({ ...editing, coderTemplatePresetId: event.target.value })} />
                  </Field>
                </div>
                <Field label="Template parameters JSON">
                  <Textarea
                    value={JSON.stringify(editing.coderParameters ?? {}, null, 2)}
                    onChange={(event) => {
                      try {
                        markGroupEditing({ ...editing, coderParameters: JSON.parse(event.target.value) as Record<string, string> });
                      } catch {
                        markGroupEditing({ ...editing });
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
                <Button onClick={saveGroup}><Save size={16} /> Save group</Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}
      {tab === "people" ? (
        <div className="panel">
          <div className="section-toolbar">
            <select value={peopleRoleFilter} onChange={(event) => setPeopleRoleFilter(event.target.value)} aria-label="Filter people by role">
              <option value="">All roles</option>
              <option value="participant">Participant</option>
              <option value="reviewer">Reviewer</option>
              <option value="admin">Admin</option>
            </select>
            <select value={peopleGroupTypeFilter} onChange={(event) => setPeopleGroupTypeFilter(event.target.value)} aria-label="Filter people by group type">
              <option value="">All group types</option>
              <option value="participant">Participant groups</option>
              <option value="reviewer">Reviewer groups</option>
            </select>
            <Button onClick={() => setCreateDialogOpen(true)}><UserPlus size={16} /> Create account</Button>
            <Button
              variant="secondary"
              disabled={selectedPeopleCount === 0}
              onClick={async () => {
                await loadTemplates();
                setCreateWorkspaceDialogOpen(true);
              }}
            >
              <Play size={16} /> New workspace
            </Button>
            <Button variant="secondary" disabled={selectedPeopleCount === 0} onClick={() => setRoleDialogOpen(true)}><Shield size={16} /> Change role</Button>
            <Button variant="danger" disabled={selectedPeopleCount === 0} onClick={() => setDeletePeopleDialogOpen(true)}><Trash2 size={16} /> Delete</Button>
          </div>
          {loading ? <TableSkeleton /> : people.length === 0 ? (
            <Empty title="No accounts yet" description="Create an account or import a CSV from Sync." />
          ) : (
            <DataGrid
              rows={peopleRows}
              columns={personColumns}
              selected={selectedPeople}
              onSelectedChange={setSelectedPeople}
              externalQuery={tab === "people" ? tableSearch : ""}
              filters={[...activePeopleFilters, ...(tableFilters as { label: string; key: keyof (PersonRow & { groupType: string }) & string; value: string }[])]}
              empty="No matching accounts"
            />
          )}
        </div>
      ) : null}
      {tab === "workspaces" ? (
        <div className="panel">
          <div className="section-toolbar">
            <span className="selection-pill">{selectedWorkspaceCount} selected</span>
            <Button variant="secondary" disabled={selectedWorkspaceCount === 0} onClick={() => setWorkspaceAction("start")}><Play size={16} /> Start</Button>
            <Button variant="secondary" disabled={selectedWorkspaceCount === 0} onClick={() => setWorkspaceAction("stop")}><Square size={16} /> Stop</Button>
            <Button variant="danger" disabled={selectedWorkspaceCount === 0} onClick={() => setWorkspaceAction("delete")}><Trash2 size={16} /> Delete</Button>
          </div>
          {loading ? <TableSkeleton /> : workspaces.length === 0 ? (
            <Empty title="No workspaces yet" description="Managed Coder workspaces will appear here after accounts are created or synced." />
          ) : (
            <DataGrid
              rows={workspaces}
              columns={workspaceColumns}
              selected={selectedWorkspaces}
              onSelectedChange={setSelectedWorkspaces}
              externalQuery={tab === "workspaces" ? tableSearch : ""}
              filters={tableFilters as { label: string; key: keyof WorkspaceRow & string; value: string }[]}
              empty="No matching workspaces"
            />
          )}
        </div>
      ) : null}
      {tab === "sync" ? (
        <div className="panel sync-layout">
          <section className="plain-section">
            <h2>Import</h2>
            <p>Paste first name and last name columns. Existing people stay the source of truth when conflicts are detected.</p>
            <Textarea value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="First name,Last name" />
            <div className="actions">
              <Button onClick={previewImport} disabled={!editing.id || !csv.trim()}><FileUp size={16} /> Preview import</Button>
              {importPreview?.conflictCount ? <Button variant="secondary" onClick={() => setImportPreview({ ...importPreview, rows: importPreview.rows.filter((row) => row.conflictPersonId) })}>Show conflicts</Button> : null}
              {importPreview ? <Button variant="secondary" onClick={confirmImport}>Confirm</Button> : null}
            </div>
            {importPreview ? (
              <div className="preview-table">
                <p>{importPreview.conflictCount} conflicts detected.</p>
                {importPreview.rows.map((row, index) => (
                  <div key={index} className={row.conflictPersonId ? "preview-row conflict" : "preview-row"}>
                    <span>{String(row.firstName)} {String(row.lastName)}</span>
                    {row.conflictPersonId ? <Badge tone="warning">Conflict {String(row.conflictScore)}%</Badge> : <Badge tone="success">New</Badge>}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
          <section className="plain-section">
            <h2>Export and Coder Sync</h2>
            <p>Export local admin data or sync managed accounts to Coder, recreating missing Coder users.</p>
            <div className="actions">
              <Button variant="secondary" onClick={exportAdminData}><Download size={16} /> Export JSON</Button>
              <Button
                onClick={async () => {
                  const data = await api<{ syncedUsers: number }>("/api/admin/coder/sync", { method: "POST" });
                  toast({ title: "Coder sync complete", description: `${data.syncedUsers} accounts synced.`, tone: "success" });
                }}
              >
                <RefreshCcw size={16} /> Sync Coder users
              </Button>
            </div>
          </section>
        </div>
      ) : null}
      {tab === "audit" ? (
        <div className="panel">
          {audit.length === 0 ? <Empty title="No audit events yet" description="Activity will appear here after admin actions run." /> : (
            <DataGrid<Record<string, unknown> & { id: string }>
              rows={audit.map((event, index) => ({ id: String(event.id ?? index), ...event }))}
              columns={auditColumns}
              selected={[]}
              onSelectedChange={() => undefined}
              externalQuery={tab === "audit" ? tableSearch : ""}
              filters={tableFilters as { label: string; key: string; value: string }[]}
              empty="No matching audit events"
            />
          )}
        </div>
      ) : null}
      <Dialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        title="Command menu"
        description="Jump to sections or search users, groups, and workspaces."
      >
        <div className="command-menu">
          <div className="command-input">
            <Command size={16} />
            <Input
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  runCommand(0);
                }
              }}
              autoFocus
              placeholder="Search everything..."
            />
          </div>
          <div className="command-list">
            {commandItems.map((item, index) => (
              <button
                key={`${item.type}-${item.label}-${index}`}
                type="button"
                className={index === 0 ? "command-item selected" : "command-item"}
                onClick={() => {
                  runCommand(index);
                }}
              >
                <span>{item.label}</span>
                <small>{item.type} · {item.detail}</small>
              </button>
            ))}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title="Create account"
        description="Create a managed account and optionally create the Coder account immediately."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                await createPerson();
                setCreateDialogOpen(false);
              }}
              disabled={!newPerson.groupId || !newPerson.firstName || !newPerson.lastName}
            >
              <UserPlus size={16} /> Create account
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="two-col">
            <Field label="First name">
              <Input value={newPerson.firstName} onChange={(event) => setNewPerson({ ...newPerson, firstName: event.target.value })} />
            </Field>
            <Field label="Last name">
              <Input value={newPerson.lastName} onChange={(event) => setNewPerson({ ...newPerson, lastName: event.target.value })} />
            </Field>
          </div>
          <div className="two-col">
            <Field label="Group">
              <select value={newPerson.groupId} onChange={(event) => setNewPerson({ ...newPerson, groupId: event.target.value })}>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Role">
              <select value={newPerson.role} onChange={(event) => setNewPerson({ ...newPerson, role: event.target.value as typeof newPerson.role })}>
                <option value="participant">Participant</option>
                <option value="reviewer">Reviewer</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
          </div>
          <div className="two-col">
            <Field label="Email format">
              <select value={newPerson.emailMode} onChange={(event) => setNewPerson({ ...newPerson, emailMode: event.target.value as typeof newPerson.emailMode })}>
                <option value="first.last">first.last</option>
                <option value="firstlast">firstlast</option>
                <option value="f.lastname">f.lastname</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
            <Field label="Custom email">
              <Input value={newPerson.customEmail} onChange={(event) => setNewPerson({ ...newPerson, customEmail: event.target.value })} disabled={newPerson.emailMode !== "custom"} />
            </Field>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={newPerson.createInCoderNow} onChange={(event) => setNewPerson({ ...newPerson, createInCoderNow: event.target.checked })} />
            Create in Coder immediately
          </label>
        </div>
      </Dialog>

      <Dialog
        open={createWorkspaceDialogOpen}
        onOpenChange={setCreateWorkspaceDialogOpen}
        title="Create workspace"
        description={`${selectedPeopleCount} account${selectedPeopleCount === 1 ? "" : "s"} selected.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateWorkspaceDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                await createWorkspaceForPeople();
                setCreateWorkspaceDialogOpen(false);
              }}
              disabled={!newWorkspace.templateId || !newWorkspace.name.trim()}
            >
              <Play size={16} /> Create workspace
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Workspace name">
            <Input value={newWorkspace.name} onChange={(event) => setNewWorkspace({ ...newWorkspace, name: event.target.value })} />
          </Field>
          <Field label="Template">
            <select
              value={newWorkspace.templateId}
              onFocus={loadTemplates}
              onChange={(event) => {
                const template = templates.find((item) => item.id === event.target.value);
                setNewWorkspace({ ...newWorkspace, templateId: event.target.value, name: newWorkspace.name || "main" });
                if (template) setNewWorkspace((current) => ({ ...current, templateId: template.id }));
              }}
            >
              <option value="">Choose a template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.display_name ?? template.name}</option>
              ))}
            </select>
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
        title="Change selected roles"
        description={`${selectedPeopleCount} account${selectedPeopleCount === 1 ? "" : "s"} selected.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                await updatePeopleRole(roleToApply);
                setRoleDialogOpen(false);
              }}
            >
              Apply role
            </Button>
          </>
        }
      >
        <Field label="Role">
          <select value={roleToApply} onChange={(event) => setRoleToApply(event.target.value as typeof roleToApply)}>
            <option value="participant">Participant</option>
            <option value="reviewer">Reviewer</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
      </Dialog>

      <Dialog
        open={deletePeopleDialogOpen}
        onOpenChange={setDeletePeopleDialogOpen}
        title="Delete selected accounts"
        description="This queues deletion for owned Coder workspaces before deleting the Coder users and local accounts."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletePeopleDialogOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                await deletePeople();
                setDeletePeopleDialogOpen(false);
              }}
            >
              Delete accounts
            </Button>
          </>
        }
      >
        <p>{selectedPeopleCount} account{selectedPeopleCount === 1 ? "" : "s"} selected.</p>
      </Dialog>

      <Dialog
        open={workspaceAction !== null}
        onOpenChange={(open) => {
          if (!open) setWorkspaceAction(null);
        }}
        title={`${workspaceAction ? workspaceAction[0]!.toUpperCase() + workspaceAction.slice(1) : "Update"} workspaces`}
        description={`${selectedWorkspaceCount} workspace${selectedWorkspaceCount === 1 ? "" : "s"} selected.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setWorkspaceAction(null)}>Cancel</Button>
            <Button
              variant={workspaceAction === "delete" ? "danger" : "primary"}
              onClick={async () => {
                if (workspaceAction) await batch(workspaceAction);
                setWorkspaceAction(null);
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        <p>This action will be sent to Coder as a workspace build operation.</p>
      </Dialog>
      </section>
    </main>
  );
}
