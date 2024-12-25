import { RootState } from "../store";
import { useSelector } from "react-redux";
import { getTickets } from "../api/tickets";
import { Geofence, Ticket } from "../types";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { getAllGeofences } from "../api/geofences";
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Linking, Modal, Pressable, RefreshControl } from "react-native";

const copyToClipboard = (text: string) => {
  Clipboard.setStringAsync(text);
  alert("ID telah disalin ke clipboard!");
};

const openInGoogleMaps = (coordinates: [number, number]) => {
  if (!coordinates || coordinates.length !== 2) {
    console.error("Invalid coordinates");
    return;
  }

  const [longitude, latitude] = coordinates;
  const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  Linking.openURL(url).catch((err) =>
    console.error("Error opening Google Maps:", err)
  );
};

const TicketsScreen = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [geofence, setGeofence] = useState<Geofence[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const userData = useSelector((state: RootState) => state.user);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // Fetch tickets dari API
  const fetchTickets = useCallback(async () => {
    try {
      if (userData) {
        const response = await getTickets(userData.user_id);
        setTickets(response);
      }
    } catch (error: any) {
      console.error("Error fetching tickets:", error.message);
    }
  }, [userData]);

  const fetchGeofences = useCallback(async () => {
    try {
      const response = await getAllGeofences();
      setGeofence(response);
    } catch (error: any) {
      console.error("Error fetching geofences:", error.message);
    }
  }, []);

  // Fetch tickets and geofences
  useEffect(() => {
    fetchTickets();
    fetchGeofences();
  }, [fetchTickets, fetchGeofences]);

  // Handle pull-to-refresh
  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchTickets();
    await fetchGeofences();
    setIsRefreshing(false);
  };

  const handleTicketPress = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setIsModalVisible(true);
  };

  return (
    <View className="flex-1 bg-[#f5f5f5] p-2 mt-6">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 16 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        <Text className="px-6 py-4 text-2xl font-semibold text-gray-700">
          Tiket Saya
        </Text>

        {tickets.length > 0 ? (
          tickets.map((ticket, index) => (
            <TouchableOpacity
              key={ticket.ticket_id}
              className={`bg-white rounded-lg p-4 mx-6 mb-4 shadow-md 
              ${ticket.status === "assigned"
                  ? "border-l-4 border-blue-600"
                  : ticket.status === "on_progress"
                    ? "border-l-4 border-yellow-600"
                    : ticket.status === "finished"
                      ? "border-l-4 border-green-600"
                      : "border-l-4 border-red-600"
                }`}
              activeOpacity={0.9}
              onPress={() => handleTicketPress(ticket)}
            >
              <View className="flex-row items-center mb-2">
                <Ionicons
                  name="ticket-outline"
                  size={24}
                  color="#4F46E5"
                />
                <View className="flex-1 gap-y-2">
                  <Text className="flex-1 ml-2 text-base font-medium text-gray-800">
                    {ticket.description}
                  </Text>
                  <Text className="flex-1 ml-2 text-sm font-medium text-gray-800">
                    {geofence.find((g) => g.external_id === ticket.geofence_id)?.description}
                  </Text>
                </View>
                <Text
                  className={`text-xs font-semibold px-2 py-1 rounded ${ticket.status === "assigned"
                    ? "bg-blue-100 text-blue-600"
                    : ticket.status === "on_progress"
                      ? "bg-yellow-100 text-yellow-600"
                      : ticket.status === "finished"
                        ? "bg-green-100 text-green-600"
                        : "bg-red-100 text-red-600"
                    }`}
                >
                  {ticket.status === "assigned"
                    ? "Ditugaskan"
                    : ticket.status === "on_progress"
                      ? "Berjalan"
                      : ticket.status === "finished"
                        ? "Selesai"
                        : "Dibatalkan"}
                </Text>
              </View>
              <Text className="text-xs text-gray-400">
                Dibuat: {new Date(ticket.created_at).toLocaleString("id-ID")}
              </Text>
            </TouchableOpacity>
          ))
        ) : (
          <View className="items-center justify-center flex-1 mt-12">
            <Ionicons name="documents-outline" size={64} color="#D1D5DB" />
            <Text className="mt-4 text-center text-gray-500">
              Belum ada tiket untuk ditampilkan
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Modal */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View className="items-center justify-center flex-1 bg-black/50">
          <View className="w-11/12 p-6 bg-white rounded-lg shadow-lg">
            <Text className="mb-4 text-2xl font-semibold text-gray-800">
              Detail Tiket
            </Text>

            <Text className="mb-4 text-lg font-semibold text-gray-800">
              {selectedTicket?.description}
            </Text>

            {selectedTicket ? (
              <View>
                {/* Ticket ID */}
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="font-medium text-gray-500">ID Tiket:</Text>
                  <View className="flex-row items-center">
                    <Text className="mr-2 text-gray-800">
                      {`${selectedTicket.ticket_id.slice(0, 8)}...${selectedTicket.ticket_id.slice(-8)}`}
                    </Text>
                    <TouchableOpacity
                      onPress={() => copyToClipboard(`ID Tiket: ${selectedTicket.ticket_id}`)}
                    >
                      <Ionicons name="copy-outline" size={16} color="#4F46E5" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Geofence ID */}
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="font-medium text-gray-500">ID Tempat:</Text>
                  <View className="flex-row items-center">
                    <Text className="mr-2 text-gray-800">
                      {`${selectedTicket.geofence_id.slice(0, 8)}...${selectedTicket.geofence_id.slice(-8)}`}
                    </Text>
                    <TouchableOpacity
                      onPress={() => copyToClipboard(`ID Tempat (${geofence.find((g) => g.external_id === selectedTicket.geofence_id)?.description}): ${selectedTicket.geofence_id}`)}
                    >
                      <Ionicons name="copy-outline" size={16} color="#4F46E5" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Nama Tempat */}
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="font-medium text-gray-500">Tempat:</Text>
                  <View className="flex-row items-center">
                    <Text className="text-gray-800">
                      {geofence.find((g) => g.external_id === selectedTicket.geofence_id)?.description}
                    </Text>
                  </View>
                </View>

                {/* Open in Google Maps */}
                <TouchableOpacity
                  className="items-center p-2 mb-2 border border-blue-500 rounded-lg"
                  onPress={() =>
                    openInGoogleMaps(
                      geofence.find(
                        (g) => g.external_id === selectedTicket.geofence_id
                      )?.coordinates || [0, 0]
                    )
                  }
                >
                  <View className="flex-row items-center gap-x-2">
                    <Text className="font-medium text-blue-500">
                      Buka di Google Maps
                    </Text>
                    <Ionicons name="open-outline" size={16} color="#3b82f6" />
                  </View>
                </TouchableOpacity>

                {/* Status */}
                <View className="flex-row justify-between mb-4">
                  <Text className="font-medium text-gray-500">Status:</Text>
                  <Text
                    className={`text-sm font-semibold px-2 py-1 rounded ${selectedTicket.status === "assigned"
                      ? "bg-blue-100 text-blue-600"
                      : selectedTicket.status === "on_progress"
                        ? "bg-yellow-100 text-yellow-600"
                        : selectedTicket.status === "finished"
                          ? "bg-green-100 text-green-600"
                          : "bg-red-100 text-red-600"
                      }`}
                  >
                    {selectedTicket.status === "assigned"
                      ? "Ditugaskan"
                      : selectedTicket.status === "on_progress"
                        ? "Berjalan"
                        : selectedTicket.status === "finished"
                          ? "Selesai"
                          : "Dibatalkan"}
                  </Text>
                </View>

                {/* Description */}
                {/* <View className="mb-4">
                  <Text className="font-medium text-gray-500">Deskripsi:</Text>
                  <Text className="text-gray-800">{selectedTicket.description}</Text>
                </View> */}

                {/* Created At */}
                <View className="flex-row justify-between mb-4">
                  <Text className="font-medium text-gray-500">Dibuat Pada:</Text>
                  <Text className="text-gray-800">
                    {new Date(selectedTicket.created_at).toLocaleString("id-ID")}
                  </Text>
                </View>

                {/* Updated At */}
                <View className="flex-row justify-between mb-4">
                  <Text className="font-medium text-gray-500">Diperbarui Pada:</Text>
                  <Text className="text-gray-800">
                    {new Date(selectedTicket.updated_at).toLocaleString("id-ID")}
                  </Text>
                </View>
              </View>
            ) : (
              <Text className="text-gray-500">Memuat data tiket...</Text>
            )}

            {/* Close Button */}
            <Pressable
              className="items-center p-3 mt-6 bg-blue-500 rounded-lg"
              onPress={() => setIsModalVisible(false)}
            >
              <Text className="font-medium text-white">Tutup</Text>
            </Pressable>
          </View>
        </View>
      </Modal >
    </View >
  );
};

export default TicketsScreen;
