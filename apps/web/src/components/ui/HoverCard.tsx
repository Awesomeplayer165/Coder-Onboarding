export function HoverCard({ children, content, href }: { children: React.ReactNode; content: React.ReactNode; href?: string }) {
  return (
    <span className="hover-card-root">
      {href ? <a href={href}>{children}</a> : children}
      <span className="hover-card-content">{content}</span>
    </span>
  );
}
