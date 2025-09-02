import { setUser } from "../store";
import Constants from "expo-constants";
import { useDispatch } from "react-redux";
import React, { useState, useEffect } from "react";
import { login, silentRefreshSession } from "../api/auth";
import ForgotPasswordModal from "../components/ForgotPassword";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LocationPermissionModal from "../components/LocationPermission";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getBackgroundPermissionsAsync, getForegroundPermissionsAsync } from 'expo-location';
import { View, Text, TextInput, Button, Alert, Platform, Linking, Image, TouchableOpacity } from "react-native";

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const dispatch = useDispatch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const openModal = () => setModalVisible(true);
  const closeModal = () => setModalVisible(false);

  const openAppSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  const handleLogin = async () => {
    try {
      const user = await login(email, password);
      dispatch(setUser(user));
      await AsyncStorage.setItem("userData", JSON.stringify(user));
      navigation.navigate("Main");
    } catch (error: any) {
      if (
        error.message?.includes("Invalid Refresh Token") ||
        error.message?.includes("Refresh Token Not Found")
      ) {
        Alert.alert(
          "Sesi Berakhir",
          "Sesi login Anda habis. Coba login ulang secara otomatis?",
          [
            {
              text: "Coba Lagi",
              onPress: async () => {
                try {
                  await silentRefreshSession();
                  navigation.navigate("Main");
                } catch (e: any) {
                  Alert.alert("Gagal login otomatis", "Silakan login manual.");
                }
              },
            },
            { text: "Tutup", style: "cancel" },
          ]
        );
      } else {
        Alert.alert("Login failed", error.message);
      }
    }
  };

  const handlePermissionsGranted = () => {
    setPermissionsGranted(true);
  };

  useEffect(() => {
    const checkPermissions = async () => {
      const { status: foreground } = await getForegroundPermissionsAsync();
      const { status: background } = await getBackgroundPermissionsAsync();
      if (foreground === 'granted' && background === 'granted') {
        setPermissionsGranted(true);
      } else {
        setPermissionsGranted(false);
      }
    };
    checkPermissions();
  }, []);

  const appVersion = Constants.expoConfig?.version;

  return (
    <View className="flex-1 bg-[#ffffff] mt-4 px-6 py-6 justify-between">
      {/* Logo Perusahaan (Posisi di atas, tengah) */}
      {/* <View className="items-center">
        <Image
          source={require("../../assets/logo/mdm-logo.png")}
          style={{ width: 50, height: 50 }}
          resizeMode="contain"
        />
      </View> */}

      {/* Logo Produk (Di antara logo perusahaan dan form login) */}
      <View className="items-center justify-center mt-20">
        <Image
          source={require("../../assets/logo/app-logo.png")}
          style={{ width: "100%", height: 120 }}
          resizeMode="contain"
        />
      </View>

      {/* Form Login (Tengah layar secara vertikal) */}
      <View className="justify-start w-full max-w-md p-8 bg-white rounded-lg shadow-xl shadow-slate-800">
        <Text className="text-center mb-5 text-2xl font-bold text-[#84439b]">Login</Text>
        {/* Input fields */}
        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          className="p-3 mb-4 bg-white border border-gray-300 rounded-md"
          editable={permissionsGranted}
        />
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          className="p-3 mb-6 bg-white border border-gray-300 rounded-md"
          editable={permissionsGranted}
        />
        {/* Login Button */}
        <Button
          title="Login"
          onPress={handleLogin}
          color="#84439b"
          disabled={!permissionsGranted}
        />

        {/* Forgot password button */}
        <TouchableOpacity
          onPress={openModal}
          className="mt-8"
        >
          <Text className="text-center text-[#84439b]">Lupa Password?</Text>
        </TouchableOpacity>
      </View>

      {/* App Version */}
      <Text className="mt-4 text-center text-gray-600">
        {process.env.EXPO_PUBLIC_APP_NAME} v{appVersion}
      </Text>

      {/* Error Text */}
      {!permissionsGranted && (
        <Text className="mb-4 text-center text-red-500">Permission Required</Text>
      )}

      {/* Button to open Settings */}
      {!permissionsGranted && (
        <TouchableOpacity
          onPress={openAppSettings}
          className="bg-[#5f5f5f] py-4 px-6 rounded-lg w-52 mx-auto"
        >
          <Text className="font-semibold text-center text-white">Buka Pengaturan</Text>
        </TouchableOpacity>
      )}

      {/* Location Permission Modal */}
      <LocationPermissionModal onPermissionsGranted={handlePermissionsGranted} />

      {/* Forgot password modal with OTP */}
      <ForgotPasswordModal visible={modalVisible} onClose={closeModal} />
    </View>
  );
};

export default LoginScreen;
