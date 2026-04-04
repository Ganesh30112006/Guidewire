/**
 * Weather Service — Open-Meteo integration with mock fallback.
 *
 * Set VITE_OPEN_METEO_CITY in your .env to fetch live data.
 * Optionally set VITE_OPEN_METEO_LATITUDE and VITE_OPEN_METEO_LONGITUDE
 * to skip geocoding and lock results to a specific location.
 */

import type { Alert } from "./api";
import { mockAlerts } from "./api";

const CITY =
  (import.meta.env.VITE_OPEN_METEO_CITY as string | undefined)
  ?? (import.meta.env.VITE_OPENWEATHER_CITY as string | undefined)
  ?? "Mumbai";
const LATITUDE = Number(import.meta.env.VITE_OPEN_METEO_LATITUDE as string | undefined);
const LONGITUDE = Number(import.meta.env.VITE_OPEN_METEO_LONGITUDE as string | undefined);
const HAS_COORDS_OVERRIDE = Number.isFinite(LATITUDE) && Number.isFinite(LONGITUDE);

// ---------------------------------------------------------------------------
// Open-Meteo response shapes (only fields we use)
// ---------------------------------------------------------------------------
interface OpenMeteoGeocoding {
  results?: { latitude: number; longitude: number; name: string; country?: string }[];
}

interface OpenMeteoForecast {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    time?: string;
  };
  hourly?: {
    time?: string[];
    precipitation_probability?: number[];
  };
}

interface OpenMeteoAirQuality {
  current?: {
    us_aqi?: number;
    pm2_5?: number;
    pm10?: number;
    time?: string;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function weatherCodeToAlertType(code: number): Alert["type"] | null {
  // WMO weather codes used by Open-Meteo.
  if ([80, 81, 82, 95, 96, 99].includes(code)) return "rain";
  if ([85, 86].includes(code)) return "flood";
  return null;
}

function severityLabel(prob: number): Alert["severity"] {
  if (prob >= 75) return "high";
  if (prob >= 50) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Convert Open-Meteo responses -> Alert[]
// ---------------------------------------------------------------------------
function buildAlertsFromOpenMeteo(
  forecast: OpenMeteoForecast,
  airQuality: OpenMeteoAirQuality | null,
  locationLabel: string,
): Alert[] {
  const alerts: Alert[] = [];
  const now = forecast.current?.time ?? new Date().toISOString();
  const weatherCode = forecast.current?.weather_code;
  const currentPrecipMm = forecast.current?.precipitation ?? 0;
  const precipProbability = Math.max(
    0,
    ...(forecast.hourly?.precipitation_probability ?? []),
  );

  // 1. Rain / flood from weather code and precipitation signals.
  if (typeof weatherCode === "number") {
    const codeType = weatherCodeToAlertType(weatherCode);
    const heavyRainSignal = precipProbability >= 80 || currentPrecipMm >= 12;
    if (codeType || heavyRainSignal) {
      const type = codeType ?? "rain";
      const probability = Math.min(95, Math.max(55, precipProbability));
      alerts.push({
        id: `LIVE-WMO-${weatherCode}-${now}`,
        type,
        message:
          type === "flood"
            ? `Potential flood risk in ${locationLabel}. Avoid low-lying routes and monitor local advisories.`
            : `Rain risk detected in ${locationLabel}. Carry protective gear and plan safer routes.`,
        probability: Math.round(probability),
        severity: severityLabel(probability),
        timestamp: now,
        zone: "Live",
      });
    }
  }

  // 2. Extreme heat (apparent temp > 40C)
  const apparentTemp = forecast.current?.apparent_temperature;
  if (typeof apparentTemp === "number" && apparentTemp > 40) {
    const probability = Math.min(95, 45 + (apparentTemp - 40) * 4);
    alerts.push({
      id: `LIVE-HEAT-${now}`,
      type: "heat",
      message: `Extreme heat alert - feels like ${apparentTemp.toFixed(1)}C in ${locationLabel}. Stay hydrated and limit outdoor exposure.`,
      probability: Math.round(probability),
      severity: severityLabel(probability),
      timestamp: now,
      zone: "Live",
    });
  }

  // 3. Air pollution (US AQI >= 100)
  const aqi = airQuality?.current?.us_aqi;
  if (typeof aqi === "number" && aqi >= 100) {
      const probability = aqi >= 200 ? 90 : aqi >= 151 ? 80 : 65;
      alerts.push({
        id: `LIVE-AQI-${now}`,
        type: "pollution",
        message: `Air quality is unhealthy in ${locationLabel} (US AQI ${Math.round(aqi)}). Consider wearing a mask and reducing time outdoors.`,
        probability,
        severity: severityLabel(probability),
        timestamp: now,
        zone: "Live",
      });
  }

  return alerts;
}

async function resolveLocation(city: string): Promise<{ latitude: number; longitude: number; label: string }> {
  if (HAS_COORDS_OVERRIDE) {
    return { latitude: LATITUDE, longitude: LONGITUDE, label: city };
  }

  const geocodeRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
  );
  if (!geocodeRes.ok) {
    throw new Error(`Open-Meteo geocoding failed: ${geocodeRes.status}`);
  }
  const geocodeData: OpenMeteoGeocoding = await geocodeRes.json();
  const location = geocodeData.results?.[0];
  if (!location) {
    throw new Error(`Open-Meteo geocoding found no match for city: ${city}`);
  }

  return {
    latitude: location.latitude,
    longitude: location.longitude,
    label: location.name,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches live weather alerts for the configured city.
 * Falls back to mock data when Open-Meteo requests fail.
 */
export async function fetchLiveAlerts(cityOverride?: string): Promise<Alert[]> {
  try {
    const effectiveCity = cityOverride?.trim() || CITY;
    const { latitude, longitude, label } = await resolveLocation(effectiveCity);

    const [forecastRes, airRes] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,precipitation,weather_code&hourly=precipitation_probability&forecast_days=1`,
      ),
      fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi,pm2_5,pm10`,
      ),
    ]);

    if (!forecastRes.ok) {
      console.warn("[WeatherService] Open-Meteo forecast request failed - using mock data");
      return mockAlerts;
    }

    const forecast: OpenMeteoForecast = await forecastRes.json();
    const airQuality: OpenMeteoAirQuality | null = airRes.ok
      ? await airRes.json()
      : null;

    const liveAlerts = buildAlertsFromOpenMeteo(forecast, airQuality, label);

    // If current conditions are calm, keep the UI populated with demo alerts.
    return liveAlerts.length > 0 ? liveAlerts : mockAlerts;
  } catch (err) {
    console.warn("[WeatherService] Error fetching Open-Meteo data - using mock data:", err);
    return mockAlerts;
  }
}
