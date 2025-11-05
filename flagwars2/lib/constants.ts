export const ACHIEVEMENTS = [
  { id:1, name:"First Purchase", description:"Buy your first flag", icon:"🎯", requirement:"Buy once", rarity:"Common" },
  { id:3, name:"First Attack", description:"Execute your first attack", icon:"⚔️", requirement:"Attack once", rarity:"Common" },
];
export const UI_TEXT = {};

// Active countries in contract
export const ACTIVE_COUNTRIES = [
  { id: 90, name: "Turkey", code: "TR" },
  { id: 44, name: "United Kingdom", code: "GB" },
  { id: 1, name: "United States", code: "US" },
]

// Country code to flag mapping (for missing flags)
export const COUNTRY_FLAG_MAP: Record<string, string> = {
  'TR': '/flags/TR.png',
  'GB': '/flags/UK.png',
  'US': '/flags/USA.png',
  // Add more as needed
}

// Get flag image path for a country name or ID
export function getFlagImage(countryName: string, countryId?: number): string {
  // Try to match by country ID first (most reliable)
  if (countryId) {
    const country = ACTIVE_COUNTRIES.find(c => c.id === countryId)
    if (country) {
      return COUNTRY_FLAG_MAP[country.code] || `/flags/${country.code}.png`
    }
  }
  
  // Try to match by country name
  const country = ACTIVE_COUNTRIES.find(c => c.name === countryName)
  if (country) {
    return COUNTRY_FLAG_MAP[country.code] || `/flags/${country.code}.png`
  }
  
  // Fallback: try first 2 chars as code
  if (typeof countryName === 'string') {
    const code = countryName.slice(0, 2).toUpperCase()
    if (COUNTRY_FLAG_MAP[code]) {
      return COUNTRY_FLAG_MAP[code]
    }
  }
  
  // Last resort: white flag placeholder
  return '/flags/whiteflag.png'
}