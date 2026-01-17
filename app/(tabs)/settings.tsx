import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";
import {
  Info,
  Zap,
  Shield,
  Camera,
  Activity,
  Cpu,
  Wifi,
  Sparkles,
  RefreshCw,
  Eye,
  Radio,
  ChevronRight,
  Brain,
  Crosshair,
  Target,
  Gauge,
  Moon,
  CircleDot,
  CheckCircle2,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

type FeatureCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  gradientColors: readonly [string, string, ...string[]];
};

const FeatureCard = ({ icon, title, description, color, gradientColors }: FeatureCardProps) => (
  <View style={styles.featureCard}>
    <LinearGradient
      colors={gradientColors}
      style={styles.featureGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={[styles.featureIconContainer, { backgroundColor: color + "30" }]}>
        {icon}
      </View>
      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
      <ChevronRight size={16} color="rgba(148, 163, 184, 0.5)" />
    </LinearGradient>
  </View>
);

type StatusItemProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  status?: "online" | "offline" | "neutral";
};

const StatusItem = ({ icon, label, value, status = "neutral" }: StatusItemProps) => (
  <View style={styles.statusItem}>
    <View style={styles.statusItemLeft}>
      {icon}
      <Text style={styles.statusItemLabel}>{label}</Text>
    </View>
    <View style={styles.statusItemRight}>
      <Text style={[
        styles.statusItemValue,
        status === "online" && { color: "#22c55e" },
        status === "offline" && { color: "#ef4444" },
      ]}>{value}</Text>
      {status !== "neutral" && (
        <View style={[
          styles.statusDot,
          status === "online" ? styles.statusDotOnline : styles.statusDotOffline
        ]} />
      )}
    </View>
  </View>
);

export default function SettingsScreen() {
  const [backendStatus, setBackendStatus] = useState<"online" | "offline">("offline");
  const [backendVersion, setBackendVersion] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<"online" | "offline">("offline");
  const [calibrating, setCalibrating] = useState(false);
  const [lastCalibrated, setLastCalibrated] = useState<string | null>(null);
  
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    ).start();
  }, [pulseAnim]);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const baseUrl = process.env.EXPO_PUBLIC_RORK_API_BASE_URL || "http://localhost:8001";
        const response = await fetch(`${baseUrl}/status`);
        const result = await response.json();
        setBackendStatus("online");
        setBackendVersion(result.version ?? null);
        
        // Check AI status
        const aiResponse = await fetch(`${baseUrl}/ai/status`);
        if (aiResponse.ok) {
          const aiResult = await aiResponse.json();
          setAiStatus(aiResult.ai_available ? "online" : "offline");
        }
      } catch (error) {
        setBackendStatus("offline");
        setAiStatus("offline");
      }
    };

    checkBackend();
  }, []);

  const handleCalibrate = async () => {
    try {
      setCalibrating(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const baseUrl = process.env.EXPO_PUBLIC_RORK_API_BASE_URL || "http://localhost:8001";
      await fetch(`${baseUrl}/calibrate`, { method: "POST" });
      setLastCalibrated(new Date().toLocaleTimeString());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.warn("Calibration failed", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setCalibrating(false);
    }
  };

  const glowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero Header */}
      <View style={styles.heroSection}>
        <LinearGradient
          colors={['rgba(16, 185, 129, 0.15)', 'rgba(15, 23, 42, 0.95)', '#0b1220']}
          style={styles.heroGradient}
        >
          <Animated.View style={[styles.heroGlow, { opacity: glowOpacity }]} />
          <View style={styles.heroIconContainer}>
            <Eye size={48} color="#10b981" strokeWidth={1.5} />
            <View style={styles.heroIconRing} />
          </View>
          <Text style={styles.heroTitle}>NIGHT VISION</Text>
          <Text style={styles.heroSubtitle}>SECURITY INTELLIGENCE SYSTEM</Text>
          <View style={styles.heroBadges}>
            <View style={styles.heroBadge}>
              <CheckCircle2 size={12} color="#22c55e" />
              <Text style={styles.heroBadgeText}>AI Powered</Text>
            </View>
            <View style={styles.heroBadge}>
              <CheckCircle2 size={12} color="#60a5fa" />
              <Text style={styles.heroBadgeText}>Real-time</Text>
            </View>
            <View style={styles.heroBadge}>
              <CheckCircle2 size={12} color="#a855f7" />
              <Text style={styles.heroBadgeText}>Secure</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* System Status Card */}
      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View style={styles.statusHeaderLeft}>
            <Radio size={16} color="#60a5fa" />
            <Text style={styles.statusTitle}>SYSTEM STATUS</Text>
          </View>
          <View style={[
            styles.statusIndicator,
            backendStatus === "online" ? styles.statusIndicatorOnline : styles.statusIndicatorOffline
          ]}>
            <CircleDot size={10} color={backendStatus === "online" ? "#22c55e" : "#ef4444"} />
            <Text style={[
              styles.statusIndicatorText,
              { color: backendStatus === "online" ? "#22c55e" : "#ef4444" }
            ]}>
              {backendStatus.toUpperCase()}
            </Text>
          </View>
        </View>
        
        <View style={styles.statusGrid}>
          <StatusItem 
            icon={<Wifi size={16} color="#60a5fa" />}
            label="Backend Server"
            value={backendStatus === "online" ? "Connected" : "Disconnected"}
            status={backendStatus}
          />
          <StatusItem 
            icon={<Brain size={16} color="#a855f7" />}
            label="AI Engine"
            value={aiStatus === "online" ? "Active" : "Inactive"}
            status={aiStatus}
          />
          <StatusItem 
            icon={<Cpu size={16} color="#f59e0b" />}
            label="Version"
            value={backendVersion ?? "Unknown"}
          />
          <StatusItem 
            icon={<Activity size={16} color="#10b981" />}
            label="Last Calibration"
            value={lastCalibrated ?? "Never"}
          />
        </View>
      </View>

      {/* Enhancement Features */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Sparkles size={18} color="#f59e0b" />
          <Text style={styles.sectionTitle}>Enhancement Intelligence</Text>
        </View>
        <FeatureCard
          icon={<Moon size={22} color="#f59e0b" />}
          title="Adaptive Smart Enhance"
          description="Auto-selects best enhancement based on scene analysis"
          color="#f59e0b"
          gradientColors={['rgba(245, 158, 11, 0.08)', 'rgba(15, 23, 42, 0.95)']}
        />
        <FeatureCard
          icon={<Activity size={22} color="#3b82f6" />}
          title="Multi-Scale Retinex"
          description="Illumination-invariant enhancement for extreme low-light"
          color="#3b82f6"
          gradientColors={['rgba(59, 130, 246, 0.08)', 'rgba(15, 23, 42, 0.95)']}
        />
        <FeatureCard
          icon={<Zap size={22} color="#8b5cf6" />}
          title="CLAHE Processing"
          description="Localized contrast enhancement with noise-aware smoothing"
          color="#8b5cf6"
          gradientColors={['rgba(139, 92, 246, 0.08)', 'rgba(15, 23, 42, 0.95)']}
        />
        <FeatureCard
          icon={<Gauge size={22} color="#10b981" />}
          title="Edge-Preserving Denoise"
          description="Adaptive denoising that retains critical scene structure"
          color="#10b981"
          gradientColors={['rgba(16, 185, 129, 0.08)', 'rgba(15, 23, 42, 0.95)']}
        />
      </View>

      {/* Detection Features */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Target size={18} color="#ef4444" />
          <Text style={styles.sectionTitle}>Detection Systems</Text>
        </View>
        <FeatureCard
          icon={<Camera size={22} color="#ef4444" />}
          title="Motion Intelligence"
          description="Advanced background modeling with adaptive thresholding"
          color="#ef4444"
          gradientColors={['rgba(239, 68, 68, 0.08)', 'rgba(15, 23, 42, 0.95)']}
        />
        <FeatureCard
          icon={<Shield size={22} color="#ec4899" />}
          title="Confidence Gating"
          description="Multi-factor scoring to eliminate false positives"
          color="#ec4899"
          gradientColors={['rgba(236, 72, 153, 0.08)', 'rgba(15, 23, 42, 0.95)']}
        />
        <FeatureCard
          icon={<Brain size={22} color="#a855f7" />}
          title="AI Threat Analysis"
          description="Neural network powered threat detection and classification"
          color="#a855f7"
          gradientColors={['rgba(168, 85, 247, 0.08)', 'rgba(15, 23, 42, 0.95)']}
        />
        <FeatureCard
          icon={<Crosshair size={22} color="#60a5fa" />}
          title="Object Tracking"
          description="Tracks significant motion and prioritizes human-like patterns"
          color="#60a5fa"
          gradientColors={['rgba(96, 165, 250, 0.08)', 'rgba(15, 23, 42, 0.95)']}
        />
      </View>

      {/* System Controls */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Cpu size={18} color="#10b981" />
          <Text style={styles.sectionTitle}>System Controls</Text>
        </View>
        <TouchableOpacity 
          style={[styles.actionButton, calibrating && styles.actionButtonDisabled]} 
          onPress={handleCalibrate}
          disabled={calibrating}
        >
          <LinearGradient
            colors={calibrating ? ['#374151', '#1f2937'] : ['#10b981', '#059669']}
            style={styles.actionButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <RefreshCw size={20} color="#fff" style={calibrating ? { opacity: 0.5 } : {}} />
            <Text style={[styles.actionButtonText, calibrating && { opacity: 0.5 }]}>
              {calibrating ? "CALIBRATING..." : "RECALIBRATE MOTION MODEL"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Use Cases */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Eye size={18} color="#60a5fa" />
          <Text style={styles.sectionTitle}>Use Cases</Text>
        </View>
        <View style={styles.useCasesCard}>
          {[
            "Home surveillance monitoring",
            "Outdoor night security",
            "Low-light environment monitoring",
            "Wildlife observation",
            "Night photography assistance",
          ].map((item, idx) => (
            <View key={idx} style={styles.useCaseItem}>
              <View style={styles.useCaseDot} />
              <Text style={styles.useCaseText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* About Section */}
      <View style={styles.aboutCard}>
        <View style={styles.aboutHeader}>
          <Info size={18} color="#64748b" />
          <Text style={styles.aboutTitle}>About</Text>
        </View>
        <Text style={styles.aboutText}>
          This system combines classical image processing with intelligent AI heuristics 
          to deliver reliable low-light visibility. Adaptive enhancement and smart motion 
          logic run locally for real-time performance and complete privacy.
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLogo}>
          <Eye size={20} color="#10b981" />
        </View>
        <Text style={styles.footerTitle}>NIGHT VISION SECURITY</Text>
        <Text style={styles.footerSubtitle}>Competition-Ready Intelligent Vision Suite</Text>
        <Text style={styles.footerVersion}>v2.0.0 • Built with ❤️</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1220",
  },
  content: {
    paddingBottom: 40,
  },
  // Hero Section
  heroSection: {
    marginBottom: 20,
  },
  heroGradient: {
    alignItems: "center",
    paddingTop: 30,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  heroGlow: {
    position: "absolute",
    top: 20,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  heroIconContainer: {
    position: "relative",
    marginBottom: 20,
  },
  heroIconRing: {
    position: "absolute",
    top: -15,
    left: -15,
    right: -15,
    bottom: -15,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#f8fafc",
    letterSpacing: 6,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 3,
    marginBottom: 20,
  },
  heroBadges: {
    flexDirection: "row",
    gap: 12,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.3)",
  },
  heroBadgeText: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "600",
  },
  // Status Card
  statusCard: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.2)",
    overflow: "hidden",
  },
  statusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(100, 116, 139, 0.15)",
  },
  statusHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusTitle: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusIndicatorOnline: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
  },
  statusIndicatorOffline: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  statusIndicatorText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  statusGrid: {
    padding: 12,
    gap: 2,
  },
  statusItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  statusItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusItemLabel: {
    color: "#94a3b8",
    fontSize: 13,
  },
  statusItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusItemValue: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "600",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotOnline: {
    backgroundColor: "#22c55e",
    shadowColor: "#22c55e",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  statusDotOffline: {
    backgroundColor: "#ef4444",
  },
  // Sections
  section: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#e2e8f0",
    letterSpacing: 0.5,
  },
  // Feature Cards
  featureCard: {
    marginBottom: 10,
    borderRadius: 14,
    overflow: "hidden",
  },
  featureGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  featureIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#e2e8f0",
    marginBottom: 3,
  },
  featureDescription: {
    fontSize: 11,
    color: "#94a3b8",
    lineHeight: 16,
  },
  // Action Button
  actionButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
  },
  // Use Cases
  useCasesCard: {
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.2)",
  },
  useCaseItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  useCaseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10b981",
  },
  useCaseText: {
    color: "#cbd5e1",
    fontSize: 13,
  },
  // About
  aboutCard: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.15)",
  },
  aboutHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  aboutTitle: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
  },
  aboutText: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 20,
  },
  // Footer
  footer: {
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(100, 116, 139, 0.15)",
    marginTop: 10,
  },
  footerLogo: {
    marginBottom: 12,
  },
  footerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#e2e8f0",
    letterSpacing: 2,
    marginBottom: 4,
  },
  footerSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 8,
  },
  footerVersion: {
    fontSize: 10,
    color: "rgba(100, 116, 139, 0.6)",
  },
});
