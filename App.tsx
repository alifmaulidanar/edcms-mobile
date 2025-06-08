import 'react-native-get-random-values';
import "./global.css";
import { Provider } from "react-redux";
import supabase from "./src/utils/supabase";
import { Session } from "@supabase/supabase-js";
import React, { useEffect, useState } from "react";
import store, { setUser } from "./src/store/index";
import LoginScreen from "./src/screens/LoginScreen";
// import { initializeRadar } from "./src/utils/radar";
import SettingsScreen from "./src/screens/SettingsScreen";
import TabsNavigator from "./src/navigation/TabsNavigator";
import { createStackNavigator } from "@react-navigation/stack";
import { NavigationContainer } from "@react-navigation/native";
import ForgotPasswordModal from "./src/components/ForgotPassword";
import { SafeAreaProvider } from "react-native-safe-area-context";
import PrivacyPolicyScreen from "./src/screens/PrivacyPolicyScreen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, Text, StatusBar, Linking, AppState } from "react-native";
import { error as handleError, log as handleLog } from "./src/utils/logHandler";

// Constants for route names
const Routes = {
  Login: "Login",
  Main: "Main",
  Settings: "Settings",
  PrivacyPolicy: "PrivacyPolicy",
};

const linking = {
  prefixes: ['pastimsedc://'],
  config: {
    screens: {
      Login: {
        path: 'login/reset-password/:email?',
        parse: {
          email: (email: string) => decodeURIComponent(email),
        },
      },
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

  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const handleDeepLink = ({ url }: { url: string }) => {
      const route = url.replace(/.*?:\/\//g, '');
      const path = route.split('/')[1];
      const emailParam = route.split('email=')[1];

      if (path === 'reset-password' && emailParam) {
        const decodedEmail = decodeURIComponent(emailParam);
        setEmail(decodedEmail);
        setModalVisible(true);
      }
    };
    const subscription = Linking.addEventListener("url", handleDeepLink);
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink({ url });
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Initialize Radar SDK
    // const publishableKey = process.env.EXPO_PUBLIC_RADAR_PUBLISHABLE_KEY as string;
    // initializeRadar(publishableKey);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    // Load user data from AsyncStorage
    const loadUserData = async () => {
      try {
        const storedUserData = await AsyncStorage.getItem("userData");
        if (storedUserData) {
          const user = JSON.parse(storedUserData);
          store.dispatch(setUser(user)); // Set user in Redux
          setIsLoggedIn(true);
        }
        if (session) {
          setIsLoggedIn(true);
        }
      } catch (error: any) {
        handleError(`Error loading user data: ${error}`);
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
