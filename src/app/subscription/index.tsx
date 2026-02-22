import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Pressable, Animated } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useAuth } from '../../services/auth/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function SubscriptionScreen() {
    const { user, userProfile, setProfileLocal, setTrialBypass } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    // Calculate days remaining
    const now = Date.now();
    const trialEnd = userProfile?.subscription?.trialEndDate || 0;
    const isTrial = userProfile?.subscription?.status === 'trial';
    const isActive = userProfile?.subscription?.status === 'active';
    const isInactive = userProfile?.subscription?.status === 'inactive' || !userProfile?.subscription; // New state
    const isExpired = userProfile?.subscription?.status === 'expired' || (isTrial && now > trialEnd);

    const msPerDay = 1000 * 60 * 60 * 24;
    const daysRemaining = Math.max(0, Math.ceil((trialEnd - now) / msPerDay));

    const handleStartTrial = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const endDate = Date.now() + (7 * 24 * 60 * 60 * 1000);
            await updateDoc(doc(db, 'users', user.uid), {
                'subscription.status': 'trial',
                'subscription.trialEndDate': endDate
            });

            // Update Local
            if (userProfile) {
                const updated = { ...userProfile, subscription: { status: 'trial' as const, trialEndDate: endDate } };
                setProfileLocal(updated);
            }
            // Trial started, now "Verify" by setting bypass so they don't get nagged immediately again in this session?
            // Actually, if they start trial, they SHOULD be allowed in.
            if (setTrialBypass) setTrialBypass(true);
            router.replace('/');
        } catch (e) {
            Alert.alert("Error", "Could not start trial.");
        } finally {
            setLoading(false);
        }
    };

    const PLANS = [
        { id: '1mo', months: 1, price: 599, label: '1 Month', savings: 0 },
        { id: '4mo', months: 4, price: 1999, label: '4 Months', savings: 17 },
        { id: '6mo', months: 6, price: 2799, label: '6 Months', savings: 22 },
        { id: '12mo', months: 12, price: 3999, label: '12 Months', savings: 45, bestValue: true },
    ];

    const [selectedPlanId, setSelectedPlanId] = useState('12mo'); // Default to 12 months
    const [showTooltip, setShowTooltip] = useState(false);
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const scrollViewRef = useRef<ScrollView>(null);

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(scaleAnim, {
                    toValue: 1.2,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 1,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    useEffect(() => {
        if (isTrial) {
            setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 500);
        }
    }, [isTrial]);

    const selectedPlan = PLANS.find(p => p.id === selectedPlanId);

    // Smart Billing Calculation
    const calculateBillingDate = () => {
        if (!selectedPlan) return 0;
        const planDurationMs = selectedPlan.months * 30 * 24 * 60 * 60 * 1000;

        let baseTime = now;
        if (isTrial && trialEnd > now) {
            baseTime = trialEnd;
        } else {
            baseTime = now + (7 * 24 * 60 * 60 * 1000); // Add 7 days if not in trial
        }

        return baseTime + planDurationMs;
    };

    const billingDateMs = calculateBillingDate();
    const billingDateFormatted = new Date(billingDateMs).toDateString(); // "Mon Jan 01 2026"

    const handleSubscribe = async () => {
        if (!user) return;
        setLoading(true);

        const selectedPlan = PLANS.find(p => p.id === selectedPlanId);

        // MOCK PURCHASE LOGIC
        setTimeout(async () => {
            try {
                // Update Firestore
                await updateDoc(doc(db, 'users', user.uid), {
                    'subscription.status': 'active',
                    'subscription.trialEndDate': 0, // Clear trial
                    'subscription.nextBillingDate': billingDateMs
                });

                // Update Local Context
                if (userProfile) {
                    const updated = {
                        ...userProfile,
                        subscription: {
                            ...userProfile.subscription!,
                            status: 'active' as const,
                            trialEndDate: 0,
                            nextBillingDate: billingDateMs
                        }
                    };
                    setProfileLocal(updated);
                }

                Alert.alert("Success", `Subscribed to ${selectedPlan?.label} plan for ₹${selectedPlan?.price}!`);
                router.replace('/'); // Go home
            } catch (e) {
                console.error(e);
                Alert.alert("Error", "Transaction failed.");
            } finally {
                setLoading(false);
            }
        }, 1500);
    };

    const handleRestore = () => {
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            Alert.alert("Restore Purchases", "No previous purchases found.");
        }, 1000);
    };

    const handleContinueTrial = () => {
        if (setTrialBypass) setTrialBypass(true);
        router.replace('/');
    };

    return (
        <ScrollView ref={scrollViewRef} contentContainerStyle={styles.container}>
            <Pressable style={styles.pressableContainer} onPress={() => setShowTooltip(false)}>
                <Stack.Screen options={{ headerShown: false }} />

                <View style={styles.header}>
                    <Text style={styles.title}>Echolearn</Text>
                    <Text style={styles.subtitle}>Taking Your Learning To The Next Level</Text>
                </View>

                <View style={styles.card}>
                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>Current Status:</Text>
                        <Text style={[styles.statusValue, (isActive || isTrial) ? styles.active : styles.expired]}>
                            {isActive ? "ACTIVE" : isTrial ? "FREE TRIAL" : isInactive ? "NOT STARTED" : "EXPIRED"}
                        </Text>
                    </View>
                    {isTrial && (
                        <Text style={styles.trialText}>
                            {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining in your trial.
                        </Text>
                    )}
                    {isExpired && !isActive && (
                        <Text style={styles.expiredText}>
                            Your trial has ended. Subscribe to continue learning.
                        </Text>
                    )}
                </View>

                <View style={styles.features}>
                    <FeatureItem icon="brain" text="Unlimited spaced repetition cycles" />
                    <FeatureItem icon="notebook" text="Unlimited Notebooks & Pages" />
                    <FeatureItem icon="account-group" text="Connect with Teachers & Parents" />
                    <FeatureItem icon="cloud-sync" text="Cloud Sync Across Devices" />
                </View>

                {isInactive && (
                    <TouchableOpacity
                        style={[styles.subscribeBtn, { backgroundColor: '#333333', marginBottom: 30 }]}
                        onPress={handleStartTrial}
                        disabled={loading}
                    >
                        <Text style={styles.subscribeText}>Start 7-Day Free Trial</Text>
                    </TouchableOpacity>
                )}

                <View style={styles.plansContainer}>
                    {PLANS.map((plan) => (
                        <TouchableOpacity
                            key={plan.id}
                            style={[
                                styles.planCard,
                                selectedPlanId === plan.id && styles.selectedPlanCard
                            ]}
                            onPress={() => setSelectedPlanId(plan.id)}
                            disabled={loading || isActive}
                        >
                            {plan.bestValue && (
                                <View style={styles.bestValueBadge}>
                                    <Text style={styles.bestValueText}>Best Value</Text>
                                </View>
                            )}
                            <View style={styles.planHeader}>
                                <Text style={[styles.planLabel, selectedPlanId === plan.id && styles.selectedText]}>{plan.label}</Text>
                                {plan.savings > 0 && <Text style={styles.savingsText}>Save {plan.savings}%</Text>}
                            </View>
                            <Text style={[styles.planPrice, selectedPlanId === plan.id && styles.selectedText]}>₹{plan.price}</Text>
                            <Text style={styles.perMonthText}>₹{Math.round(plan.price / plan.months)}/mo</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <TouchableOpacity
                    style={[styles.subscribeBtn, loading && styles.disabledBtn]}
                    onPress={handleSubscribe}
                    disabled={loading || isActive}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.subscribeText}>
                            {isActive ? "You are Subscribed" : `Purchase for ₹${selectedPlan?.price}`}
                        </Text>
                    )}
                </TouchableOpacity>

                {!isActive && (
                    <View style={[styles.billingInfo, { zIndex: 100 }]}>
                        <TouchableOpacity onPress={(e) => {
                            e.stopPropagation();
                            setShowTooltip(!showTooltip);
                        }}>
                            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                                <MaterialCommunityIcons name="information-outline" size={18} color="#35c128" />
                            </Animated.View>
                        </TouchableOpacity>

                        {showTooltip && (
                            <View style={styles.tooltipBubble}>
                                <Text style={styles.tooltipText}>
                                    {isTrial
                                        ? `You have ${daysRemaining} days remaining in your trial.\n\nYour selected ${selectedPlan?.label} plan will begin AFTER your trial ends.`
                                        : "You get a 7-day free trial starting today.\n\nYour first payment is due only after the trial + your selected plan duration."
                                    }
                                </Text>
                            </View>
                        )}

                        <Text style={styles.billingText}>
                            Next billing date: <Text style={{ color: '#fff', fontWeight: 'bold' }}>{billingDateFormatted}</Text>
                        </Text>
                    </View>
                )}

                <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={loading}>
                    <Text style={styles.restoreText}>Restore Purchases</Text>
                </TouchableOpacity>

                {isTrial && (
                    <TouchableOpacity style={styles.continueBtn} onPress={handleContinueTrial} disabled={loading}>
                        <Text style={styles.continueText}>Continue with Trial</Text>
                    </TouchableOpacity>
                )}
            </Pressable>
        </ScrollView>
    );
}

const FeatureItem = ({ icon, text }: { icon: any, text: string }) => (
    <View style={styles.featureRow}>
        <MaterialCommunityIcons name={icon} size={24} color="#35c128" />
        <Text style={styles.featureText}>{text}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: { flexGrow: 1, backgroundColor: '#121212' },
    pressableContainer: { padding: 20, paddingTop: 45, alignItems: 'center', width: '100%', flex: 1 },
    header: { alignItems: 'center', marginBottom: 50 },
    title: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 5 },
    subtitle: { fontSize: 16, color: '#aaa' },

    card: { width: '100%', backgroundColor: '#1e1e1e', padding: 20, borderRadius: 12, marginBottom: 30, alignItems: 'center' },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5 },
    statusLabel: { color: '#aaa', fontSize: 16 },
    statusValue: { fontWeight: 'bold', fontSize: 16 },
    active: { color: '#35c128' },
    expired: { color: '#FF3B30' },
    trialText: { color: '#fff', fontSize: 14, marginTop: 5 },
    expiredText: { color: '#FF3B30', fontSize: 14, marginTop: 5, textAlign: 'center' },

    features: { width: '100%', marginBottom: 30 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 15 },
    featureText: { color: '#fff', fontSize: 16 },

    plansContainer: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', marginBottom: 30 },
    planCard: {
        width: '48%',
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 15,
        borderWidth: 2,
        borderColor: '#333',
        marginBottom: 10,
        position: 'relative'
    },
    selectedPlanCard: {
        borderColor: '#35c128',
        backgroundColor: '#1a2e1a'
    },
    planHeader: { marginBottom: 10 },
    planLabel: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    selectedText: { color: '#35c128' },
    savingsText: { color: '#FF9800', fontSize: 12, fontWeight: 'bold', marginTop: 2 },
    planPrice: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
    perMonthText: { color: '#aaa', fontSize: 12 },
    bestValueBadge: {
        position: 'absolute',
        top: -10,
        right: -10,
        backgroundColor: '#2E7D32',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10
    },
    bestValueText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

    subscribeBtn: { width: '100%', backgroundColor: '#2E7D32', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginBottom: 15 },
    disabledBtn: { backgroundColor: '#1b4a1b' },
    subscribeText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

    restoreBtn: { padding: 10 },
    restoreText: { color: '#aaa', fontSize: 14, textDecorationLine: 'underline' },

    continueBtn: { marginTop: 20, backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 30, width: '80%', alignSelf: 'center', alignItems: 'center', shadowColor: '#fff', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 },
    continueText: { color: '#000', fontSize: 16, fontWeight: 'bold', textDecorationLine: 'none' },

    billingInfo: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, marginBottom: 20, position: 'relative' },
    billingText: { color: '#aaa', fontSize: 13 },
    tooltipBubble: {
        position: 'absolute',
        bottom: 30, // Above the text
        left: -10,
        width: 250,
        backgroundColor: '#2E2E2E',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#35c128',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5
    },
    tooltipText: { color: '#fff', fontSize: 12, lineHeight: 18 }
});
