import { setUser } from "../store";
import { login } from "../api/auth";
import { useDispatch } from "react-redux";
import * as Location from 'expo-location';
import React, { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LocationPermissionModal from "../components/LocationPermission";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
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
      Alert.alert("Login failed", error.message);
    }
  };

  const handlePermissionsGranted = () => {
    setPermissionsGranted(true);
  };

  useEffect(() => {
    const checkPermissions = async () => {
      const { status: foreground } = await Location.getForegroundPermissionsAsync();
      const { status: background } = await Location.getBackgroundPermissionsAsync();
      if (foreground === 'granted' && background === 'granted') {
        setPermissionsGranted(true);
      } else {
        setPermissionsGranted(false);
      }
    };
    checkPermissions();
  }, []);

  return (
    <View className="flex-1 bg-[#f5f5f5] mt-4 px-6 py-6 justify-between">
      {/* Logo Perusahaan (Posisi di atas, tengah) */}
      <View className="items-center">
        <Image
          source={require("../../assets/logo/mdm-logo.png")}
          style={{ width: 50, height: 50 }}
          resizeMode="contain"
        />
      </View>

      {/* Logo Produk (Di antara logo perusahaan dan form login) */}
      <View className="items-center justify-center">
        <Image
          source={require("../../assets/logo/pastims-newest-logo.png")}
          style={{ width: "100%", height: 120 }}
          resizeMode="contain"
        />
      </View>

      {/* Form Login (Tengah layar secara vertikal) */}
      <View className="justify-start w-full max-w-md p-8 bg-white rounded-lg shadow-lg">
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
      </View>

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
    </View>
  );
};

export default LoginScreen;
