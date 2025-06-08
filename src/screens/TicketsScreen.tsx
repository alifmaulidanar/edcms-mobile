import { RootState } from "../store";
import { useSelector } from "react-redux";
import { Geofence, Ticket } from "../types";
import { Ionicons } from "@expo/vector-icons";
import { setStringAsync } from "expo-clipboard";
import { Picker } from "@react-native-picker/picker";
import NetInfo from '@react-native-community/netinfo';
import { useNavigation } from '@react-navigation/native';
import { TICKET_CONFIG } from "../utils/ticketPhotoConfig";
import SyncPreviewModal from '../components/SyncPreviewModal';
import SyncProgressModal from '../components/SyncProgressModal';
import { enqueueTicketAction } from "../utils/ticketActionQueue";
import { TabView, SceneMap, TabBar } from "react-native-tab-view";
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { getSingleTicket, getTicketsWithGeofences } from "../api/tickets";
import { log as handleLog, error as handleError } from '../utils/logHandler';
import { requestPermissionsAsync, createAssetAsync } from 'expo-media-library';
import { getInfoAsync, deleteAsync, downloadAsync, documentDirectory } from 'expo-file-system';
import { getPendingPhotos, updatePhotoStatus, deletePhoto, insertUploadAuditLog, initTicketPhotoTable, initUploadAuditLogTable } from '../utils/ticketPhotoDB';
import { View, Text, TouchableOpacity, ScrollView, Linking, Modal, RefreshControl, Dimensions, Image, Alert, TextInput, FlatList, ActivityIndicator, TouchableWithoutFeedback, BackHandler } from "react-native";

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
  Linking.openURL(url).catch((err) => handleError(`Error opening Google Maps: ${err}`));
};

const getTicketType = (ticket: Ticket | null): "pullout" | "sharing" | "single" | "default" => {
  if (!ticket || !ticket?.additional_info) return "default";
  const tipeTiket = (ticket?.additional_info?.tipe_tiket || "").toString().toLowerCase().replace(/\s+/g, "");
  const edcService = (ticket?.additional_info?.edc_service || "").toString().toLowerCase();
  if (tipeTiket.includes("pullout") || tipeTiket.includes("pullout")) {
    return "pullout";
  }
  if (edcService.includes("sharing")) {
    return "sharing";
  }
  if (edcService.includes("single")) {
    return "single";
  }
  return "default";
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
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isNetInfoSafe, setIsNetInfoSafe] = useState(false);
  const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
  const [syncableTickets, setSyncableTickets] = useState<any[]>([]); // [{ticket, photos: [{...}]}]
  const [selectedTicketsToSync, setSelectedTicketsToSync] = useState<string[]>([]);
  const [showAdditionalInfo, setShowAdditionalInfo] = useState<boolean>(false);
  const [isProgressModalVisible, setIsProgressModalVisible] = useState(false);
  const [syncResultSummary, setSyncResultSummary] = useState<any>(null);
  const [routes] = useState([
    { key: "active", title: "Aktif" },
    { key: "on_progress", title: "Berjalan" },
    { key: "complete", title: "Selesai" },
    { key: "canceled", title: "Batal" },
  ]);
  const [progressState, setProgressState] = useState({
    currentTicketIdx: 0,
    currentPhotoIdx: 0,
    totalTickets: 0,
    totalPhotos: 0,
    currentTicket: null as any,
    currentPhoto: null as any,
    status: 'idle', // 'uploading', 'done'
  });
  // const [accordionOpen, setAccordionOpen] = useState<string | null>(null);
  // const [syncProgress, setSyncProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

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
      setIsRefreshing(true);

      // Fetch all ticket statuses at once to avoid multiple API calls, but with a short delay between them
      // to prevent overwhelming the device
      const assignedData = await getTicketsWithGeofences(userData.user_id, 'assigned');
      // Process assigned tickets first for better perceived performance (active tab is shown first)
      const processedTickets: Ticket[] = [];
      const geofences: Geofence[] = [];
      const geofenceLookupMap: Record<string, Geofence> = {};

      // Process assigned tickets
      assignedData.forEach(item => {
        const { geofence_data, ...ticketData } = item;
        processedTickets.push(ticketData as Ticket);
        if (geofence_data) {
          geofences.push(geofence_data);
          if (geofence_data.external_id) {
            geofenceLookupMap[geofence_data.external_id] = geofence_data;
          }
        }
      });

      // Update state with the first batch of data to make UI responsive
      setTickets(processedTickets);
      setGeofence(geofences);
      setGeofenceLookup(geofenceLookupMap);

      // Then fetch the rest of the data in sequence to prevent overwhelming the device
      const otherStatuses = ['on_progress', 'completed', 'canceled'];
      for (const status of otherStatuses) {
        const batchData = await getTicketsWithGeofences(userData.user_id, status);
        batchData.forEach(item => {
          const { geofence_data, ...ticketData } = item;
          processedTickets.push(ticketData as Ticket);
          if (geofence_data) {
            geofences.push(geofence_data);
            if (geofence_data.external_id) {
              geofenceLookupMap[geofence_data.external_id] = geofence_data;
            }
          }
        });

        // Update state after processing each batch
        setTickets([...processedTickets]);
        setGeofence([...geofences]);
        setGeofenceLookup({ ...geofenceLookupMap });
      }
      handleLog(`✅ Optimized fetch: ${processedTickets.length} tickets with ${geofences.length} unique geofences`);
      setIsRefreshing(false);
    } catch (error: any) {
      handleLog(`Error in optimized fetch: ${error.message}`);
      setIsRefreshing(false);
    }
  }, [userData]);

  useEffect(() => {
    initTicketPhotoTable();
    initUploadAuditLogTable();
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
    setSelectedTicketId(null);
    await fetchTicketsWithGeofences();
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
    const [ticketTypeFilter, setTicketTypeFilter] = useState("all"); // Ticket Type filter state
    const [pageSize] = useState(20); // Number of items to display per page
    const [currentPage, setCurrentPage] = useState(1); // Current page number
    const [isLoadingMore, setIsLoadingMore] = useState(false); // Loading more indicator

    // Reset pagination when tickets or filters change
    useEffect(() => {
      setCurrentPage(1);
    }, [tickets, searchText, sortKey, sortOrder, filterKey, ticketTypeFilter]);

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

      // Filter by ticket type
      if (ticketTypeFilter !== "all") {
        filtered = filtered.filter((ticket: any) =>
          ticket.additional_info?.tipe_tiket === ticketTypeFilter
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
    }, [tickets, searchText, sortKey, sortOrder, filterKey, ticketTypeFilter, geofenceLookup]);

    // Get paginated data
    const paginatedTickets = useMemo(() => {
      return filteredAndSortedTickets.slice(0, currentPage * pageSize);
    }, [filteredAndSortedTickets, currentPage, pageSize]);

    // Check if there are more items to load
    const hasMoreItems = paginatedTickets.length < filteredAndSortedTickets.length;
    const loadMoreItems = () => {
      if (!hasMoreItems || isLoadingMore) return;
      setIsLoadingMore(true);
      setTimeout(() => {
        setCurrentPage(prevPage => prevPage + 1);
        setIsLoadingMore(false);
      }, 500);
    };

    // Compute most recent on_progress ticket_id if in tab index 1
    let mostRecentOnProgressId: string | null = null;
    if (index === 1 && filteredAndSortedTickets.length > 0) {
      // Only consider tickets with status 'on_progress'
      const onProgress = filteredAndSortedTickets.filter((t: any) => t.status === 'on_progress');
      if (onProgress.length > 0) {
        mostRecentOnProgressId = onProgress.reduce((latest: any, curr: any) => {
          return new Date(curr.updated_at) > new Date(latest.updated_at) ? curr : latest;
        }, onProgress[0]).ticket_id;
      }
    }

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
        {/* Sort and Filter Controls - Compact Layout */}
        <View className="flex-row items-center justify-between py-2 mx-2 mb-2 bg-white rounded-lg">
          <View className="flex-1 mx-0.5 gap-y-1">
            <Text className="text-xs font-medium text-gray-500 mb-0.5 ml-1">Urutkan</Text>
            <View className="justify-center h-10 bg-white border border-gray-300 rounded-lg">
              <Picker
                selectedValue={sortKey}
                onValueChange={(value) => setSortKey(value)}
                className="bg-white rounded-lg"
                itemStyle={{ fontSize: 12, height: 120 }}
              >
                <Picker.Item label="Tgl Dibuat" value="created_at" />
                <Picker.Item label="Tgl Selesai" value="updated_at" />
                <Picker.Item label="Deskripsi" value="description" />
              </Picker>
            </View>
          </View>
          <View className="flex-1 mx-0.5 gap-y-1">
            <Text className="text-xs font-medium text-gray-500 mb-0.5 ml-1">Urutan</Text>
            <View className="justify-center h-10 bg-white border border-gray-300 rounded-lg">
              <Picker
                selectedValue={sortOrder}
                onValueChange={(value) => setSortOrder(value)}
                className="bg-white rounded-lg"
                itemStyle={{ fontSize: 12, height: 120 }}
              >
                <Picker.Item label="Menurun" value="desc" />
                <Picker.Item label="Menaik" value="asc" />
              </Picker>
            </View>
          </View>
          <View className="flex-1 mx-0.5 gap-y-1">
            <Text className="text-xs font-medium text-gray-500 mb-0.5 ml-1">Kategori Tiket</Text>
            <View className="justify-center h-10 bg-white border border-gray-300 rounded-lg">
              <Picker
                selectedValue={ticketTypeFilter}
                onValueChange={(value) => setTicketTypeFilter(value)}
                className="bg-white rounded-lg"
                itemStyle={{ fontSize: 12, height: 120 }}
              >
                <Picker.Item label="Semua" value="all" />
                <Picker.Item label="CM Visit / VTI" value="CM Visit" />
                <Picker.Item label="Installation" value="Installation" />
                <Picker.Item label="Preventive Maintenance / PM" value="PM" />
                <Picker.Item label="Pull Out" value="Pull Out" />
                <Picker.Item label="Replacement" value="Replacement" />
              </Picker>
            </View>
          </View>
        </View>

        {/* Ticket Count & Validation Status (for completed tickets) */}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginRight: 16, marginBottom: 4 }}>
          <Text style={{ color: "#6B7280", fontSize: 14 }}>
            Total: {filteredAndSortedTickets.length} tiket
          </Text>
        </View>
        {/* Show validation status counts only for completed tab */}
        {index === 2 && (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginRight: 16, marginBottom: 4, gap: 12 }}>
            <Text style={{ color: "#6B7280", fontSize: 13 }}>
              Belum divalidasi: {filteredAndSortedTickets.filter((t: any) => t.validation_status == null).length}
            </Text>
            <Text style={{ color: "#10B981", fontSize: 13 }}>
              Tervalidasi: {filteredAndSortedTickets.filter((t: any) => t.validation_status === "validated").length}
            </Text>
            <Text style={{ color: "#F59E42", fontSize: 13 }}>
              Hold: {filteredAndSortedTickets.filter((t: any) => t.validation_status === "hold").length}
            </Text>
          </View>
        )}

        {/* Tickets List */}
        <FlatList
          data={paginatedTickets}
          keyExtractor={(item) => item.ticket_id}
          contentContainerStyle={{ paddingBottom: 130 }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={true}
          onEndReached={loadMoreItems}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={() => (
            <Text style={{ textAlign: "center", color: "gray", marginTop: 16 }}>
              Tidak ada tiket yang tersedia.
            </Text>
          )}
          ListFooterComponent={() => (
            hasMoreItems ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                {isLoadingMore ? (
                  <ActivityIndicator size="small" color="#3B82F6" />
                ) : (
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#3B82F6',
                      paddingVertical: 8,
                      paddingHorizontal: 16,
                      borderRadius: 4,
                    }}
                    onPress={loadMoreItems}
                  >
                    <Text style={{ color: 'white' }}>Muat Lebih Banyak</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : filteredAndSortedTickets.length > 0 ? (
              <Text style={{ textAlign: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, color: 'gray' }}>
                Semua tiket telah dimuat
              </Text>
            ) : null
          )}
          renderItem={({ item: ticket }) => (
            <TicketItem
              ticket={ticket}
              geofenceLookup={geofenceLookup}
              handleTicketPress={handleTicketPress}
              isAnyTicketInProgress={isAnyTicketInProgress}
              selectedTicketId={selectedTicketId}
              selectTicket={selectTicket}
              index={index}
              mostRecentOnProgressId={mostRecentOnProgressId}
            />
          )}
        />
      </View>
    );
  }

  // Render a loading placeholder for lazy loading
  const renderLazyPlaceholder = () => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5', padding: 16 }}>
      <ActivityIndicator size="large" color="#3B82F6" />
      <Text style={{ marginTop: 16, color: '#4B5563', fontSize: 16, fontWeight: '500' }}>
        Memuat data tiket...
      </Text>
      <Text style={{ marginTop: 8, color: '#6B7280', textAlign: 'center', maxWidth: '80%' }}>
        Mohon tunggu sementara kami menyiapkan daftar tiket Anda
      </Text>
    </View>
  );
  // Define the tabs first
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

  // Tab Scenes with lazy loading - defined after the tabs
  const lazyTabScenes = SceneMap({
    active: ActiveTab,
    on_progress: OnProgressTab,
    complete: CompleteTab,
    canceled: CanceledTab,
  });

  const handleGetTicketWithPhotos = async (ticketId: string | undefined) => {
    if (!ticketId) {
      alert("Tidak ada ID tiket yang ditemukan.");
      return;
    }
    setIsLoadingPhotos(true);
    const data = await getSingleTicket(ticketId);
    console.log({ data });
    setPhotos(data.photos);
    setIsLoadingPhotos(false);
    return data;
  };

  // Get photo titles based on ticket type
  const getPhotoTitles = (ticket: Ticket | null) => {
    const ticketType = getTicketType(ticket);
    return TICKET_CONFIG[ticketType].photoTitles;
  };

  // Cek NetInfo setiap mount dan saat koneksi berubah
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      // Izinkan wifi dan cellular, harus isConnected dan isInternetReachable
      const safe =
        (state.type === 'wifi' || state.type === 'cellular') &&
        state.isConnected &&
        state.isInternetReachable;
      setIsNetInfoSafe(!!safe);
    });
    // Cek awal
    NetInfo.fetch().then(state => {
      const safe =
        (state.type === 'wifi' || state.type === 'cellular') &&
        state.isConnected &&
        state.isInternetReachable;
      setIsNetInfoSafe(!!safe);
    });
    return () => unsubscribe();
  }, []);

  // Disable back handler selama modal progres aktif
  useEffect(() => {
    if (!isProgressModalVisible) return;
    const handler = () => true; // block back
    BackHandler.addEventListener('hardwareBackPress', handler);
    return () => BackHandler.removeEventListener('hardwareBackPress', handler);
  }, [isProgressModalVisible]);

  // Handler sinkronisasi batch dengan progres
  const handleSyncSelectedTickets = async () => {
    setIsPreviewModalVisible(false);
    setIsProgressModalVisible(true);
    setSyncResultSummary(null);
    let totalTickets = syncableTickets.filter(row => selectedTicketsToSync.includes(row.ticket.ticket_id)).length;
    let totalPhotos = syncableTickets.filter(row => selectedTicketsToSync.includes(row.ticket.ticket_id)).reduce((acc, row) => acc + row.photos.length, 0);
    let summary: any[] = [];
    let photoCounter = 0;
    for (let tIdx = 0; tIdx < syncableTickets.length; tIdx++) {
      const row = syncableTickets[tIdx];
      if (!selectedTicketsToSync.includes(row.ticket.ticket_id)) continue;
      let ticketResult = { ticket_id: row.ticket.ticket_id, description: row.ticket.description, success: 0, failed: 0 };
      for (let pIdx = 0; pIdx < row.photos.length; pIdx++) {
        setProgressState({
          currentTicketIdx: tIdx + 1,
          currentPhotoIdx: pIdx + 1,
          totalTickets,
          totalPhotos,
          currentTicket: row.ticket,
          currentPhoto: row.photos[pIdx],
          status: 'uploading',
        });
        // Proses upload satu foto (panggil syncTicketPhotos untuk satu foto saja, atau refactor logic upload per foto di sini)
        // Untuk performa, upload satu per satu, delay kecil antar upload
        let retry = 0;
        let uploaded = false;
        let photo = row.photos[pIdx];
        let compressedUri = null;
        while (retry < 3 && !uploaded) {
          try {
            // Validasi file
            const fileInfo = await getInfoAsync(photo.local_uri);
            if (!fileInfo.exists) {
              handleLog(`[SYNC] File tidak ditemukan: ${photo.local_uri}`);
              await updatePhotoStatus(photo.id, 'failed');
              insertUploadAuditLog({ ticket_id: photo.ticket_id, photo_id: photo.id, queue_order: photo.queue_order, status: 'failed', error_message: 'File tidak ditemukan' });
              ticketResult.failed++;
              break;
            }
            // Image compression
            try {
              const compressed = await manipulateAsync(
                photo.local_uri,
                [{ resize: { width: 800 } }],
                { compress: 0.3, format: SaveFormat.JPEG }
              );
              compressedUri = compressed.uri;
            } catch (err) {
              handleLog(`[SYNC] Gagal kompres foto, upload original: ${photo.local_uri}`);
              compressedUri = photo.local_uri;
            }
            // Upload ke server
            const formData = new FormData();
            formData.append('photo', { uri: compressedUri, name: `photo_${photo.queue_order}.jpg`, type: 'image/jpeg' } as any);
            formData.append('queue_order', photo.queue_order.toString());
            formData.append('uuid', photo.id ?? '');
            formData.append('ticket_id', photo.ticket_id ?? '');
            const userIdHeader = userData?.user_id || photo.user_id || '';
            const response = await fetch(`${BASE_URL2}/admin/tickets/photos/new/upload/${photo.ticket_id}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'multipart/form-data',
                'user_id': userIdHeader,
              },
              body: formData,
            });
            if (!response.ok) {
              handleLog(`[SYNC] Upload gagal untuk foto ${photo.id} (order ${photo.queue_order}): ${response.status}`);
              retry++;
              if (retry >= 3) {
                await updatePhotoStatus(photo.id, 'failed');
                insertUploadAuditLog({ ticket_id: photo.ticket_id, photo_id: photo.id, queue_order: photo.queue_order, status: 'failed', error_message: `HTTP ${response.status}` });
                ticketResult.failed++;
              } else {
                await new Promise(res => setTimeout(res, 100 * retry));
              }
              continue;
            }
            // Sukses: update status dan hapus file lokal
            await updatePhotoStatus(photo.id, 'success');
            await deleteAsync(photo.local_uri, { idempotent: true });
            await deletePhoto(photo.id);
            insertUploadAuditLog({ ticket_id: photo.ticket_id, photo_id: photo.id, queue_order: photo.queue_order, status: 'success' });
            handleLog(`[SYNC] Foto ${photo.id} (order ${photo.queue_order}) berhasil diupload & dihapus lokal`);
            ticketResult.success++;
            uploaded = true;
          } catch (err) {
            handleLog(`[SYNC] Error upload foto ${photo.id}: ${err}`);
            retry++;
            if (retry >= 3) {
              await updatePhotoStatus(photo.id, 'failed');
              insertUploadAuditLog({ ticket_id: photo.ticket_id, photo_id: photo.id, queue_order: photo.queue_order, status: 'failed', error_message: String(err) });
              ticketResult.failed++;
            } else {
              await new Promise(res => setTimeout(res, 100 * retry));
            }
          } finally {
            if (compressedUri && compressedUri !== photo.local_uri) {
              try { await deleteAsync(compressedUri, { idempotent: true }); } catch { }
            }
          }
        }
        photoCounter++;
        await new Promise(res => setTimeout(res, 80)); // delay kecil antar upload
      }
      summary.push(ticketResult);
    }
    setProgressState(ps => ({ ...ps, status: 'done' }));
    setSyncResultSummary(summary);
    setIsSyncing(false);
  };

  // Handler untuk modal preview sinkronisasi
  const handleOpenSyncPreview = async () => {
    setIsSyncing(true);
    const result: any[] = [];
    for (const ticket of tickets) {
      const pending = await getPendingPhotos(ticket.ticket_id);
      if (pending.length > 0) {
        result.push({ ticket, photos: pending });
      }
    }
    setSyncableTickets(result);
    setSelectedTicketsToSync(result.map(r => r.ticket.ticket_id)); // default: semua terpilih
    setIsPreviewModalVisible(true);
    setIsSyncing(false);
  };

  const handleSelectAllTickets = () => {
    if (selectedTicketsToSync.length === syncableTickets.length) {
      setSelectedTicketsToSync([]);
    } else {
      setSelectedTicketsToSync(syncableTickets.map(r => r.ticket.ticket_id));
    }
  };

  const handleToggleTicket = (ticketId: string) => {
    setSelectedTicketsToSync(prev =>
      prev.includes(ticketId)
        ? prev.filter(id => id !== ticketId)
        : [...prev, ticketId]
    );
  };

  return (
    <View className="flex-1 bg-[#f5f5f5] p-2 mt-6">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 }}>
        <Text className="text-2xl font-semibold text-gray-700">Tiket Saya</Text>
        <TouchableOpacity
          onPress={handleOpenSyncPreview}
          style={{ backgroundColor: isSyncing || !isNetInfoSafe ? '#d1d5db' : '#2563eb', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}
          disabled={isSyncing || !isNetInfoSafe}
          activeOpacity={0.7}
        >
          <Ionicons name="cloud-upload-outline" size={20} color="white" style={{ marginRight: 6 }} />
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
            {isSyncing ? 'Sinkronisasi...' : 'Sinkronkan Foto'}
          </Text>
        </TouchableOpacity>
      </View>

      <TabView
        navigationState={{ index, routes }}
        renderScene={lazyTabScenes}
        onIndexChange={setIndex}
        initialLayout={{ width: Dimensions.get("window").width }}
        renderLazyPlaceholder={renderLazyPlaceholder}
        lazy={true}
        lazyPreloadDistance={0}
        renderTabBar={(props) => (
          <TabBar
            {...props}
            indicatorStyle={{ backgroundColor: "#3B82F6", height: 3 }}
            style={{ backgroundColor: "#f5f5f5" }}
            tabStyle={{ padding: 8 }}
            activeColor="#3B82F6"
            inactiveColor="#666"
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
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          {/* Overlay untuk klik di luar modal */}
          <TouchableWithoutFeedback onPress={() => setIsModalVisible(false)}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          </TouchableWithoutFeedback>
          {/* Modal Box */}
          <View className="w-11/12 p-0 bg-white rounded-lg shadow-lg max-h-[90%]" style={{ zIndex: 10 }}>
            {/* Sticky Header: Judul dan Tombol X */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: 'white', zIndex: 10 }}>
              <Text className="text-2xl font-semibold text-gray-800">Detail Tiket</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsModalVisible(false);
                  setPhotos([]);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ marginLeft: 12 }}
              >
                <Ionicons name="close" size={28} color="#374151" />
              </TouchableOpacity>
            </View>
            {/* Scrollable Content */}
            <ScrollView
              showsVerticalScrollIndicator={true}
              style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 }}
              contentContainerStyle={{ paddingBottom: 32 }}
              nestedScrollEnabled={true}
            >
              {selectedTicket && (
                <View pointerEvents="box-none">
                  <Text className="mb-4 text-lg font-semibold text-gray-800">
                    {selectedTicket?.description}
                  </Text>
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

                  {/* Address */}
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="font-medium text-gray-500">Alamat:</Text>
                    <View className="flex-row items-center">
                      <Text
                        className="text-gray-800"
                        style={{ flexShrink: 1, flexWrap: 'wrap', maxWidth: 220 }}
                        numberOfLines={0}
                      >
                        {geofenceLookup[selectedTicket.geofence_id]?.address || 'Alamat tidak ditemukan'}
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
                    {isLoadingPhotos ? (
                      <ActivityIndicator size="small" color="#3B82F6" />
                    ) : photos.length === 0 ? (
                      <Text className="text-gray-500">-</Text>
                    ) : (
                      <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={true} nestedScrollEnabled={true}>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                          {photos
                            .sort((a, b) => {
                              // const indexA = parseInt(a.url.split('-').pop().split('.')[0], 10);
                              // const indexB = parseInt(b.url.split('-').pop().split('.')[0], 10);
                              // return indexA - indexB;
                              // If both have queue_order, sort ascending
                              if (a.queue_order != null && b.queue_order != null) {
                                return a.queue_order - b.queue_order;
                              }
                              // If both don't have queue_order, sort by filename
                              if (a.queue_order == null && b.queue_order == null) {
                                const indexA = parseInt(a.url.split('-').pop().split('.')[0], 10);
                                const indexB = parseInt(b.url.split('-').pop().split('.')[0], 10);
                                return indexA - indexB;
                              }
                              // If only one has queue_order, sort by queue_order
                              return a.queue_order == null ? 1 : -1;
                            })
                            .map((photo, index) => (
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
                                  marginBottom: 8,
                                }}
                              >
                                <Image
                                  source={{ uri: photo.url }}
                                  style={{ width: "100%", height: "100%" }}
                                  resizeMode="cover"
                                />
                                <View
                                  style={{
                                    position: "absolute",
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    backgroundColor: "rgba(0, 0, 0, 0.7)",
                                    padding: 4,
                                  }}
                                >
                                  <Text style={{ color: "white", fontSize: 12, textAlign: "center" }}>
                                    {getPhotoTitles(selectedTicket)[index] || `Foto ${index + 1}`}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            ))}
                        </View>
                      </ScrollView>
                    )}
                  </View>

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

                  {/* Pada UI detail tiket, tampilkan summary foto pending/failed */}
                  {/* <View style={{ marginVertical: 16 }}>
                    {(() => {
                      const summary = getPhotoSummary(selectedTicket.ticket_id);
                      return (
                        <View style={{ marginBottom: 8 }}>
                          <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>
                            Foto gagal upload: {summary.failed}
                          </Text>
                          <Text style={{ color: '#10b981', fontWeight: 'bold' }}>
                            Foto berhasil upload: {summary.success}
                          </Text>
                        </View>
                      );
                    })()}
                    {isSyncing && (
                      <View style={{ alignItems: 'center', marginTop: 8 }}>
                        <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: 'bold' }}>
                          Jangan tutup aplikasi atau pindah halaman selama proses sinkronisasi!
                        </Text>
                        <Text style={{ color: '#6b7280', fontSize: 12 }}>
                          Proses ini tidak bisa dihentikan. Estimasi waktu tergantung jumlah foto dan kecepatan internet.
                        </Text>
                      </View>
                    )}
                  </View> */}
                </View>
              )}

              {/* Additional Info Button */}
              {selectedTicket?.additional_info && (
                <View style={{ marginBottom: 16 }}>
                  <TouchableOpacity
                    onPress={() => setShowAdditionalInfo((prev) => !prev)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: '#f3f4f6',
                      borderRadius: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      marginBottom: showAdditionalInfo ? 12 : 0,
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontWeight: 'bold', color: '#374151', fontSize: 16 }}>Informasi Tambahan</Text>
                    <Ionicons name={showAdditionalInfo ? 'chevron-up' : 'chevron-down'} size={22} color="#374151" />
                  </TouchableOpacity>
                  {showAdditionalInfo && (
                    <View style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 12, marginTop: 2 }}>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                        {Object.entries(selectedTicket.additional_info).map(([key, value], idx) => (
                          <View key={key} style={{ width: '50%', paddingVertical: 4, paddingHorizontal: 6 }}>
                            <Text style={{ color: '#6b7280', fontWeight: 'bold', fontSize: 13 }}>{key}</Text>
                            <Text style={{ color: '#222', fontSize: 14 }}>{String(value)}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Download PDF Button */}
              <TouchableOpacity
                className="flex flex-row items-center justify-center p-3 border border-blue-500 rounded-lg gap-x-2"
                style={{ marginBottom: 16, marginTop: 12 }}
                onPress={() => {
                  Linking.openURL(`${BASE_URL2}/admin/tickets/pdf/${selectedTicket?.ticket_id}/${selectedTicket?.user_id}/${selectedTicket?.geofence_id}`);
                }}
              >
                <Text className="font-medium text-blue-500">Unduh PDF</Text>
                <Ionicons name="document-outline" size={18} color="#3B82F6" />
              </TouchableOpacity>
            </ScrollView>
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

      {/* Modal Preview Sinkronisasi */}
      <SyncPreviewModal
        visible={isPreviewModalVisible}
        onClose={() => setIsPreviewModalVisible(false)}
        syncableTickets={syncableTickets}
        selectedTickets={selectedTicketsToSync}
        onSelectTicket={handleToggleTicket}
        onSelectAll={handleSelectAllTickets}
        onSync={handleSyncSelectedTickets}
        geofenceLookup={geofenceLookup}
      />

      {/* Modal Progres Sinkronisasi */}
      <SyncProgressModal
        visible={isProgressModalVisible}
        progressState={progressState}
        syncResultSummary={syncResultSummary}
        onClose={() => { setIsProgressModalVisible(false); setSyncResultSummary(null); }}
      />
    </View >
  );
};

const TicketItem = React.memo(({
  ticket,
  geofenceLookup,
  handleTicketPress,
  isAnyTicketInProgress,
  selectedTicketId,
  selectTicket,
  index,
  mostRecentOnProgressId
}: {
  ticket: Ticket;
  geofenceLookup: Record<string, Geofence>;
  handleTicketPress: (ticket: Ticket) => void;
  isAnyTicketInProgress: boolean;
  selectedTicketId: string | null;
  selectTicket: (ticket: Ticket) => Promise<void>;
  index: number;
  mostRecentOnProgressId?: string | null;
}) => {
  const navigation = useNavigation<any>();
  const userData = useSelector((state: RootState) => state.user);
  const geofenceItem = geofenceLookup[ticket.geofence_id];
  const geofenceDescription = geofenceItem?.description || 'Loading location...';
  const [continueDisabled, setContinueDisabled] = useState(false);

  // Function to get color based on ticket type
  const getTicketTypeColor = (ticketType: string) => {
    switch (ticketType) {
      case 'CM Visit':
      case 'VTI':
        return '#4F46E5'; // Indigo
      case 'Installation':
        return '#0EA5E9'; // Sky blue
      case 'PM':
        return '#10B981'; // Green
      case 'Pull Out':
        return '#F59E0B'; // Amber
      case 'Replacement':
        return '#EF4444'; // Red
      default:
        return '#6B7280'; // Gray
    }
  };

  // Badge color and label for validation_status
  let validationBadge = null;
  if (index === 2) {
    if (ticket.validation_status === "validated") {
      validationBadge = (
        <View style={{ backgroundColor: "#10B981", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start", marginTop: 4 }}>
          <Text style={{ color: "white", fontSize: 12, fontWeight: "bold" }}>Tervalidasi</Text>
        </View>
      );
    } else if (ticket.validation_status === "hold") {
      validationBadge = (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
          <View style={{ backgroundColor: "#F59E42", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
            <Text style={{ color: "white", fontSize: 12, fontWeight: "bold" }}>Hold</Text>
          </View>
          {ticket.hold_noted ? (
            <View style={{ marginLeft: 8 }}>
              <Text style={{ color: "#222", fontSize: 12 }}>{ticket.hold_noted}</Text>
            </View>
          ) : null}
        </View>
      );
    } else {
      validationBadge = (
        <View style={{ backgroundColor: "#6B7280", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start", marginTop: 4 }}>
          <Text style={{ color: "white", fontSize: 12, fontWeight: "bold" }}>Belum divalidasi</Text>
        </View>
      );
    }
  }

  // Format dates once
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds} WIB`;
  };

  const createdAtFormatted = formatDate(ticket.created_at);
  const updatedAtFormatted = formatDate(ticket.updated_at);

  // Handler for continuing stuck ticket
  const handleContinueTicket = async () => {
    Alert.alert(
      'Lanjutkan Tiket',
      'Apakah Anda ingin melanjutkan pengerjaan tiket ini?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya',
          style: 'default',
          onPress: async () => {
            setContinueDisabled(true);
            try {
              await AsyncStorage.setItem('selectedTicket', JSON.stringify(ticket));
              // Use updated_at as start time for stopwatch
              if (ticket.updated_at) {
                const startTime = new Date(ticket.updated_at).getTime();
                await AsyncStorage.setItem('startTime', startTime.toString());
                console.log(`Melanjutkan tiket ${ticket.ticket_id} dengan start time: ${startTime}`);
              }
              // Tambahkan ke offline queue jika offline
              const state = await NetInfo.fetch();
              if (!state.isConnected) {
                await enqueueTicketAction({
                  type: 'start', // Gunakan 'start' karena queue hanya mengenal start/stop/cancel
                  ticketId: ticket.ticket_id,
                  data: {
                    user_id: ticket.user_id,
                    username: userData?.username || '',
                    description: ticket.description || '',
                    geofence_id: ticket.geofence_id,
                    geofence_tag: geofenceItem?.tag || '',
                    started_location: geofenceItem?.coordinates || [0, 0],
                    started_at: ticket.updated_at,
                  },
                  createdAt: Date.now(),
                });
              }
              navigation.navigate('Main');
            } catch (error) {
              alert('Gagal melanjutkan tiket. Silakan coba lagi.');
              setContinueDisabled(false);
            }
          }
        }
      ]
    );
  };

  return (
    <TouchableOpacity
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
        {/* Badge for most recent on_progress ticket */}
        {index === 1 && mostRecentOnProgressId === ticket.ticket_id && (
          <View style={{ position: 'absolute', top: 0, right: 0, backgroundColor: '#3B82F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, zIndex: 10 }}>
            <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>Terbaru</Text>
          </View>
        )}
        {/* Ticket Type Badge */}
        {ticket.additional_info?.tipe_tiket && (
          <View style={{
            position: 'absolute',
            top: 0,
            right: index === 1 && mostRecentOnProgressId === ticket.ticket_id ? 75 : 0,
            backgroundColor: getTicketTypeColor(ticket.additional_info.tipe_tiket),
            borderTopRightRadius: (index === 1 && mostRecentOnProgressId === ticket.ticket_id) ? 8 : 0,
            borderBottomLeftRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
            zIndex: 10
          }}>
            <Text style={{ color: 'white', fontSize: 11, fontWeight: 'bold' }}>
              {ticket.additional_info.tipe_tiket}
            </Text>
          </View>
        )}
        <View style={{ marginTop: 10 }}>
          <Text style={{ fontWeight: "medium", color: "#3B82F6" }}>{ticket.ticket_id}</Text>
          <Text style={{ fontWeight: "bold" }}>{ticket.description}</Text>
          <Text style={{ fontWeight: "500", color: "#4B5563" }}>
            {geofenceDescription}
          </Text>
          <Text style={{ fontWeight: "500" }}>MID: {ticket.additional_info?.mid || '-'}</Text>
          <Text style={{ fontWeight: "500" }}>TID: {ticket.additional_info?.tid || '-'}</Text>
          <Text style={{ fontWeight: "500" }}>EDC Service: {ticket.additional_info?.edc_service || '-'}</Text>
          <Text style={{ color: "gray" }}>
            Dibuat: {createdAtFormatted}
          </Text>
          {(index === 1 || index === 3) && (
            <Text style={{ color: "gray" }}>
              Diperbarui: {updatedAtFormatted}
            </Text>
          )}
          {index === 2 && (
            <Text style={{ color: "gray" }}>
              Selesai: {updatedAtFormatted}
            </Text>
          )}
          {/* Validation Status Badge */}
          {validationBadge}
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
          {/* Lanjutkan Tiket button for stuck on_progress tickets */}
          {ticket.status === 'on_progress' && (
            <>
              <TouchableOpacity
                onPress={handleContinueTicket}
                style={{
                  backgroundColor: '#f59e42',
                  padding: 8,
                  borderRadius: 4,
                  marginTop: 8,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  opacity: continueDisabled ? 0.6 : 1,
                }}
                disabled={continueDisabled}
              >
                <Ionicons name="play" size={16} color="white" style={{ marginRight: 4 }} />
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
                  Lanjutkan Tiket
                </Text>
              </TouchableOpacity>
              <Text className="text-sm text-center text-gray-400">
                Pastikan tiket belum diperbaiki oleh Admin
              </Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default TicketsScreen;
