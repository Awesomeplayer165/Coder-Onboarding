import type { PropsWithChildren } from "react";

export function Tabs({
  value,
  onChange,
  tabs
}: {
  value: string;
  onChange: (value: string) => void;
  tabs: { id: string; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} className={value === tab.id ? "tab active" : "tab"} onClick={() => onChange(tab.id)} type="button">
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Panel({ children }: PropsWithChildren) {
  return <div className="panel">{children}</div>;
}
