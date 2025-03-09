import React from "react";
import { Ionicons } from "@expo/vector-icons";
import MainScreen from "../screens/MainScreen";
import ProfileScreen from "../screens/ProfileScreen";
import TicketsScreen from "../screens/TicketsScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

const Tab = createBottomTabNavigator();

const TabsNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;

          if (route.name === "Beranda") {
            iconName = "home";
          } else if (route.name === "Tiket") {
            iconName = "ticket";
          } else if (route.name === "Profil") {
            iconName = "person";
          } else if (route.name === "Setelan") {
            iconName = "settings";
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        // tabBarActiveTintColor: "#10b981",
        tabBarActiveTintColor: "#047857",
        tabBarInactiveTintColor: "#adb3bc",
        tabBarStyle: { backgroundColor: "#fff" },
      })}
    >
      <Tab.Screen
        name="Beranda"
        component={MainScreen}
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="Tiket"
        component={TicketsScreen}
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="Profil"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="Setelan"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
    </Tab.Navigator>
  );
};

export default TabsNavigator;
