import { Ticket } from "../types";
import Constants from 'expo-constants';
import supabase from "../utils/supabase";
import { error as handleError, log as handleLog } from '../utils/logHandler';

// Get tickets by user ID from backend API
const getTickets = async (user_id: string): Promise<Ticket[]> => {
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
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL_V2}/tickets/mobile/photo/${ticket_id}`, {
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

// Get an updated ticket status directly from Supabase
export const getUpdatedTicketStatus = async (ticket_id: string) => {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('status')
      .eq('ticket_id', ticket_id)
      .single();

    if (error) {
      handleError(`Error fetching ticket status: ${error.message}`);
      throw error;
    }
    return data?.status;
  } catch (error) {
    handleError(`Error: ${error}`);
    throw error;
  }
}

// Update tripID and ticket status in table tickets in Supabase by ticket ID by backend API
export const updateTicket = async (username: string, ticket_id: string, trip_id: string, status: string): Promise<void> => {
  try {
    const appVersion = Constants.expoConfig?.version || 'default:1.4.4';
    handleLog(`Updating ticket ${ticket_id} with trip ID ${trip_id} and status ${status} using app version ${appVersion}`);
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL_V2 as string}/tickets/status/no-radar`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, ticket_id, trip_id, status, appVersion }),
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
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL_V2 as string}/tickets/new-extras`, {
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
 * Optimized function to fetch tickets with related geofence data in a single query
 * Now supports filtering by month and year (for strict monthly filter)
 * @param userId The ID of the user whose tickets to fetch
 * @param status Optional filter for ticket status (defaults to 'assigned')
 * @param month Optional month (1-12)
 * @param year Optional year (e.g. 2025)
 * @returns Array of Ticket objects with embedded geofence data
 */
export const getTicketsWithGeofences = async (
  userId: string,
  status: string = 'assigned',
  month?: number,
  year?: number
): Promise<any[]> => {
  try {
    let startDate: Date | undefined = undefined;
    let endDate: Date | undefined = undefined;
    if (month && year) {
      // startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
      // endDate = new Date(year, month, 0, 23, 59, 59, 999); // last day of month
      startDate = new Date(year, month - 2, 28);
      endDate = new Date(year, month, 5, 23, 59, 59, 999);
    }

    // Use a direct Supabase join query to get tickets and their geofences in one go
    let query = supabase
      .from('tickets')
      .select(`
        *,
        geofence:geofences!geofence_id(*),
        ticket_extras:ticket_extras!ticket_extras_ticket_id_fkey(updated_at)
      `)
      .eq('user_id', userId)
      .eq('status', status);

    // Filter by month/year if provided
    if (startDate && endDate) {
      query = query.gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .lte('updated_at', endDate.toISOString())
        // .like('additional_info->>target', `%/${month?.toString().padStart(2, '0')}/${year}`)
        .order('updated_at', { ascending: false });
    }

    const { data, error } = await query;
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