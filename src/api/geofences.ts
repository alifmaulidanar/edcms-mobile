import { Geofence } from "../types";

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
      console.error("Error fetching geofences:", data.message || "Unknown error");
      throw new Error(data.message || "Unknown error");
    }

    const data = await response.json();
    return data as Geofence[];
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}