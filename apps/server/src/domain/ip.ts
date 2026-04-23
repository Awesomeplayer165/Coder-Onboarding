function ipToInt(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return null;
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

export function ipv4Allowed(ip: string, allowlist: string[]) {
  if (allowlist.length === 0) return true;
  const current = ipToInt(ip.replace(/^::ffff:/, ""));
  if (current === null) return false;

  return allowlist.some((entry) => {
    const [base, mask] = entry.trim().split("/");
    const baseInt = ipToInt(base ?? "");
    if (baseInt === null) return false;
    if (!mask) return current === baseInt;
    const bits = Number(mask);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const subnetMask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (current & subnetMask) === (baseInt & subnetMask);
  });
}
