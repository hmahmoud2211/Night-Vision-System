import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from "react-native";
import Slider from "@react-native-community/slider";
import {
  Camera,
  Moon,
  SwitchCamera,
  Activity,
  Bell,
  BellOff,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";

type EnhancementMode = "none" | "gamma" | "contrast" | "clahe" | "smart" | "full";

type EnhancementVisual = {
  overlayColor: string;
  scanLineColor: string;
  scanLineOpacity: number;
};

export default function NightVisionCamera() {
  const [facing, setFacing] = useState<CameraType>("back");
  const [permission, requestPermission] = useCameraPermissions();
  const [enhancementMode, setEnhancementMode] = useState<EnhancementMode>("full");
  const [motionDetection, setMotionDetection] = useState(true);
  const [motionDetected, setMotionDetected] = useState(false);
  const [intensity, setIntensity] = useState(1.0);

  const cameraRef = useRef<CameraView>(null);
  const previousFrameRef = useRef<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const motionHistoryRef = useRef<boolean[]>([]);
  const consecutiveMotionRef = useRef<number>(0);

  useEffect(() => {
    // Load alert sound on mount
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  useEffect(() => {
    if (motionDetected && motionDetection) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      
      // Play alert sound
      const playAlert = async () => {
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
            { shouldPlay: true, volume: 1.0 }
          );
          soundRef.current = sound;
          await sound.playAsync();
        } catch (err) {
          console.warn('Alert sound error:', err);
        }
      };
      playAlert();
      
      const timeout = setTimeout(() => setMotionDetected(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [motionDetected, motionDetection]);

  useEffect(() => {
    if (!motionDetection || !permission?.granted) return;

    const interval = setInterval(async () => {
      if (!cameraRef.current) return;

      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.3,
          base64: true,
          skipProcessing: true,
        });

        if (!photo?.base64) return;

        // Strip data URI prefix if present (sometimes camera returns full data URI)
        let currentFrame = photo.base64;
        if (currentFrame.startsWith('data:')) {
          currentFrame = currentFrame.split(',')[1];
        }
        
        if (previousFrameRef.current) {
          const formData = new FormData();
          
          // Detect format from base64 header (PNG starts with iVBORw, JPEG with /9j/)
          const isPNG = currentFrame.startsWith('iVBORw');
          const mimeType = isPNG ? 'image/png' : 'image/jpeg';
          const ext = isPNG ? 'png' : 'jpg';
          
          // Convert base64 to File objects for proper multipart upload
          const currDataUri = `data:${mimeType};base64,${currentFrame}`;
          // previousFrameRef stores raw base64, not data URI
          const prevDataUri = `data:${mimeType};base64,${previousFrameRef.current}`;
          
          const currBlob = await fetch(currDataUri).then(r => r.blob());
          const prevBlob = await fetch(prevDataUri).then(r => r.blob());
          
          // Create File objects from blobs
          const currFile = new File([currBlob], `current.${ext}`, { type: mimeType });
          const prevFile = new File([prevBlob], `previous.${ext}`, { type: mimeType });
          
          formData.append("current", currFile);
          formData.append("previous", prevFile);

          const baseUrl = process.env.EXPO_PUBLIC_RORK_API_BASE_URL || "http://localhost:8000";
          const response = await fetch(`${baseUrl}/motion`, {
            method: "POST",
            body: formData,
          });

          const result = await response.json();
          
          // Smart temporal filtering: require motion in 2 out of last 3 frames
          motionHistoryRef.current.push(result.motion);
          if (motionHistoryRef.current.length > 3) {
            motionHistoryRef.current.shift();
          }
          
          const motionCount = motionHistoryRef.current.filter(Boolean).length;
          
          // Smart detection criteria:
          // 1. Motion detected in 2+ of last 3 frames
          // 2. Confidence above threshold (0.35)
          // 3. At least one detected object
          const hasConsistentMotion = motionCount >= 2;
          const hasHighConfidence = result.confidence > 0.35;
          const hasObjects = result.objects_count > 0;
          
          // Check for human-like objects (higher priority)
          const humanlikeObjects = result.objects?.filter((obj: any) => obj.is_humanlike) || [];
          const hasHumanlike = humanlikeObjects.length > 0;
          
          // Final smart decision
          const smartMotionDetected = hasConsistentMotion && (
            (hasHighConfidence && hasObjects) ||
            (hasHumanlike && result.confidence > 0.25)  // Lower threshold for human-like
          );
          
          if (smartMotionDetected) {
            consecutiveMotionRef.current += 1;
            // Trigger alert only after 2 consecutive positive detections
            if (consecutiveMotionRef.current >= 2) {
              setMotionDetected(true);
              console.log(`🎯 Smart Motion Detected:`, {
                confidence: result.confidence?.toFixed(2),
                objects: result.objects_count,
                humanlike: humanlikeObjects.length,
                magnitude: result.motion_magnitude?.toFixed(1),
                brightness: result.avg_brightness?.toFixed(0),
                center: result.motion_center,
              });
            }
          } else {
            consecutiveMotionRef.current = 0;
          }
        }

        previousFrameRef.current = currentFrame;
      } catch (err) {
        console.warn("Motion detection error:", err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [motionDetection, permission]);

  const toggleCameraFacing = useCallback(() => {
    setFacing((current: CameraType) => (current === "back" ? "front" : "back"));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const cycleEnhancementMode = useCallback(() => {
    const modes: EnhancementMode[] = ["none", "gamma", "contrast", "clahe", "smart", "full"];
    const currentIndex = modes.indexOf(enhancementMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setEnhancementMode(nextMode);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [enhancementMode]);

  const toggleMotionDetection = useCallback(() => {
    setMotionDetection((prev) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return !prev;
    });
  }, []);

  const getEnhancementVisuals = (): EnhancementVisual | null => {
    switch (enhancementMode) {
      case "gamma":
        return {
          overlayColor: "rgba(59, 130, 246, 0.08)",
          scanLineColor: "#60a5fa",
          scanLineOpacity: 0.4,
        };
      case "contrast":
        return {
          overlayColor: "rgba(16, 185, 129, 0.08)",
          scanLineColor: "#10b981",
          scanLineOpacity: 0.4,
        };
      case "clahe":
        return {
          overlayColor: "rgba(168, 85, 247, 0.08)",
          scanLineColor: "#a855f7",
          scanLineOpacity: 0.5,
        };
      case "smart":
        return {
          overlayColor: "rgba(251, 191, 36, 0.10)",
          scanLineColor: "#fbbf24",
          scanLineOpacity: 0.5,
        };
      case "full":
        return {
          overlayColor: "rgba(34, 197, 94, 0.10)",
          scanLineColor: "#22c55e",
          scanLineOpacity: 0.6,
        };
      case "none":
      default:
        return null;
    }
  };

  const getEnhancementLabel = () => {
    switch (enhancementMode) {
      case "none":
        return "Normal";
      case "gamma":
        return "Gamma";
      case "contrast":
        return "Contrast";
      case "clahe":
        return "CLAHE";
      case "smart":
        return "Smart AI";
      case "full":
        return "Full Enhancement";
      default:
        return "Unknown";
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Camera size={64} color="#10b981" style={{ marginBottom: 20 }} />
        <Text style={styles.message}>Camera access is required</Text>
        <Text style={styles.subMessage}>
          Enable camera to use night vision features
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        animateShutter={false}
      >
        <View style={styles.overlay}>
          {motionDetected && motionDetection && (
            <View style={styles.motionAlert}>
              <Bell size={20} color="#fff" />
              <Text style={styles.motionAlertText}>MOTION DETECTED</Text>
            </View>
          )}

          <View style={styles.statusBar}>
            <View style={styles.statusBadge}>
              <Activity size={14} color="#10b981" />
              <Text style={styles.statusText}>ACTIVE</Text>
            </View>
            <View style={styles.statusBadge}>
              <Moon size={14} color="#3b82f6" />
              <Text style={styles.statusText}>{getEnhancementLabel()}</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={toggleMotionDetection}
            >
              {motionDetection ? (
                <Bell size={24} color="#fff" />
              ) : (
                <BellOff size={24} color="#fff" />
              )}
              <Text style={styles.controlLabel}>
                {motionDetection ? "Motion On" : "Motion Off"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.mainButton]}
              onPress={cycleEnhancementMode}
            >
              <Moon size={32} color="#fff" />
              <Text style={styles.controlLabel}>{getEnhancementLabel()}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton} onPress={toggleCameraFacing}>
              <SwitchCamera size={24} color="#fff" />
              <Text style={styles.controlLabel}>Flip</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoPanel}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Enhancement:</Text>
              <Text style={styles.infoValue}>{getEnhancementLabel()}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Motion Detection:</Text>
              <Text style={styles.infoValue}>{motionDetection ? "ON" : "OFF"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Camera:</Text>
              <Text style={styles.infoValue}>
                {facing === "back" ? "Rear" : "Front"}
              </Text>
            </View>
            <View style={styles.intensityContainer}>
              <Text style={styles.intensityLabel}>Intensity: {(intensity * 100).toFixed(0)}%</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={2}
                value={intensity}
                onValueChange={setIntensity}
                minimumTrackTintColor="#10b981"
                maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
                thumbTintColor="#10b981"
                step={0.1}
              />
            </View>
          </View>
        </View>
      </CameraView>

      {getEnhancementVisuals() && (
        <View
          style={[
            styles.enhancementOverlay,
            { backgroundColor: getEnhancementVisuals()!.overlayColor },
          ]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.scanLine,
              {
                opacity: getEnhancementVisuals()!.scanLineOpacity,
                backgroundColor: getEnhancementVisuals()!.scanLineColor,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  message: {
    fontSize: 18,
    color: "#fff",
    marginBottom: 8,
    fontWeight: "600",
  },
  subMessage: {
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 24,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  permissionButton: {
    backgroundColor: "#10b981",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  camera: {
    flex: 1,
    width: "100%",
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  motionAlert: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: "#ef4444",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  motionAlertText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
  },
  statusBar: {
    position: "absolute",
    top: 120,
    left: 20,
    flexDirection: "row",
    gap: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  controls: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  controlButton: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
    minWidth: 80,
  },
  mainButton: {
    backgroundColor: "rgba(16, 185, 129, 0.8)",
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderColor: "rgba(255, 255, 255, 0.3)",
    minWidth: 100,
  },
  controlLabel: {
    color: "#fff",
    fontSize: 12,
    marginTop: 6,
    fontWeight: "600",
  },
  infoPanel: {
    position: "absolute",
    top: 60,
    right: 20,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 16,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    color: "#9ca3af",
    fontSize: 13,
    fontWeight: "500",
  },
  infoValue: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  intensityContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  intensityLabel: {
    color: "#10b981",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  slider: {
    width: "100%",
    height: 30,
  },
  enhancementOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 255, 100, 0.02)",
    pointerEvents: "none",
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#10b981",
    top: "50%",
  },
});
