const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');
const { toToken18, toUSDC6 } = require("../lib/units");

function loadDeployments() {
  const p = path.resolve(process.cwd(), 'deployments/base-sepolia.json');
  if (!fs.existsSync(p)) {
    throw new Error('Deployments file not found. Run 01_deploy_core.ts first.');
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Country list with IDs and names
// Test için sadece 3 ülke
const COUNTRIES: Array<{ id: number; name: string }> = [
  { id: 90, name: 'TR' },   // Turkey
  { id: 44, name: 'GB' },   // United Kingdom
  { id: 1, name: 'US' },    // United States
  { id: 33, name: 'FR' },   // France
  { id: 39, name: 'IT' },   // Italy
  { id: 34, name: 'ES' },   // Spain
  { id: 31, name: 'NL' },   // Netherlands
  { id: 32, name: 'BE' },   // Belgium
  { id: 41, name: 'CH' },   // Switzerland
  { id: 43, name: 'AT' },   // Austria
  { id: 46, name: 'SE' },   // Sweden
  { id: 47, name: 'NO' },   // Norway
  { id: 45, name: 'DK' },   // Denmark
  { id: 358, name: 'FI' },  // Finland
  { id: 48, name: 'PL' },   // Poland
  { id: 420, name: 'CZ' },  // Czech Republic
  { id: 421, name: 'SK' },  // Slovakia
  { id: 36, name: 'HU' },   // Hungary
  { id: 40, name: 'RO' },   // Romania
  { id: 359, name: 'BG' },  // Bulgaria
  { id: 385, name: 'HR' },  // Croatia
  { id: 386, name: 'SI' },  // Slovenia
  { id: 372, name: 'EE' },  // Estonia
  { id: 371, name: 'LV' },  // Latvia
  { id: 370, name: 'LT' },  // Lithuania
  { id: 7, name: 'RU' },    // Russia
  { id: 380, name: 'UA' },  // Ukraine
  { id: 375, name: 'BY' },  // Belarus
  { id: 81, name: 'JP' },   // Japan
  { id: 82, name: 'KR' },   // South Korea
  { id: 86, name: 'CN' },   // China
  { id: 91, name: 'IN' },   // India
  { id: 65, name: 'SG' },   // Singapore
  { id: 60, name: 'MY' },   // Malaysia
  { id: 66, name: 'TH' },   // Thailand
  { id: 63, name: 'PH' },   // Philippines
  { id: 84, name: 'VN' },   // Vietnam
  { id: 62, name: 'ID' },   // Indonesia
  { id: 61, name: 'AU' },   // Australia
  { id: 64, name: 'NZ' },   // New Zealand
  { id: 55, name: 'BR' },   // Brazil
  { id: 54, name: 'AR' },   // Argentina
  { id: 56, name: 'CL' },   // Chile
  { id: 57, name: 'CO' },   // Colombia
  { id: 51, name: 'PE' },   // Peru
  { id: 52, name: 'MX' },   // Mexico
  { id: 1, name: 'CA' },    // Canada
  { id: 27, name: 'ZA' },   // South Africa
  { id: 234, name: 'NG' },  // Nigeria
  { id: 254, name: 'KE' },  // Kenya
  { id: 20, name: 'EG' },   // Egypt
  { id: 212, name: 'MA' },  // Morocco
  { id: 213, name: 'DZ' },  // Algeria
  { id: 216, name: 'TN' },  // Tunisia
  { id: 218, name: 'LY' },  // Libya
  { id: 249, name: 'SD' },  // Sudan
  { id: 251, name: 'ET' },  // Ethiopia
  { id: 255, name: 'TZ' },  // Tanzania
  { id: 256, name: 'UG' },  // Uganda
  { id: 250, name: 'RW' },  // Rwanda
  { id: 258, name: 'MZ' },  // Mozambique
  { id: 263, name: 'ZW' },  // Zimbabwe
  { id: 267, name: 'BW' },  // Botswana
  { id: 268, name: 'SZ' },  // Eswatini
  { id: 266, name: 'LS' },  // Lesotho
  { id: 264, name: 'NA' },  // Namibia
  { id: 27, name: 'ZA' },   // South Africa (duplicate removed)
  { id: 966, name: 'SA' },  // Saudi Arabia
  { id: 971, name: 'AE' },  // UAE
  { id: 974, name: 'QA' },  // Qatar
  { id: 965, name: 'KW' },  // Kuwait
  { id: 973, name: 'BH' },  // Bahrain
  { id: 968, name: 'OM' },  // Oman
  { id: 962, name: 'JO' },  // Jordan
  { id: 961, name: 'LB' },  // Lebanon
  { id: 963, name: 'SY' },  // Syria
  { id: 964, name: 'IQ' },  // Iraq
  { id: 98, name: 'IR' },   // Iran
  { id: 90, name: 'TR' },   // Turkey (duplicate removed)
  { id: 972, name: 'IL' },  // Israel
  { id: 970, name: 'PS' },  // Palestine
  { id: 20, name: 'EG' },   // Egypt (duplicate removed)
  { id: 218, name: 'LY' },  // Libya (duplicate removed)
  { id: 216, name: 'TN' },  // Tunisia (duplicate removed)
  { id: 213, name: 'DZ' },  // Algeria (duplicate removed)
  { id: 212, name: 'MA' },  // Morocco (duplicate removed)
];

(async () => {
  const dep = loadDeployments();
  const core = await ethers.getContractAt("FlagWarsCore", dep.core);

  console.log(`Seeding ${COUNTRIES.length} countries with 50,000 supply and $5 initial price...`);

  for (const country of COUNTRIES) {
    try {
      // Check if country already exists (idempotent)
      try {
        const countryInfo = await core.getCountryInfo(country.id);
        if (countryInfo.exists) {
          console.log(`Country ${country.id} (${country.name}) already exists, skipping...`);
          continue;
        }
      } catch (error) {
        // Country doesn't exist yet, continue with creation
        console.log(`Country ${country.id} (${country.name}) doesn't exist yet, creating...`);
      }

      // Create country
      await (await core.createCountry(country.id, country.name)).wait();
      console.log(`Country created: ${country.id} ${country.name}`);

      // Mint initial supply (50,000 TOKEN18)
      if (core.functions.mintInitialSupply) {
        await (await core.mintInitialSupply(country.id, toToken18("50000"))).wait();
        console.log(`  - Minted 50,000 tokens`);
      }

      // Set initial price (5 USDC)
      if (core.functions.setInitialPriceUSDC) {
        await (await core.setInitialPriceUSDC(country.id, toUSDC6("5"))).wait();
        console.log(`  - Set initial price to 5 USDC`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Error processing country ${country.id} (${country.name}):`, error);
    }
  }

  console.log("Country seeding completed.");
})();
