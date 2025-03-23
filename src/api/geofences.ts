import { Geofence } from "../types";
import { error as handleError } from '../utils/logHandler';

// Get geofences by user ID from backend API
export const getAllGeofences = async (): Promise<Geofence[]> => {
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