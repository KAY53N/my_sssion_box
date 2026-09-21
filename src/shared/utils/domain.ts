export function extractDomain(hostname: string): string {
  // Remove www. prefix and extract main domain
  return hostname.replace(/^www\./, "");
}

export function getDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = extractDomain(urlObj.hostname);

    const isLocalhost = domain === "localhost" || domain.startsWith("127.");
    const port = urlObj.port;

    if (isLocalhost && port) {
      return `${domain}:${port}`;
    }

    return domain;
  } catch (_) {
    console.error("Invalid URL:", url);
    return "";
  }
}

/**
 * Extract root domain (top-level domain + one level above)
 * Examples:
 * - chat.deepseek.com -> deepseek.com
 * - www.example.co.uk -> example.co.uk
 * - localhost -> localhost
 */
export function extractRootDomain(domain: string): string {
  // Handle localhost and IP addresses
  if (domain === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
    return domain;
  }

  // Handle domains with port (e.g., localhost:3000)
  const [hostPart, portPart] = domain.split(":");

  // Split by dots
  const parts = hostPart.split(".");

  // If domain has 2 or fewer parts, return as is (e.g., example.com)
  if (parts.length <= 2) {
    return domain;
  }

  // Handle common two-part TLDs (e.g., .co.uk, .com.cn)
  const twoPartTLDs = ["co.uk", "com.cn", "com.au", "co.jp", "co.kr"];
  const lastTwoParts = parts.slice(-2).join(".");

  if (twoPartTLDs.includes(lastTwoParts)) {
    // Take last 3 parts (e.g., example.co.uk)
    const rootDomain = parts.slice(-3).join(".");
    return portPart ? `${rootDomain}:${portPart}` : rootDomain;
  }

  // Default: take last 2 parts (e.g., deepseek.com from chat.deepseek.com)
  const rootDomain = parts.slice(-2).join(".");
  return portPart ? `${rootDomain}:${portPart}` : rootDomain;
}
