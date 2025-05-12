import moment from "moment-timezone";
import { RootState } from '../store';
import { useSelector } from 'react-redux';
import { Geofence, Ticket } from '../types';
import LottieView from 'lottie-react-native';
import { Picker } from '@react-native-picker/picker';
import NetInfo from '@react-native-community/netinfo';
import { getCurrentPositionAsync } from 'expo-location';
import { RadioButton, Checkbox } from 'react-native-paper';
import BackgroundJob from 'react-native-background-actions';
import { requestPermissionsAsync } from 'expo-media-library';
import { startUploadService } from "../utils/backgroundUploader";
// import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import MultiPhasePhotoCapture from "../components/MultiPhasePhotoCapture";
import { getTicketsWithGeofences, updateTicketExtras } from '../api/tickets';
import { log as handleLog, error as handleError } from '../utils/logHandler';
import { clearLocationCache } from "../components/ImageTimestampAndLocation";
import { cancelTrip, startBackgroundTracking, stopBackgroundTracking } from "../utils/radar";
import { View, Alert, Text, Modal, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, TextInput, Platform } from "react-native";

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Tickets: undefined;
  Profile: undefined;
  Settings: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "Main">;

const MainScreen: React.FC<Props> = ({ navigation }) => {
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [timestamp, setTimestamp] = useState(moment().tz("Asia/Jakarta").format("DD MMM YYYY HH:mm:ss"));
  const [tracking, setTracking] = useState(false);
  const [time, setTime] = useState(0);  // To store the time in seconds
  const [multiPhasePhotoModalVisible, setMultiPhasePhotoModalVisible] = useState(false); // For multi-phase photo capture
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [geofence, setGeofence] = useState<Geofence[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [additionalInfoModalVisible, setAdditionalInfoModalVisible] = useState(false);
  const [ticketExtrasModalVisible, setTicketExtrasModalVisible] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [currentTicketID, setCurrentTicketID] = useState<string | null>(null);
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);
  const [isSubmittingTicketExtras, setIsSubmittingTicketExtras] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  // const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  // const [currentDateField, setCurrentDateField] = useState<string>('');

  // Get user data from Redux store
  const userData = useSelector((state: RootState) => state.user);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // AsyncStorage.removeItem("uploadQueue");
    // setIsPhotoProcessed(false);
    const init = async () => {
      // if (BackgroundJob.isRunning()) {
      //   await stopUploadService();
      // }
      // if (!BackgroundJob.isRunning()) {
      //   await startUploadService();
      // }
      try {
        const queue = await AsyncStorage.getItem('uploadQueue');
        const isRunning = BackgroundJob.isRunning();
        handleLog(`Background service status: ${isRunning}`);
        if (!isRunning && queue && JSON.parse(queue).length > 0) {
          try {
            await startUploadService();
            handleLog('Starting background service...');
          } catch (error) {
            handleError(`Gagal memulai BackgroundJob: ${error}`);
          }
        }
      } catch (error: any) {
        handleError(`Init error: ${error}`);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (selectedTicket?.geofence_id) {
      const geofenceData = geofence.find((t) => t.external_id === selectedTicket.geofence_id);
      if (geofenceData && geofenceData.coordinates) {
        const [longitude, latitude] = geofenceData.coordinates;
        fetchAddressFromCoordinates(latitude, longitude);
      }
    }
  }, [selectedTicket, geofence]);

  // NEW optimized function that fetches tickets WITH their geofence data in one query
  const fetchTicketsWithGeofences = useCallback(async () => {
    try {
      if (!userData?.user_id) {
        handleError("User data is missing");
        return;
      }

      const assignedTicketsWithGeofences = await getTicketsWithGeofences(userData.user_id, 'assigned');
      if (assignedTicketsWithGeofences.length > 0) {
        const ticketsData = assignedTicketsWithGeofences.map(item => {
          const { geofence_data, ...ticketOnly } = item;
          return ticketOnly;
        });
        const geofencesData = assignedTicketsWithGeofences
          .filter(item => item.geofence_data) // Only include tickets that have geofence data
          .map(item => item.geofence_data);
        setTickets(ticketsData);
        setGeofence(geofencesData);
        handleLog(`✅ Optimized fetch: ${ticketsData.length} tickets with ${geofencesData.length} geofences`);
      } else {
        handleLog("No assigned tickets found");
      }
    } catch (error: any) {
      handleError(`Error in optimized fetch: ${error.message}`);
    }
  }, [userData]);

  // Fetch tickets using the optimized method
  useEffect(() => {
    fetchTicketsWithGeofences();
  }, [fetchTicketsWithGeofences]);

  // Handle pull-to-refresh with optimized approach
  const onRefresh = async () => {
    setIsRefreshing(true);
    setSelectedTicket(null);
    setCurrentTicketID(null);
    await fetchTicketsWithGeofences();
    setIsRefreshing(false);
  };

  // Handle Start Tracking (Start Trip)
  const handleStart = async () => {
    if (!selectedTicket) {
      Alert.alert("Tidak ada tiket yg dipilih", "Silakan pilih tiket sebelum memulai pekerjaan.");
      return;
    }
    if (!geofence || geofence.length === 0) {
      handleError("Data geofence belum siap. Proses dibatalkan.");
      return;
    }

    try {
      const startTime = Date.now();
      await AsyncStorage.setItem("startTime", startTime.toString());
      await AsyncStorage.setItem("selectedTicket", JSON.stringify(selectedTicket));
      await startBackgroundTracking(  // Start Radar trip tracking
        userData?.user_id || '',
        userData?.username || '',
        selectedTicket.ticket_id,
        selectedTicket.description,
        selectedTicket.geofence_id,
        geofence.find((g) => g.external_id === selectedTicket.geofence_id)?.tag || ''
      );
      handleLog('Trip started');
      setTracking(true);
    } catch (error: any) {
      handleError(`Error starting trip: ${error}`);
      Alert.alert("Failed to start tracking", error.message);
    }
  };

  const handleCompleteTrip = async () => {
    setIsCompleting(true);
    const ticket_id = currentTicketID || selectedTicket?.ticket_id;
    if (!ticket_id || typeof ticket_id !== 'string') {
      handleError('Ticket ID is not valid');
      Alert.alert("Tiket Tidak Ditemukan", "Tidak ada tiket yang dipilih.");
      setIsCompleting(false);
      return;
    }

    try {
      const { status } = await requestPermissionsAsync();
      if (status !== 'granted') {
        handleError('Izin lokasi tidak diberikan');
        setIsCompleting(false);
        return;
      }
      const location = await getCurrentPositionAsync({});
      setTimestamp(moment().tz("Asia/Jakarta").format("DD MMM YYYY HH:mm:ss"));
      clearLocationCache();
      setCurrentLocation(location);
      setMultiPhasePhotoModalVisible(true);
    } catch (error) {
      handleError(`Error in handleCompleteTrip: ${error}`);
      setIsCompleting(false);
      Alert.alert("Error", "Terjadi kesalahan saat mempersiapkan pengambilan foto. Silakan coba lagi.");
    }
  };

  // Handle Cancel Tracking (Cancel Trip)
  const handleCancel = async () => {
    try {
      if (selectedTicket?.ticket_id) {
        await cancelTrip(selectedTicket.ticket_id); // Cancel Radar trip tracking
        await AsyncStorage.removeItem("startTime"); // Clear AsyncStorage
        await AsyncStorage.removeItem("selectedTicket");
        setTracking(false); // Reset state
        setSelectedTicket(null);
        setTime(0);
        handleLog('Trip canceled');
        clearLocationCache();
        onRefresh();
      }
    } catch (error: any) {
      handleError(`Error canceling trip: ${error}`);
    }
  };

  const handleStartWithConfirmation = () => {
    if (!selectedTicket) {
      handleError('No ticket selected');
      Alert.alert("Tidak ada tiket yg dipilih", "Silakan pilih tiket sebelum memulai pekerjaan.");
      return;
    }
    setIsConfirmationVisible(true);
  };

  const handleCompletetWithConfirmation = () => {
    Alert.alert(
      "Konfirmasi Selesai",
      "Apakah Anda yakin ingin menyelesaikan pekerjaan?",
      [
        {
          text: "Batal",
          style: "cancel",
        },
        {
          text: "Ya",
          onPress: () => handleCompleteTrip(),
        },
      ]
    );
  };

  const handleCanceltWithConfirmation = () => {
    Alert.alert(
      "Konfirmasi Pembatalan",
      "Apakah Anda yakin ingin membatalkan pekerjaan?",
      [
        {
          text: "Batal",
          style: "cancel",
        },
        {
          text: "Ya",
          onPress: () => handleCancel(),
        },
      ]
    );
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (tracking) {
      interval = setInterval(async () => {
        try {
          const storedStartTime = await AsyncStorage.getItem("startTime");
          if (storedStartTime) {
            const startTime = parseInt(storedStartTime, 10);
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            setTime(elapsed);
          }
        } catch (error: any) {
          handleError(`Error updating time: ${error}`);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval); // Clear interval when component unmounts
    };
  }, [tracking]);

  useEffect(() => {
    const loadTrackingData = async () => {
      try {
        const storedStartTime = await AsyncStorage.getItem("startTime");
        const storedTicket = await AsyncStorage.getItem("selectedTicket");
        if (storedStartTime && storedTicket) {
          const startTime = parseInt(storedStartTime, 10);
          const elapsed = Math.floor((Date.now() - startTime) / 1000); // Time elapsed in seconds
          setTime(elapsed);
          setSelectedTicket(JSON.parse(storedTicket));
          setTracking(true);
        } else if (storedTicket) {
          setSelectedTicket(JSON.parse(storedTicket));
          handleLog("Tiket dipilih dari halaman Tiket");
        }
      } catch (error: any) {
        handleError(`Error loading tracking data: ${error}`);
      }
    };
    loadTrackingData();
    const unsubscribeFocus = navigation.addListener('focus', () => {
      loadTrackingData();
    });
    return () => {
      unsubscribeFocus();
    };
  }, []);

  // Format time as HH:MM:SS
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Initialize form data when selected ticket changes
  useEffect(() => {
    if (selectedTicket?.additional_info) {
      setFormData(prevData => ({
        ...prevData,
        sn_edc: selectedTicket.additional_info?.sn_edc || prevData.sn_edc,
        tid_mti: selectedTicket.additional_info?.tid || prevData.tid_mti,
        tid_member_bank: prevData.tid_member_bank,
        mid_mti: selectedTicket.additional_info?.mid || prevData.mid_mti,
        mid_member_bank: prevData.mid_member_bank,
        sim_card: selectedTicket.additional_info?.sn_sim_card || prevData.sim_card,
        sam_card: selectedTicket.additional_info?.sn_sam_card || prevData.sam_card,
        edc_description: prevData.edc_description,
        edc_notes: selectedTicket.additional_info?.noted || prevData.edc_notes,
        edc_cleaning: prevData.edc_cleaning,
        edc_problem: prevData.edc_problem,
        started_on: prevData.started_on,
        vendor_code: "MDM",
        task: selectedTicket.description || prevData.task,
        thermal_supply: prevData.thermal_supply,
        com_line: selectedTicket.additional_info?.connection_type || prevData.com_line,
        profile_sticker: prevData.profile_sticker,
        base_adaptor: prevData.base_adaptor,
        settlement: prevData.settlement,
        signal_bar: selectedTicket.additional_info?.signal_bar || prevData.signal_bar,
        signal_type: selectedTicket.additional_info?.signal_type || prevData.signal_type,
        edc_condition: selectedTicket.additional_info?.edc_condition || prevData.edc_condition,
        merchant_name: prevData.merchant_name,
        merchant_address: prevData.merchant_address,
        merchant_location: prevData.merchant_location,
        merchant_city: prevData.merchant_city,
        pic_name: selectedTicket.additional_info?.contact_person_merchant || prevData.pic_name,
        pic_phone: selectedTicket.additional_info?.phone_merchant || prevData.pic_phone,
        member_bank_category: prevData.member_bank_category,
        edc_priority: selectedTicket.additional_info?.priority_edc || prevData.edc_priority,
        edc_count: prevData.edc_count,
        thermal_stock: prevData.thermal_stock,
        manual_book: prevData.manual_book,
        merchant_condition: selectedTicket.additional_info?.merchant_condition || prevData.merchant_condition,
        merchant_comment: selectedTicket.additional_info?.merchant_comment || prevData.merchant_comment,
        training_trx_qr: prevData.training_trx_qr,
        training_trx_prepaid: prevData.training_trx_prepaid,
        training_trx_credit: prevData.training_trx_credit,
        training_trx_debit: prevData.training_trx_debit,
        usual_edc: selectedTicket.additional_info?.edc_yang_sering_digunakan || prevData.usual_edc,
        other_edc: selectedTicket.additional_info?.edc_bank_lainnya || prevData.other_edc,
        merchant_request: selectedTicket.additional_info?.merchant_request || prevData.merchant_request,
        promo_material: selectedTicket.additional_info?.promo_matrial_ || prevData.promo_material,
        case_remaks: selectedTicket.additional_info?.case_remaks || prevData.case_remaks,
      }));
    }
  }, [selectedTicket]);

  const [formData, setFormData] = useState({
    // EDC DETAILS
    sn_edc: "",
    tid_mti: "",
    tid_member_bank: "",
    mid_mti: "",
    mid_member_bank: "",
    sim_card: "",
    sam_card: "",
    edc_description: "",
    edc_notes: "",

    // ACTIVITIES & TASKS
    edc_cleaning: false,
    edc_problem: false,
    started_on: "",
    vendor_code: "MDM",
    task: "",
    thermal_supply: 0,

    // EDC DEVICE INFO
    com_line: "",
    profile_sticker: false,
    base_adaptor: false,
    settlement: false,
    signal_bar: "",
    signal_type: "",
    edc_condition: "",

    // MERCHANT DETAILS
    merchant_name: "",
    merchant_address: "",
    merchant_location: "",
    merchant_city: "",
    pic_name: "",
    pic_phone: "0",
    member_bank_category: "",
    edc_priority: "",
    edc_count: 1,
    thermal_stock: 0,
    manual_book: false,
    merchant_condition: "",
    merchant_comment: "",
    merchant_eligibility: "",
    edc_active_trx: false,
    no_tel_ty_pic: false,

    // TANDA EDC RUSAK
    kondisi_edc_baik: true,
    masalah_baterai: false,
    masalah_layar: false,
    masalah_tombol: false,
    masalah_print: false,
    edc_restart: false,
    masalah_fisik: false,
    masalah_port_charger: false,
    masalah_card_reader: false,

    // KONDISI MERCHANT 3 BULAN KE DEPAN
    merchant_normal: true,
    merchant_tutup_sementara: false,
    merchant_tutup_permanen: false,
    merchant_renovasi: false,
    merchant_pindah_lokasi: false,
    merchant_tutup_sementara_date: "",
    merchant_tutup_permanen_date: "",
    merchant_renovasi_date: "",
    merchant_pindah_lokasi_date: "",

    // TRAINING DETAILS
    training_trx_qr: false,
    training_trx_prepaid: false,
    training_trx_credit: false,
    training_trx_debit: false,
    sale_void_settlement_logon: false,
    installment: false,
    audit_report: false,
    top_up: false,
    redeem_point: false,
    cardver_preauth_offline: false,
    manual_key_in: false,
    mini_atm: false,
    fare_nonfare: false,
    dsc_download_bin: false,
    first_level_maintenance: false,
    penyimpanan_struk_trx: false,

    // OTHER DETAILS
    usual_edc: "",
    other_edc: "",
    merchant_request: "",
    promo_material: "",
    case_remaks: "",
  });

  // Function untuk mengupdate data form
  const handleInputChangeTicketExtras = (field: any, value: any) => {
    let processedValue = value;

    // Handle numeric fields
    const numericFields = ['thermal_supply', 'thermal_stock', 'edc_count'];
    if (numericFields.includes(field)) {
      processedValue = value === "" ? 0 : Number(value);
    }

    // Handle boolean fields
    const booleanFields = ['edc_cleaning', 'edc_problem', 'profile_sticker',
      'base_adaptor', 'settlement', 'manual_book', 'training_trx_qr',
      'training_trx_prepaid', 'training_trx_credit', 'training_trx_debit'];

    if (booleanFields.includes(field)) {
      processedValue = Boolean(value);
    }

    setFormData(prev => ({ ...prev, [field]: processedValue }));
  };

  const handleSubmitTicketExtras = async () => {
    setIsSubmittingTicketExtras(true);
    try {
      // Convert date strings from dd-mm-yyyy to ISO format with Jakarta timezone (GMT+7)
      const convertDateToISOWithJakartaTZ = (dateStr: string) => {
        if (!dateStr || dateStr.trim() === '') return '';
        const dateParts = dateStr.split('-');
        if (dateParts.length !== 3) return '';
        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const year = parseInt(dateParts[2], 10);
        return moment.tz(`${year}-${month + 1}-${day}`, 'YYYY-MM-DD', 'Asia/Jakarta').toISOString();
      };

      const processedData = {
        ...formData,
        merchant_location: formData.merchant_location ? formData.merchant_location.split(", ").map(Number) : [],
        started_on: selectedTicket?.updated_at ? new Date(selectedTicket.updated_at).toISOString() : new Date().toISOString(),
        merchant_tutup_sementara_date: formData.merchant_tutup_sementara && formData.merchant_tutup_sementara_date ?
          convertDateToISOWithJakartaTZ(formData.merchant_tutup_sementara_date) : '',
        merchant_tutup_permanen_date: formData.merchant_tutup_permanen && formData.merchant_tutup_permanen_date ?
          convertDateToISOWithJakartaTZ(formData.merchant_tutup_permanen_date) : '',
        merchant_renovasi_date: formData.merchant_renovasi && formData.merchant_renovasi_date ?
          convertDateToISOWithJakartaTZ(formData.merchant_renovasi_date) : '',
        merchant_pindah_lokasi_date: formData.merchant_pindah_lokasi && formData.merchant_pindah_lokasi_date ?
          convertDateToISOWithJakartaTZ(formData.merchant_pindah_lokasi_date) : ''
      }

      await updateTicketExtras(selectedTicket?.ticket_id || "", processedData);
      clearLocationCache();

      setTimeout(() => {
        // jangan ditukar
        setIsSubmittingTicketExtras(false);
        setTicketExtrasModalVisible(false);
        alert("Data berhasil disimpan! Tiket telah ditandai selesai.");
      }, 1000);
      // Reset states
      setTracking(false);
      setTime(0);
      setCurrentLocation(null);
      setIsCompleting(false);
      setSelectedTicket(null);

      // Clear storage
      await AsyncStorage.removeItem("selectedTicket");
      await AsyncStorage.removeItem("startTime");
      setFormData({
        // EDC DETAILS
        sn_edc: "",
        tid_mti: "",
        tid_member_bank: "",
        mid_mti: "",
        mid_member_bank: "",
        sim_card: "",
        sam_card: "",
        edc_description: "",
        edc_notes: "",

        // ACTIVITIES & TASKS
        edc_cleaning: false,
        edc_problem: false,
        started_on: "",
        vendor_code: "MDM",
        task: "",
        thermal_supply: 0,

        // EDC DEVICE INFO
        com_line: "",
        profile_sticker: false,
        base_adaptor: false,
        settlement: false,
        signal_bar: "",
        signal_type: "",
        edc_condition: "",

        // MERCHANT DETAILS
        merchant_name: "",
        merchant_address: "",
        merchant_location: "",
        merchant_city: "",
        pic_name: "",
        pic_phone: "0",
        member_bank_category: "",
        edc_priority: "",
        edc_count: 1,
        thermal_stock: 0,
        manual_book: false,
        merchant_condition: "",
        merchant_comment: "",
        merchant_eligibility: "",
        edc_active_trx: false,
        no_tel_ty_pic: false,

        // TANDA EDC RUSAK
        kondisi_edc_baik: true,
        masalah_baterai: false,
        masalah_layar: false,
        masalah_tombol: false,
        masalah_print: false,
        edc_restart: false,
        masalah_fisik: false,
        masalah_port_charger: false,
        masalah_card_reader: false,

        // KONDISI MERCHANT 3 BULAN KE DEPAN
        merchant_normal: true,
        merchant_tutup_sementara: false,
        merchant_tutup_permanen: false,
        merchant_renovasi: false,
        merchant_pindah_lokasi: false,
        merchant_tutup_sementara_date: "",
        merchant_tutup_permanen_date: "",
        merchant_renovasi_date: "",
        merchant_pindah_lokasi_date: "",

        // TRAINING DETAILS
        training_trx_qr: false,
        training_trx_prepaid: false,
        training_trx_credit: false,
        training_trx_debit: false,
        sale_void_settlement_logon: false,
        installment: false,
        audit_report: false,
        top_up: false,
        redeem_point: false,
        cardver_preauth_offline: false,
        manual_key_in: false,
        mini_atm: false,
        fare_nonfare: false,
        dsc_download_bin: false,
        first_level_maintenance: false,
        penyimpanan_struk_trx: false,

        // OTHER DETAILS
        usual_edc: "",
        other_edc: "",
        merchant_request: "",
        promo_material: "",
        case_remaks: "",
      });
      onRefresh();
    } catch (error) {
      handleError(`Error submitting ticket extras: ${error}`);
      setIsSubmittingTicketExtras(false);
      alert("Terjadi kesalahan!");
    }
  };

  const fetchAddressFromCoordinates = async (latitude: any, longitude: any) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36' } }
      );
      const data = await response.json();
      if (data && data.address) {
        const alamat = data.display_name || "Alamat tidak ditemukan";
        const kota = data.address.city || data.address.town || data.address.village || "Kota tidak ditemukan";
        setFormData((prevState) => ({
          ...prevState,
          merchant_address: alamat,
          merchant_city: kota,
          merchant_location: `${longitude}, ${latitude}`,
          merchant_name: geofence.find((g) => g.external_id === selectedTicket?.geofence_id)?.description || "-",
          task: selectedTicket?.description || "-",
        }));
      }
    } catch (error: any) {
      handleError(`Error fetching address: ${error}`);
    }
  };

  const geofenceLookup = useMemo(() => {
    const lookup: { [key: string]: Geofence } = {};
    geofence.forEach((g) => {
      lookup[g.external_id] = g;
    });
    return lookup;
  }, [geofence]);
  // const handleShowDatePicker = (fieldName: string) => {
  //   setCurrentDateField(fieldName);
  //   setShowDatePicker(true);
  // };

  // // Format date for display
  // const formatDateForDisplay = (isoString: string | undefined): string => {
  //   if (!isoString) return "YYYY-MM-DD";
  //   try {
  //     return moment(isoString)
  //       .tz("Asia/Jakarta")
  //       .format("DD MMM YYYY");
  //   } catch (error) {
  //     return "YYYY-MM-DD";
  //   }
  // };
  // const handleDateChange = (event: any, selectedDate?: Date) => {
  //   if (Platform.OS === 'android') {
  //     setShowDatePicker(false);
  //   }
  //   if (selectedDate) {
  //     const fieldToUpdate = currentDateField;
  //     const formattedDate = selectedDate.toISOString();
  //     handleInputChangeTicketExtras(fieldToUpdate, formattedDate);
  //   }
  //   if (Platform.OS === 'ios') {
  //     setTimeout(() => {
  //       setShowDatePicker(false);
  //     }, 200);
  //   }
  // };

  return (
    <ScrollView
      className='bg-[#f5f5f5] p-6 mt-4'
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={
        !tracking ? (
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      <View className="flex-row items-center justify-between w-full">
        <View className="flex items-start gap-y-1">
          <Text className="text-xl font-bold text-center">
            Halo, {userData?.username || "User"}
          </Text>
        </View>
      </View>

      {/* Internet Status Badge */}
      <View className="mt-4">
        <Text className={`text-sm font-bold text-center py-2 px-4 rounded-full ${isConnected ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {isConnected ? 'Koneksi Internet Stabil' : 'Tidak Ada Koneksi Internet'}
        </Text>
      </View>

      {/* Tickets Dropdown */}
      <View className="mt-4">
        <Text className="mb-2 text-lg font-bold">Pilih Tiket yang Tersedia</Text>
        <View style={{ maxHeight: 100, overflow: 'hidden' }}>
          <ScrollView>
            <Picker
              mode="dialog"
              selectedValue={selectedTicket?.id || null}
              onValueChange={(value: any) => {
                const ticket = tickets.find((t) => t.id === value);
                setSelectedTicket(ticket || null);
                setCurrentTicketID(ticket?.ticket_id || null);
              }}
              style={{ height: 50, backgroundColor: 'white', borderRadius: 8 }}
            >
              <Picker.Item label="Pilih tiket..." value={null} />
              {tickets
                .filter((ticket) => ticket.status === 'assigned')
                .map((ticket) => {
                  const geofence_obj = geofenceLookup[ticket.geofence_id];
                  const geofenceDescription = geofence_obj?.description || ticket.description;
                  // Truncate description to max 20 characters plus ellipsis
                  const truncatedDescription = geofenceDescription.length > 20
                    ? geofenceDescription.substring(0, 25) + '...'
                    : geofenceDescription;
                  return (
                    <Picker.Item
                      style={{ fontSize: 12 }}
                      key={ticket.id}
                      label={`${truncatedDescription} - ${ticket.additional_info?.tipe_tiket || ""} - TID: ${ticket.additional_info?.tid || ''}`}
                      value={ticket.id}
                    />
                  );
                })}
            </Picker>
          </ScrollView>
        </View>
      </View>

      {/* Ticket Extras Detail Modal */}
      <Modal
        visible={ticketExtrasModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setTicketExtrasModalVisible(false)}
      >
        <View className="items-center justify-center flex-1 px-4 bg-gray-900 bg-opacity-75">
          <View className="w-[350px] max-w-lg p-6 bg-white rounded-lg">
            <Text className="mb-2 text-xl font-bold text-center">Berita Acara</Text>
            <Text className="mb-4 text-sm text-center">Isilah formulir di bawah ini secara lengkap.</Text>

            <ScrollView style={{ maxHeight: 600 }} showsVerticalScrollIndicator={true} fadingEdgeLength={200} alwaysBounceVertical={true} bounces={true} persistentScrollbar={true}>
              {/* 1. EDC Detail */}
              <View>
                <Text className="mb-4 font-bold underline">1. Detail EDC</Text>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">SN EDC</Text>
                    <TextInput
                      value={
                        formData.sn_edc?.replace(
                          /^(\d+)(?:,(\d+))?E\+(\d+)$/,
                          (_: any, p1: any, p2: any, p3: any) => {
                            const baseNum = p2 ? `${p1}.${p2}` : p1;
                            const exponent = parseInt(p3, 10);
                            const fullNum = parseFloat(baseNum) * Math.pow(10, exponent);
                            return fullNum.toLocaleString('fullwide', { useGrouping: false });
                          }
                        ) || selectedTicket?.additional_info?.sn_edc?.replace(
                          /^(\d+)(?:,(\d+))?E\+(\d+)$/,
                          (_: any, p1: any, p2: any, p3: any) => {
                            const baseNum = p2 ? `${p1}.${p2}` : p1;
                            const exponent = parseInt(p3, 10);
                            const fullNum = parseFloat(baseNum) * Math.pow(10, exponent);
                            return fullNum.toLocaleString('fullwide', { useGrouping: false });
                          }
                        )
                      }
                      onChangeText={(text) => handleInputChangeTicketExtras("sn_edc", text)}
                      // placeholder="SN EDC"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">MID MTI</Text>
                    <TextInput
                      value={selectedTicket?.additional_info?.mid}
                      onChangeText={(text) => handleInputChangeTicketExtras("mid_mti", text)}
                      // placeholder="MID MTI"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">TID MTI</Text>
                    <TextInput
                      value={selectedTicket?.additional_info?.tid}
                      onChangeText={(text) => handleInputChangeTicketExtras("tid_mti", text)}
                      // placeholder="TID MTI"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                      editable={false}
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">SIM Card</Text>
                    <TextInput
                      value={
                        selectedTicket?.additional_info?.sn_sim_card?.replace(
                          /^(\d+)(?:,(\d+))?E\+(\d+)$/,
                          (_: any, p1: any, p2: any, p3: any) => {
                            const baseNum = p2 ? `${p1}.${p2}` : p1;
                            const exponent = parseInt(p3, 10);
                            const fullNum = parseFloat(baseNum) * Math.pow(10, exponent);
                            return fullNum.toLocaleString('fullwide', { useGrouping: false });
                          }
                        )
                      }
                      onChangeText={(text) => handleInputChangeTicketExtras("sim_card", text)}
                      // placeholder="SIM Card"
                      className="p-2 mt-2 text-xs bg-gray-200 border border-gray-300 rounded-md text-wrap"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">SAM Card</Text>
                    <TextInput
                      value={selectedTicket?.additional_info?.sn_sam_card}
                      onChangeText={(text) => handleInputChangeTicketExtras("sam_card", text)}
                      // placeholder="SAM Card"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                      editable={false}
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Keterangan</Text>
                    <TextInput
                      value={formData.edc_description}
                      onChangeText={(text) => handleInputChangeTicketExtras("edc_description", text)}
                      // placeholder="Keterangan"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Catatan/Notes</Text>
                    <TextInput
                      value={formData.edc_notes || selectedTicket?.additional_info?.noted}
                      onChangeText={(text) => handleInputChangeTicketExtras("edc_notes", text)}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
              </View>

              {/* 2. Aktivitas Pekerjaan */}
              <View>
                <Text className="mb-4 font-bold underline">2. Aktivitas Pekerjaan</Text>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">EDC Cleaning</Text>
                    <View className="flex-row justify-start">
                      <View className="flex-row items-center">
                        <RadioButton
                          value="true"
                          status={formData.edc_cleaning ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("edc_cleaning", true)}
                        />
                        <Text className="text-sm text-gray-600">Ya</Text>
                      </View>
                      <View className="flex-row items-center">
                        <RadioButton
                          value="false"
                          status={!formData.edc_cleaning ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("edc_cleaning", false)}
                        />
                        <Text className="text-sm text-gray-600">Tidak</Text>
                      </View>
                    </View>
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">EDC Problem</Text>
                    <View className="flex-row justify-start">
                      <View className="flex-row items-center">
                        <RadioButton
                          value="true"
                          status={formData.edc_problem ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("edc_problem", true)}
                        />
                        <Text className="text-sm text-gray-600">Ya</Text>
                      </View>
                      <View className="flex-row items-center">
                        <RadioButton
                          value="false"
                          status={!formData.edc_problem ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("edc_problem", false)}
                        />
                        <Text className="text-sm text-gray-600">Tidak</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Dimulai Pada</Text>
                    <TextInput
                      value={selectedTicket ? moment(selectedTicket.updated_at).format("DD/MM/YYYY, HH:mm") : ""}
                      onChangeText={(text) => handleInputChangeTicketExtras("started_on", text)}
                      // placeholder="Dimulai Pada"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Kode Vendor</Text>
                    <TextInput
                      value={formData.vendor_code}
                      onChangeText={(text) => handleInputChangeTicketExtras("vendor_code", text)}
                      // placeholder="Kode Vendor"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md"
                      editable={false}
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Pekerjaan</Text>
                    <TextInput
                      value={selectedTicket?.description}
                      onChangeText={(text) => handleInputChangeTicketExtras("task", text)}
                      // placeholder="Pekerjaan"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Thermal Supply</Text>
                    <TextInput
                      value={formData.thermal_supply.toString()}
                      onChangeText={(text) => handleInputChangeTicketExtras("thermal_supply", text)}
                      // placeholder="Thermal Supply"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              {/* 3. Informasi Device EDC */}
              <View>
                <Text className="mb-4 font-bold underline">3. Informasi Device EDC</Text>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">MID MTI</Text>
                    <TextInput
                      // value={formData.mid_mti}
                      value={selectedTicket?.additional_info?.mid}
                      onChangeText={(text) => handleInputChangeTicketExtras("mid_mti", text)}
                      // placeholder="MID MTI"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">MID Member Bank</Text>
                    <TextInput
                      value={formData.mid_member_bank}
                      onChangeText={(text) => handleInputChangeTicketExtras("mid_member_bank", text)}
                      // placeholder="MID Member Bank"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">TID MTI</Text>
                    <TextInput
                      value={selectedTicket?.additional_info?.tid}
                      onChangeText={(text) => handleInputChangeTicketExtras("tid_mti", text)}
                      // placeholder="TID MTI"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">TID Member Bank</Text>
                    <TextInput
                      value={formData.tid_member_bank}
                      onChangeText={(text) => handleInputChangeTicketExtras("tid_member_bank", text)}
                      // placeholder="TID Member Bank"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Com Line</Text>
                    <TextInput
                      value={formData.com_line || selectedTicket?.additional_info?.connection_type}
                      onChangeText={(text) => handleInputChangeTicketExtras("com_line", text)}
                      // placeholder="Com Line"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Profile Sticker</Text>
                    <View className="flex-row justify-start">
                      <View className="flex-row items-center">
                        <RadioButton
                          value="true"
                          status={formData.profile_sticker ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("profile_sticker", true)}
                        />
                        <Text className="text-sm text-gray-600">Ya</Text>
                      </View>
                      <View className="flex-row items-center">
                        <RadioButton
                          value="false"
                          status={!formData.profile_sticker ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("profile_sticker", false)}
                        />
                        <Text className="text-sm text-gray-600">Tidak</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Base Adaptor</Text>
                    <View className="flex-row justify-start">
                      <View className="flex-row items-center">
                        <RadioButton
                          value="true"
                          status={formData.base_adaptor ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("base_adaptor", true)}
                        />
                        <Text className="text-sm text-gray-600">Ya</Text>
                      </View>
                      <View className="flex-row items-center">
                        <RadioButton
                          value="false"
                          status={!formData.base_adaptor ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("base_adaptor", false)}
                        />
                        <Text className="text-sm text-gray-600">Tidak</Text>
                      </View>
                    </View>
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Settlement</Text>
                    <View className="flex-row justify-start">
                      <View className="flex-row items-center">
                        <RadioButton
                          value="true"
                          status={formData.settlement ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("settlement", true)}
                        />
                        <Text className="text-sm text-gray-600">Ya</Text>
                      </View>
                      <View className="flex-row items-center">
                        <RadioButton
                          value="false"
                          status={!formData.settlement ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("settlement", false)}
                        />
                        <Text className="text-sm text-gray-600">Tidak</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Signal Bar</Text>
                    <Picker
                      selectedValue={formData.signal_bar || selectedTicket?.additional_info?.signal_bar}
                      onValueChange={(value) => handleInputChangeTicketExtras("signal_bar", value)}
                      style={{ height: 50, backgroundColor: 'white', borderRadius: 8 }}
                    >
                      <Picker.Item label="Signal Bar..." value="" />
                      <Picker.Item label="1" value="1" />
                      <Picker.Item label="2" value="2" />
                      <Picker.Item label="3" value="3" />
                      <Picker.Item label="4" value="4" />
                    </Picker>
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Signal Type</Text>
                    <Picker
                      selectedValue={formData.signal_type || selectedTicket?.additional_info?.signal_type}
                      onValueChange={(value) => handleInputChangeTicketExtras("signal_type", value)}
                      style={{ height: 50, backgroundColor: 'white', borderRadius: 8 }}
                    >
                      <Picker.Item label="Signal Type..." value="" />
                      <Picker.Item label="3G" value="3G" />
                      <Picker.Item label="4G" value="4G" />
                      <Picker.Item label="5G" value="5G" />
                    </Picker>
                  </View>
                </View>

                <View className="flex-1 mb-4">
                  <Text className="text-sm text-gray-600">Kondisi EDC</Text>
                  <Picker
                    selectedValue={formData.edc_condition || selectedTicket?.additional_info?.edc_condition}
                    onValueChange={(value) => handleInputChangeTicketExtras("edc_condition", value)}
                    style={{ height: 50, backgroundColor: 'white', borderRadius: 8 }}
                  >
                    <Picker.Item style={{ fontSize: 12 }} label="Pilih kondisi EDC..." value="" />
                    <Picker.Item style={{ fontSize: 12 }} label="Kondisi EDC Baik" value="Kondisi EDC Baik" />
                    <Picker.Item style={{ fontSize: 12 }} label="Done Penarikan" value="Done Penarikan" />
                    <Picker.Item style={{ fontSize: 12 }} label="Done Pergantian" value="Done Pergantian" />
                    <Picker.Item style={{ fontSize: 12 }} label="EDC Berhasil Dipasang" value="EDC Berhasil Dipasang" />
                    <Picker.Item style={{ fontSize: 12 }} label="EDC Tidak Ada di Lokasi" value="EDC Tidak Ada di Lokasi" />
                    <Picker.Item style={{ fontSize: 12 }} label="Merchant Tutup Permanen" value="Merchant Tutup Permanen" />
                    <Picker.Item style={{ fontSize: 12 }} label="Merchant Tutup Sementara" value="Merchant Tutup Sementara" />
                    <Picker.Item style={{ fontSize: 12 }} label="EDC Disimpan" value="EDC Disimpan" />
                    <Picker.Item style={{ fontSize: 12 }} label="Jaringan Problem" value="Jaringan Problem" />
                    <Picker.Item style={{ fontSize: 12 }} label="Device Problem" value="Device Problem" />
                  </Picker>
                </View>
              </View>

              {/* 4. Informasi Merchant */}
              <View>
                <Text className="mb-4 font-bold underline">4. Informasi Merchant</Text>
                <View className="mb-4">
                  <Text className="text-sm text-gray-600">Nama Merchant/Agent</Text>
                  <TextInput
                    value={geofence.find((t) => t.external_id === selectedTicket?.geofence_id)?.description}
                    onChangeText={(text) => handleInputChangeTicketExtras("merchant_name", text)}
                    // placeholder="Nama Merchant/Agent"
                    multiline
                    numberOfLines={10}
                    textAlignVertical="top"
                    className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                    editable={false}
                  />
                </View>
                <View className="mb-4">
                  <Text className="text-sm text-gray-600">Alamat</Text>
                  <TextInput
                    value={formData.merchant_address}
                    onChangeText={(text) => handleInputChangeTicketExtras("merchant_address", text)}
                    // placeholder="Alamat"
                    multiline
                    numberOfLines={10}
                    textAlignVertical="top"
                    className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                    editable={false}

                  />
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Kota</Text>
                    <TextInput
                      value={formData.merchant_city}
                      onChangeText={(text) => handleInputChangeTicketExtras("merchant_city", text)}
                      // placeholder="Kota"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md"
                      editable={false}
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Lokasi</Text>
                    <TextInput
                      value={geofence.find((t) => t.external_id === selectedTicket?.geofence_id)?.coordinates?.join(", ")}
                      onChangeText={(text) => handleInputChangeTicketExtras("merchant_location", text)}
                      // placeholder="Lokasi"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md"
                      editable={false}
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Nama PIC</Text>
                    <TextInput
                      value={formData.pic_name || selectedTicket?.additional_info?.contact_person_merchant}
                      onChangeText={(text) => handleInputChangeTicketExtras("pic_name", text)}
                      // placeholder="Nama PIC"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">No. Telepon PIC</Text>
                    <TextInput
                      value={formData.pic_phone || selectedTicket?.additional_info?.phone_merchant}
                      onChangeText={(text) => handleInputChangeTicketExtras("pic_phone", text)}
                      // placeholder="No. Telepon PIC"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Kategori Member Bank</Text>
                    <TextInput
                      value={formData.member_bank_category || selectedTicket?.additional_info?.edc_service}
                      onChangeText={(text) => handleInputChangeTicketExtras("member_bank_category", text)}
                      // placeholder="Kategori Member Bank"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Prioritas EDC</Text>
                    <TextInput
                      // value={formData.edc_priority}
                      value={formData.edc_priority || selectedTicket?.additional_info?.priority_edc}
                      onChangeText={(text) => handleInputChangeTicketExtras("edc_priority", text)}
                      // placeholder="Prioritas EDC"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Jumlah Unit EDC</Text>
                    <TextInput
                      value={formData.edc_count.toLocaleString()}
                      onChangeText={(text) => handleInputChangeTicketExtras("edc_count", text)}
                      // placeholder="EDC (unit)"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                      keyboardType="numeric"
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Thermal Stock</Text>
                    <TextInput
                      value={formData.thermal_stock.toLocaleString()}
                      onChangeText={(text) => handleInputChangeTicketExtras("thermal_stock", text)}
                      // placeholder="Thermal Stock"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View className="mb-4">
                  <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                    <View className="flex-1 mb-4">
                      <Text className="text-sm text-gray-600">Manual Book</Text>
                      <View className="flex-row my-2 space-x-4">
                        <View className="flex-row items-center">
                          <RadioButton
                            value="true"
                            status={formData.manual_book ? "checked" : "unchecked"}
                            onPress={() => handleInputChangeTicketExtras("manual_book", true)}
                          />
                          <Text className="text-sm text-gray-600">Ya</Text>
                        </View>
                        <View className="flex-row items-center">
                          <RadioButton
                            value="false"
                            status={!formData.manual_book ? "checked" : "unchecked"}
                            onPress={() => handleInputChangeTicketExtras("manual_book", false)}
                          />
                          <Text className="text-sm text-gray-600">Tidak</Text>
                        </View>
                      </View>
                    </View>
                    <View className="flex-1 mb-4">
                      <Text className="text-sm text-gray-600">Kelayakan Merchant</Text>
                      <View className="flex-col mt-2 space-x-4">
                        <View className="flex-row items-center">
                          <RadioButton
                            value="true"
                            status={formData.merchant_eligibility ? "checked" : "unchecked"}
                            onPress={() => handleInputChangeTicketExtras("merchant_eligibility", true)}
                          />
                          <Text className="text-sm text-gray-600">Layak</Text>
                        </View>
                        <View className="flex-row items-center">
                          <RadioButton
                            value="false"
                            status={!formData.merchant_eligibility ? "checked" : "unchecked"}
                            onPress={() => handleInputChangeTicketExtras("merchant_eligibility", false)}
                          />
                          <Text className="text-sm text-gray-600">Tidak Layak</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                    <View className="flex-1 mb-4">
                      <Text className="text-sm text-gray-600">EDC Aktif Bertransaksi</Text>
                      <View className="flex-row my-2 space-x-4">
                        <View className="flex-row items-center">
                          <RadioButton
                            value="true"
                            status={formData.edc_active_trx ? "checked" : "unchecked"}
                            onPress={() => handleInputChangeTicketExtras("edc_active_trx", true)}
                          />
                          <Text className="text-sm text-gray-600">Ya</Text>
                        </View>
                        <View className="flex-row items-center">
                          <RadioButton
                            value="false"
                            status={!formData.edc_active_trx ? "checked" : "unchecked"}
                            onPress={() => handleInputChangeTicketExtras("edc_active_trx", false)}
                          />
                          <Text className="text-sm text-gray-600">Tidak</Text>
                        </View>
                      </View>
                    </View>
                    <View className="flex-1 mb-4">
                      <Text className="text-sm text-gray-600">No Telepon TY dan No PIC Kawasan/TL</Text>
                      <View className="flex-row mt-2 space-x-4">
                        <View className="flex-row items-center">
                          <RadioButton
                            value="true"
                            status={formData.no_tel_ty_pic ? "checked" : "unchecked"}
                            onPress={() => handleInputChangeTicketExtras("no_tel_ty_pic", true)}
                          />
                          <Text className="text-sm text-gray-600">Ya</Text>
                        </View>
                        <View className="flex-row items-center">
                          <RadioButton
                            value="false"
                            status={!formData.no_tel_ty_pic ? "checked" : "unchecked"}
                            onPress={() => handleInputChangeTicketExtras("no_tel_ty_pic", false)}
                          />
                          <Text className="text-sm text-gray-600">Tidak</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View className="mt-4 mb-4">
                    <Text className="text-sm text-gray-600">Kondisi Merchant</Text>
                    <View className="flex-row mt-2 space-x-4">
                      <View className="flex-row items-center">
                        <RadioButton
                          value="Baik"
                          status={formData.merchant_condition === "Baik" || (!formData.merchant_condition && selectedTicket?.additional_info?.merchant_condition === "Baik") ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("merchant_condition", "Baik")}
                        />
                        <Text className="text-sm text-gray-600">Baik</Text>
                      </View>
                      <View className="flex-row items-center">
                        <RadioButton
                          value="Problem Non Teknis"
                          status={formData.merchant_condition === "Problem Non Teknis" || (!formData.merchant_condition && selectedTicket?.additional_info?.merchant_condition === "Problem Non Teknis") ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("merchant_condition", "Problem Non Teknis")}
                        />
                        <Text className="text-sm text-gray-600">Problem Non Teknis</Text>
                      </View>
                    </View>
                    <View className="flex-row mt-2 space-x-4">
                      <View className="flex-row items-center">
                        <RadioButton
                          value="Problem Teknis"
                          status={formData.merchant_condition === "Problem Teknis" || (!formData.merchant_condition && selectedTicket?.additional_info?.merchant_condition === "Problem Teknis") ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("merchant_condition", "Problem Teknis")}
                        />
                        <Text className="text-sm text-gray-600">Problem Teknis</Text>
                      </View>
                    </View>
                    <View className="flex-row flex-wrap mt-4 gap-x-4 gap-y-4">
                      <View className="flex-1 mb-4">
                        <Text className="text-sm text-gray-600">Komentar Merchant</Text>
                        <TextInput
                          value={formData.merchant_comment || selectedTicket?.additional_info?.merchant_comment}
                          onChangeText={(text) => handleInputChangeTicketExtras("merchant_comment", text)}
                          // placeholder="Komentar Merchant"
                          multiline
                          numberOfLines={3}
                          textAlignVertical="top"
                          className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                        />
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              {/* 5. Informasi Lainnya */}
              <View>
                <Text className="mb-4 font-bold underline">5. Informasi Lainnya</Text>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">EDC yang sering digunakan</Text>
                    <TextInput
                      value={formData.usual_edc || selectedTicket?.additional_info?.edc_yang_sering_digunakan}
                      onChangeText={(text) => handleInputChangeTicketExtras("usual_edc", text)}
                      // placeholder="EDC yang sering digunakan"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">EDC Lainnya</Text>
                    <TextInput
                      value={formData.other_edc || selectedTicket?.additional_info?.edc_bank_lainnya}
                      onChangeText={(text) => handleInputChangeTicketExtras("other_edc", text)}
                      // placeholder="EDC Lainnya"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Permintaan Merchant (Request)</Text>
                    <TextInput
                      value={formData.merchant_request || selectedTicket?.additional_info?.merchant_request}
                      onChangeText={(text) => handleInputChangeTicketExtras("merchant_request", text)}
                      // placeholder="Permintaan Merchant (Request)"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Promo Material</Text>
                    <TextInput
                      value={formData.promo_material || selectedTicket?.additional_info?.promo_matrial_}
                      onChangeText={(text) => handleInputChangeTicketExtras("promo_material", text)}
                      // placeholder="Promo Material"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
              </View>

              {/* 6. Tanda EDC Rusak */}
              <View className="mb-4 mr-4">
                <Text className="mb-4 font-bold underline">6. Tanda-tanda EDC Rusak</Text>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.kondisi_edc_baik ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("kondisi_edc_baik", !formData.kondisi_edc_baik)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Kondisi EDC baik</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.masalah_baterai ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("masalah_baterai", !formData.masalah_baterai)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Baterai drop</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.masalah_layar ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("masalah_layar", !formData.masalah_layar)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Layar EDC kedip-kedip/bergaris</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.masalah_tombol ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("masalah_tombol", !formData.masalah_tombol)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Tombol sudah lepas/keras/susah ditekan/tidak nampak angka</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.masalah_print ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("masalah_print", !formData.masalah_print)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Hasil print EDC kurang jelas</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.edc_restart ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("edc_restart", !formData.edc_restart)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">EDC sering restart</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.masalah_fisik ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("masalah_fisik", !formData.masalah_fisik)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Fisik tidak sempurna/rusak</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.masalah_port_charger ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("masalah_port_charger", !formData.masalah_port_charger)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Port charger EDC bermasalah (tidak ada aliran listrik masuk)</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.masalah_card_reader ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("masalah_card_reader", !formData.masalah_card_reader)}
                  />
                  <Text className="ml-2 text-sm text-gray-600 text-wrap">Card reader EDC tidak bisa membaca/sering gagal/no respon</Text>
                </View>
              </View>

              {/* 7. Kondisi Merchant 3 bulan ke depan */}
              <View className="mb-4">
                <Text className="mb-4 font-bold underline">7. Kondisi Merchant 3 bulan ke depan</Text>
                <View className="mb-4">
                  <Text className="text-sm text-gray-600">Pilih 1 kondisi merchant</Text>
                  <View className="flex-col mt-2 space-x-4">
                    {/* Merchant Normal */}
                    <View className="flex-row items-center">
                      <RadioButton
                        value="normal"
                        status={formData.merchant_normal ? "checked" : "unchecked"}
                        onPress={() => {
                          handleInputChangeTicketExtras("merchant_normal", true);
                          handleInputChangeTicketExtras("merchant_tutup_sementara", false);
                          handleInputChangeTicketExtras("merchant_tutup_permanen", false);
                          handleInputChangeTicketExtras("merchant_renovasi", false);
                          handleInputChangeTicketExtras("merchant_pindah_lokasi", false);
                          // Reset semua tanggal
                          handleInputChangeTicketExtras("merchant_tutup_sementara_date", "");
                          handleInputChangeTicketExtras("merchant_tutup_permanen_date", "");
                          handleInputChangeTicketExtras("merchant_renovasi_date", "");
                          handleInputChangeTicketExtras("merchant_pindah_lokasi_date", "");
                        }}
                      />
                      <Text className="text-sm text-gray-600">Merchant beroperasi normal</Text>
                    </View>

                    {/* Tutup Sementara */}
                    <View className="flex-row items-center">
                      <RadioButton
                        value="tutup_sementara"
                        status={formData.merchant_tutup_sementara ? "checked" : "unchecked"}
                        onPress={() => {
                          handleInputChangeTicketExtras("merchant_normal", false);
                          handleInputChangeTicketExtras("merchant_tutup_sementara", true);
                          handleInputChangeTicketExtras("merchant_tutup_permanen", false);
                          handleInputChangeTicketExtras("merchant_renovasi", false);
                          handleInputChangeTicketExtras("merchant_pindah_lokasi", false);
                          // Reset tanggal lainnya
                          handleInputChangeTicketExtras("merchant_tutup_permanen_date", "");
                          handleInputChangeTicketExtras("merchant_renovasi_date", "");
                          handleInputChangeTicketExtras("merchant_pindah_lokasi_date", "");
                        }}
                      />
                      <Text className="text-sm text-gray-600">Merchant akan tutup sementara</Text>
                    </View>
                    {formData.merchant_tutup_sementara && (
                      <View className="mt-2 ml-8">
                        <Text className="text-sm text-gray-600">Ketik Tanggal (format: dd-mm-yyyy)</Text>
                        <TextInput
                          value={formData.merchant_tutup_sementara_date || ""}
                          onChangeText={(text) => {
                            const validInput = /^(\d{0,2})([-]?)(\d{0,2})([-]?)(\d{0,4})$/.test(text);
                            if (validInput || text === "") {
                              setFormData((prevState) => ({
                                ...prevState,
                                merchant_tutup_sementara_date: text,
                              }));
                            }
                          }}
                          placeholder="Contoh: 13-05-2025"
                          className="p-2 mt-2 border border-gray-300 rounded-md"
                          maxLength={10} // Limit to 10 characters (dd-mm-yyyy)
                        />
                        <Text className="mt-1 text-xs italic text-gray-500">
                          Ketik tanggal dengan format tanggal-bulan-tahun (dd-mm-yyyy)
                        </Text>
                      </View>
                    )}
                    {/* {formData.merchant_tutup_sementara && (
                      <View className="mt-2 ml-8">
                        <Text className="text-sm text-gray-600">Pilih Tanggal</Text>
                        <TouchableOpacity
                          onPress={() => handleShowDatePicker('merchant_tutup_sementara_date')}
                          className="p-2 mt-2 border border-gray-300 rounded-md"
                        >
                          <Text>{formatDateForDisplay(formData.merchant_tutup_sementara_date) || "Pilih tanggal"}</Text>
                        </TouchableOpacity>
                        <Text className="mt-1 text-xs italic text-gray-500">
                          Tap untuk memilih tanggal
                        </Text>
                      </View>
                    )} */}

                    {/* Tutup Permanen */}
                    <View className="flex-row items-center">
                      <RadioButton
                        value="tutup_permanen"
                        status={formData.merchant_tutup_permanen ? "checked" : "unchecked"}
                        onPress={() => {
                          handleInputChangeTicketExtras("merchant_normal", false);
                          handleInputChangeTicketExtras("merchant_tutup_sementara", false);
                          handleInputChangeTicketExtras("merchant_tutup_permanen", true);
                          handleInputChangeTicketExtras("merchant_renovasi", false);
                          handleInputChangeTicketExtras("merchant_pindah_lokasi", false);
                          // Reset tanggal lainnya
                          handleInputChangeTicketExtras("merchant_tutup_sementara_date", "");
                          handleInputChangeTicketExtras("merchant_renovasi_date", "");
                          handleInputChangeTicketExtras("merchant_pindah_lokasi_date", "");
                        }}
                      />
                      <Text className="text-sm text-gray-600">Merchant akan tutup permanen</Text>
                    </View>
                    {formData.merchant_tutup_permanen && (
                      <View className="mt-2 ml-8">
                        <Text className="text-sm text-gray-600">Ketik Tanggal (format: dd-mm-yyyy)</Text>
                        <TextInput
                          value={formData.merchant_tutup_permanen_date || ""}
                          onChangeText={(text) => {
                            const validInput = /^(\d{0,2})([-]?)(\d{0,2})([-]?)(\d{0,4})$/.test(text);
                            if (validInput || text === "") {
                              setFormData((prevState) => ({
                                ...prevState,
                                merchant_tutup_permanen_date: text,
                              }));
                            }
                          }}
                          placeholder="Contoh: 13-05-2025"
                          className="p-2 mt-2 border border-gray-300 rounded-md"
                          maxLength={10} // Limit to 10 characters (dd-mm-yyyy)
                        />
                        <Text className="mt-1 text-xs italic text-gray-500">
                          Ketik tanggal dengan format tanggal-bulan-tahun (dd-mm-yyyy)
                        </Text>
                      </View>
                    )}
                    {/* {formData.merchant_tutup_permanen && (
                      <View className="mt-2 ml-8">
                        <Text className="text-sm text-gray-600">Pilih Tanggal</Text>
                        <TouchableOpacity
                          onPress={() => handleShowDatePicker('merchant_tutup_permanen_date')}
                          className="p-2 mt-2 border border-gray-300 rounded-md"
                        >
                          <Text>{formatDateForDisplay(formData.merchant_tutup_permanen_date) || "Pilih tanggal"}</Text>
                        </TouchableOpacity>
                        <Text className="mt-1 text-xs italic text-gray-500">
                          Tap untuk memilih tanggal
                        </Text>
                      </View>
                    )} */}

                    {/* Renovasi */}
                    <View className="flex-row items-center">
                      <RadioButton
                        value="renovasi"
                        status={formData.merchant_renovasi ? "checked" : "unchecked"}
                        onPress={() => {
                          handleInputChangeTicketExtras("merchant_normal", false);
                          handleInputChangeTicketExtras("merchant_tutup_sementara", false);
                          handleInputChangeTicketExtras("merchant_tutup_permanen", false);
                          handleInputChangeTicketExtras("merchant_renovasi", true);
                          handleInputChangeTicketExtras("merchant_pindah_lokasi", false);
                          // Reset tanggal lainnya
                          handleInputChangeTicketExtras("merchant_tutup_sementara_date", "");
                          handleInputChangeTicketExtras("merchant_tutup_permanen_date", "");
                          handleInputChangeTicketExtras("merchant_pindah_lokasi_date", "");
                        }}
                      />
                      <Text className="text-sm text-gray-600">Merchant akan renovasi</Text>
                    </View>
                    {formData.merchant_renovasi && (
                      <View className="mt-2 ml-8">
                        <Text className="text-sm text-gray-600">Ketik Tanggal (format: dd-mm-yyyy)</Text>
                        <TextInput
                          value={formData.merchant_renovasi_date || ""}
                          onChangeText={(text) => {
                            const validInput = /^(\d{0,2})([-]?)(\d{0,2})([-]?)(\d{0,4})$/.test(text);
                            if (validInput || text === "") {
                              setFormData((prevState) => ({
                                ...prevState,
                                merchant_renovasi_date: text,
                              }));
                            }
                          }}
                          placeholder="Contoh: 13-05-2025"
                          className="p-2 mt-2 border border-gray-300 rounded-md"
                          maxLength={10} // Limit to 10 characters (dd-mm-yyyy)
                        />
                        <Text className="mt-1 text-xs italic text-gray-500">
                          Ketik tanggal dengan format tanggal-bulan-tahun (dd-mm-yyyy)
                        </Text>
                      </View>
                    )}
                    {/* {formData.merchant_renovasi && (
                      <View className="mt-2 ml-8">
                        <Text className="text-sm text-gray-600">Pilih Tanggal</Text>
                        <TouchableOpacity
                          onPress={() => handleShowDatePicker('merchant_renovasi_date')}
                          className="p-2 mt-2 border border-gray-300 rounded-md"
                        >
                          <Text>{formatDateForDisplay(formData.merchant_renovasi_date) || "Pilih tanggal"}</Text>
                        </TouchableOpacity>
                        <Text className="mt-1 text-xs italic text-gray-500">
                          Tap untuk memilih tanggal
                        </Text>
                      </View>
                    )} */}

                    {/* Pindah Lokasi */}
                    <View className="flex-row items-center">
                      <RadioButton
                        value="pindah_lokasi"
                        status={formData.merchant_pindah_lokasi ? "checked" : "unchecked"}
                        onPress={() => {
                          handleInputChangeTicketExtras("merchant_normal", false);
                          handleInputChangeTicketExtras("merchant_tutup_sementara", false);
                          handleInputChangeTicketExtras("merchant_tutup_permanen", false);
                          handleInputChangeTicketExtras("merchant_renovasi", false);
                          handleInputChangeTicketExtras("merchant_pindah_lokasi", true);
                          // Reset tanggal lainnya
                          handleInputChangeTicketExtras("merchant_tutup_sementara_date", "");
                          handleInputChangeTicketExtras("merchant_tutup_permanen_date", "");
                          handleInputChangeTicketExtras("merchant_renovasi_date", "");
                        }}
                      />
                      <Text className="text-sm text-gray-600">Merchant akan pindah lokasi</Text>
                    </View>
                    {formData.merchant_pindah_lokasi && (
                      <View className="mt-2 ml-8">
                        <Text className="text-sm text-gray-600">Ketik Tanggal (format: dd-mm-yyyy)</Text>
                        <TextInput
                          value={formData.merchant_pindah_lokasi_date || ""}
                          onChangeText={(text) => {
                            const validInput = /^(\d{0,2})([-]?)(\d{0,2})([-]?)(\d{0,4})$/.test(text);
                            if (validInput || text === "") {
                              setFormData((prevState) => ({
                                ...prevState,
                                merchant_pindah_lokasi_date: text,
                              }));
                            }
                          }}
                          placeholder="Contoh: 13-05-2025"
                          className="p-2 mt-2 border border-gray-300 rounded-md"
                          maxLength={10} // Limit to 10 characters (dd-mm-yyyy)
                        />
                        <Text className="mt-1 text-xs italic text-gray-500">
                          Ketik tanggal dengan format tanggal-bulan-tahun (dd-mm-yyyy)
                        </Text>
                      </View>
                    )}
                    {/* {formData.merchant_pindah_lokasi && (
                      <View className="mt-2 ml-8">
                        <Text className="text-sm text-gray-600">Pilih Tanggal</Text>
                        <TouchableOpacity
                          onPress={() => handleShowDatePicker('merchant_pindah_lokasi_date')}
                          className="p-2 mt-2 border border-gray-300 rounded-md"
                        >
                          <Text>{formatDateForDisplay(formData.merchant_pindah_lokasi_date) || "Pilih tanggal"}</Text>
                        </TouchableOpacity>
                        <Text className="mt-1 text-xs italic text-gray-500">
                          Tap untuk memilih tanggal
                        </Text>
                      </View>
                    )} */}
                  </View>
                </View>
              </View>

              {/* 8. Training Material */}
              <View>
                <Text className="mb-4 font-bold underline">8. Training Material</Text>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.sale_void_settlement_logon ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("sale_void_settlement_logon", !formData.sale_void_settlement_logon)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Sale/void/settlement/logon</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.installment ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("installment", !formData.installment)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Installment</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.audit_report ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("audit_report", !formData.audit_report)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Audit report</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.top_up ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("top_up", !formData.top_up)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Top up</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.redeem_point ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("redeem_point", !formData.redeem_point)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Redeem point</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.cardver_preauth_offline ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("cardver_preauth_offline", !formData.cardver_preauth_offline)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Cardver/pre auth/offline</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.manual_key_in ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("manual_key_in", !formData.manual_key_in)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Manual key in</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.mini_atm ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("mini_atm", !formData.mini_atm)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Mini ATM</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.fare_nonfare ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("fare_nonfare", !formData.fare_nonfare)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Fare & non fare</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.dsc_download_bin ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("dsc_download_bin", !formData.dsc_download_bin)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">DSC/download BIN</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.first_level_maintenance ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("first_level_maintenance", !formData.first_level_maintenance)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">First level maintenance</Text>
                </View>
                <View className="flex-row items-center -mb-2">
                  <Checkbox
                    status={formData.penyimpanan_struk_trx ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("penyimpanan_struk_trx", !formData.penyimpanan_struk_trx)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Penyimpanan struk transaksi</Text>
                </View>
              </View>

              {/* 9. Remarks */}
              <View>
                <Text className="mt-2 mb-4 font-bold underline">9. Remarks</Text>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Remarks / Notes (case_remaks)</Text>
                    <TextInput
                      value={formData.case_remaks || selectedTicket?.additional_info?.case_remaks}
                      onChangeText={(text) => handleInputChangeTicketExtras("case_remaks", text)}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={handleSubmitTicketExtras}
                className={`items-center px-8 py-4 mt-6 mb-4 rounded-full ${isSubmittingTicketExtras ? "bg-gray-300" : "bg-blue-500"}`}
                activeOpacity={0.7}
                disabled={isSubmittingTicketExtras}
              >
                {isSubmittingTicketExtras ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-xl font-bold text-white">Simpan Berita Acara</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
            {/* Date Picker */}
            {/* {showDatePicker && (
              <DateTimePicker
                value={(() => {
                  try {
                    const dateValue = formData[currentDateField as keyof typeof formData] as string;
                    if (dateValue && dateValue.trim() !== '') {
                      const date = new Date(dateValue);
                      // Check if date is valid
                      if (!isNaN(date.getTime())) {
                        return date;
                      }
                    }
                    return new Date();
                  } catch (e) {
                    return new Date();
                  }
                })()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                testID="datePicker"
              />
            )} */}
          </View>
        </View>
      </Modal >

      {/* Activity Card */}
      <View className="items-center justify-start flex-1 p-8 mt-4 bg-white rounded-3xl" >
        <View className="relative items-center justify-start flex-1 w-full">
          <Text className="mb-2 text-2xl font-bold text-center">Aktivitas</Text>
          <Text className="text-lg text-center">
            {tracking ? "Berjalan..." : "Idle"}
          </Text>
          <View>
            {!tracking && !selectedTicket && (
              <Text className="text-center text-gray-500">
                Silakan pilih tiket sebelum memulai aktivitas.
              </Text>
            )}

            {!tracking && selectedTicket && (
              <View className="z-10 gap-y-2">
                <Text className="text-center text-gray-600">
                  <Text className="font-bold">ID Tiket:</Text> {selectedTicket.ticket_id}
                </Text>
                <Text className="text-center text-gray-600">
                  <Text className="font-bold">Deskripsi:</Text> {selectedTicket.description}
                </Text>
                <Text className="text-center text-gray-600">
                  <Text className="font-bold">Lokasi Tujuan:</Text> {geofenceLookup[selectedTicket.geofence_id]?.description}
                </Text>
                {selectedTicket?.additional_info && (
                  <>
                    <Text className="text-center text-gray-600">
                      <Text className="font-bold">SN EDC:</Text> {selectedTicket.additional_info?.sn_edc || '-'}
                    </Text>
                    <View className="flex-row flex-wrap justify-center gap-x-4 gap-y-2">
                      <Text className="text-center text-gray-600">
                        <Text className="font-bold">TID:</Text> {selectedTicket.additional_info?.tid || '-'}
                      </Text>
                      <Text className="text-center text-gray-600">
                        <Text className="font-bold">MID:</Text> {selectedTicket.additional_info?.mid || '-'}
                      </Text>
                    </View>
                    <Text className="text-center text-gray-600">
                      <Text className="font-bold">Tipe Tiket:</Text> {selectedTicket.additional_info?.tipe_tiket || '-'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setAdditionalInfoModalVisible(true)}
                      className="items-center w-full px-1 py-2 bg-blue-500 rounded-full"
                      activeOpacity={0.7}
                      style={{ zIndex: 2 }}
                    >
                      <Text className="text-sm font-bold text-white">Lihat Info Tambahan</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Modal for Additional Info */}
                <Modal
                  visible={additionalInfoModalVisible}
                  animationType="slide"
                  transparent
                  onRequestClose={() => setAdditionalInfoModalVisible(false)}
                >
                  <View className="items-center justify-center flex-1 bg-black bg-opacity-50">
                    <View className="w-11/12 max-w-md p-4 bg-white rounded-lg">
                      <Text className="mb-4 text-xl font-bold text-center">Detail Tambahan</Text>
                      <ScrollView style={{ maxHeight: 400 }}>
                        <View className="flex-row flex-wrap">
                          {Object.entries(selectedTicket?.additional_info || {}).map(([key, value]) => (
                            <View key={key} className="w-1/2 px-2 mb-4">
                              <Text className="text-sm font-semibold text-gray-700">{key}</Text>
                              <Text className="mt-1 text-sm text-gray-900">
                                {typeof value === "object"
                                  ? JSON.stringify(value)
                                  : String(value)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                      <TouchableOpacity
                        onPress={() => setAdditionalInfoModalVisible(false)}
                        className="py-2 mt-4 bg-gray-300 rounded-full"
                      >
                        <Text className="font-bold text-center text-gray-800">Tutup</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              </View>
            )}
          </View>
          {tracking && (
            <Text className="mb-4 text-xl text-center">{formatTime(time)}</Text>
          )}

          {/* <View className="z-20 flex-row items-center justify-center w-full gap-x-2"> */}
          {/* <TouchableOpacity
              onPress={() => setMultiPhasePhotoModalVisible(true)}
              className="p-1 bg-red-500 rounded-full top-2 right-2"
            >
              <Text className="text-white">Debug photo modal</Text>
            </TouchableOpacity> */}
          {/* <TouchableOpacity
              onPress={() => {
                const defaultDate = new Date();
                defaultDate.setDate(defaultDate.getDate() + 0);
                const defaultFutureDate = defaultDate.toISOString();
                setFormData(prevState => ({
                  ...prevState,
                  merchant_tutup_sementara_date: defaultFutureDate,
                  merchant_tutup_permanen_date: defaultFutureDate,
                  merchant_renovasi_date: defaultFutureDate,
                  merchant_pindah_lokasi_date: defaultFutureDate
                }));
                setTicketExtrasModalVisible(true);
              }}
              className="p-1 bg-blue-500 rounded-full top-2 right-2"
            >
              <Text className="text-white">Debug berita acara modal</Text>
            </TouchableOpacity> */}
          {/* </View> */}

          {/* Idle */}
          {!tracking ? (
            <LottieView
              source={require('../../assets/animations/idle1.json')}
              autoPlay
              loop
              style={{
                position: 'absolute',
                top: '65%',
                left: '50%',
                transform: [
                  { translateX: -150 },
                  { translateY: -150 },
                ],
                width: 300,
                height: 300,
                zIndex: 1,
              }}
            />
          ) : (
            <Text className="absolute text-2xl font-bold text-gray-500">
              {/* {tracking ? "Sedang Bekerja..." : "Idle"} */}
            </Text>
          )}

          {/* Working */}
          {tracking ? (
            <LottieView
              source={require('../../assets/animations/working1.json')}
              autoPlay
              loop
              style={{
                position: 'absolute',
                top: '65%',
                left: '50%',
                transform: [
                  { translateX: -150 },
                  { translateY: -150 },
                ],
                width: 300,
                height: 300,
                zIndex: 1,
              }}
            />
          ) : (
            <Text className="absolute text-2xl font-bold text-gray-500">
              {/* {tracking ? "Sedang Bekerja..." : "Idle"} */}
            </Text>
          )}
        </View>

        {/* Start/Stop Button */}
        <TouchableOpacity
          onPress={tracking ? handleCompletetWithConfirmation : handleStartWithConfirmation}
          className={`items-center w-full py-4 px-8 rounded-full ${isCompleting || !isConnected ? "bg-gray-300" : tracking ? "bg-red-500" : "bg-[#059669]"}`}
          activeOpacity={0.7}
          disabled={isCompleting || !isConnected}
        >
          {isCompleting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-xl font-bold text-white">
              {tracking ? "Selesai" : "Mulai Bekerja"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Cancel Button */}
        {tracking && (
          <TouchableOpacity
            onPress={handleCanceltWithConfirmation}
            className="items-center w-full px-8 py-4 mt-4 bg-gray-500 rounded-full"
            activeOpacity={0.7}
            disabled={!isConnected}
          >
            <Text className="text-xl font-bold text-white">Batalkan</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Confirmation Modal to Start a Ticket */}
      {isConfirmationVisible && (
        <Modal
          visible={isConfirmationVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsConfirmationVisible(false)}
        >
          <View className="items-center justify-center flex-1 px-4 bg-black/50">
            <View className="w-full max-w-md p-6 bg-white rounded-lg">
              <Text className="mb-4 text-xl font-semibold text-gray-800">
                Konfirmasi Mulai
              </Text>
              <Text className="text-sm text-gray-600">
                Apakah Anda yakin ingin memulai pekerjaan?
              </Text>
              <View className="my-4 gap-y-2">
                <Text className="text-sm text-gray-600">
                  <Text className="font-bold">ID Tiket:</Text> {selectedTicket?.ticket_id}
                </Text>
                <Text className="text-sm text-gray-600">
                  <Text className="font-bold">ID Tempat:</Text> {selectedTicket?.geofence_id}
                </Text>
                <Text className="text-sm text-gray-600">
                  <Text className="font-bold">Deskripsi:</Text> {selectedTicket?.description}
                </Text>
                <Text className="text-sm text-gray-600">
                  <Text className="font-bold">Tempat tujuan:</Text> {geofenceLookup[selectedTicket?.geofence_id ?? ""]?.description || "Tidak tersedia"}
                </Text>
              </View>
              <View className="flex-row justify-between mt-4">
                {/* Tombol Batal */}
                <TouchableOpacity
                  onPress={() => setIsConfirmationVisible(false)}
                  className="px-6 py-3 bg-gray-300 rounded-lg"
                >
                  <Text className="text-sm font-semibold text-gray-700">Batal</Text>
                </TouchableOpacity>
                {/* Tombol Ya */}
                <TouchableOpacity
                  onPress={() => {
                    setIsConfirmationVisible(false);
                    handleStart();
                  }}
                  className="px-6 py-3 bg-blue-500 rounded-lg"
                >
                  <Text className="text-sm font-semibold text-white">Ya</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Multi-Phase Photo Capture Component */}
      <MultiPhasePhotoCapture
        visible={multiPhasePhotoModalVisible}
        onClose={() => {
          setMultiPhasePhotoModalVisible(false);
          setIsCompleting(false);
        }}
        onComplete={async () => {
          try {
            // Call stopBackgroundTracking to properly update ticket status
            if (selectedTicket?.ticket_id) {
              await stopBackgroundTracking(selectedTicket.ticket_id);
              handleLog(`Background tracking stopped for ticket: ${selectedTicket.ticket_id}`);
            }
            setFormData(prevData => ({
              ...prevData,
              merchant_tutup_sementara_date: prevData.merchant_tutup_sementara ? prevData.merchant_tutup_sementara_date || '' : '',
              merchant_tutup_permanen_date: prevData.merchant_tutup_permanen ? prevData.merchant_tutup_permanen_date || '' : '',
              merchant_renovasi_date: prevData.merchant_renovasi ? prevData.merchant_renovasi_date || '' : '',
              merchant_pindah_lokasi_date: prevData.merchant_pindah_lokasi ? prevData.merchant_pindah_lokasi_date || '' : ''
            }));
            setTicketExtrasModalVisible(true); // After completing all phases, show ticket extras form
            setMultiPhasePhotoModalVisible(false);
          } catch (error) {
            handleError(`Error in MultiPhasePhotoCapture completion: ${error}`);
            // Still continue to the form even if there's an error stopping tracking
            setMultiPhasePhotoModalVisible(false);
            setTicketExtrasModalVisible(true);
          }
        }}
        ticketId={currentTicketID || selectedTicket?.ticket_id || ""}
        userId={userData?.user_id || ""}
        isConnected={isConnected || false}
        timestamp={timestamp || ""}
        currentLocation={currentLocation}
      />
    </ScrollView >
  );
};

export default MainScreen;
