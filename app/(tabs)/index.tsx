import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
} from "react-native";
import Slider from "@react-native-community/slider";
import {
  Camera,
  Moon,
  SwitchCamera,
  Activity,
  Bell,
  BellOff,
  Brain,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Eye,
  Zap,
  Radio,
  Crosshair,
  Target,
  Gauge,
  Wifi,
  WifiOff,
  CircleDot,
  Scan,
  Settings2,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";

type EnhancementMode = "none" | "gamma" | "contrast" | "clahe" | "smart" | "full";

type EnhancementVisual = {
  overlayColor: string;
  scanLineColor: string;
  scanLineOpacity: number;
};

type TelemetrySnapshot = {
  luminance: number;
  noise: number;
  contrast: number;
  sharpness: number;
  dynamic_range: number;
  recommended_mode: string;
  processing_ms: number;
  image_size: { width: number; height: number };
};

type AIThreatResult = {
  alert: boolean;
  alert_level: string;
  reason: string;
  detected_threats: string[];
  confidence: number;
  recommended_action: string;
  ai_available: boolean;
  processing_ms: number;
};

const { height: screenHeight, width: screenWidth } = Dimensions.get("window");

// HUD Corner bracket component
const HUDCorner = ({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) => {
  const rotation = position === 'tl' ? '0deg' : position === 'tr' ? '90deg' : position === 'bl' ? '-90deg' : '180deg';
  return (
    <View style={[
      styles.hudCorner,
      position === 'tl' && { top: 55, left: 15 },
      position === 'tr' && { top: 55, right: 15 },
      position === 'bl' && { bottom: 130, left: 15 },
      position === 'br' && { bottom: 130, right: 15 },
    ]}>
      <View style={[styles.hudCornerBracket, { transform: [{ rotate: rotation }] }]} />
    </View>
  );
};

// Animated scanning crosshair
const ScanningCrosshair = ({ isActive }: { isActive: boolean }) => {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 4000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isActive, rotateAnim, pulseAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (!isActive) return null;

  return (
    <Animated.View style={[styles.scanCrosshair, { transform: [{ rotate }, { scale: pulseAnim }] }]}>
      <Crosshair size={120} color="rgba(16, 185, 129, 0.4)" strokeWidth={1} />
    </Animated.View>
  );
};

export default function NightVisionCamera() {
  const [facing, setFacing] = useState<CameraType>("back");
  const [permission, requestPermission] = useCameraPermissions();
  const [enhancementMode, setEnhancementMode] = useState<EnhancementMode>("full");
  const [motionDetection, setMotionDetection] = useState(true);
  const [motionDetected, setMotionDetected] = useState(false);
  const [intensity, setIntensity] = useState(1.0);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [enhancedPreview, setEnhancedPreview] = useState<string | null>(null);
  const [lastProcessingMs, setLastProcessingMs] = useState<number | null>(null);
  const [backendOnline, setBackendOnline] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiThreat, setAiThreat] = useState<AIThreatResult | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const previousFrameRef = useRef<string | null>(null);
  const previousBase64Ref = useRef<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const motionHistoryRef = useRef<boolean[]>([]);
  const consecutiveMotionRef = useRef<number>(0);
  const lastAnalyzeAtRef = useRef<number>(0);
  const lastEnhanceAtRef = useRef<number>(0);
  const lastAiAnalyzeRef = useRef<number>(0);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const threatPulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Load alert sound on mount
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  // Animate threat pulse when AI detects a threat
  useEffect(() => {
    if (aiThreat?.alert && aiThreat.alert_level !== 'none') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(threatPulseAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(threatPulseAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      ).start();
      
      // Clear threat after 5 seconds
      const timeout = setTimeout(() => setAiThreat(null), 5000);
      return () => {
        clearTimeout(timeout);
        threatPulseAnim.stopAnimation();
      };
    }
  }, [aiThreat, threatPulseAnim]);


  useEffect(() => {
    Animated.loop(
      Animated.timing(scanAnim, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim, scanAnim]);

  useEffect(() => {
    if (enhancementMode === "none") {
      setEnhancedPreview(null);
    }
  }, [enhancementMode]);

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
          quality: 0.4,
          base64: true,
          skipProcessing: true,
        });

        if (!photo?.uri) return;
        const currentBase64 = photo.base64 ?? null;

        const baseUrl = process.env.EXPO_PUBLIC_RORK_API_BASE_URL || "http://localhost:8001";

        if (previousFrameRef.current) {
          const formData = new FormData();
          formData.append("current", {
            uri: photo.uri,
            name: "current.jpg",
            type: "image/jpeg",
          } as any);
          formData.append("previous", {
            uri: previousFrameRef.current,
            name: "previous.jpg",
            type: "image/jpeg",
          } as any);

          const response = await fetch(`${baseUrl}/motion`, {
            method: "POST",
            body: formData,
          });

          let result: any = null;
          if (!response.ok && response.status === 422 && currentBase64 && previousBase64Ref.current) {
            const fallbackResponse = await fetch(`${baseUrl}/motion-base64`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                current_base64: currentBase64,
                previous_base64: previousBase64Ref.current,
                diff_threshold: 25.0,
                motion_ratio: 0.02,
              }),
            });
            result = await fallbackResponse.json();
          } else {
            result = await response.json();
          }
          if (!result) {
            return;
          }
          setBackendOnline(true);
          setLastProcessingMs(result.processing_ms ?? null);
          
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

        // Telemetry analysis every 2.5s
        const now = Date.now();
        if (now - lastAnalyzeAtRef.current > 2500) {
          lastAnalyzeAtRef.current = now;
          const analyzeForm = new FormData();
          analyzeForm.append("file", {
            uri: photo.uri,
            name: "analyze.jpg",
            type: "image/jpeg",
          } as any);
          const analyzeResponse = await fetch(`${baseUrl}/analyze`, {
            method: "POST",
            body: analyzeForm,
          });

          let analyzeResult: any = null;
          if (!analyzeResponse.ok && analyzeResponse.status === 422 && currentBase64) {
            const fallbackResponse = await fetch(`${baseUrl}/analyze-base64`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image_base64: currentBase64, max_side: 640 }),
            });
            analyzeResult = await fallbackResponse.json();
          } else {
            analyzeResult = await analyzeResponse.json();
          }

          if (analyzeResult) {
            setTelemetry(analyzeResult);
          }
        }

        // Enhanced preview every 3.2s when enhancement is active
        if (enhancementMode !== "none" && now - lastEnhanceAtRef.current > 3200) {
          lastEnhanceAtRef.current = now;
          const enhanceForm = new FormData();
          const modeMap: Record<EnhancementMode, string> = {
            none: "log",
            gamma: "log",
            contrast: "retinex",
            clahe: "clahe",
            smart: "smart",
            full: "all",
          };
          enhanceForm.append("file", {
            uri: photo.uri,
            name: "enhance.jpg",
            type: "image/jpeg",
          } as any);
          enhanceForm.append("mode", modeMap[enhancementMode]);
          enhanceForm.append("intensity", intensity.toString());
          enhanceForm.append("include_stats", "true");
          const enhanceResponse = await fetch(`${baseUrl}/enhance`, {
            method: "POST",
            body: enhanceForm,
          });

          let enhanceResult: any = null;
          if (!enhanceResponse.ok && enhanceResponse.status === 422 && currentBase64) {
            const fallbackResponse = await fetch(`${baseUrl}/enhance-base64`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                image_base64: currentBase64,
                mode: modeMap[enhancementMode],
                intensity,
                include_stats: true,
              }),
            });
            enhanceResult = await fallbackResponse.json();
          } else {
            enhanceResult = await enhanceResponse.json();
          }

          if (enhanceResult?.image_base64) {
            setEnhancedPreview(enhanceResult.image_base64);
          }
        }

        previousFrameRef.current = photo.uri;
        if (currentBase64) {
          previousBase64Ref.current = currentBase64;
        }
      } catch (err) {
        setBackendOnline(false);
        console.warn("Motion detection error:", err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [motionDetection, permission, enhancementMode, intensity]);

  // Independent AI threat detection - runs separately from motion detection
  useEffect(() => {
    if (!aiEnabled || !permission?.granted) return;

    const aiInterval = setInterval(async () => {
      if (!cameraRef.current || aiAnalyzing) return;

      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.5,
          base64: true,
          skipProcessing: true,
        });

        if (!photo?.base64) return;

        const baseUrl = process.env.EXPO_PUBLIC_RORK_API_BASE_URL || "http://localhost:8001";
        
        setAiAnalyzing(true);
        const aiResponse = await fetch(`${baseUrl}/ai/smart-alert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_base64: photo.base64,
            detect_classes: ["person", "intruder", "weapon", "vehicle", "suspicious_activity"],
            confidence_threshold: 0.5,
          }),
        });
        
        if (aiResponse.ok) {
          const aiResult = await aiResponse.json();
          setAiThreat(aiResult);
          setBackendOnline(true);
          console.log("🤖 AI Threat Analysis:", aiResult);
          
          if (aiResult.alert && aiResult.alert_level !== 'none') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            
            // Play alert sound for AI threats
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
          }
        }
      } catch (aiErr) {
        console.warn("AI analysis error:", aiErr);
      } finally {
        setAiAnalyzing(false);
      }
    }, 3000); // Run AI analysis every 3 seconds (faster)

    return () => clearInterval(aiInterval);
  }, [aiEnabled, permission, aiAnalyzing]);

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

  const toggleAiDetection = useCallback(() => {
    setAiEnabled((prev) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (prev) setAiThreat(null); // Clear threat when disabling
      return !prev;
    });
  }, []);

  const getEnhancementVisuals = (): EnhancementVisual | null => {
    // Apply intensity multiplier to all visual effects
    const intensityMultiplier = intensity;
    
    switch (enhancementMode) {
      case "gamma":
        return {
          overlayColor: `rgba(59, 130, 246, ${0.08 * intensityMultiplier})`,
          scanLineColor: "#60a5fa",
          scanLineOpacity: 0.4 * intensityMultiplier,
        };
      case "contrast":
        return {
          overlayColor: `rgba(16, 185, 129, ${0.08 * intensityMultiplier})`,
          scanLineColor: "#10b981",
          scanLineOpacity: 0.4 * intensityMultiplier,
        };
      case "clahe":
        return {
          overlayColor: `rgba(168, 85, 247, ${0.08 * intensityMultiplier})`,
          scanLineColor: "#a855f7",
          scanLineOpacity: 0.5 * intensityMultiplier,
        };
      case "smart":
        return {
          overlayColor: `rgba(251, 191, 36, ${0.10 * intensityMultiplier})`,
          scanLineColor: "#fbbf24",
          scanLineOpacity: 0.5 * intensityMultiplier,
        };
      case "full":
        return {
          overlayColor: `rgba(34, 197, 94, ${0.10 * intensityMultiplier})`,
          scanLineColor: "#22c55e",
          scanLineOpacity: 0.6 * intensityMultiplier,
        };
      case "none":
      default:
        return null;
    }
  };

  const getEnhancementLabel = () => {
    switch (enhancementMode) {
      case "none":
        return "STD";
      case "gamma":
        return "γ";
      case "contrast":
        return "CNT";
      case "clahe":
        return "CLAHE";
      case "smart":
        return "SMART";
      case "full":
        return "FULL";
      default:
        return "—";
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#020617', '#0a0f1a', '#000']} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingContainer}>
          <Animated.View style={styles.loadingIcon}>
            <Eye size={48} color="#10b981" />
          </Animated.View>
          <Text style={styles.loadingTitle}>INITIALIZING</Text>
          <Text style={styles.loadingSubtitle}>Requesting camera access...</Text>
          <View style={styles.loadingBar}>
            <View style={styles.loadingBarFill} />
          </View>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#020617', '#0a0f1a', '#000']} style={StyleSheet.absoluteFill} />
        <View style={styles.permissionContainer}>
          <View style={styles.permissionIconContainer}>
            <Camera size={56} color="#10b981" />
            <View style={styles.permissionIconRing} />
          </View>
          <Text style={styles.permissionTitle}>CAMERA ACCESS REQUIRED</Text>
          <Text style={styles.permissionSubtitle}>
            Enable camera to activate night vision surveillance system
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <LinearGradient
              colors={['#10b981', '#059669']}
              style={styles.permissionButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <ShieldCheck size={20} color="#fff" />
              <Text style={styles.permissionButtonText}>GRANT ACCESS</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
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
        {/* HUD Overlay Container */}
        <View style={styles.overlay}>
          {/* HUD Corners */}
          <HUDCorner position="tl" />
          <HUDCorner position="tr" />
          <HUDCorner position="bl" />
          <HUDCorner position="br" />

          {/* Center crosshair when AI is analyzing */}
          <ScanningCrosshair isActive={aiAnalyzing} />

          {/* Top gradient overlay */}
          <LinearGradient
            colors={['rgba(0,0,0,0.7)', 'transparent']}
            style={styles.topGradient}
          />

          {/* Motion Alert Banner */}
          {motionDetected && motionDetection && (
            <Animated.View
              style={[
                styles.motionAlert,
                {
                  transform: [
                    {
                      scale: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.02],
                      }),
                    },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={['#ef4444', '#dc2626']}
                style={styles.motionAlertGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={styles.motionAlertIcon}>
                  <Bell size={18} color="#fff" />
                </View>
                <Text style={styles.motionAlertText}>⚠ MOTION DETECTED</Text>
                <View style={styles.motionAlertPulse} />
              </LinearGradient>
            </Animated.View>
          )}

          {/* Top Status Bar */}
          <View style={styles.topStatusBar}>
            <View style={styles.statusLeft}>
              <View style={[styles.statusChip, styles.statusChipActive]}>
                <CircleDot size={10} color="#22c55e" />
                <Text style={styles.statusChipText}>LIVE</Text>
              </View>
              <View style={styles.statusChip}>
                <Gauge size={12} color="#60a5fa" />
                <Text style={styles.statusChipText}>{getEnhancementLabel()}</Text>
              </View>
            </View>
            <View style={styles.statusRight}>
              <View style={[styles.statusChip, backendOnline ? styles.statusChipOnline : styles.statusChipOffline]}>
                {backendOnline ? <Wifi size={12} color="#22c55e" /> : <WifiOff size={12} color="#ef4444" />}
                <Text style={[styles.statusChipText, !backendOnline && { color: '#ef4444' }]}>
                  {backendOnline ? 'ONLINE' : 'OFFLINE'}
                </Text>
              </View>
              <View style={[styles.statusChip, aiEnabled ? styles.statusChipAI : null]}>
                <Brain size={12} color={aiEnabled ? '#a855f7' : '#6b7280'} />
                <Text style={[styles.statusChipText, aiEnabled && { color: '#a855f7' }]}>
                  {aiEnabled ? (aiAnalyzing ? 'SCANNING' : 'AI') : 'AI OFF'}
                </Text>
              </View>
            </View>
          </View>

          {/* AI Status Panel - Clear State */}
          {aiEnabled && aiThreat && !aiThreat.alert && (
            <View style={styles.aiClearPanel}>
              <View style={styles.aiClearHeader}>
                <View style={styles.aiClearIconContainer}>
                  <ShieldCheck size={20} color="#22c55e" />
                </View>
                <View style={styles.aiClearInfo}>
                  <Text style={styles.aiClearTitle}>SECTOR CLEAR</Text>
                  <Text style={styles.aiClearSubtitle}>{aiThreat.reason || "No threats detected"}</Text>
                </View>
              </View>
              <View style={styles.aiClearMeta}>
                <Text style={styles.aiClearMetaText}>
                  Scan: {aiThreat.processing_ms?.toFixed(0) || "--"}ms
                </Text>
                <View style={styles.aiClearDot} />
                <Text style={styles.aiClearMetaText}>
                  {aiThreat.ai_available ? "AI Online" : "AI Offline"}
                </Text>
              </View>
            </View>
          )}

          {/* AI Analyzing Indicator */}
          {aiEnabled && aiAnalyzing && !aiThreat && (
            <View style={styles.aiAnalyzingPanel}>
              <View style={styles.aiAnalyzingContent}>
                <Scan size={18} color="#a855f7" />
                <Text style={styles.aiAnalyzingText}>AI SCANNING...</Text>
              </View>
              <View style={styles.aiAnalyzingBar}>
                <Animated.View style={styles.aiAnalyzingBarFill} />
              </View>
            </View>
          )}

          {/* AI Threat Alert Panel */}
          {aiThreat && aiThreat.alert && (
            <Animated.View 
              style={[
                styles.threatPanel,
                {
                  opacity: threatPulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.95, 1],
                  }),
                  transform: [{
                    scale: threatPulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.01],
                    }),
                  }],
                },
              ]}
            >
              <LinearGradient
                colors={[
                  aiThreat.alert_level === 'critical' ? 'rgba(220, 38, 38, 0.95)' :
                  aiThreat.alert_level === 'high' ? 'rgba(234, 88, 12, 0.95)' :
                  'rgba(234, 179, 8, 0.95)',
                  'rgba(0, 0, 0, 0.9)'
                ]}
                style={styles.threatGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              >
                <View style={styles.threatHeader}>
                  <View style={styles.threatIconContainer}>
                    <ShieldAlert size={28} color="#fff" />
                  </View>
                  <View style={styles.threatTitleContainer}>
                    <Text style={styles.threatLevel}>
                      {aiThreat.alert_level?.toUpperCase()} ALERT
                    </Text>
                    <Text style={styles.threatReason}>{aiThreat.reason}</Text>
                  </View>
                </View>
                
                {aiThreat.detected_threats && aiThreat.detected_threats.length > 0 && (
                  <View style={styles.threatList}>
                    {aiThreat.detected_threats.slice(0, 3).map((threat, idx) => (
                      <View key={idx} style={styles.threatItem}>
                        <AlertTriangle size={12} color="#fbbf24" />
                        <Text style={styles.threatItemText}>{threat}</Text>
                      </View>
                    ))}
                  </View>
                )}
                
                <View style={styles.threatFooter}>
                  <Text style={styles.threatAction}>
                    ⚡ {aiThreat.recommended_action}
                  </Text>
                  <Text style={styles.threatConfidence}>
                    {((aiThreat.confidence || 0) * 100).toFixed(0)}% • {aiThreat.processing_ms?.toFixed(0)}ms
                  </Text>
                </View>
              </LinearGradient>
            </Animated.View>
          )}

          {/* Bottom gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.bottomGradient}
          />

          {/* Main Control Bar */}
          <View style={styles.controlBar}>
            {/* Motion Toggle */}
            <TouchableOpacity
              style={[styles.controlBtn, motionDetection && styles.controlBtnActive]}
              onPress={toggleMotionDetection}
            >
              <View style={styles.controlBtnInner}>
                {motionDetection ? (
                  <Bell size={22} color="#22c55e" />
                ) : (
                  <BellOff size={22} color="#6b7280" />
                )}
              </View>
              <Text style={[styles.controlBtnLabel, motionDetection && styles.controlBtnLabelActive]}>
                Motion
              </Text>
            </TouchableOpacity>

            {/* Enhancement Mode - Main Button */}
            <TouchableOpacity
              style={styles.mainControlBtn}
              onPress={cycleEnhancementMode}
            >
              <LinearGradient
                colors={['#10b981', '#059669']}
                style={styles.mainControlBtnGradient}
              >
                <Eye size={32} color="#fff" />
              </LinearGradient>
              <Text style={styles.mainControlBtnLabel}>{getEnhancementLabel()}</Text>
            </TouchableOpacity>

            {/* Camera Flip */}
            <TouchableOpacity style={styles.controlBtn} onPress={toggleCameraFacing}>
              <View style={styles.controlBtnInner}>
                <SwitchCamera size={22} color="#60a5fa" />
              </View>
              <Text style={styles.controlBtnLabel}>Flip</Text>
            </TouchableOpacity>

            {/* AI Toggle */}
            <TouchableOpacity 
              style={[styles.controlBtn, aiEnabled && styles.controlBtnAI]} 
              onPress={toggleAiDetection}
            >
              <View style={[styles.controlBtnInner, aiEnabled && styles.controlBtnInnerAI]}>
                <Brain size={22} color={aiEnabled ? "#a855f7" : "#6b7280"} />
              </View>
              <Text style={[styles.controlBtnLabel, aiEnabled && { color: '#a855f7' }]}>
                {aiEnabled ? "AI On" : "AI Off"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Right Side Info Panel */}
          <View style={styles.sidePanel}>
            <View style={styles.sidePanelHeader}>
              <Settings2 size={14} color="#64748b" />
              <Text style={styles.sidePanelTitle}>STATUS</Text>
            </View>
            <View style={styles.sidePanelItem}>
              <Text style={styles.sidePanelLabel}>Mode</Text>
              <Text style={styles.sidePanelValue}>{getEnhancementLabel()}</Text>
            </View>
            <View style={styles.sidePanelItem}>
              <Text style={styles.sidePanelLabel}>Motion</Text>
              <View style={[styles.sidePanelIndicator, motionDetection && styles.sidePanelIndicatorOn]} />
            </View>
            <View style={styles.sidePanelItem}>
              <Text style={styles.sidePanelLabel}>Camera</Text>
              <Text style={styles.sidePanelValue}>{facing === "back" ? "Rear" : "Front"}</Text>
            </View>
            <View style={styles.sidePanelItem}>
              <Text style={styles.sidePanelLabel}>Latency</Text>
              <Text style={styles.sidePanelValue}>
                {lastProcessingMs ? `${lastProcessingMs.toFixed(0)}ms` : "--"}
              </Text>
            </View>
            {/* Intensity Slider */}
            <View style={styles.intensitySection}>
              <View style={styles.intensityHeader}>
                <Zap size={12} color="#10b981" />
                <Text style={styles.intensityLabel}>INT</Text>
                <Text style={styles.intensityValue}>{(intensity * 100).toFixed(0)}%</Text>
              </View>
              <Slider
                style={styles.intensitySlider}
                minimumValue={0}
                maximumValue={2}
                value={intensity}
                onValueChange={setIntensity}
                minimumTrackTintColor="#10b981"
                maximumTrackTintColor="rgba(255,255,255,0.2)"
                thumbTintColor="#10b981"
                step={0.1}
              />
            </View>
          </View>

          {/* Left Side Telemetry Panel */}
          {telemetry && (
            <View style={styles.telemetryPanel}>
              <View style={styles.telemetryHeader}>
                <Radio size={14} color="#60a5fa" />
                <Text style={styles.telemetryTitle}>TELEMETRY</Text>
              </View>
              <View style={styles.telemetryGrid}>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>LUM</Text>
                  <Text style={styles.telemetryValue}>
                    {typeof telemetry.luminance === "number" ? telemetry.luminance.toFixed(0) : "--"}
                  </Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>NOISE</Text>
                  <Text style={styles.telemetryValue}>
                    {typeof telemetry.noise === "number" ? telemetry.noise.toFixed(1) : "--"}
                  </Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>SHARP</Text>
                  <Text style={styles.telemetryValue}>
                    {typeof telemetry.sharpness === "number" ? telemetry.sharpness.toFixed(0) : "--"}
                  </Text>
                </View>
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>DR</Text>
                  <Text style={styles.telemetryValue}>
                    {typeof telemetry.dynamic_range === "number" ? telemetry.dynamic_range.toFixed(0) : "--"}
                  </Text>
                </View>
              </View>
              <View style={styles.telemetryRecommend}>
                <Target size={10} color="#f59e0b" />
                <Text style={styles.telemetryRecommendText}>
                  {telemetry.recommended_mode ?? "--"}
                </Text>
              </View>
            </View>
          )}
        </View>
      </CameraView>

      {/* Enhancement Overlay Effect */}
      {getEnhancementVisuals() && (
        <View
          style={[
            styles.enhancementOverlay,
            { backgroundColor: getEnhancementVisuals()!.overlayColor },
          ]}
          pointerEvents="none"
        >
          <Animated.View
            style={[
              styles.scanLine,
              {
                opacity: getEnhancementVisuals()!.scanLineOpacity,
                backgroundColor: getEnhancementVisuals()!.scanLineColor,
                transform: [
                  {
                    translateY: scanAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-20, screenHeight + 20],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      )}

      {/* Enhanced Preview Card */}
      {enhancedPreview && (
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Eye size={12} color="#10b981" />
            <Text style={styles.previewTitle}>ENHANCED</Text>
          </View>
          <Image
            source={{ uri: `data:image/png;base64,${enhancedPreview}` }}
            style={styles.previewImage}
            resizeMode="cover"
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
  },
  // Loading screen styles
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingIcon: {
    marginBottom: 20,
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#e2e8f0",
    letterSpacing: 4,
    marginBottom: 8,
  },
  loadingSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 20,
  },
  loadingBar: {
    width: 200,
    height: 3,
    backgroundColor: "rgba(100, 116, 139, 0.3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  loadingBarFill: {
    width: "60%",
    height: "100%",
    backgroundColor: "#10b981",
  },
  // Permission screen styles
  permissionContainer: {
    alignItems: "center",
    padding: 40,
  },
  permissionIconContainer: {
    position: "relative",
    marginBottom: 30,
  },
  permissionIconRing: {
    position: "absolute",
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#e2e8f0",
    letterSpacing: 2,
    marginBottom: 12,
    textAlign: "center",
  },
  permissionSubtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  permissionButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  permissionButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
  },
  // Camera styles
  camera: {
    flex: 1,
    width: "100%",
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  // HUD Corner brackets
  hudCorner: {
    position: "absolute",
    width: 24,
    height: 24,
    zIndex: 10,
  },
  hudCornerBracket: {
    width: 24,
    height: 24,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderColor: "rgba(16, 185, 129, 0.6)",
  },
  // Scanning crosshair
  scanCrosshair: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -60,
    marginLeft: -60,
  },
  // Gradients
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  // Motion alert
  motionAlert: {
    position: "absolute",
    top: 55,
    left: 20,
    right: 20,
    borderRadius: 10,
    overflow: "hidden",
    zIndex: 100,
  },
  motionAlertGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  motionAlertIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  motionAlertText: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
  },
  motionAlertPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  // Top status bar
  topStatusBar: {
    position: "absolute",
    top: Platform.OS === "ios" ? 55 : 45,
    left: 15,
    right: 15,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statusLeft: {
    flexDirection: "row",
    gap: 8,
  },
  statusRight: {
    flexDirection: "row",
    gap: 8,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.3)",
  },
  statusChipActive: {
    borderColor: "rgba(34, 197, 94, 0.5)",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  statusChipOnline: {
    borderColor: "rgba(34, 197, 94, 0.4)",
  },
  statusChipOffline: {
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  statusChipAI: {
    borderColor: "rgba(168, 85, 247, 0.4)",
    backgroundColor: "rgba(168, 85, 247, 0.1)",
  },
  statusChipText: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  // AI Clear Panel
  aiClearPanel: {
    position: "absolute",
    top: 110,
    left: 15,
    right: 15,
    backgroundColor: "rgba(5, 20, 15, 0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.4)",
    padding: 14,
  },
  aiClearHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  aiClearIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  aiClearInfo: {
    flex: 1,
  },
  aiClearTitle: {
    color: "#22c55e",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  aiClearSubtitle: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 2,
  },
  aiClearMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aiClearMetaText: {
    color: "rgba(148, 163, 184, 0.6)",
    fontSize: 10,
  },
  aiClearDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(148, 163, 184, 0.4)",
  },
  // AI Analyzing Panel
  aiAnalyzingPanel: {
    position: "absolute",
    top: 110,
    left: 15,
    right: 15,
    backgroundColor: "rgba(15, 10, 25, 0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.4)",
    padding: 14,
  },
  aiAnalyzingContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  aiAnalyzingText: {
    color: "#a855f7",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  aiAnalyzingBar: {
    height: 3,
    backgroundColor: "rgba(168, 85, 247, 0.2)",
    borderRadius: 2,
    overflow: "hidden",
  },
  aiAnalyzingBarFill: {
    width: "60%",
    height: "100%",
    backgroundColor: "#a855f7",
  },
  // Threat Panel
  threatPanel: {
    position: "absolute",
    top: 110,
    left: 15,
    right: 15,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  threatGradient: {
    padding: 16,
  },
  threatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  threatIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  threatTitleContainer: {
    flex: 1,
  },
  threatLevel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },
  threatReason: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    marginTop: 2,
  },
  threatList: {
    marginBottom: 10,
    gap: 6,
  },
  threatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 8,
  },
  threatItemText: {
    color: "#fbbf24",
    fontSize: 12,
    fontWeight: "600",
  },
  threatFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  threatAction: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  threatConfidence: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
  },
  // Control bar
  controlBar: {
    position: "absolute",
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 12,
    paddingHorizontal: 15,
  },
  controlBtn: {
    alignItems: "center",
    gap: 6,
  },
  controlBtnActive: {},
  controlBtnAI: {},
  controlBtnInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    borderWidth: 2,
    borderColor: "rgba(100, 116, 139, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnInnerAI: {
    borderColor: "rgba(168, 85, 247, 0.5)",
    backgroundColor: "rgba(168, 85, 247, 0.1)",
  },
  controlBtnLabel: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "600",
  },
  controlBtnLabelActive: {
    color: "#22c55e",
  },
  mainControlBtn: {
    alignItems: "center",
    gap: 8,
  },
  mainControlBtnGradient: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  mainControlBtnLabel: {
    color: "#10b981",
    fontSize: 11,
    fontWeight: "700",
  },
  // Side panel
  sidePanel: {
    position: "absolute",
    top: 110,
    right: 15,
    width: 100,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.2)",
    padding: 12,
  },
  sidePanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(100, 116, 139, 0.2)",
  },
  sidePanelTitle: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
  },
  sidePanelItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sidePanelLabel: {
    color: "#64748b",
    fontSize: 10,
  },
  sidePanelValue: {
    color: "#e2e8f0",
    fontSize: 10,
    fontWeight: "600",
  },
  sidePanelIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(100, 116, 139, 0.4)",
  },
  sidePanelIndicatorOn: {
    backgroundColor: "#22c55e",
    shadowColor: "#22c55e",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  // Intensity section
  intensitySection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(100, 116, 139, 0.2)",
  },
  intensityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  intensityLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "600",
    flex: 1,
  },
  intensityValue: {
    color: "#10b981",
    fontSize: 10,
    fontWeight: "700",
  },
  intensitySlider: {
    width: "100%",
    height: 24,
    marginLeft: -4,
  },
  // Telemetry panel
  telemetryPanel: {
    position: "absolute",
    left: 15,
    bottom: 130,
    width: 120,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.2)",
    padding: 12,
  },
  telemetryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(96, 165, 250, 0.15)",
  },
  telemetryTitle: {
    color: "#60a5fa",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
  },
  telemetryGrid: {
    gap: 6,
  },
  telemetryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  telemetryLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "600",
  },
  telemetryValue: {
    color: "#e2e8f0",
    fontSize: 10,
    fontWeight: "700",
  },
  telemetryRecommend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(96, 165, 250, 0.15)",
  },
  telemetryRecommendText: {
    color: "#f59e0b",
    fontSize: 9,
    fontWeight: "600",
  },
  // Enhancement overlay
  enhancementOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: "none",
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    top: 0,
  },
  // Preview card
  previewCard: {
    position: "absolute",
    right: 15,
    bottom: 130,
    width: 120,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    padding: 10,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  previewTitle: {
    color: "#10b981",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
  },
  previewImage: {
    width: "100%",
    height: 70,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
});
