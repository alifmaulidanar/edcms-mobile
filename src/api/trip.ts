import { Trip } from "../types";
import supabase from "../utils/supabase";

// Get a trip by ID
export const getTrip = async (tripExternalId: string): Promise<Trip> => {
  console.log("Fetching trip:", tripExternalId);
  try {
    const response = await fetch(`${process.env.EXPO_PUBLIC_RADAR_API as string}/v1/trips/${tripExternalId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: process.env.EXPO_PUBLIC_RADAR_SECRET_KEY as string,
      },
    });

    if (!response.ok) {
      const data = await response.json();
      console.error("Error fetching trip:", data.message || "Unknown error");
      throw new Error(data.message || "Unknown error");
    }

    const data = await response.json();
    console.log({ data });
    const duration = (new Date(data.trip.endedAt).getTime() - new Date(data.trip.startedAt).getTime()) / 1000;
    const trip: Trip = {
      radar_id: data.trip._id,
      external_id: data.trip.externalId,
      user_id: data.trip.userId,
      geofence_id: data.trip.destinationGeofenceExternalId,
      geofence_tag: data.trip.destinationGeofenceTag,
      mode: data.trip.mode,
      status: data.trip.status,
      duration: duration,
      live: data.trip.live || false,
      approaching_threshold: data.trip.approachingThreshold,
      metadata: data.trip.metadata,
    }
    console.log({ trip });
    return trip;
  } catch (error) {
    console.error("Error getTrip:", error);
    throw error;
  }
}

// Get trip_id from table tickets in Supabase by ticket_id
export const getTripIdByTicketId = async (ticket_id: string): Promise<string> => {
  try {
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('trip_id')
      .eq('ticket_id', ticket_id)
      .single();

    if (error) {
      console.error("Error fetching ticket:", error.message);
      throw new Error(error.message);
    }

    return tickets?.trip_id || '';
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

// Create a new trip
export const createTrip = async (
  radar_id: string,
  external_id: string,
  user_id: string,
  geofence_id: string,
  geofence_tag: string,
  mode: string,
  status: string,
  duration: number,
  live: boolean,
  approaching_threshold: number
): Promise<void> => {
  try {
    console.log("Creating trip:", { radar_id, external_id, user_id, geofence_id, geofence_tag, mode, status, duration, live, approaching_threshold });
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL as string}/trip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        radar_id, external_id, user_id, geofence_id, geofence_tag, mode, status, duration, live, approaching_threshold
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error("Error creating trip:", data.message || "Unknown error");
      throw new Error(data.message || "Unknown error");
    }

    console.log("Trip created successfully:", response);
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

// Update a trip status & duration by trip_id
export const updateTrip = async (trip_id: string, status: string, duration: number): Promise<void> => {
  try {
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL as string}/trip/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trip_id, status, duration }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error("Error updating trip:", data.message || "Unknown error");
      throw new Error(data.message || "Unknown error");
    }

    console.log("Trip updated successfully:", response);
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}