import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { TouchableOpacity, ScrollView } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Arrow } from '../../types/schema';

interface ArrowToolbarProps {
    arrow: Arrow;
    onUpdate: (updates: Partial<Arrow>) => void;
    onDelete: () => void;
    scale: number;
}

export const ArrowToolbar: React.FC<ArrowToolbarProps> = ({ arrow, onUpdate, onDelete, scale }) => {
    const COLORS = ['#000000', '#FF5252', '#448AFF', '#69F0AE', '#FFD740', '#E040FB'];

    return (
        <View style={styles.container}>
            {/* Row 1: Arrow Ends */}
            <View style={styles.row}>
                <TouchableOpacity
                    style={[styles.btn, arrow.arrowEnds === 'none' && styles.activeBtn]}
                    onPress={() => onUpdate({ arrowEnds: 'none' })}
                >
                    <MaterialCommunityIcons name="minus" size={20} color={arrow.arrowEnds === 'none' ? 'white' : '#333'} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.btn, arrow.arrowEnds === 'end' && styles.activeBtn]}
                    onPress={() => onUpdate({ arrowEnds: 'end' })}
                >
                    <MaterialCommunityIcons name="arrow-right" size={20} color={arrow.arrowEnds === 'end' ? 'white' : '#333'} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.btn, arrow.arrowEnds === 'both' && styles.activeBtn]}
                    onPress={() => onUpdate({ arrowEnds: 'both' })}
                >
                    <MaterialCommunityIcons name="arrow-left-right" size={20} color={arrow.arrowEnds === 'both' ? 'white' : '#333'} />
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity onPress={onDelete} style={[styles.btn, { backgroundColor: '#ffebee' }]}>
                    <MaterialCommunityIcons name="delete" size={20} color="#f44336" />
                </TouchableOpacity>
            </View>

            {/* Row 2: Style & Type */}
            <View style={styles.row}>
                {/* Line Style */}
                <TouchableOpacity
                    style={[styles.btn, arrow.lineStyle === 'solid' && styles.activeBtn]}
                    onPress={() => onUpdate({ lineStyle: 'solid' })}
                >
                    <MaterialCommunityIcons name="vector-line" size={20} color={arrow.lineStyle === 'solid' ? 'white' : '#333'} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.btn, arrow.lineStyle === 'dotted' && styles.activeBtn]}
                    onPress={() => onUpdate({ lineStyle: 'dotted' })}
                >
                    <MaterialCommunityIcons name="dots-horizontal" size={20} color={arrow.lineStyle === 'dotted' ? 'white' : '#333'} />
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Line Type */}
                <TouchableOpacity
                    style={[styles.btn, arrow.lineType === 'straight' && styles.activeBtn]}
                    onPress={() => onUpdate({ lineType: 'straight' })}
                >
                    <MaterialCommunityIcons name="slash-forward" size={20} color={arrow.lineType === 'straight' ? 'white' : '#333'} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.btn, arrow.lineType === 'curved' && styles.activeBtn]}
                    onPress={() => onUpdate({ lineType: 'curved' })}
                >
                    <MaterialCommunityIcons name="chart-bell-curve" size={20} color={arrow.lineType === 'curved' ? 'white' : '#333'} />
                </TouchableOpacity>
            </View>

            {/* Row 3: Colors */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorRow}>
                {COLORS.map(color => (
                    <TouchableOpacity
                        key={color}
                        style={[
                            styles.colorBtn,
                            { backgroundColor: color },
                            arrow.color === color && styles.activeColorBtn
                        ]}
                        onPress={() => onUpdate({ color })}
                    />
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
        width: 220,
        height: 120,
        gap: 8
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4
    },
    colorRow: {
        flexDirection: 'row',
        marginTop: 4
    },
    btn: {
        padding: 6,
        borderRadius: 6,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center'
    },
    activeBtn: {
        backgroundColor: '#2196F3'
    },
    divider: {
        width: 1,
        height: 20,
        backgroundColor: '#eee',
        marginHorizontal: 4
    },
    colorBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#ddd'
    },
    activeColorBtn: {
        borderColor: '#000',
        borderWidth: 2
    }
});
