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
