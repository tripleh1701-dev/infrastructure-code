/**
 * Country, state, and postal code validation data.
 * Covers major countries with their subdivisions and postal code patterns.
 */

export interface CountryData {
  code: string;
  name: string;
  states: string[];
  postalCodePattern: RegExp;
  postalCodeExample: string;
  postalCodeLabel: string; // "ZIP Code", "PIN Code", "Postal Code", etc.
  phoneCode: string;
}

export const countries: CountryData[] = [
  {
    code: "US",
    name: "United States",
    states: [
      "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
      "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
      "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
      "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
      "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
      "New Hampshire", "New Jersey", "New Mexico", "New York",
      "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
      "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
      "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
      "West Virginia", "Wisconsin", "Wyoming", "District of Columbia",
    ],
    postalCodePattern: /^\d{5}(-\d{4})?$/,
    postalCodeExample: "12345 or 12345-6789",
    postalCodeLabel: "ZIP Code",
    phoneCode: "+1",
  },
  {
    code: "IN",
    name: "India",
    states: [
      "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
      "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
      "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
      "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
      "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
      "Uttarakhand", "West Bengal",
      "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
      "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
    ],
    postalCodePattern: /^\d{6}$/,
    postalCodeExample: "110001",
    postalCodeLabel: "PIN Code",
    phoneCode: "+91",
  },
  {
    code: "GB",
    name: "United Kingdom",
    states: [
      "England", "Scotland", "Wales", "Northern Ireland",
    ],
    postalCodePattern: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
    postalCodeExample: "SW1A 1AA",
    postalCodeLabel: "Postcode",
    phoneCode: "+44",
  },
  {
    code: "DE",
    name: "Germany",
    states: [
      "Baden-Württemberg", "Bavaria", "Berlin", "Brandenburg", "Bremen",
      "Hamburg", "Hesse", "Lower Saxony", "Mecklenburg-Vorpommern",
      "North Rhine-Westphalia", "Rhineland-Palatinate", "Saarland",
      "Saxony", "Saxony-Anhalt", "Schleswig-Holstein", "Thuringia",
    ],
    postalCodePattern: /^\d{5}$/,
    postalCodeExample: "10115",
    postalCodeLabel: "Postal Code",
    phoneCode: "+49",
  },
  {
    code: "CA",
    name: "Canada",
    states: [
      "Alberta", "British Columbia", "Manitoba", "New Brunswick",
      "Newfoundland and Labrador", "Northwest Territories", "Nova Scotia",
      "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon",
    ],
    postalCodePattern: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
    postalCodeExample: "K1A 0B1",
    postalCodeLabel: "Postal Code",
    phoneCode: "+1",
  },
  {
    code: "AU",
    name: "Australia",
    states: [
      "Australian Capital Territory", "New South Wales", "Northern Territory",
      "Queensland", "South Australia", "Tasmania", "Victoria", "Western Australia",
    ],
    postalCodePattern: /^\d{4}$/,
    postalCodeExample: "2000",
    postalCodeLabel: "Postcode",
    phoneCode: "+61",
  },
  {
    code: "JP",
    name: "Japan",
    states: [
      "Hokkaido", "Aomori", "Iwate", "Miyagi", "Akita", "Yamagata", "Fukushima",
      "Ibaraki", "Tochigi", "Gunma", "Saitama", "Chiba", "Tokyo", "Kanagawa",
      "Niigata", "Toyama", "Ishikawa", "Fukui", "Yamanashi", "Nagano",
      "Gifu", "Shizuoka", "Aichi", "Mie", "Shiga", "Kyoto", "Osaka",
      "Hyogo", "Nara", "Wakayama", "Tottori", "Shimane", "Okayama",
      "Hiroshima", "Yamaguchi", "Tokushima", "Kagawa", "Ehime", "Kochi",
      "Fukuoka", "Saga", "Nagasaki", "Kumamoto", "Oita", "Miyazaki",
      "Kagoshima", "Okinawa",
    ],
    postalCodePattern: /^\d{3}-?\d{4}$/,
    postalCodeExample: "100-0001",
    postalCodeLabel: "Postal Code",
    phoneCode: "+81",
  },
  {
    code: "FR",
    name: "France",
    states: [
      "Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Brittany",
      "Centre-Val de Loire", "Corsica", "Grand Est", "Hauts-de-France",
      "Île-de-France", "Normandy", "Nouvelle-Aquitaine", "Occitanie",
      "Pays de la Loire", "Provence-Alpes-Côte d'Azur",
    ],
    postalCodePattern: /^\d{5}$/,
    postalCodeExample: "75001",
    postalCodeLabel: "Postal Code",
    phoneCode: "+33",
  },
  {
    code: "SG",
    name: "Singapore",
    states: ["Singapore"],
    postalCodePattern: /^\d{6}$/,
    postalCodeExample: "018956",
    postalCodeLabel: "Postal Code",
    phoneCode: "+65",
  },
  {
    code: "AE",
    name: "United Arab Emirates",
    states: [
      "Abu Dhabi", "Ajman", "Dubai", "Fujairah", "Ras Al Khaimah", "Sharjah", "Umm Al Quwain",
    ],
    postalCodePattern: /^.{0,10}$/,
    postalCodeExample: "Optional",
    postalCodeLabel: "P.O. Box",
    phoneCode: "+971",
  },
  {
    code: "BR",
    name: "Brazil",
    states: [
      "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará",
      "Distrito Federal", "Espírito Santo", "Goiás", "Maranhão",
      "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará",
      "Paraíba", "Paraná", "Pernambuco", "Piauí", "Rio de Janeiro",
      "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima",
      "Santa Catarina", "São Paulo", "Sergipe", "Tocantins",
    ],
    postalCodePattern: /^\d{5}-?\d{3}$/,
    postalCodeExample: "01001-000",
    postalCodeLabel: "CEP",
    phoneCode: "+55",
  },
  {
    code: "CN",
    name: "China",
    states: [
      "Anhui", "Beijing", "Chongqing", "Fujian", "Gansu", "Guangdong",
      "Guangxi", "Guizhou", "Hainan", "Hebei", "Heilongjiang", "Henan",
      "Hong Kong", "Hubei", "Hunan", "Inner Mongolia", "Jiangsu", "Jiangxi",
      "Jilin", "Liaoning", "Macau", "Ningxia", "Qinghai", "Shaanxi",
      "Shandong", "Shanghai", "Shanxi", "Sichuan", "Taiwan", "Tianjin",
      "Tibet", "Xinjiang", "Yunnan", "Zhejiang",
    ],
    postalCodePattern: /^\d{6}$/,
    postalCodeExample: "100000",
    postalCodeLabel: "Postal Code",
    phoneCode: "+86",
  },
  {
    code: "ZA",
    name: "South Africa",
    states: [
      "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo",
      "Mpumalanga", "North West", "Northern Cape", "Western Cape",
    ],
    postalCodePattern: /^\d{4}$/,
    postalCodeExample: "0001",
    postalCodeLabel: "Postal Code",
    phoneCode: "+27",
  },
  {
    code: "MX",
    name: "Mexico",
    states: [
      "Aguascalientes", "Baja California", "Baja California Sur", "Campeche",
      "Chiapas", "Chihuahua", "Ciudad de México", "Coahuila", "Colima",
      "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco",
      "México", "Michoacán", "Morelos", "Nayarit", "Nuevo León",
      "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
      "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala",
      "Veracruz", "Yucatán", "Zacatecas",
    ],
    postalCodePattern: /^\d{5}$/,
    postalCodeExample: "06600",
    postalCodeLabel: "Postal Code",
    phoneCode: "+52",
  },
  {
    code: "SA",
    name: "Saudi Arabia",
    states: [
      "Asir", "Bahah", "Eastern Province", "Ha'il", "Jazan",
      "Makkah", "Madinah", "Najran", "Northern Borders",
      "Qassim", "Riyadh", "Tabuk",
    ],
    postalCodePattern: /^\d{5}(-\d{4})?$/,
    postalCodeExample: "11564",
    postalCodeLabel: "Postal Code",
    phoneCode: "+966",
  },
];

/** Look up country data by name */
export function getCountryByName(name: string): CountryData | undefined {
  return countries.find(c => c.name === name);
}

/** Get sorted country names */
export function getCountryNames(): string[] {
  return countries.map(c => c.name).sort();
}

/** Get states for a country name */
export function getStatesForCountry(countryName: string): string[] {
  const country = getCountryByName(countryName);
  return country?.states || [];
}

/** Validate postal code for a country */
export function validatePostalCode(countryName: string, postalCode: string): { valid: boolean; message: string } {
  const country = getCountryByName(countryName);
  if (!country) {
    // Fallback: just check it's not empty
    return postalCode.trim() ? { valid: true, message: "" } : { valid: false, message: "Postal code is required" };
  }
  if (!postalCode.trim()) {
    return { valid: false, message: `${country.postalCodeLabel} is required` };
  }
  if (!country.postalCodePattern.test(postalCode.trim())) {
    return { valid: false, message: `Invalid ${country.postalCodeLabel}. Example: ${country.postalCodeExample}` };
  }
  return { valid: true, message: "" };
}

/** Validate phone number (basic international format) */
export function validatePhone(phone: string): { valid: boolean; message: string } {
  if (!phone || !phone.trim()) return { valid: true, message: "" }; // Optional
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (!/^\+?\d{7,15}$/.test(cleaned)) {
    return { valid: false, message: "Invalid phone number. Use international format: +1234567890" };
  }
  return { valid: true, message: "" };
}
