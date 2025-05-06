import { RootState } from "../store";
import { useSelector } from "react-redux";
import { Geofence, Ticket } from "../types";
import { setStringAsync } from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { TabView, SceneMap, TabBar } from "react-native-tab-view";
import { downloadAsync, documentDirectory } from 'expo-file-system';
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { getSingleTicket, getTicketsWithGeofences } from "../api/tickets";
import { log as handleLog, error as handleError } from '../utils/logHandler';
import { requestPermissionsAsync, createAssetAsync } from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { View, Text, TouchableOpacity, ScrollView, Linking, Modal, Pressable, RefreshControl, Dimensions, Image, Alert, TextInput } from "react-native";

const BASE_URL2 = process.env.EXPO_PUBLIC_API_BASE_URL_V2;

const copyToClipboard = (text: string) => {
  setStringAsync(text);
  alert("ID telah disalin ke clipboard!");
};

const openInGoogleMaps = (coordinates: [number, number]) => {
  if (!coordinates || coordinates.length !== 2) {
    handleError("Invalid coordinates");
    return;
  }

  const [longitude, latitude] = coordinates;
  const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  Linking.openURL(url).catch((err) =>
    handleError(`Error opening Google Maps: ${err}`)
  );
};

const TicketsScreen = () => {
  const navigation = useNavigation();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [geofence, setGeofence] = useState<Geofence[]>([]);
  const [geofenceLookup, setGeofenceLookup] = useState<Record<string, Geofence>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const userData = useSelector((state: RootState) => state.user);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isAnyTicketInProgress, setIsAnyTicketInProgress] = useState(false);
  const [routes] = useState([
    { key: "active", title: "Aktif" },
    { key: "on_progress", title: "Berjalan" },
    { key: "complete", title: "Selesai" },
    { key: "canceled", title: "Batal" },
  ]);

  // Fungsi untuk memilih dan membatalkan pilihan tiket
  const selectTicket = async (ticket: Ticket) => {
    try {
      const selectedTicketStr = await AsyncStorage.getItem("selectedTicket");
      const currentSelectedTicket = selectedTicketStr ? JSON.parse(selectedTicketStr) : null;
      if (currentSelectedTicket && currentSelectedTicket.ticket_id === ticket.ticket_id) {
        await AsyncStorage.removeItem("selectedTicket");
        setSelectedTicketId(null); // Reset state local
        return;
      }
      await AsyncStorage.setItem("selectedTicket", JSON.stringify(ticket));
      setSelectedTicketId(ticket.ticket_id); // Set state local
      // @ts-ignore - navigation.navigate memang menerima string sebagai parameter
      // navigation.navigate('Main');
    } catch (error) {
      handleError(`Error selecting ticket: ${error}`);
      Alert.alert(
        "Gagal Memilih Tiket",
        "Terjadi kesalahan saat memilih tiket. Silakan coba lagi.",
        [{ text: "OK" }]
      );
    }
  };

  // NEW optimized function that fetches tickets WITH their geofence data in one query
  const fetchTicketsWithGeofences = useCallback(async () => {
    try {
      if (!userData?.user_id) {
        handleError("User data is missing");
        return;
      }

      // Fetch all ticket statuses at once to avoid multiple API calls
      const allTicketsWithGeofences = await Promise.all([
        getTicketsWithGeofences(userData.user_id, 'assigned'),
        getTicketsWithGeofences(userData.user_id, 'on_progress'),
        getTicketsWithGeofences(userData.user_id, 'completed'),
        getTicketsWithGeofences(userData.user_id, 'canceled')
      ]);

      // Process each status batch into a combined dataset
      const processedTickets: Ticket[] = [];
      const geofences: Geofence[] = [];
      const geofenceLookupMap: Record<string, Geofence> = {};

      // Process each batch of tickets with their geofences
      allTicketsWithGeofences.forEach(batch => {
        batch.forEach(item => {
          const { geofence_data, ...ticketData } = item;
          processedTickets.push(ticketData as Ticket);
          if (geofence_data) {
            geofences.push(geofence_data);
            if (geofence_data.external_id) {
              geofenceLookupMap[geofence_data.external_id] = geofence_data;
            }
          }
        });
      });
      setTickets(processedTickets);
      setGeofence(geofences);
      setGeofenceLookup(geofenceLookupMap);
      handleLog(`✅ Optimized fetch: ${processedTickets.length} tickets with ${geofences.length} unique geofences`);
    } catch (error: any) {
      handleError(`Error in optimized fetch: ${error.message}`);
    }
  }, [userData]);

  useEffect(() => {
    fetchTicketsWithGeofences();
  }, [fetchTicketsWithGeofences]);

  // Load selected ticket ID when component mounts
  useEffect(() => {
    const checkSelectedTicket = async () => {
      try {
        const selectedTicketStr = await AsyncStorage.getItem("selectedTicket");
        if (selectedTicketStr) {
          const currentSelectedTicket = JSON.parse(selectedTicketStr);
          setSelectedTicketId(currentSelectedTicket.ticket_id);
        }
      } catch (error) {
        handleError(`Error checking selected ticket: ${error}`);
      }
    };
    checkSelectedTicket();
    const unsubscribe = navigation.addListener('focus', () => {
      checkSelectedTicket();
    });
    return unsubscribe;
  }, [navigation]);

  // useEffect untuk memeriksa apakah ada tiket yang sedang berjalan (tracking)
  useEffect(() => {
    const checkTrackingStatus = async () => {
      try {
        const startTime = await AsyncStorage.getItem("startTime");
        const storedTicket = await AsyncStorage.getItem("selectedTicket");
        const isTracking = !!startTime && !!storedTicket;
        setIsAnyTicketInProgress(isTracking);
      } catch (error) {
        handleError(`Error checking tracking status: ${error}`);
      }
    };
    checkTrackingStatus();
    const unsubscribe = navigation.addListener('focus', checkTrackingStatus);
    return unsubscribe;
  }, [navigation]);

  // Handle pull-to-refresh with optimized approach
  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchTicketsWithGeofences();
    setIsRefreshing(false);
  };

  const handleTicketPress = (ticket: Ticket) => {
    handleGetTicketWithPhotos(ticket.ticket_id);
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

  const TicketsList = ({ tickets, geofence, onRefresh, isRefreshing, handleTicketPress }: any) => {
    const [searchText, setSearchText] = useState(""); // Search state
    const [sortKey, setSortKey] = useState("updated_at"); // Sort state
    const [sortOrder, setSortOrder] = useState("desc"); // Sort order state
    const [filterKey, setFilterKey] = useState(""); // Filter state

    // Filtered and sorted tickets
    const filteredAndSortedTickets = useMemo(() => {
      let filtered = tickets;

      // Filter by search text
      if (searchText) {
        filtered = filtered.filter(
          (ticket: any) => {
            const ticketMatches = ticket.description.toLowerCase().includes(searchText.toLowerCase()) ||
              ticket.ticket_id.toLowerCase().includes(searchText.toLowerCase());
            const geofenceDesc = geofenceLookup[ticket.geofence_id]?.description || '';
            const geofenceMatches = geofenceDesc.toLowerCase().includes(searchText.toLowerCase());
            return ticketMatches || geofenceMatches;
          }
        );
      }

      // Filter by custom key
      if (filterKey) {
        filtered = filtered.filter((ticket: any) => ticket.status === filterKey);
      }

      // Sort by selected key
      const sorted = [...filtered].sort((a: any, b: any) => {
        const valueA = a[sortKey];
        const valueB = b[sortKey];
        if (sortOrder === "desc") {
          return valueA < valueB ? 1 : -1;
        }
        return valueA > valueB ? -1 : 1;
      });
      return sorted;
    }, [tickets, searchText, sortKey, sortOrder, filterKey]);

    return (
      <View>
        {/* Search Bar */}
        <TextInput
          value={searchText}
          onChangeText={(text) => setSearchText(text)}
          placeholder="Cari tiket atau tempat..."
          style={{
            backgroundColor: "white",
            padding: 10,
            borderRadius: 8,
            margin: 8,
          }}
        />

        {/* Sort and Filter Controls */}
        <View className="flex-row items-center justify-between p-4 mx-2 mb-2 bg-white rounded-lg">
          <View className="flex-1 mr-2 gap-y-2">
            {/* <Text className="text-sm font-medium text-gray-600">Urutkan berdasarkan:</Text> */}
            <View className="justify-center h-12 bg-white border border-gray-300 rounded-lg">
              <Picker
                selectedValue={sortKey}
                onValueChange={(value) => setSortKey(value)}
                className="bg-white rounded-lg"
              >
                <Picker.Item label="Tanggal Dibuat" value="created_at" />
                <Picker.Item label="Deskripsi" value="description" />
              </Picker>
            </View>
          </View>
          <View className="flex-1 ml-2 gap-y-2">
            {/* <Text className="text-sm font-medium text-gray-600">Urutan:</Text> */}
            <View className="justify-center h-12 bg-white border border-gray-300 rounded-lg">
              <Picker
                selectedValue={sortOrder}
                onValueChange={(value) => setSortOrder(value)}
                className="bg-white rounded-lg"
              >
                <Picker.Item label="Menurun" value="desc" />
                <Picker.Item label="Menaik" value="asc" />
              </Picker>
            </View>
          </View>
        </View>

        {/* Tickets List */}
        <ScrollView
          contentContainerStyle={{ paddingBottom: 130 }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
        >
          {filteredAndSortedTickets.map((ticket: any) => {
            const geofenceItem = geofenceLookup[ticket.geofence_id];
            const geofenceDescription = geofenceItem?.description || 'Loading location...';
            return (
              <TouchableOpacity
                key={ticket.ticket_id}
                style={{
                  backgroundColor: "white",
                  padding: 16,
                  marginTop: 6,
                  marginBottom: 6,
                  marginRight: 8,
                  marginLeft: 8,
                  borderRadius: 8,
                  borderLeftWidth: 4,
                  borderColor:
                    ticket.status === "assigned"
                      ? "blue"
                      : ticket.status === "on_progress"
                        ? "yellow"
                        : ticket.status === "completed"
                          ? "green"
                          : "red",
                }}
                onPress={() => handleTicketPress(ticket)}
              >
                <View>
                  <Text style={{ fontWeight: "medium", color: "#3B82F6" }}>{ticket.ticket_id}</Text>
                  <Text style={{ fontWeight: "bold" }}>{ticket.description}</Text>
                  <Text style={{ fontWeight: "500", color: "#4B5563" }}>
                    {geofenceDescription}
                  </Text>
                  <Text style={{ color: "gray" }}>
                    Dibuat: {(() => {
                      const createdAt = new Date(ticket.created_at);
                      const day = String(createdAt.getDate()).padStart(2, "0");
                      const month = String(createdAt.getMonth() + 1).padStart(2, "0");
                      const year = createdAt.getFullYear();
                      const hours = String(createdAt.getHours()).padStart(2, "0");
                      const minutes = String(createdAt.getMinutes()).padStart(2, "0");
                      const seconds = String(createdAt.getSeconds()).padStart(2, "0");
                      return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds} WIB`;
                    })()}
                  </Text>
                  {index === 2 && completedTickets && (
                    <Text style={{ color: "gray" }}>
                      Selesai: {(() => {
                        const createdAt = new Date(ticket.updated_at);
                        const day = String(createdAt.getDate()).padStart(2, "0");
                        const month = String(createdAt.getMonth() + 1).padStart(2, "0");
                        const year = createdAt.getFullYear();
                        const hours = String(createdAt.getHours()).padStart(2, "0");
                        const minutes = String(createdAt.getMinutes()).padStart(2, "0");
                        const seconds = String(createdAt.getSeconds()).padStart(2, "0");
                        return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds} WIB`;
                      })()}
                    </Text>
                  )}
                  {ticket.status === "assigned" && (
                    <TouchableOpacity
                      onPress={() => isAnyTicketInProgress ? null : selectTicket(ticket)}
                      disabled={isAnyTicketInProgress}
                      style={{
                        backgroundColor: isAnyTicketInProgress
                          ? "#9ca3af" // Abu-abu ketika disabled
                          : selectedTicketId === ticket.ticket_id
                            ? "#22c55e"
                            : "#3B82F6",
                        padding: 8,
                        borderRadius: 4,
                        marginTop: 8,
                        flexDirection: 'row',
                        justifyContent: 'center',
                        alignItems: 'center',
                        opacity: isAnyTicketInProgress ? 0.6 : 1,
                      }}
                    >
                      {selectedTicketId === ticket.ticket_id && !isAnyTicketInProgress && (
                        <Ionicons name="checkmark-circle" size={16} color="white" style={{ marginRight: 4 }} />
                      )}
                      <Text style={{ color: "white", textAlign: "center" }}>
                        {isAnyTicketInProgress
                          ? "Tidak tersedia (tiket sedang berjalan)"
                          : selectedTicketId === ticket.ticket_id
                            ? "Terpilih (Klik untuk Batal)"
                            : "Pilih"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          {filteredAndSortedTickets.length === 0 && (
            <Text style={{ textAlign: "center", color: "gray", marginTop: 16 }}>
              Tidak ada tiket yang tersedia.
            </Text>
          )}
        </ScrollView>
      </View>
    );
  }

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

  const handleGetTicketWithPhotos = async (ticketId: string | undefined) => {
    if (!ticketId) {
      alert("Tidak ada ID tiket yang ditemukan.");
      return;
    }
    const data = await getSingleTicket(ticketId);
    setPhotos(data.photos);
    return data;
  }

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
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-medium text-gray-500">ID Tiket:</Text>
                  <View className="flex-row items-center">
                    <Text className="mr-2 text-gray-800">
                      {selectedTicket.ticket_id}
                    </Text>
                    <TouchableOpacity
                      onPress={() => copyToClipboard(`ID Tiket: ${selectedTicket.ticket_id}`)}
                    >
                      <Ionicons name="copy-outline" size={16} color="#4F46E5" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Geofence ID */}
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-medium text-gray-500">ID Tempat:</Text>
                  <View className="flex-row items-center">
                    <Text className="mr-2 text-gray-800">
                      {selectedTicket.geofence_id}
                    </Text>
                    <TouchableOpacity
                      onPress={() => copyToClipboard(`ID Tempat (${geofenceLookup[selectedTicket.geofence_id]?.description || ''}): ${selectedTicket.geofence_id}`)}
                    >
                      <Ionicons name="copy-outline" size={16} color="#4F46E5" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Place Name */}
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-medium text-gray-500">Tempat:</Text>
                  <View className="flex-row items-center">
                    <Text className="text-gray-800">
                      {geofenceLookup[selectedTicket.geofence_id]?.description?.length > 30
                        ? `${geofenceLookup[selectedTicket.geofence_id]?.description.slice(0, 30)}...`
                        : geofenceLookup[selectedTicket.geofence_id]?.description || 'Tempat tidak ditemukan'}
                    </Text>
                  </View>
                </View>

                {/* Open in Google Maps */}
                <TouchableOpacity
                  className="items-center p-2 mb-2 border border-blue-500 rounded-lg"
                  onPress={() => {
                    const coordinates = geofenceLookup[selectedTicket.geofence_id]?.coordinates || [0, 0];
                    openInGoogleMaps(coordinates);
                  }}
                >
                  <View className="flex-row items-center gap-x-2">
                    <Text className="font-medium text-blue-500">
                      Buka di Google Maps
                    </Text>
                    <Ionicons name="open-outline" size={16} color="#3b82f6" />
                  </View>
                </TouchableOpacity>

                {/* Status */}
                <View className="flex-row justify-between">
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

                {/* Photos Section */}
                <View className="mb-2">
                  <Text className="mb-2 font-medium text-gray-500">Foto Bukti:</Text>
                  {photos.length === 0 ? (
                    <Text className="text-gray-500">-</Text>
                  ) : (
                    <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={true}>

                      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                        {photos.map((photo, index) => (
                          <TouchableOpacity
                            key={index}
                            onPress={() => setPreviewPhoto(photo.url)}
                            style={{
                              width: "50%",
                              aspectRatio: 1,
                              borderRadius: 8,
                              overflow: "hidden",
                              backgroundColor: "#f3f4f6",
                              borderWidth: 1,
                              borderColor: "#e5e7eb",
                            }}
                          >
                            <Image
                              source={{ uri: photo.url }}
                              style={{ width: "100%", height: "100%" }}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </View>

                {/* Description */}
                {/* <View className="mb-2">
                  <Text className="font-medium text-gray-500">Deskripsi:</Text>
                  <Text className="text-gray-800">{selectedTicket.description}</Text>
                </View> */}

                {/* Created At */}
                <View className="flex-row justify-between mb-2">
                  <Text className="font-medium text-gray-500">Dibuat Pada:</Text>
                  <Text className="text-gray-800">
                    {(() => {
                      const createdAt = new Date(selectedTicket.created_at);
                      const day = String(createdAt.getDate()).padStart(2, "0");
                      const month = String(createdAt.getMonth() + 1).padStart(2, "0");
                      const year = createdAt.getFullYear();
                      const hours = String(createdAt.getHours()).padStart(2, "0");
                      const minutes = String(createdAt.getMinutes()).padStart(2, "0");
                      const seconds = String(createdAt.getSeconds()).padStart(2, "0");
                      return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds} WIB`;
                    })()}
                  </Text>
                </View>

                {/* Updated At */}
                <View className="flex-row justify-between mb-2">
                  <Text className="font-medium text-gray-500">Diperbarui Pada:</Text>
                  <Text className="text-gray-800">
                    {(() => {
                      const createdAt = new Date(selectedTicket.updated_at);
                      const day = String(createdAt.getDate()).padStart(2, "0");
                      const month = String(createdAt.getMonth() + 1).padStart(2, "0");
                      const year = createdAt.getFullYear();
                      const hours = String(createdAt.getHours()).padStart(2, "0");
                      const minutes = String(createdAt.getMinutes()).padStart(2, "0");
                      const seconds = String(createdAt.getSeconds()).padStart(2, "0");
                      return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds} WIB`;
                    })()}
                  </Text>
                </View>
              </View>
            ) : (
              <Text className="text-gray-500">Memuat data tiket...</Text>
            )}

            {/* Download PDF Button */}
            <TouchableOpacity
              className="flex flex-row items-center justify-center p-3 mt-2 border border-blue-500 rounded-lg gap-x-2"
              onPress={() => {
                Linking.openURL(`${BASE_URL2}/admin/tickets/pdf/${selectedTicket?.ticket_id}/${selectedTicket?.user_id}/${selectedTicket?.geofence_id}`);
              }}
            >
              <Text className="font-medium text-blue-500">Unduh PDF</Text>
              <Ionicons name="document-outline" size={18} color="#3B82F6" />
            </TouchableOpacity>

            {/* Close Button */}
            <TouchableOpacity
              className="items-center p-3 mt-2 bg-blue-500 rounded-lg"
              onPress={() => {
                setIsModalVisible(false)
                setPhotos([]);
              }}
            >
              <Text className="font-medium text-white">Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal >

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <Modal
          visible={!!previewPhoto}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setPreviewPhoto(null)}
        >
          <View className="items-center justify-center flex-1 bg-black/90 backdrop-blur-2xl">
            <Image
              source={{ uri: previewPhoto }}
              style={{ width: "100%", height: 400 }}
              resizeMode="contain"
            />

            <View className="flex-row items-center gap-4 mt-4">
              {/* Tombol Unduh Foto */}
              <TouchableOpacity
                className="items-center px-8 py-3 bg-gray-300 rounded-lg"
                onPress={async () => {
                  const { status } = await requestPermissionsAsync();
                  if (status !== 'granted') {
                    Alert.alert(
                      'Izin Ditolak',
                      'Aplikasi meminta izin untuk menyimpan gambar ke galeri.'
                    );
                    return;
                  }

                  try {
                    const fileUri = `${documentDirectory}${previewPhoto.split('/').pop()}`;
                    const { uri } = await downloadAsync(previewPhoto, fileUri);
                    await createAssetAsync(uri);
                    Alert.alert('Sukses', 'Gambar berhasil disimpan ke galeri.');
                  } catch (error) {
                    handleError(`Error downloading photo: ${error}`);
                    Alert.alert('Error', 'Gagal menyimpan gambar.');
                  }
                }}
              >
                <View className="flex-row items-center gap-2">
                  <Ionicons name="download-outline" size={20} color="#4F46E5" />
                  <Text className="font-medium text-gray-900">Download</Text>
                </View>
              </TouchableOpacity>

              {/* Tombol Tutup */}
              <TouchableOpacity
                className="items-center px-8 py-3 bg-blue-500 rounded-lg"
                onPress={() => setPreviewPhoto(null)}
              >
                <View className="flex-row items-center gap-2">
                  <Ionicons name="close-outline" size={20} color="#ffffff" />
                  <Text className="font-medium text-white">Tutup</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View >
  );
};

export default TicketsScreen;
