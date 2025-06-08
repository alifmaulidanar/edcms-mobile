import { Geofence } from "../types";
import supabase from "../utils/supabase";
import { error as handleError } from '../utils/logHandler';

// Get geofences by user ID from backend API
const getAllGeofences = async (): Promise<Geofence[]> => {
  try {
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL as string}/geofences`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const data = await response.json();
      handleError(`Error fetching geofences: ${data.message || "Unknown error"}`);
      throw new Error(data.message || "Unknown error");
    }

    const data = await response.json();
    return data as Geofence[];
  } catch (error) {
    handleError(`Error: ${error}`);
    throw error;
  }
}

/**
 * Get specific geofences by their external IDs directly from Supabase
 * This is more efficient than fetching all geofences when you only need specific ones
 * @param externalIds Array of geofence external IDs to fetch
 * @returns Array of Geofence objects that match the requested IDs
 */
const getGeofencesByIds = async (externalIds: string[]): Promise<Geofence[]> => {
  try {
    if (!externalIds || externalIds.length === 0) {
      return [];
    }
    const { data, error } = await supabase
      .from('geofences')
      .select('*')
      .in('external_id', externalIds);

    if (error) {
      handleError(`Error fetching geofences by IDs: ${error.message}`);
      throw new Error(error.message);
    }
    return data as Geofence[];
  } catch (error) {
    handleError(`Error in getGeofencesByIds: ${error}`);
    throw error;
  }
}