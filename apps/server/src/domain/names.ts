export function normalizeNamePart(value: string) {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizedFullName(firstName: string, lastName: string) {
  return `${normalizeNamePart(firstName)} ${normalizeNamePart(lastName)}`.trim();
}

export function compactName(value: string) {
  return normalizeNamePart(value).replace(/\s+/g, "");
}

export function usernamePart(value: string) {
  return normalizeNamePart(value).replace(/[^a-z0-9]/g, "");
}

export function personDisplayName(firstName: string, lastName: string) {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

export function titleCaseNamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/([\s-]+)/)
    .map((part) => (/^[a-z]/.test(part) ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part))
    .join("")
    .replace(/\s+/g, " ");
}

export function cleanPersonName(firstName: string, lastName: string) {
  return {
    firstName: titleCaseNamePart(firstName),
    lastName: titleCaseNamePart(lastName)
  };
}
