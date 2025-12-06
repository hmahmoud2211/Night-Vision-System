import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
} from "react-native";
import {
  Info,
  Zap,
  Shield,
  Camera,
  Activity,
} from "lucide-react-native";

type FeatureCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
};

const FeatureCard = ({ icon, title, description, color }: FeatureCardProps) => (
  <View style={[styles.featureCard, { borderLeftColor: color }]}>
    <View style={[styles.iconContainer, { backgroundColor: color + "20" }]}>
      {icon}
    </View>
    <View style={styles.featureContent}>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDescription}>{description}</Text>
    </View>
  </View>
);

export default function SettingsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Shield size={32} color="#10b981" />
          <Text style={styles.title}>Night Vision Security</Text>
        </View>
        <Text style={styles.subtitle}>
          Advanced low-light image enhancement and real-time motion detection
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Enhancement Techniques</Text>
        <FeatureCard
          icon={<Zap size={24} color="#f59e0b" />}
          title="Gamma Correction"
          description="Adjusts brightness and contrast for better visibility in dark conditions"
          color="#f59e0b"
        />
        <FeatureCard
          icon={<Activity size={24} color="#3b82f6" />}
          title="Histogram Equalization"
          description="Redistributes pixel intensities to enhance overall image contrast"
          color="#3b82f6"
        />
        <FeatureCard
          icon={<Zap size={24} color="#8b5cf6" />}
          title="CLAHE"
          description="Contrast Limited Adaptive Histogram Equalization for localized enhancement"
          color="#8b5cf6"
        />
        <FeatureCard
          icon={<Activity size={24} color="#10b981" />}
          title="Unsharp Masking"
          description="Enhances image details and edges for clearer visibility"
          color="#10b981"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Motion Detection</Text>
        <FeatureCard
          icon={<Camera size={24} color="#ef4444" />}
          title="Frame Differencing"
          description="Compares consecutive frames to detect movement in real-time"
          color="#ef4444"
        />
        <FeatureCard
          icon={<Shield size={24} color="#ec4899" />}
          title="Smart Alerts"
          description="Instant notifications with haptic feedback when motion is detected"
          color="#ec4899"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Use Cases</Text>
        <View style={styles.useCaseContainer}>
          <Text style={styles.useCaseItem}>• Home surveillance monitoring</Text>
          <Text style={styles.useCaseItem}>• Outdoor night security</Text>
          <Text style={styles.useCaseItem}>• Low-light environment monitoring</Text>
          <Text style={styles.useCaseItem}>• Wildlife observation</Text>
          <Text style={styles.useCaseItem}>• Night photography assistance</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.aboutCard}>
          <Info size={20} color="#6b7280" />
          <Text style={styles.aboutText}>
            This system uses classical image processing techniques to enhance
            visibility in low-light conditions without requiring machine learning
            or cloud processing. All enhancements run locally on your device for
            privacy and real-time performance.
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Night Vision Security System v1.0</Text>
        <Text style={styles.footerSubtext}>
          Classical Image Processing Solution
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  featureCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    borderLeftWidth: 4,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
  },
  useCaseContainer: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  useCaseItem: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  aboutCard: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  aboutText: {
    flex: 1,
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 19,
  },
  footer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 12,
    color: "#9ca3af",
  },
});
