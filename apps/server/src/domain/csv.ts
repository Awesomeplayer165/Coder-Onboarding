export type ImportPerson = {
  firstName: string;
  lastName: string;
};

export function parsePeopleCsv(input: string): ImportPerson[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(",").map((value) => value.trim()).filter(Boolean);
      if (index === 0 && /first/i.test(parts[0] ?? "") && /last/i.test(parts[1] ?? "")) {
        return null;
      }
      if (parts.length < 2) {
        const words = line.split(/\s+/).filter(Boolean);
        if (words.length < 2) throw new Error(`Row ${index + 1} must include first and last name.`);
        return { firstName: words[0]!, lastName: words.slice(1).join(" ") };
      }
      return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
    })
    .filter((row): row is ImportPerson => row !== null);
}
