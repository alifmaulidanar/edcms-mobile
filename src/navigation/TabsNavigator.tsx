import React from "react";
import { Ionicons } from "@expo/vector-icons";
import MainScreen from "../screens/MainScreen";
import ProfileScreen from "../screens/ProfileScreen";
import TicketsScreen from "../screens/TicketsScreen";
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
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#4F46E5",
        tabBarInactiveTintColor: "gray",
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
    </Tab.Navigator>
  );
};

export default TabsNavigator;
