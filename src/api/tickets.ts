import { Ticket } from "../types";
import supabase from "../utils/supabase";
import { error as handleError } from '../utils/logHandler';

// Get tickets by user ID from backend API
export const getTickets = async (user_id: string): Promise<Ticket[]> => {
  try {
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL as string}/ticket/user/${user_id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const data = await response.json();
      handleError(`Error fetching tickets: ${data.message || "Unknown error"}`);
      throw new Error(data.message || "Unknown error");
    }

    const data = await response.json();
    return data as Ticket[];
  } catch (error) {
    handleError(`Error: ${error}`);
    throw error;
  }
}

// Get a tickets by ticket ID from backend API
export const getSingleTicket = async (ticket_id: string) => {
  try {
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/ticket/photo/${ticket_id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const data = await response.json();
      handleError(`Error fetching tickets: ${data.message || "Unknown error"}`);
      throw new Error(data.message || "Unknown error");
    }

    const data = await response.json();
    return data;
  } catch (error) {
    handleError(`Error: ${error}`);
    throw error;
  }
}

// Update tripID and ticket status in table tickets in Supabase by ticket ID by backend API
export const updateTicket = async (ticket_id: string, trip_id: string, status: string): Promise<void> => {
  try {
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL as string}/ticket/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket_id, trip_id, status }),
    });

    if (!response.ok) {
      const data = await response.json();
      handleError(`Error updating ticket: ${data.message || "Unknown error"}`);
      throw new Error(data.message || "Unknown error");
    }
  } catch (error) {
    handleError(`Error: ${error}`);
    throw error;
  }
}

// Update ticket extras
export const updateTicketExtras = async (ticket_id: string, extrasData: any): Promise<void> => {
  try {
    // const token = await AsyncStorage.getItem("session");
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL_V2 as string}/tickets/extras`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Authorization: `Bearer ${token ? JSON.parse(token) : ''}`,
      },
      body: JSON.stringify({ ticket_id, extrasData }),
    });

    if (!response.ok) {
      const data = await response.json();
      handleError(`Error updating ticket: ${data.message || "Unknown error"}`);
      throw new Error(data.message || "Unknown error");
    }
  } catch (error) {
    handleError(`Error: ${error}`);
    throw error;
  }
}

/**
 * Optimized function to fetch assigned tickets with related geofence data in a single query
 * This significantly reduces data transfer and processing by only retrieving what's needed
 * @param userId The ID of the user whose tickets to fetch
 * @param status Optional filter for ticket status (defaults to 'assigned')
 * @returns Array of Ticket objects with embedded geofence data
 */
export const getTicketsWithGeofences = async (
  userId: string,
  status: string = 'assigned'
): Promise<any[]> => {
  try {
    // Use a direct Supabase join query to get tickets and their geofences in one go
    const { data, error } = await supabase
      .from('tickets')
      .select(`
        *,
        geofence:geofences!geofence_id(*)
      `)
      .eq('user_id', userId)
      .eq('status', status);

    if (error) {
      handleError(`Error fetching tickets with geofences: ${error.message}`);
      throw new Error(error.message);
    }

    // Process the joined data to match the expected format in the UI
    const processedData = data?.map(ticket => ({
      ...ticket,
      geofence_data: ticket.geofence // This contains the joined geofence data
    })) || [];

    return processedData;
  } catch (error: any) {
    handleError(`Error in getTicketsWithGeofences: ${error.message}`);
    throw error;
  }
}