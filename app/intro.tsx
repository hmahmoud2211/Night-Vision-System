import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { Shield, Scan, Eye, Radio, Crosshair, CircleDot } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Animated particle component for background effect
const Particle = ({ delay, startX, startY }: { delay: number; startX: number; startY: number }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -100, duration: 2500, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.2, duration: 2500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 800, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -150, duration: 500, useNativeDriver: true }),
        ]),
        Animated.timing(translateY, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.5, duration: 0, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [delay, opacity, translateY, scale]);

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: startX,
          top: startY,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    />
  );
};

// Scanning ring animation
const ScanRing = ({ delay, size }: { delay: number; size: number }) => {
  const scale = useRef(new Animated.Value(0.3)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 2000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 2000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.3, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.9, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [delay, scale, opacity]);

  return (
    <Animated.View
      style={[
        styles.scanRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
};

export default function IntroScreen() {
  const router = useRouter();
  const [bootPhase, setBootPhase] = useState(0);
  const [bootText, setBootText] = useState("");

  // Animation values
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(30)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const hudOpacity = useRef(new Animated.Value(0)).current;
  const scanLineY = useRef(new Animated.Value(0)).current;
  const bootTextOpacity = useRef(new Animated.Value(0)).current;
  const cornerOpacity = useRef(new Animated.Value(0)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  const bootSequence = [
    "INITIALIZING NEURAL CORE...",
    "LOADING VISION ALGORITHMS...",
    "CALIBRATING SENSORS...",
    "AI DETECTION ONLINE...",
    "SYSTEM READY",
  ];

  useEffect(() => {
    // Phase 1: Logo entrance with dramatic scale and rotation
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
        Animated.timing(logoRotate, { toValue: 1, duration: 1000, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
        Animated.timing(cornerOpacity, { toValue: 1, duration: 600, delay: 300, useNativeDriver: true }),
      ]),
    ]).start();

    // Continuous glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    // Scan line animation
    Animated.loop(
      Animated.timing(scanLineY, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true })
    ).start();

    // Phase 2: Title and subtitle reveal
    const titleTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(titleTranslateY, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
      ]).start();
    }, 600);

    const subtitleTimer = setTimeout(() => {
      Animated.timing(subtitleOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }, 1000);

    // Phase 3: HUD elements and boot sequence
    const hudTimer = setTimeout(() => {
      Animated.timing(hudOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      Animated.timing(bootTextOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, 1200);

    // Boot sequence text
    let bootIndex = 0;
    const bootInterval = setInterval(() => {
      if (bootIndex < bootSequence.length) {
        setBootText(bootSequence[bootIndex]);
        setBootPhase(bootIndex + 1);
        bootIndex++;
      }
    }, 500);

    // Progress bar animation
    Animated.timing(progressWidth, {
      toValue: 1,
      duration: 2500,
      delay: 1200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

    // Navigate after animation
    const navTimeout = setTimeout(() => {
      router.replace("/(tabs)");
    }, 4000);

    return () => {
      clearTimeout(titleTimer);
      clearTimeout(subtitleTimer);
      clearTimeout(hudTimer);
      clearInterval(bootInterval);
      clearTimeout(navTimeout);
    };
  }, []);

  const glowScale = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });
  const glowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.8] });
  const logoRotation = logoRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scanLineTranslate = scanLineY.interpolate({ inputRange: [0, 1], outputRange: [-SCREEN_HEIGHT / 2, SCREEN_HEIGHT / 2] });

  // Generate random particles
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_WIDTH,
    y: SCREEN_HEIGHT * 0.3 + Math.random() * SCREEN_HEIGHT * 0.5,
    delay: Math.random() * 2000,
  }));

  return (
    <View style={styles.container}>
      {/* Gradient Background */}
      <LinearGradient
        colors={['#020617', '#0a0f1a', '#051015', '#000']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Grid overlay */}
      <View style={styles.gridOverlay}>
        {Array.from({ length: 20 }).map((_, i) => (
          <View key={`h-${i}`} style={[styles.gridLine, { top: `${i * 5}%` }]} />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <View key={`v-${i}`} style={[styles.gridLineV, { left: `${i * 10}%` }]} />
        ))}
      </View>

      {/* Animated particles */}
      {particles.map((p) => (
        <Particle key={p.id} delay={p.delay} startX={p.x} startY={p.y} />
      ))}

      {/* Scanning line */}
      <Animated.View
        style={[
          styles.scanLine,
          { transform: [{ translateY: scanLineTranslate }] },
        ]}
      />

      {/* Corner brackets */}
      <Animated.View style={[styles.cornerTL, { opacity: cornerOpacity }]}>
        <View style={styles.cornerBracket} />
      </Animated.View>
      <Animated.View style={[styles.cornerTR, { opacity: cornerOpacity }]}>
        <View style={[styles.cornerBracket, { transform: [{ rotate: '90deg' }] }]} />
      </Animated.View>
      <Animated.View style={[styles.cornerBL, { opacity: cornerOpacity }]}>
        <View style={[styles.cornerBracket, { transform: [{ rotate: '-90deg' }] }]} />
      </Animated.View>
      <Animated.View style={[styles.cornerBR, { opacity: cornerOpacity }]}>
        <View style={[styles.cornerBracket, { transform: [{ rotate: '180deg' }] }]} />
      </Animated.View>

      {/* Scan rings */}
      <View style={styles.ringsContainer}>
        <ScanRing delay={0} size={280} />
        <ScanRing delay={500} size={280} />
        <ScanRing delay={1000} size={280} />
      </View>

      {/* Glow effect */}
      <Animated.View
        style={[
          styles.glow,
          { opacity: glowOpacity, transform: [{ scale: glowScale }] },
        ]}
      />

      {/* Main logo */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            transform: [{ scale: logoScale }, { rotate: logoRotation }],
          },
        ]}
      >
        <View style={styles.logoInner}>
          <Eye size={56} color="#10b981" strokeWidth={1.5} />
          <View style={styles.logoCrosshair}>
            <Crosshair size={90} color="rgba(16, 185, 129, 0.3)" strokeWidth={1} />
          </View>
        </View>
      </Animated.View>

      {/* Title */}
      <Animated.View
        style={[
          styles.titleContainer,
          {
            opacity: titleOpacity,
            transform: [{ translateY: titleTranslateY }],
          },
        ]}
      >
        <Text style={styles.titleMain}>NIGHT VISION</Text>
        <View style={styles.titleDivider} />
        <Text style={styles.titleSub}>SECURITY INTELLIGENCE</Text>
      </Animated.View>

      {/* Subtitle with icons */}
      <Animated.View style={[styles.subtitleContainer, { opacity: subtitleOpacity }]}>
        <View style={styles.featureBadge}>
          <Scan size={14} color="#60a5fa" />
          <Text style={styles.featureText}>AI Detection</Text>
        </View>
        <View style={styles.featureDot} />
        <View style={styles.featureBadge}>
          <Radio size={14} color="#a855f7" />
          <Text style={styles.featureText}>Real-time</Text>
        </View>
        <View style={styles.featureDot} />
        <View style={styles.featureBadge}>
          <Shield size={14} color="#10b981" />
          <Text style={styles.featureText}>Protected</Text>
        </View>
      </Animated.View>

      {/* HUD elements */}
      <Animated.View style={[styles.hudContainer, { opacity: hudOpacity }]}>
        {/* Left HUD */}
        <View style={styles.hudLeft}>
          <View style={styles.hudLine} />
          <CircleDot size={12} color="#10b981" />
          <Text style={styles.hudText}>SYS.ONLINE</Text>
        </View>
        {/* Right HUD */}
        <View style={styles.hudRight}>
          <Text style={styles.hudText}>v2.0.0</Text>
          <CircleDot size={12} color="#60a5fa" />
          <View style={styles.hudLine} />
        </View>
      </Animated.View>

      {/* Boot sequence */}
      <Animated.View style={[styles.bootContainer, { opacity: bootTextOpacity }]}>
        <View style={styles.bootHeader}>
          <View style={[styles.bootDot, bootPhase >= 1 && styles.bootDotActive]} />
          <View style={[styles.bootDot, bootPhase >= 2 && styles.bootDotActive]} />
          <View style={[styles.bootDot, bootPhase >= 3 && styles.bootDotActive]} />
          <View style={[styles.bootDot, bootPhase >= 4 && styles.bootDotActive]} />
          <View style={[styles.bootDot, bootPhase >= 5 && styles.bootDotActive, bootPhase >= 5 && styles.bootDotFinal]} />
        </View>
        <Text style={styles.bootText}>{bootText}</Text>
        
        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                width: progressWidth.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </Animated.View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>TACTICAL VISION SYSTEMS™</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(16, 185, 129, 0.03)",
  },
  gridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(16, 185, 129, 0.03)",
  },
  particle: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#10b981",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(16, 185, 129, 0.4)",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  cornerTL: { position: "absolute", top: 60, left: 30 },
  cornerTR: { position: "absolute", top: 60, right: 30 },
  cornerBL: { position: "absolute", bottom: 120, left: 30 },
  cornerBR: { position: "absolute", bottom: 120, right: 30 },
  cornerBracket: {
    width: 30,
    height: 30,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderColor: "rgba(16, 185, 129, 0.6)",
  },
  ringsContainer: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  scanRing: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.5)",
  },
  glow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 60,
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
  },
  logoInner: {
    alignItems: "center",
    justifyContent: "center",
    width: 100,
    height: 100,
  },
  logoCrosshair: {
    position: "absolute",
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  titleMain: {
    fontSize: 36,
    fontWeight: "900",
    color: "#f8fafc",
    letterSpacing: 8,
    textShadowColor: "rgba(16, 185, 129, 0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  titleDivider: {
    width: 60,
    height: 2,
    backgroundColor: "#10b981",
    marginVertical: 12,
    borderRadius: 1,
  },
  titleSub: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 6,
  },
  subtitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 12,
  },
  featureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.3)",
  },
  featureText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "600",
  },
  featureDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#475569",
  },
  hudContainer: {
    position: "absolute",
    top: 100,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 30,
  },
  hudLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hudRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hudLine: {
    width: 40,
    height: 1,
    backgroundColor: "rgba(16, 185, 129, 0.5)",
  },
  hudText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1,
  },
  bootContainer: {
    position: "absolute",
    bottom: 160,
    alignItems: "center",
    width: "80%",
  },
  bootHeader: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  bootDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(100, 116, 139, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.5)",
  },
  bootDotActive: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  bootDotFinal: {
    backgroundColor: "#22c55e",
    borderColor: "#22c55e",
  },
  bootText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: 16,
  },
  progressContainer: {
    width: "100%",
    height: 3,
    backgroundColor: "rgba(100, 116, 139, 0.2)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#10b981",
    borderRadius: 2,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  footer: {
    position: "absolute",
    bottom: 50,
    alignItems: "center",
  },
  footerText: {
    color: "rgba(100, 116, 139, 0.5)",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 3,
  },
});
