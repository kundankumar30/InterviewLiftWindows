const countries = [
  { name: 'India', code: 'IN', dialCode: '91', minLength: 10, maxLength: 10, flag: '🇮🇳' },
  { name: 'United States', code: 'US', dialCode: '1', minLength: 10, maxLength: 10, flag: '🇺🇸' },
  { name: 'United Kingdom', code: 'GB', dialCode: '44', minLength: 10, maxLength: 11, flag: '🇬🇧' },
  { name: 'Canada', code: 'CA', dialCode: '1', minLength: 10, maxLength: 10, flag: '🇨🇦' },
  { name: 'Australia', code: 'AU', dialCode: '61', minLength: 9, maxLength: 9, flag: '🇦🇺' },
  { name: 'Germany', code: 'DE', dialCode: '49', minLength: 10, maxLength: 12, flag: '🇩🇪' },
  { name: 'France', code: 'FR', dialCode: '33', minLength: 9, maxLength: 9, flag: '🇫🇷' },
  { name: 'China', code: 'CN', dialCode: '86', minLength: 11, maxLength: 11, flag: '🇨🇳' },
  { name: 'Japan', code: 'JP', dialCode: '81', minLength: 10, maxLength: 11, flag: '🇯🇵' },
  { name: 'Brazil', code: 'BR', dialCode: '55', minLength: 10, maxLength: 11, flag: '🇧🇷' },
  { name: 'Mexico', code: 'MX', dialCode: '52', minLength: 10, maxLength: 10, flag: '🇲🇽' },
  { name: 'South Korea', code: 'KR', dialCode: '82', minLength: 9, maxLength: 10, flag: '🇰🇷' },
  { name: 'Singapore', code: 'SG', dialCode: '65', minLength: 8, maxLength: 8, flag: '🇸🇬' },
  { name: 'UAE', code: 'AE', dialCode: '971', minLength: 9, maxLength: 9, flag: '🇦🇪' },
  { name: 'Saudi Arabia', code: 'SA', dialCode: '966', minLength: 9, maxLength: 9, flag: '🇸🇦' },
  { name: 'Nigeria', code: 'NG', dialCode: '234', minLength: 10, maxLength: 10, flag: '🇳🇬' },
  { name: 'South Africa', code: 'ZA', dialCode: '27', minLength: 9, maxLength: 9, flag: '🇿🇦' },
  { name: 'Egypt', code: 'EG', dialCode: '20', minLength: 10, maxLength: 10, flag: '🇪🇬' },
  { name: 'Turkey', code: 'TR', dialCode: '90', minLength: 10, maxLength: 10, flag: '🇹🇷' },
  { name: 'Russia', code: 'RU', dialCode: '7', minLength: 10, maxLength: 10, flag: '🇷🇺' },
  { name: 'Italy', code: 'IT', dialCode: '39', minLength: 9, maxLength: 10, flag: '🇮🇹' },
  { name: 'Spain', code: 'ES', dialCode: '34', minLength: 9, maxLength: 9, flag: '🇪🇸' },
  { name: 'Netherlands', code: 'NL', dialCode: '31', minLength: 9, maxLength: 9, flag: '🇳🇱' },
  { name: 'Sweden', code: 'SE', dialCode: '46', minLength: 8, maxLength: 9, flag: '🇸🇪' },
  { name: 'Norway', code: 'NO', dialCode: '47', minLength: 8, maxLength: 8, flag: '🇳🇴' },
  { name: 'Denmark', code: 'DK', dialCode: '45', minLength: 8, maxLength: 8, flag: '🇩🇰' },
  { name: 'Switzerland', code: 'CH', dialCode: '41', minLength: 9, maxLength: 9, flag: '🇨🇭' },
  { name: 'Belgium', code: 'BE', dialCode: '32', minLength: 8, maxLength: 9, flag: '🇧🇪' },
  { name: 'Austria', code: 'AT', dialCode: '43', minLength: 10, maxLength: 11, flag: '🇦🇹' },
  { name: 'Poland', code: 'PL', dialCode: '48', minLength: 9, maxLength: 9, flag: '🇵🇱' },
  { name: 'Czech Republic', code: 'CZ', dialCode: '420', minLength: 9, maxLength: 9, flag: '🇨🇿' },
  { name: 'Hungary', code: 'HU', dialCode: '36', minLength: 8, maxLength: 9, flag: '🇭🇺' },
  { name: 'Greece', code: 'GR', dialCode: '30', minLength: 10, maxLength: 10, flag: '🇬🇷' },
  { name: 'Portugal', code: 'PT', dialCode: '351', minLength: 9, maxLength: 9, flag: '🇵🇹' },
  { name: 'Ireland', code: 'IE', dialCode: '353', minLength: 9, maxLength: 9, flag: '🇮🇪' },
  { name: 'Israel', code: 'IL', dialCode: '972', minLength: 9, maxLength: 9, flag: '🇮🇱' },
  { name: 'Thailand', code: 'TH', dialCode: '66', minLength: 8, maxLength: 9, flag: '🇹🇭' },
  { name: 'Malaysia', code: 'MY', dialCode: '60', minLength: 9, maxLength: 10, flag: '🇲🇾' },
  { name: 'Philippines', code: 'PH', dialCode: '63', minLength: 10, maxLength: 10, flag: '🇵🇭' },
  { name: 'Indonesia', code: 'ID', dialCode: '62', minLength: 10, maxLength: 12, flag: '🇮🇩' },
  { name: 'Vietnam', code: 'VN', dialCode: '84', minLength: 9, maxLength: 10, flag: '🇻🇳' },
  { name: 'Bangladesh', code: 'BD', dialCode: '880', minLength: 10, maxLength: 10, flag: '🇧🇩' },
  { name: 'Pakistan', code: 'PK', dialCode: '92', minLength: 10, maxLength: 10, flag: '🇵🇰' },
  { name: 'Sri Lanka', code: 'LK', dialCode: '94', minLength: 9, maxLength: 9, flag: '🇱🇰' },
  { name: 'Argentina', code: 'AR', dialCode: '54', minLength: 10, maxLength: 11, flag: '🇦🇷' },
  { name: 'Chile', code: 'CL', dialCode: '56', minLength: 8, maxLength: 9, flag: '🇨🇱' },
  { name: 'Colombia', code: 'CO', dialCode: '57', minLength: 10, maxLength: 10, flag: '🇨🇴' },
  { name: 'Peru', code: 'PE', dialCode: '51', minLength: 9, maxLength: 9, flag: '🇵🇪' },
  { name: 'Venezuela', code: 'VE', dialCode: '58', minLength: 10, maxLength: 10, flag: '🇻🇪' },
  { name: 'Kenya', code: 'KE', dialCode: '254', minLength: 9, maxLength: 9, flag: '🇰🇪' },
  { name: 'Ghana', code: 'GH', dialCode: '233', minLength: 9, maxLength: 9, flag: '🇬🇭' },
  { name: 'Morocco', code: 'MA', dialCode: '212', minLength: 9, maxLength: 9, flag: '🇲🇦' }
];

// Cache for IP-based country detection
let cachedCountryCode = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get country by country code
 * @param {string} code - ISO country code
 * @returns {Object|undefined} Country object
 */
function getCountryByCode(code) {
    return countries.find(country => country.code === code);
}

/**
 * Get country by dial code
 * @param {string} dialCode - Country dial code
 * @returns {Object|undefined} Country object
 */
function getCountryByDialCode(dialCode) {
    return countries.find(country => country.dialCode === dialCode);
}

/**
 * Validate phone number for a specific country
 * @param {string} phone - Phone number
 * @param {Object} country - Country object
 * @returns {boolean} Is valid
 */
function validatePhoneNumber(phone, country) {
    const cleanPhone = phone.replace(/\D/g, '');
    return cleanPhone.length >= country.minLength && cleanPhone.length <= country.maxLength;
}

/**
 * Format phone number for API submission
 * @param {string} phone - Phone number
 * @param {string} dialCode - Country dial code
 * @returns {string} Formatted phone number
 */
function formatPhoneForAPI(phone, dialCode) {
    const cleanPhone = phone.replace(/\D/g, '');
    return dialCode + cleanPhone;
}

/**
 * Detect user's country based on IP address
 * @returns {Promise<Object>} Country object
 */
async function detectUserCountry() {
    // Check cache first
    const now = Date.now();
    if (cachedCountryCode && (now - cacheTimestamp) < CACHE_DURATION) {
        const cachedCountry = getCountryByCode(cachedCountryCode);
        if (cachedCountry) {
            console.log('🌍 Using cached country:', cachedCountry.name);
            return cachedCountry;
        }
    }

    try {
        // Try IP-based geolocation
        const ipCountry = await detectCountryByIP();
        if (ipCountry) {
            // Cache the result
            cachedCountryCode = ipCountry.code;
            cacheTimestamp = now;
            console.log('🌍 Detected country from IP:', ipCountry.name);
            return ipCountry;
        }
    } catch (error) {
        console.warn('IP geolocation failed, trying browser detection...', error);
    }

    // Fallback to browser language detection
    try {
        const browserCountry = detectCountryByBrowser();
        if (browserCountry) {
            console.log('🌍 Detected country from browser:', browserCountry.name);
            return browserCountry;
        }
    } catch (error) {
        console.warn('Browser detection failed, using default...', error);
    }

    // Ultimate fallback to US
    const defaultCountry = countries.find(c => c.code === 'US') || countries[0];
    console.log('🌍 Using default country:', defaultCountry.name);
    return defaultCountry;
}

/**
 * Synchronous version for immediate use
 * @returns {Object} Country object
 */
function detectUserCountrySync() {
    // Check cache first
    if (cachedCountryCode) {
        const cachedCountry = getCountryByCode(cachedCountryCode);
        if (cachedCountry) {
            return cachedCountry;
        }
    }

    // Use browser detection as fallback
    const browserCountry = detectCountryByBrowser();
    if (browserCountry) {
        return browserCountry;
    }

    // Ultimate fallback
    return countries.find(c => c.code === 'US') || countries[0];
}

/**
 * IP-based country detection using multiple services
 * @returns {Promise<Object|null>} Country object or null
 */
async function detectCountryByIP() {
    const services = [
        {
            name: 'ipapi.co',
            url: 'https://ipapi.co/json/',
            parser: (data) => data.country_code
        },
        {
            name: 'ipinfo.io', 
            url: 'https://ipinfo.io/json',
            parser: (data) => data.country
        }
    ];

    for (const service of services) {
        try {
            console.log(`🌍 Trying ${service.name} for country detection...`);
            
            const response = await fetch(service.url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Interview-Lift-Electron/1.0'
                },
                signal: AbortSignal.timeout(5000) // 5s timeout
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`📡 ${service.name} response:`, data);
            
            if (data.error) {
                throw new Error(data.message || 'API returned error');
            }
            
            const countryCode = service.parser(data);
            
            if (countryCode && typeof countryCode === 'string') {
                const country = getCountryByCode(countryCode.toUpperCase());
                if (country) {
                    console.log(`✅ ${service.name} detected country:`, country.name, `(${countryCode})`);
                    return country;
                } else {
                    console.warn(`⚠️ ${service.name} returned unknown country code:`, countryCode);
                }
            } else {
                console.warn(`⚠️ ${service.name} returned invalid country code:`, countryCode);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`❌ ${service.name} failed:`, errorMessage);
            continue; // Try next service
        }
    }
    
    console.warn('🚫 All IP geolocation services failed');
    return null;
}

/**
 * Browser-based country detection
 * @returns {Object|null} Country object or null
 */
function detectCountryByBrowser() {
    if (typeof navigator === 'undefined') {
        return null;
    }

    try {
        // Try navigator.language
        const language = navigator.language || navigator.userLanguage || 'en-IN';
        const countryCode = language.split('-')[1]?.toUpperCase();
        
        if (countryCode) {
            const country = getCountryByCode(countryCode);
            if (country) {
                return country;
            }
        }

        // Try timezone detection
        if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const timezoneCountryMap = {
                'America/New_York': 'US',
                'America/Los_Angeles': 'US',
                'America/Chicago': 'US',
                'America/Toronto': 'CA',
                'Europe/London': 'GB',
                'Europe/Paris': 'FR',
                'Europe/Berlin': 'DE',
                'Asia/Kolkata': 'IN',
                'Asia/Shanghai': 'CN',
                'Asia/Tokyo': 'JP',
                'Australia/Sydney': 'AU',
                'Asia/Singapore': 'SG',
                'Europe/Moscow': 'RU',
                'America/Sao_Paulo': 'BR',
                'America/Mexico_City': 'MX',
            };
            
            const countryFromTimezone = timezoneCountryMap[timezone];
            if (countryFromTimezone) {
                const country = getCountryByCode(countryFromTimezone);
                if (country) {
                    return country;
                }
            }
        }
    } catch (error) {
        console.warn('Browser country detection failed:', error);
    }
    
    return null;
}

module.exports = {
    countries,
    getCountryByCode,
    getCountryByDialCode,
    validatePhoneNumber,
    formatPhoneForAPI,
    detectUserCountry,
    detectUserCountrySync
}; 