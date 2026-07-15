import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../services/auth/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const POST_GRAD_OPTIONS = ["M.Ed", "M.A.", "M.Sc.", "M.Phil", "Ph.D.", "MBA", "Other"];
const GRAD_OPTIONS = ["B.Ed", "B.A.", "B.Sc.", "B.Com", "B.Tech", "BBA", "Other"];

export default function TeacherOnboarding() {
    const { user, refreshProfile } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [saving, setSaving] = useState(false);

    // Qualifications
    const [selectedPostGrad, setSelectedPostGrad] = useState<string[]>([]);
    const [postGradOther, setPostGradOther] = useState('');
    const [selectedGrad, setSelectedGrad] = useState<string[]>([]);
    const [gradOther, setGradOther] = useState('');

    // Dynamic arrays
    const [certificates, setCertificates] = useState<string[]>(['']);
    const [awards, setAwards] = useState<string[]>(['']);

    // Bio
    const [bio, setBio] = useState('');

    const togglePostGrad = (option: string) => {
        if (selectedPostGrad.includes(option)) {
            setSelectedPostGrad(selectedPostGrad.filter(o => o !== option));
        } else {
            setSelectedPostGrad([...selectedPostGrad, option]);
        }
    };

    const toggleGrad = (option: string) => {
        if (selectedGrad.includes(option)) {
            setSelectedGrad(selectedGrad.filter(o => o !== option));
        } else {
            setSelectedGrad([...selectedGrad, option]);
        }
    };

    const addCertificate = () => {
        setCertificates([...certificates, '']);
    };

    const updateCertificate = (index: number, value: string) => {
        const updated = [...certificates];
        updated[index] = value;
        setCertificates(updated);
    };

    const removeCertificate = (index: number) => {
        if (certificates.length > 1) {
            setCertificates(certificates.filter((_, i) => i !== index));
        }
    };

    const addAward = () => {
        setAwards([...awards, '']);
    };

    const updateAward = (index: number, value: string) => {
        const updated = [...awards];
        updated[index] = value;
        setAwards(updated);
    };

    const removeAward = (index: number) => {
        if (awards.length > 1) {
            setAwards(awards.filter((_, i) => i !== index));
        }
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);

        try {
            // Build post graduation string
            let postGradList = selectedPostGrad.filter(o => o !== 'Other');
            if (selectedPostGrad.includes('Other') && postGradOther.trim()) {
                postGradList.push(postGradOther.trim());
            }
            const postGradString = postGradList.join(', ');

            // Build graduation string
            let gradList = selectedGrad.filter(o => o !== 'Other');
            if (selectedGrad.includes('Other') && gradOther.trim()) {
                gradList.push(gradOther.trim());
            }
            const gradString = gradList.join(', ');

            // Filter empty certificates and awards
            const filteredCerts = certificates.filter(c => c.trim() !== '');
            const filteredAwards = awards.filter(a => a.trim() !== '');

            await updateDoc(doc(db, 'users', user.uid), {
                postGraduation: postGradString,
                graduation: gradString,
                professionalCertificates: filteredCerts,
                awards: filteredAwards,
                bio: bio.trim()
            });

            await refreshProfile();
            router.replace('/teacher/link-students');
        } catch (e) {
            console.error("Error saving teacher profile:", e);
            Alert.alert("Error", "Could not save profile. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top + 30 }]}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={styles.title}>Complete Your Profile</Text>
                <Text style={styles.subtitle}>Help students know more about your qualifications</Text>

                {/* Post Graduation */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Post Graduation</Text>
                    <View style={styles.chipContainer}>
                        {POST_GRAD_OPTIONS.map(option => (
                            <TouchableOpacity
                                key={option}
                                style={[styles.chip, selectedPostGrad.includes(option) && styles.selectedChip]}
                                onPress={() => togglePostGrad(option)}
                            >
                                <Text style={[styles.chipText, selectedPostGrad.includes(option) && styles.selectedChipText]}>
                                    {option}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {selectedPostGrad.includes('Other') && (
                        <TextInput
                            style={styles.input}
                            placeholder="Enter other qualification"
                            placeholderTextColor="#666"
                            value={postGradOther}
                            onChangeText={setPostGradOther}
                        />
                    )}
                </View>

                {/* Graduation */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Graduation</Text>
                    <View style={styles.chipContainer}>
                        {GRAD_OPTIONS.map(option => (
                            <TouchableOpacity
                                key={option}
                                style={[styles.chip, selectedGrad.includes(option) && styles.selectedChip]}
                                onPress={() => toggleGrad(option)}
                            >
                                <Text style={[styles.chipText, selectedGrad.includes(option) && styles.selectedChipText]}>
                                    {option}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {selectedGrad.includes('Other') && (
                        <TextInput
                            style={styles.input}
                            placeholder="Enter other qualification"
                            placeholderTextColor="#666"
                            value={gradOther}
                            onChangeText={setGradOther}
                        />
                    )}
                </View>

                {/* Professional Certificates */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Professional Certificates</Text>
                    {certificates.map((cert, index) => (
                        <View key={index} style={styles.dynamicRow}>
                            <TextInput
                                style={[styles.input, styles.dynamicInput]}
                                placeholder={`Certificate ${index + 1}`}
                                placeholderTextColor="#666"
                                value={cert}
                                onChangeText={(text) => updateCertificate(index, text)}
                            />
                            {certificates.length > 1 && (
                                <TouchableOpacity onPress={() => removeCertificate(index)} style={styles.removeBtn}>
                                    <MaterialCommunityIcons name="minus-circle" size={24} color="#e74c3c" />
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                    <TouchableOpacity onPress={addCertificate} style={styles.addBtn}>
                        <MaterialCommunityIcons name="plus-circle" size={20} color="#2E7D32" />
                        <Text style={styles.addBtnText}>Add Certificate</Text>
                    </TouchableOpacity>
                </View>

                {/* Awards */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Awards & Recognitions</Text>
                    {awards.map((award, index) => (
                        <View key={index} style={styles.dynamicRow}>
                            <TextInput
                                style={[styles.input, styles.dynamicInput]}
                                placeholder={`Award ${index + 1}`}
                                placeholderTextColor="#666"
                                value={award}
                                onChangeText={(text) => updateAward(index, text)}
                            />
                            {awards.length > 1 && (
                                <TouchableOpacity onPress={() => removeAward(index)} style={styles.removeBtn}>
                                    <MaterialCommunityIcons name="minus-circle" size={24} color="#e74c3c" />
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                    <TouchableOpacity onPress={addAward} style={styles.addBtn}>
                        <MaterialCommunityIcons name="plus-circle" size={20} color="#2E7D32" />
                        <Text style={styles.addBtnText}>Add Award</Text>
                    </TouchableOpacity>
                </View>

                {/* Bio */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Bio</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Tell students about yourself, your teaching philosophy, experience..."
                        placeholderTextColor="#666"
                        value={bio}
                        onChangeText={setBio}
                        multiline
                        numberOfLines={5}
                        textAlignVertical="top"
                    />
                </View>

                {/* Save Button */}
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                    {saving ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.saveBtnText}>Save & Continue</Text>
                    )}
                </TouchableOpacity>

                {/* Skip Link */}
                <TouchableOpacity onPress={() => router.replace('/teacher/link-students')} style={styles.skipBtn}>
                    <Text style={styles.skipText}>Skip for now</Text>
                </TouchableOpacity>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    content: { padding: 20, paddingBottom: 50 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#aaa', marginBottom: 30 },

    section: { marginBottom: 25, backgroundColor: '#1e1e1e', padding: 16, borderRadius: 12 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 12 },

    chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#444', backgroundColor: '#252525' },
    selectedChip: { backgroundColor: 'rgba(46, 125, 50, 0.3)', borderColor: '#2E7D32' },
    chipText: { color: '#bbb', fontWeight: '500', fontSize: 14 },
    selectedChipText: { color: '#4CAF50', fontWeight: 'bold' },

    input: { backgroundColor: '#252525', borderRadius: 8, padding: 12, color: '#fff', fontSize: 16, marginTop: 10 },
    textArea: { minHeight: 120 },

    dynamicRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    dynamicInput: { flex: 1, marginTop: 0, marginBottom: 0 },
    removeBtn: { marginLeft: 10 },

    addBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    addBtnText: { color: '#2E7D32', fontWeight: '600', marginLeft: 6 },

    saveBtn: { backgroundColor: '#2E7D32', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 20 },
    saveBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

    skipBtn: { alignItems: 'center', marginTop: 15 },
    skipText: { color: '#888', fontSize: 14 }
});
