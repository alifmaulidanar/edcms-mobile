import { Ticket } from "../types";

// Get tickets by user ID from backend API
export const getTickets = async (user_id: string): Promise<Ticket[]> => {
  try {
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL as string}/ticket/${user_id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const data = await response.json();
      console.error("Error fetching tickets:", data.message || "Unknown error");
      throw new Error(data.message || "Unknown error");
    }

    const data = await response.json();
    return data as Ticket[];
  } catch (error) {
    console.error("Error:", error);
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
      console.error("Error updating ticket:", data.message || "Unknown error");
      throw new Error(data.message || "Unknown error");
    }
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}