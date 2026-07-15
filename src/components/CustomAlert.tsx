import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Dimensions } from 'react-native';

interface CustomAlertProps {
    visible: boolean;
    title: string;
    message: string;
    onClose: () => void;
    buttons?: {
        text: string;
        onPress: () => void;
        style?: 'cancel' | 'default' | 'destructive';
        autoClose?: boolean; // New prop
    }[];
}

export const CustomAlert = ({ visible, title, message, onClose, buttons }: CustomAlertProps) => {
    if (!visible) return null;

    const renderButtons = () => {
        if (!buttons || buttons.length === 0) {
            return (
                <Pressable
                    style={({ pressed }: { pressed: boolean }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}
                    onPress={onClose}
                >
                    <Text style={styles.buttonText}>OK</Text>
                </Pressable>
            );
        }

        return buttons.map((btn, index) => (
            <Pressable
                key={index}
                style={({ pressed }: { pressed: boolean }) => [
                    styles.button,
                    btn.style === 'cancel' && styles.cancelButton,
                    btn.style === 'destructive' && styles.destructiveButton,
                    { opacity: pressed ? 0.7 : 1 }
                ]}
                onPress={() => {
                    btn.onPress();
                    // Auto close if autoClose is not explicitly false
                    if (btn.autoClose !== false) {
                        onClose();
                    }
                }}
            >
                <Text style={[styles.buttonText, btn.style === 'cancel' && styles.cancelText]}>{btn.text}</Text>
            </Pressable>
        ));
    };

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            statusBarTranslucent
        >
            <View style={styles.overlay}>
                <View style={styles.alertBox}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.message}>{message}</Text>
                    <View style={styles.buttonContainer}>
                        {renderButtons()}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    alertBox: {
        width: '100%',
        maxWidth: 320,
        backgroundColor: '#1E1E1E',
        borderRadius: 16,
        padding: 24,
        // alignItems: 'center', // Removed to allow left alignment (stretch)
        borderWidth: 1,
        borderColor: '#333',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
        zIndex: 100
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 10,
        textAlign: 'left' // Changed from center
    },
    message: {
        fontSize: 16,
        color: '#ccc',
        textAlign: 'left', // Changed from center
        marginBottom: 24,
        lineHeight: 22
    },
    buttonContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap', // Allow wrapping
        justifyContent: 'flex-end',
        alignItems: 'center', // Align if wrapped
        gap: 10,
        width: '100%',
        marginTop: 10 // Add space if wrapped close to text
    },
    button: {
        backgroundColor: '#2E7D32', // Darker Green
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8, // Changed from 30 for a more standard modal look
        minWidth: 80,
        alignItems: 'center',
        flexGrow: 1, // Make buttons fill width when wrapped
        marginBottom: 5 // Space between rows if wrapped
    },
    cancelButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#666'
    },
    destructiveButton: {
        backgroundColor: '#B71C1C', // Darker Red
    },
    buttonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16
    },
    cancelText: {
        color: '#aaa'
    }
});
