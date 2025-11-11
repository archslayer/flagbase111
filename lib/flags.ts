/**
 * Flag utilities for country mapping
 * Maps country IDs to names and flag image URLs
 */

export interface CountryFlag {
  id: number;
  name: string;
  code: string;
  flagUrl: string;
}

// Country mapping based on the existing flags array
const COUNTRY_FLAGS: CountryFlag[] = [
  { id: 1, name: "Argentina", code: "ARG", flagUrl: "/flags/ARG.png" },
  { id: 2, name: "Australia", code: "AU", flagUrl: "/flags/AU.png" },
  { id: 3, name: "Brazil", code: "BR", flagUrl: "/flags/BR.png" },
  { id: 4, name: "Canada", code: "CA", flagUrl: "/flags/CA.png" },
  { id: 5, name: "Switzerland", code: "CH", flagUrl: "/flags/CH.png" },
  { id: 6, name: "Germany", code: "DE", flagUrl: "/flags/DE.png" },
  { id: 7, name: "France", code: "FR", flagUrl: "/flags/FR.png" },
  { id: 8, name: "Greece", code: "GR", flagUrl: "/flags/GR.png" },
  { id: 9, name: "India", code: "IN", flagUrl: "/flags/IN.png" },
  { id: 10, name: "Japan", code: "JP", flagUrl: "/flags/JP.png" },
  { id: 11, name: "South Korea", code: "KR", flagUrl: "/flags/KR.png" },
  { id: 12, name: "Morocco", code: "MO", flagUrl: "/flags/MO.png" },
  { id: 13, name: "Mexico", code: "MX", flagUrl: "/flags/MX.png" },
  { id: 14, name: "Malaysia", code: "MY", flagUrl: "/flags/MY.png" },
  { id: 15, name: "Nigeria", code: "NG", flagUrl: "/flags/NG.png" },
  { id: 16, name: "Philippines", code: "PH", flagUrl: "/flags/PH.png" },
  { id: 17, name: "Pakistan", code: "PK", flagUrl: "/flags/PK.png" },
  { id: 18, name: "Poland", code: "PL", flagUrl: "/flags/PL.png" },
  { id: 19, name: "Portugal", code: "POR", flagUrl: "/flags/POR.png" },
  { id: 20, name: "Russia", code: "RU", flagUrl: "/flags/RU.png" },
  { id: 21, name: "Saudi Arabia", code: "SA", flagUrl: "/flags/SA.png" },
  { id: 22, name: "Singapore", code: "SG", flagUrl: "/flags/SG.png" },
  { id: 23, name: "Spain", code: "SP", flagUrl: "/flags/SP.png" },
  { id: 24, name: "Sweden", code: "SW", flagUrl: "/flags/SW.png" },
  { id: 25, name: "Thailand", code: "TH", flagUrl: "/flags/TH.png" },
  { id: 26, name: "Turkey", code: "TR", flagUrl: "/flags/TR.png" },
  { id: 27, name: "Taiwan", code: "TW", flagUrl: "/flags/TW.png" },
  { id: 28, name: "UAE", code: "UAE", flagUrl: "/flags/UAE.png" },
  { id: 29, name: "United Kingdom", code: "UK", flagUrl: "/flags/UK.png" },
  { id: 30, name: "Ukraine", code: "UKR", flagUrl: "/flags/UKR.png" },
  { id: 31, name: "United States", code: "USA", flagUrl: "/flags/USA.png" },
  { id: 32, name: "Venezuela", code: "VE", flagUrl: "/flags/VE.png" },
  { id: 33, name: "Vietnam", code: "VN", flagUrl: "/flags/VN.png" },
  { id: 34, name: "South Africa", code: "ZA", flagUrl: "/flags/ZA.png" },
];

/**
 * Get country name by ID
 */
export function countryName(id: number): string {
  const country = COUNTRY_FLAGS.find(c => c.id === id);
  return country?.name || `Country ${id}`;
}

/**
 * Get country code by ID
 */
export function countryCode(id: number): string {
  const country = COUNTRY_FLAGS.find(c => c.id === id);
  return country?.code || `C${id}`;
}

/**
 * Get country flag URL by ID
 */
export function countryFlagUrl(id: number): string {
  const country = COUNTRY_FLAGS.find(c => c.id === id);
  return country?.flagUrl || "/flags/whiteflag.png";
}

/**
 * Get all country flags
 */
export function getAllCountryFlags(): CountryFlag[] {
  return [...COUNTRY_FLAGS];
}

/**
 * Get country flag by ID
 */
export function getCountryFlag(id: number): CountryFlag | null {
  return COUNTRY_FLAGS.find(c => c.id === id) || null;
}

/**
 * Check if country ID exists
 */
export function isValidCountryId(id: number): boolean {
  return COUNTRY_FLAGS.some(c => c.id === id);
}
