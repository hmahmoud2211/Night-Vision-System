// template
import { Tabs } from "expo-router";
import { Eye, Settings, Shield } from "lucide-react-native";
import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import Colors from "@/constants/Colors";

// Custom tab bar icon with glow effect
const TabIcon = ({ icon: Icon, color, focused }: { icon: any; color: string; focused: boolean }) => (
  <View style={styles.tabIconContainer}>
    {focused && <View style={[styles.tabIconGlow, { backgroundColor: color }]} />}
    <Icon size={22} color={color} strokeWidth={focused ? 2.5 : 2} />
  </View>
);

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#10b981",
        tabBarInactiveTintColor: "rgba(148, 163, 184, 0.6)",
        tabBarStyle: {
          backgroundColor: "#0a0f1a",
          borderTopColor: "rgba(16, 185, 129, 0.15)",
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 85 : 70,
          paddingBottom: Platform.OS === "ios" ? 28 : 12,
          paddingTop: 12,
          shadowColor: "#10b981",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.5,
          marginTop: 4,
        },
        headerStyle: {
          backgroundColor: "#0a0f1a",
          shadowColor: "#10b981",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 5,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(16, 185, 129, 0.1)",
        },
        headerTintColor: "#e2e8f0",
        headerTitleStyle: {
          fontWeight: "800",
          fontSize: 17,
          letterSpacing: 1,
        },
        headerTitleAlign: "center",
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "NIGHT VISION",
          tabBarLabel: "Vision",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon={Eye} color={color} focused={focused} />
          ),
          headerLeft: () => (
            <View style={styles.headerLeft}>
              <Shield size={18} color="#10b981" />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "SETTINGS",
          tabBarLabel: "Settings",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon={Settings} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  tabIconGlow: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    opacity: 0.15,
  },
  headerLeft: {
    marginLeft: 16,
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
});
