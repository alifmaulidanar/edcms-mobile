import { RootState } from "../store";
import { useSelector } from "react-redux";
import { getTickets } from "../api/tickets";
import { Geofence, Ticket } from "../types";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { getAllGeofences } from "../api/geofences";
import React, { useEffect, useState, useCallback } from "react";
import { TabView, SceneMap, TabBar } from "react-native-tab-view";
import { View, Text, TouchableOpacity, ScrollView, Linking, Modal, Pressable, RefreshControl, Dimensions } from "react-native";

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
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: "active", title: "Aktif" },
    { key: "on_progress", title: "Berjalan" },
    { key: "complete", title: "Selesai" },
    { key: "canceled", title: "Batal" },
  ]);

  // Fetch tickets
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

  // Fetch geofences
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

  // Filter Tickets for Tabs
  const assignedTickets = tickets.filter(
    (ticket) => ticket.status === "assigned"
  );

  const onProgressTickets = tickets.filter(
    (ticket) => ticket.status === "on_progress"
  );

  const completedTickets = tickets.filter(
    (ticket) => ticket.status === "completed"
  );

  const canceledTickets = tickets.filter(
    (ticket) => ticket.status === "canceled"
  );

  const TicketsList = ({ tickets, geofence, onRefresh, isRefreshing, handleTicketPress }: any) => (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 16 }}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      {tickets.map((ticket: any) => (
        <TouchableOpacity
          key={ticket.ticket_id}
          className={`bg-white rounded-lg mt-4 p-4 mx-4 shadow-md ${ticket.status === "assigned"
            ? "border-l-4 border-blue-600"
            : ticket.status === "on_progress"
              ? "border-l-4 border-yellow-600"
              : ticket.status === "completed"
                ? "border-l-4 border-green-600"
                : "border-l-4 border-red-600"
            }`}
          activeOpacity={0.9}
          onPress={() => handleTicketPress(ticket)}
        >
          <View className="flex-row items-center mb-2">
            <Ionicons name="ticket-outline" size={24} color="#4F46E5" />
            <View className="flex-1 ml-2">
              <Text className="ml-2 text-base font-medium text-gray-800">
                {ticket.description}
              </Text>
              <Text className="flex-1 ml-2 text-sm font-medium text-gray-800">
                {geofence.find((g: any) => g.external_id === ticket.geofence_id)?.description}
              </Text>
            </View>
            <Text
              className={`text-xs font-semibold px-2 py-1 rounded ${ticket.status === "assigned"
                ? "bg-blue-100 text-blue-600"
                : ticket.status === "on_progress"
                  ? "bg-yellow-100 text-yellow-600"
                  : ticket.status === "completed"
                    ? "bg-green-100 text-green-600"
                    : "bg-red-100 text-red-600"
                }`}
            >
              {ticket.status === "assigned"
                ? "Ditugaskan"
                : ticket.status === "on_progress"
                  ? "Berjalan"
                  : ticket.status === "completed"
                    ? "Selesai"
                    : "Dibatalkan"}
            </Text>
          </View>
          <Text className="text-xs text-gray-400">
            Dibuat: {new Date(ticket.created_at).toLocaleString("id-ID")}
          </Text>
        </TouchableOpacity>
      ))}
      {tickets.length === 0 && (
        <Text className="mt-8 text-center text-gray-500">
          Tidak ada tiket yang tersedia.
        </Text>
      )}
    </ScrollView>
  );

  // Tab Scenes
  const ActiveTab = () => (
    <TicketsList
      tickets={assignedTickets}
      geofence={geofence}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      handleTicketPress={handleTicketPress}
    />
  );

  const OnProgressTab = () => (
    <TicketsList
      tickets={onProgressTickets}
      geofence={geofence}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      handleTicketPress={handleTicketPress}
    />
  );

  const CompleteTab = () => (
    <TicketsList
      tickets={completedTickets}
      geofence={geofence}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      handleTicketPress={handleTicketPress}
    />
  );

  const CanceledTab = () => (
    <TicketsList
      tickets={canceledTickets}
      geofence={geofence}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      handleTicketPress={handleTicketPress}
    />
  );

  return (
    <View className="flex-1 bg-[#f5f5f5] p-2 mt-6">
      <Text className="px-6 pt-4 text-2xl font-semibold text-gray-700">
        Tiket Saya
      </Text>
      <TabView
        navigationState={{ index, routes }}
        renderScene={SceneMap({
          active: ActiveTab,
          on_progress: OnProgressTab,
          complete: CompleteTab,
          canceled: CanceledTab,
        })}
        onIndexChange={setIndex}
        initialLayout={{ width: Dimensions.get("window").width }}
        renderTabBar={(props) => (
          <TabBar
            {...props}
            indicatorStyle={{ backgroundColor: "#3B82F6", height: 3, borderRadius: 5 }}
            style={{ backgroundColor: "#f5f5f5", shadowOpacity: 0.2 }}
            labelStyle={{ color: "gray", fontWeight: "600" }}
            activeColor="#3B82F6"
            inactiveColor="#9CA3AF"
          />
        )}
      />

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

                {/* Place Name */}
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
                        : selectedTicket.status === "completed"
                          ? "bg-green-100 text-green-600"
                          : "bg-red-100 text-red-600"
                      }`}
                  >
                    {selectedTicket.status === "assigned"
                      ? "Ditugaskan"
                      : selectedTicket.status === "on_progress"
                        ? "Berjalan"
                        : selectedTicket.status === "completed"
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

            {/* CTA Button */}
            {/* <Pressable
              className={`items-center py-3 mb-4 rounded-lg ${selectedTicket?.status === "assigned"
                ? "bg-blue-600"
                : "bg-yellow-600"
                }`}
              onPress={toggleTicketStatus}
            >
              <Text className="font-medium text-white">
                {selectedTicket?.status === "assigned"
                  ? "Aktifkan"
                  : "Tunda"}
              </Text>
            </Pressable> */}

            {/* Close Button */}
            <Pressable
              // className="items-center p-3 mt-2 bg-white border border-blue-500 rounded-lg"
              className="items-center p-3 mt-2 bg-blue-500 rounded-lg"
              onPress={() => setIsModalVisible(false)}
            >
              {/* <Text className="font-medium text-blue-500">Tutup</Text> */}
              <Text className="font-medium text-white">Tutup</Text>
            </Pressable>
          </View>
        </View>
      </Modal >
    </View >
  );
};

export default TicketsScreen;
