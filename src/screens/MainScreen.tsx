import { RootState } from '../store';
import { useSelector } from 'react-redux';
import { getTickets } from '../api/tickets';
import { Geofence, Ticket } from '../types';
import LottieView from 'lottie-react-native';
import { getAllGeofences } from '../api/geofences';
import { Picker } from '@react-native-picker/picker';
import React, { useState, useEffect, useCallback } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { cancelTrip, startBackgroundTracking, stopBackgroundTracking } from "../utils/radar";
import { View, Alert, Text, Modal, TouchableOpacity, ScrollView, RefreshControl } from "react-native";

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Tickets: undefined;
  Profile: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "Main">;

const MainScreen: React.FC<Props> = ({ navigation }) => {
  const [tracking, setTracking] = useState(false);
  const [time, setTime] = useState(0);  // To store the time in seconds
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [geofence, setGeofence] = useState<Geofence[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Get user data from Redux store
  const userData = useSelector((state: RootState) => state.user);

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
  }, [fetchTickets]);

  // Handle pull-to-refresh
  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchTickets();
    await fetchGeofences();
    setIsRefreshing(false);
  };

  // Handle Start Tracking (Start Trip)
  const handleStart = async () => {
    if (!selectedTicket) {
      Alert.alert("No Ticket Selected", "Please select a ticket before starting work.");
      return;
    }

    try {
      await startBackgroundTracking(  // Start Radar trip tracking
        userData?.user_id || '',
        userData?.username || '',
        selectedTicket.ticket_id,
        selectedTicket.description,
        selectedTicket.geofence_id,
        geofence.find((g) => g.external_id === selectedTicket.geofence_id)?.tag || ''
      );
      console.log('Trip started');
      setTracking(true);
    } catch (error: any) {
      Alert.alert("Failed to start tracking", error.message);
    }
  };

  // Handle Stop Tracking (Finish Trip)
  const handleStop = async () => {
    if (selectedTicket?.ticket_id) {
      stopBackgroundTracking(selectedTicket.ticket_id);  // Stop Radar location tracking
      console.log('Trip completed');
      setTracking(false);
    }
  };

  // Handle Cancel Tracking (Cancel Trip)
  const handleCancel = () => {
    if (selectedTicket?.ticket_id) {
      cancelTrip(selectedTicket?.ticket_id);  // Cancel Radar trip tracking
      console.log('Trip canceled');
      setTracking(false);
    }
  };

  // Stopwatch effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (tracking) {
      timer = setInterval(() => {
        setTime(prevTime => prevTime + 1);  // Increment time by 1 second
      }, 1000);
    } else {
      setTime(0);  // Reset time when tracking stops
    }

    return () => {
      if (timer) clearInterval(timer);  // Cleanup timer on component unmount or tracking stop
    };
  }, [tracking]);

  // Format time as HH:MM:SS
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // const handleDebug = async () => {
  //   console.log('Debugging getTrip()');
  //   await getTrip('01940e25-57bd-7134-8c4f-00aa5029b040');
  // };

  return (
    <ScrollView
      className='bg-[#f5f5f5] p-6 mt-4'
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      <View className="flex-row items-center justify-between w-full">
        <View className="flex items-start gap-y-1">
          <Text className="text-xl font-bold text-center">
            Halo, {userData?.username || "User"}
          </Text>
        </View>
      </View>

      {/* Tickets Dropdown */}
      <View className="mt-4">
        <Text className="mb-2 text-lg font-bold">Pilih Tiket</Text>
        <Picker
          selectedValue={selectedTicket?.id || null}
          onValueChange={(value: any) => {
            const ticket = tickets.find((t) => t.id === value);
            setSelectedTicket(ticket || null);
          }}
          style={{ height: 50, backgroundColor: 'white', borderRadius: 8 }}
        >
          <Picker.Item label="Select a ticket..." value={null} />
          {tickets.map((ticket) => (
            <Picker.Item key={ticket.id} label={ticket.description} value={ticket.id} />
          ))}
        </Picker>
      </View>

      {/* Debugging */}
      {/* <View className="mt-4">
        <TouchableOpacity onPress={handleDebug}>
          <Text className="text-lg font-bold text-blue-500">Debug getTrip()</Text>
        </TouchableOpacity>
      </View> */}

      {/* Activity Card */}
      <View className="items-center justify-start flex-1 p-8 mt-4 bg-white rounded-3xl">
        <View className="relative items-center justify-start flex-1 w-full">
          <Text className="mb-4 text-2xl font-bold text-center">Aktivitas</Text>
          <Text className="mb-4 text-lg text-center">
            {tracking ? "Berjalan..." : "Idle"}
          </Text>
          {tracking && (
            <Text className="mb-4 text-xl text-center">
              {formatTime(time)}
            </Text>
          )}

          {/* Idle */}
          {!tracking && (
            <LottieView
              source={require('../../assets/animations/idle1.json')}
              autoPlay
              loop
              style={{
                position: 'absolute',
                top: '50%',
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
          )}

          {/* Working */}
          {tracking && (
            <LottieView
              source={require('../../assets/animations/working1.json')}
              autoPlay
              loop
              style={{
                position: 'absolute',
                top: '50%',
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
          )}
        </View>

        {/* Start/Stop Button */}
        <TouchableOpacity
          onPress={tracking ? handleStop : handleStart}
          className={`items-center w-full py-4 px-8 rounded-full ${tracking ? "bg-red-500" : "bg-[#059669]"}`}
          activeOpacity={0.7}
        >
          <Text className="text-xl font-bold text-white">
            {tracking ? "Selesai" : "Mulai Bekerja"}
          </Text>
        </TouchableOpacity>

        {/* Cancel Button */}
        {tracking && (
          <TouchableOpacity
            onPress={handleCancel}
            className="items-center w-full px-8 py-4 mt-4 bg-gray-500 rounded-full"
            activeOpacity={0.7}
          >
            <Text className="text-xl font-bold text-white">
              Batalkan
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
};

export default MainScreen;
