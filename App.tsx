import "./global.css";
import { Provider } from "react-redux";
import React, { useEffect, useState } from "react";
import store, { setUser } from "./src/store/index";
import { initializeRadar } from "./src/utils/radar";
import LoginScreen from "./src/screens/LoginScreen";
import { View, Text, StatusBar, Linking } from "react-native";
import SettingsScreen from "./src/screens/SettingsScreen";
import TabsNavigator from "./src/navigation/TabsNavigator";
import { createStackNavigator } from "@react-navigation/stack";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import PrivacyPolicyScreen from "./src/screens/PrivacyPolicyScreen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ForgotPasswordModal from "./src/components/ForgotPassword";

// Constants for route names
const Routes = {
  Login: "Login",
  Main: "Main",
  Settings: "Settings",
  PrivacyPolicy: "PrivacyPolicy",
};

const linking = {
  prefixes: [`${process.env.EXPO_PUBLIC_LINKING_URI}://`],
  config: {
    screens: {
      Login: "login",
      Beranda: 'home',
      Tiket: 'ticket',
      Profil: 'profile',
      Settings: "settings",
      PrivacyPolicy: "privacy-policy",
    },
  },
};

// Stack navigator
const Stack = createStackNavigator();

export default function App() {
  // Set status bar style
  StatusBar.setBarStyle("dark-content");
  StatusBar.setBackgroundColor("transparent");
  StatusBar.setTranslucent(true);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const { url } = event;
      if (url.includes("reset-password")) {
        const emailMatch = url.match(/email=([^&]*)/);
        if (emailMatch) {
          setEmail(decodeURIComponent(emailMatch[1]));
          setModalVisible(true);
        }
      }
    };
    Linking.addEventListener("url", handleDeepLink);
    Linking.getInitialURL().then((url) => {
      if (url && url.includes("reset-password")) {
        const emailMatch = url.match(/email=([^&]*)/);
        if (emailMatch) {
          setEmail(decodeURIComponent(emailMatch[1]));
          setModalVisible(true);
        }
      }
    });
    return () => Linking.removeAllListeners("url");
  }, []);

  useEffect(() => {
    // Initialize Radar SDK
    const publishableKey = process.env.EXPO_PUBLIC_RADAR_PUBLISHABLE_KEY as string;
    initializeRadar(publishableKey);

    // Load user data from AsyncStorage
    const loadUserData = async () => {
      try {
        const storedUserData = await AsyncStorage.getItem("userData");
        if (storedUserData) {
          const user = JSON.parse(storedUserData);
          store.dispatch(setUser(user)); // Set user in Redux
          setIsLoggedIn(true);
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadUserData();
  }, []);

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text>Loading...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <NavigationContainer linking={linking}>
          <Stack.Navigator initialRouteName={isLoggedIn ? Routes.Main : Routes.Login}>
            <Stack.Screen
              name={Routes.Login}
              component={LoginScreen as React.ComponentType}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name={Routes.Main}
              component={TabsNavigator}
              options={{ headerShown: false }}
            />
            <Stack.Screen name={Routes.Settings} component={SettingsScreen as React.ComponentType} options={{ headerShown: false }} />
            <Stack.Screen name={Routes.PrivacyPolicy} component={PrivacyPolicyScreen as React.ComponentType} options={{ headerShown: false }} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>

      <ForgotPasswordModal visible={modalVisible} onClose={() => setModalVisible(false)} email={email} />
    </Provider>
  );
}
